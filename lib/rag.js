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
 * QUERY REWRITING — the standard fix for follow-up questions in RAG.
 *
 * Retrieval embeds the question in isolation, so a follow-up like
 * "what voids it?" retrieves garbage: "it" means nothing without the
 * previous turn about warranties. Before retrieving, we ask the LLM to
 * rewrite the question into a standalone one using the recent chat
 * history ("What voids the warranty on the AuroraDesk Pro?").
 *
 * Cheap (one small completion), and only runs when there IS history.
 * If rewriting fails for any reason we fall back to the raw question —
 * a degraded answer beats a failed request.
 *
 * @param {string} question
 * @param {Array<{role: string, content: string}>} history - prior turns
 * @returns {Promise<string>} standalone question
 */
export async function rewriteQuestion(question, history) {
  if (!history?.length) return question;

  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const completion = await getGroq().chat.completions.create({
      model: CONFIG.GENERATION_MODEL,
      temperature: 0, // rewriting is mechanical; no creativity wanted
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content:
            'You rewrite follow-up questions into standalone questions. Using the conversation, ' +
            'replace pronouns and references ("it", "that", "the second one") with what they refer to. ' +
            'If the question is already self-contained, return it unchanged. ' +
            'Return ONLY the rewritten question — no explanation, no quotes.',
        },
        {
          role: 'user',
          content: `Conversation:\n${transcript}\n\nFollow-up question: ${question}`,
        },
      ],
    });
    const rewritten = completion.choices[0]?.message?.content?.trim();
    return rewritten || question;
  } catch {
    return question;
  }
}

/**
 * SUGGESTED QUESTIONS — generated once per upload from the document's
 * opening chunks, shown as clickable chips so a first-time user never
 * faces a blank input box wondering what to ask.
 *
 * Best-effort: any failure returns [] and the upload still succeeds.
 *
 * @param {string} sampleText - first few chunks of the document
 * @returns {Promise<string[]>} up to 3 short questions
 */
export async function suggestQuestions(sampleText) {
  try {
    const completion = await getGroq().chat.completions.create({
      model: CONFIG.GENERATION_MODEL,
      temperature: 0.5, // some variety is fine here
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'Given the beginning of a document, write exactly 3 specific questions that the ' +
            'document itself answers. Each must be a complete, fluent English question — ' +
            'written the way a person would actually ask it, with articles and auxiliary verbs ' +
            '(like "How often should the machine be descaled?", never "What is descaling process?"). ' +
            'Return ONLY a JSON array of 3 strings, nothing else.',
        },
        { role: 'user', content: sampleText.slice(0, 6000) },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    // Models sometimes wrap JSON in code fences — strip before parsing.
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((q) => typeof q === 'string').slice(0, 3)
      : [];
  } catch {
    return [];
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
