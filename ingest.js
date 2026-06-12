/**
 * CLI test harness for the full RAG pipeline (Phase 1).
 *
 * Usage:
 *   node ingest.js <path-to-pdf> "<question>"
 *
 * Runs all six stages end-to-end:
 *   LOAD → CHUNK → EMBED → STORE → RETRIEVE → GENERATE
 * and prints the grounded answer plus the retrieved chunks with their
 * cosine similarity scores.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from './config.js';
import { loadPdf } from './lib/loader.js';
import { chunkText } from './lib/chunker.js';
import { embedChunks } from './lib/embedder.js';
import { VectorStore } from './lib/vectorStore.js';
import { askQuestion } from './lib/rag.js';

const [pdfPath, question] = process.argv.slice(2);

if (!pdfPath || !question) {
  console.error('Usage: node ingest.js <path-to-pdf> "<question>"');
  console.error('Example: node ingest.js ./sample.pdf "What is the refund policy?"');
  process.exit(1);
}

for (const key of ['GROQ_API_KEY', 'COHERE_API_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Copy .env.example to .env and fill in your keys.`);
    process.exit(1);
  }
}

try {
  const filename = path.basename(pdfPath);

  // STAGE 1 — LOAD: PDF bytes → plain text
  console.log(`\n[1/6] Loading ${filename}...`);
  const buffer = await readFile(pdfPath);
  const { text, numPages } = await loadPdf(buffer);
  console.log(`      ${numPages} page(s), ${text.length.toLocaleString()} characters of text`);

  // STAGE 2 — CHUNK: text → overlapping ~500-token pieces
  console.log('[2/6] Chunking...');
  const chunks = chunkText(text, filename);
  console.log(`      ${chunks.length} chunks (~${CONFIG.CHUNK_SIZE} tokens each, ${CONFIG.CHUNK_OVERLAP} overlap)`);

  // STAGE 3 — EMBED: chunks → 1024-dim vectors (input_type: search_document)
  console.log('[3/6] Embedding chunks via Cohere...');
  const vectors = await embedChunks(chunks.map((c) => c.text));
  console.log(`      ${vectors.length} vectors of ${vectors[0].length} dimensions`);

  // STAGE 4 — STORE: vectors into HNSW index + parallel metadata array
  console.log('[4/6] Indexing in HNSW vector store...');
  const store = new VectorStore();
  store.add(vectors, chunks);
  console.log(`      ${store.size} vectors indexed (cosine space)`);

  // STAGES 5+6 — RETRIEVE top-K chunks, GENERATE grounded answer
  console.log('[5/6] Retrieving relevant chunks for the question...');
  console.log('[6/6] Generating grounded answer via Groq...\n');
  const { answer, sources } = await askQuestion(question, store);

  console.log('='.repeat(70));
  console.log(`QUESTION: ${question}`);
  console.log('='.repeat(70));
  console.log(`\nANSWER:\n${answer}\n`);
  console.log('-'.repeat(70));
  console.log(`RETRIEVED SOURCES (top ${sources.length} by cosine similarity):`);
  console.log('-'.repeat(70));

  for (const [i, s] of sources.entries()) {
    const preview = s.text.length > 300 ? s.text.slice(0, 300) + '…' : s.text;
    console.log(`\n[${i + 1}] score=${s.score.toFixed(4)}  source=${s.source}  chunk#${s.chunkIndex}`);
    console.log(preview);
  }
  console.log();
} catch (err) {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}
