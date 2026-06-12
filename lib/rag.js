/**
 * STAGES 5 & 6 — RETRIEVE and GENERATE (plus orchestration)
 *
 * This is where "grounding" happens. Instead of letting the LLM answer from
 * its training data (where it can hallucinate), we:
 *   1. Embed the question and retrieve the most similar document chunks.
 *   2. Paste those chunks into the prompt as numbered context.
 *   3. Instruct the model to answer ONLY from that context, cite the chunk
 *      numbers it used, and explicitly refuse when the context doesn't
 *      contain the answer.
 *
 * The refusal instruction is the most important line: without it, LLMs
 * happily fill gaps with plausible-sounding fiction.
 *
 * Exposed in two flavors:
 *   - askQuestion()       → complete answer in one shot (CLI / tests)
 *   - retrieveSources() + streamAnswerTokens() → the API server sends
 *     sources to the browser first, then streams the answer token-by-token.
 */

import Groq from 'groq-sdk';
import { CONFIG } from '../config.js';
import { embedQuery } from './embedder.js';

let groq;
function getGroq() {
  if (!groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set. Copy .env.example to .env and add your key.');
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

export const REFUSAL_TEXT = "I couldn't find that in the document.";

const SYSTEM_PROMPT = `You are a document Q&A assistant. You answer questions using ONLY the numbered context passages provided below. Follow these rules strictly:

1. Answer exclusively from the context. Never use outside knowledge, even if you know the answer.
2. If the context does not contain the answer, reply exactly: "${REFUSAL_TEXT}"
3. Cite the passages you used with their numbers in square brackets, like [1] or [2][3], placed after the relevant statement.
4. Be thorough and complete. Cover EVERY aspect of the question that the context addresses: include all relevant details, numbers, conditions, exceptions, steps, and edge cases found in the passages. If the context mentions related caveats or prerequisites, include them too.
5. Structure longer answers for readability: use short paragraphs or bullet points, and number the steps for any procedure.
6. Detail must come from the context only — a long answer is never an excuse to add outside information or speculation.
7. Never invent facts, numbers, or quotes that are not in the context.`;

/**
 * Format retrieved chunks as numbered context the model can cite.
 * The numbers here are what the model's [1], [2] citations refer to,
 * and the UI maps them back to the same sources array.
 */
function buildContext(sources) {
  return sources
    .map((s, i) => `[${i + 1}] (from "${s.source}")\n${s.text}`)
    .join('\n\n');
}

/** Build the chat messages for a grounded answer. */
function buildMessages(question, sources) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Context passages:\n\n${buildContext(sources)}\n\nQuestion: ${question}`,
    },
  ];
}

/**
 * RETRIEVE: embed the question with input_type "search_query" (the
 * counterpart to the "search_document" type used at ingestion), then
 * cosine-search the store for the TOP_K most relevant chunks.
 *
 * @returns {Promise<Array<{text, source, chunkIndex, score}>>} best-first
 */
export async function retrieveSources(question, store) {
  const queryVector = await embedQuery(question);
  return store.search(queryVector, CONFIG.TOP_K);
}

/**
 * GENERATE (streaming): yields answer tokens as the model produces them.
 * Used by the API server to push tokens over Server-Sent Events so the
 * user sees the answer being written instead of staring at a spinner.
 *
 * @param {string} question
 * @param {Array} sources - Chunks from retrieveSources().
 * @yields {string} answer fragments
 */
export async function* streamAnswerTokens(question, sources) {
  const stream = await getGroq().chat.completions.create({
    model: CONFIG.GENERATION_MODEL,
    temperature: CONFIG.GENERATION_TEMPERATURE,
    messages: buildMessages(question, sources),
    stream: true,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}

/**
 * Run retrieve → generate end-to-end and return the full answer at once.
 * Used by the Phase 1 CLI (ingest.js).
 *
 * @returns {Promise<{ answer: string, sources: Array }>}
 */
export async function askQuestion(question, store) {
  const sources = await retrieveSources(question, store);

  if (sources.length === 0) {
    return { answer: REFUSAL_TEXT, sources: [] };
  }

  const completion = await getGroq().chat.completions.create({
    model: CONFIG.GENERATION_MODEL,
    temperature: CONFIG.GENERATION_TEMPERATURE,
    messages: buildMessages(question, sources),
  });

  return {
    answer: completion.choices[0]?.message?.content?.trim() ?? '',
    sources,
  };
}
