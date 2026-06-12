/**
 * STAGE 2 — CHUNK
 *
 * Splits document text into overlapping ~500-token pieces.
 *
 * Why chunk at all? Two reasons:
 *  1. Embedding models compress a whole input into ONE vector. Embed a
 *     50-page document as a single vector and every topic in it gets blurred
 *     together — retrieval becomes useless. Small chunks keep each vector
 *     semantically focused.
 *  2. The LLM's context window is finite. We can only show it a few of the
 *     most relevant passages, so those passages need to be bite-sized.
 *
 * Why overlap? A fact can straddle a chunk boundary ("The warranty lasts |
 * five years"). Carrying ~50 tokens from the end of each chunk into the
 * start of the next guarantees boundary-spanning facts survive intact in at
 * least one chunk.
 *
 * Why break on sentence boundaries? Splitting mid-sentence produces
 * fragments that embed poorly and read badly when shown as citations.
 */

import { CONFIG } from '../config.js';

/** Convert a token budget into a character budget (tokens ≈ chars / 4). */
const toChars = (tokens) => tokens * CONFIG.CHARS_PER_TOKEN;

/**
 * Split text into sentences. The regex splits after ., !, or ? followed by
 * whitespace. It's heuristic (it will split on "Dr. Smith"), but for RAG
 * chunking an occasional bad split is harmless — we only need *roughly*
 * sentence-shaped pieces.
 */
function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Chunk a document's text.
 *
 * @param {string} text   - Full document text from the loader.
 * @param {string} source - Filename, stored as metadata so citations can say
 *                          which document a chunk came from (matters for
 *                          multi-document sessions later).
 * @returns {Array<{ text: string, source: string, chunkIndex: number }>}
 */
export function chunkText(text, source) {
  const maxChars = toChars(CONFIG.CHUNK_SIZE); // ~2000 chars
  const overlapChars = toChars(CONFIG.CHUNK_OVERLAP); // ~200 chars

  const sentences = splitIntoSentences(text);
  const chunks = [];
  let current = []; // sentences accumulated for the chunk being built
  let currentLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      text: current.join(' '),
      source,
      chunkIndex: chunks.length,
    });
  };

  for (const sentence of sentences) {
    // Edge case: a single "sentence" longer than a whole chunk (tables,
    // lists without punctuation). Hard-split it by character budget.
    if (sentence.length > maxChars) {
      flush();
      current = [];
      currentLen = 0;
      for (let i = 0; i < sentence.length; i += maxChars - overlapChars) {
        chunks.push({
          text: sentence.slice(i, i + maxChars),
          source,
          chunkIndex: chunks.length,
        });
      }
      continue;
    }

    // Would adding this sentence overflow the chunk? Flush, then seed the
    // next chunk with the tail sentences of this one (the overlap).
    if (currentLen + sentence.length > maxChars && current.length > 0) {
      flush();

      // Walk backwards collecting sentences until we have ~overlapChars.
      const overlap = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0 && overlapLen < overlapChars; i--) {
        overlap.unshift(current[i]);
        overlapLen += current[i].length;
      }
      current = overlap;
      currentLen = overlapLen;
    }

    current.push(sentence);
    currentLen += sentence.length + 1; // +1 for the joining space
  }

  flush();
  return chunks;
}
