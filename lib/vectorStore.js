/**
 * STAGES 4 & 5 — STORE and RETRIEVE
 *
 * An in-process vector store built on HNSW (Hierarchical Navigable Small
 * World), an approximate-nearest-neighbor graph index. HNSW finds the
 * closest vectors in roughly O(log n) instead of comparing the query
 * against every stored vector — overkill for one PDF, but it's the same
 * data structure behind dedicated vector DBs, and running it in-process
 * means zero external infrastructure.
 *
 * The index only stores vectors and integer labels. The actual chunk text
 * and its source filename live in a parallel `metadata` array, where the
 * array position IS the index label. search() joins the two back together.
 *
 * We use cosine space: similarity is about *direction* of the vector
 * (meaning), not magnitude. hnswlib reports cosine *distance*
 * (1 - similarity), so we convert back: a score of 1.0 = identical meaning,
 * 0 = unrelated.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import hnswlib from 'hnswlib-node';
import { CONFIG } from '../config.js';

const { HierarchicalNSW } = hnswlib;

const INDEX_FILE = 'index.bin';
const META_FILE = 'meta.json';

export class VectorStore {
  constructor(dim = CONFIG.EMBED_DIM) {
    this.dim = dim;
    this.index = new HierarchicalNSW('cosine', dim);
    this.initialized = false;
    // Parallel array: metadata[i] describes the vector with label i.
    this.metadata = [];
  }

  /**
   * Add vectors with their chunk metadata.
   *
   * @param {number[][]} vectors
   * @param {Array<{ text: string, source: string, chunkIndex: number }>} metadatas
   */
  add(vectors, metadatas) {
    if (vectors.length !== metadatas.length) {
      throw new Error('vectors and metadatas must be the same length');
    }

    const needed = this.metadata.length + vectors.length;
    if (!this.initialized) {
      this.index.initIndex(needed);
      this.initialized = true;
    } else if (needed > this.index.getMaxElements()) {
      // HNSW indexes are fixed-capacity; grow when adding more documents.
      this.index.resizeIndex(needed);
    }

    for (let i = 0; i < vectors.length; i++) {
      const label = this.metadata.length;
      this.index.addPoint(vectors[i], label);
      this.metadata.push(metadatas[i]);
    }
  }

  /**
   * Find the k chunks most similar to a query vector.
   *
   * @param {number[]} queryVector - Embedded question (search_query type!).
   * @param {number} k
   * @returns {Array<{ text, source, chunkIndex, score }>} sorted best-first;
   *          score is cosine similarity in [0, 1].
   */
  search(queryVector, k = CONFIG.TOP_K) {
    if (!this.initialized || this.metadata.length === 0) {
      return [];
    }
    const limit = Math.min(k, this.metadata.length);
    const { neighbors, distances } = this.index.searchKnn(queryVector, limit);

    return neighbors.map((label, i) => ({
      ...this.metadata[label],
      score: 1 - distances[i], // cosine distance → cosine similarity
    }));
  }

  get size() {
    return this.metadata.length;
  }

  /**
   * Persist the index + metadata to a directory (used in Phase 3 so
   * sessions survive server restarts).
   */
  async save(dir) {
    await mkdir(dir, { recursive: true });
    await this.index.writeIndex(path.join(dir, INDEX_FILE));
    await writeFile(
      path.join(dir, META_FILE),
      JSON.stringify({ dim: this.dim, metadata: this.metadata })
    );
  }

  /** Load a previously saved store from a directory. */
  static async load(dir) {
    const meta = JSON.parse(await readFile(path.join(dir, META_FILE), 'utf-8'));
    const store = new VectorStore(meta.dim);
    await store.index.readIndex(path.join(dir, INDEX_FILE));
    store.metadata = meta.metadata;
    store.initialized = true;
    return store;
  }
}
