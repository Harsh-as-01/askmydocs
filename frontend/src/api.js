/**
 * API helper for the AskMyDocs backend.
 *
 * Note on streaming: the browser's built-in EventSource only supports GET,
 * but our chat endpoint is a POST (it carries a JSON body). So we use
 * fetch() and parse the Server-Sent Events framing ourselves — events are
 * separated by a blank line, with `event:` and `data:` lines inside.
 */

// Backend base URL resolution:
//  - VITE_API_URL set (Vercel + separate Render API) → use it.
//  - Unset in dev → the local backend on :3001.
//  - Unset in production build → '' (same origin): the Docker image and the
//    single-service Render deploy serve UI and API from one URL.
const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

/**
 * Liveness ping — also used to warm a cold-started backend (free hosting
 * tiers put idle servers to sleep; the first request wakes them up).
 * Times out after 5s so the UI can show a "waking up" notice and retry.
 */
export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error('Backend is not responding');
  return res.json();
}

/**
 * Upload a PDF for ingestion. Pass an existing sessionId to add the
 * document to that session (multi-document chat).
 * @returns {Promise<{ sessionId, filename, chunkCount, files, totalChunks }>}
 */
export async function uploadPdf(file, sessionId) {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) formData.append('sessionId', sessionId);

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Upload failed (HTTP ${res.status})`);
  }
  return body;
}

/**
 * Ask a question and consume the SSE stream.
 *
 * The server sends, in order:
 *   1. `sources` — retrieved chunks with similarity scores (before the
 *      answer, so the UI can show citations immediately)
 *   2. many `token` events — answer fragments
 *   3. `done` — stream finished (or `error` on failure)
 *
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.question
 * @param {Array<{role, content}>} [opts.history] - recent turns, used by the
 *        backend to rewrite follow-up questions before retrieval
 * @param {(sources: Array) => void} opts.onSources
 * @param {(token: string) => void} opts.onToken
 * @returns {Promise<void>} resolves on `done`, rejects on `error`
 */
export async function streamChat({ sessionId, question, history = [], onSources, onToken }) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, question, history }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Chat failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are delimited by a blank line. Keep the (possibly
    // incomplete) trailing frame in the buffer for the next read.
    const frames = buffer.split('\n\n');
    buffer = frames.pop();

    for (const frame of frames) {
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;

      const payload = JSON.parse(data);
      if (event === 'sources') onSources?.(payload);
      else if (event === 'token') onToken?.(payload.token);
      else if (event === 'error') throw new Error(payload.message);
      else if (event === 'done') return;
    }
  }
}
