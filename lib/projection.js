/**
 * 3D projection of embeddings for the frontend's vector-space globe.
 *
 * The UI renders every chunk as a point on a sphere — not decorative dots,
 * but a real (if heavily compressed) view of the vector index: each chunk's
 * 1024-dimensional Cohere embedding is projected onto 3 fixed pseudo-random
 * axes (a random projection, Johnson–Lindenstrauss style) and normalized to
 * the unit sphere. Random projection roughly preserves angles, so chunks
 * about similar topics tend to land near each other on the globe, and the
 * red flash of retrieved chunks visibly clusters around the query's topic.
 */

import { CONFIG } from '../config.js';

/** Small deterministic PRNG so the axes are identical across restarts. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Three fixed random unit axes in embedding space, built once per process.
const AXES = (() => {
  const rand = mulberry32(1337);
  return [0, 1, 2].map(() => {
    const axis = Array.from({ length: CONFIG.EMBED_DIM }, () => rand() * 2 - 1);
    const norm = Math.hypot(...axis) || 1;
    return axis.map((x) => x / norm);
  });
})();

/**
 * Project one embedding to a point on the unit sphere.
 * @param {number[]} vector - 1024-dim embedding
 * @returns {[number, number, number]}
 */
export function projectTo3D(vector) {
  const p = AXES.map((axis) => {
    let dot = 0;
    for (let i = 0; i < axis.length; i++) dot += axis[i] * (vector[i] ?? 0);
    return dot;
  });
  const norm = Math.hypot(...p) || 1;
  return p.map((x) => Number((x / norm).toFixed(3)));
}
