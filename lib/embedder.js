/**
 * STAGE 3 — EMBED
 *
 * Converts text into vectors using Cohere's embed-english-v3.0 (1024 dims).
 *
 * An embedding maps text to a point in high-dimensional space where
 * *semantically similar* texts land close together. That's what makes
 * retrieval work: "What's the refund policy?" and "Customers may return
 * items within 30 days" share almost no words, but their vectors are
 * neighbors.
 *
 * CRITICAL detail — input_type asymmetry:
 * Cohere v3 models embed documents and queries into the space differently,
 * optimized for retrieval:
 *   - input_type "search_document" → for the chunks we store
 *   - input_type "search_query"    → for the user's question
 * Mixing these up (or using the same type for both) measurably degrades
 * retrieval quality.
 */

import { CohereClient } from 'cohere-ai';
import { CONFIG } from '../config.js';

// Cohere caps embed requests at 96 texts; large documents need batching.
const BATCH_SIZE = 96;

// How many batches to embed at once. The batches are independent network
// calls, so instead of waiting on each Cohere round-trip end to end we
// overlap them. Bounded so a huge document can't fire dozens of requests
// simultaneously and trip Cohere's rate limit — 5 in flight hides the
// latency without getting throttled.
const MAX_CONCURRENT_BATCHES = 5;

let client;
function getClient() {
  if (!client) {
    if (!process.env.COHERE_API_KEY) {
      throw new Error('COHERE_API_KEY is not set. Copy .env.example to .env and add your key.');
    }
    client = new CohereClient({ token: process.env.COHERE_API_KEY });
  }
  return client;
}

/** Unwrap the embeddings array regardless of Cohere SDK response shape. */
function extractEmbeddings(response) {
  // With embeddingTypes specified the SDK returns { embeddings: { float: [...] } };
  // without it, embeddings is the array directly. Handle both.
  return Array.isArray(response.embeddings) ? response.embeddings : response.embeddings.float;
}

/**
 * Embed document chunks (uses input_type "search_document").
 *
 * @param {string[]} texts - Chunk texts.
 * @returns {Promise<number[][]>} One 1024-dim vector per chunk, same order.
 */
export async function embedChunks(texts) {
  const cohere = getClient();

  // Split into fixed-size batches, recording each batch's start offset so the
  // vectors can be reassembled in the original chunk order even though the
  // batches finish out of order.
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push({ offset: i, texts: texts.slice(i, i + BATCH_SIZE) });
  }

  const vectors = new Array(texts.length);

  // Worker pool: up to MAX_CONCURRENT_BATCHES workers pull batches off the
  // queue until it's drained, each writing its results into the reserved
  // slots. This replaces the old sequential loop that waited on every Cohere
  // round-trip in turn — the slow part of ingesting a large PDF.
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const { offset, texts: batch } = batches[next++];
      const response = await cohere.embed({
        texts: batch,
        model: CONFIG.EMBED_MODEL,
        inputType: 'search_document',
        embeddingTypes: ['float'],
      });
      const embeddings = extractEmbeddings(response);
      for (let j = 0; j < embeddings.length; j++) {
        vectors[offset + j] = embeddings[j];
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_BATCHES, batches.length) }, worker)
  );

  return vectors;
}

/**
 * Embed a user question (uses input_type "search_query").
 *
 * @param {string} question
 * @returns {Promise<number[]>} A single 1024-dim vector.
 */
export async function embedQuery(question) {
  const cohere = getClient();
  const response = await cohere.embed({
    texts: [question],
    model: CONFIG.EMBED_MODEL,
    inputType: 'search_query',
    embeddingTypes: ['float'],
  });
  return extractEmbeddings(response)[0];
}
