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
  const vectors = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await cohere.embed({
      texts: batch,
      model: CONFIG.EMBED_MODEL,
      inputType: 'search_document',
      embeddingTypes: ['float'],
    });
    vectors.push(...extractEmbeddings(response));
  }

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
