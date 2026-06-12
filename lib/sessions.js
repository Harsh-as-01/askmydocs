/**
 * Session manager with disk persistence (Phase 3).
 *
 * Sessions live in an in-memory Map for fast access, but every session is
 * also persisted under ./data/<sessionId>/:
 *   - index.bin     — the serialized HNSW graph (written by VectorStore)
 *   - meta.json     — chunk texts + source filenames (written by VectorStore)
 *   - session.json  — session-level info (list of uploaded files)
 *
 * When a chat request misses the Map (typically because the server
 * restarted — common on free hosting tiers that sleep and recycle dynos),
 * we lazily reload the session from disk instead of failing. The user never
 * notices the restart.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VectorStore } from './vectorStore.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const SESSION_FILE = 'session.json';

// sessionId → { store: VectorStore, files: string[] }
const memory = new Map();

// Session ids are UUIDs we generated ourselves. Validating the shape before
// touching the filesystem also blocks path-traversal attempts like
// sessionId = "../../etc" from ever reaching path.join().
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSessionId = (id) => typeof id === 'string' && UUID_RE.test(id);

const dirFor = (sessionId) => path.join(DATA_DIR, sessionId);

/**
 * Fetch a session: memory first, then lazy-load from disk.
 * @returns {Promise<{store: VectorStore, files: string[]} | null>}
 */
export async function getSession(sessionId) {
  if (!isValidSessionId(sessionId)) return null;
  if (memory.has(sessionId)) return memory.get(sessionId);

  try {
    const dir = dirFor(sessionId);
    const info = JSON.parse(await readFile(path.join(dir, SESSION_FILE), 'utf-8'));
    const store = await VectorStore.load(dir);
    const session = { store, files: info.files ?? [] };
    memory.set(sessionId, session); // cache for subsequent requests
    return session;
  } catch {
    return null; // never persisted (or files were deleted)
  }
}

/** Register a session in memory (call persistSession to make it durable). */
export function setSession(sessionId, session) {
  memory.set(sessionId, session);
}

/** Write the session's vector index + metadata to ./data/<sessionId>. */
export async function persistSession(sessionId, session) {
  const dir = dirFor(sessionId);
  await session.store.save(dir); // creates the directory, writes index + meta
  await writeFile(
    path.join(dir, SESSION_FILE),
    JSON.stringify({ files: session.files, savedAt: new Date().toISOString() })
  );
}
