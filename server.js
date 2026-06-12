/**
 * AskMyDocs API server (Phase 2).
 *
 * Endpoints:
 *   POST /api/upload  — multipart PDF upload → runs LOAD → CHUNK → EMBED →
 *                       STORE and returns a sessionId.
 *   POST /api/chat    — { sessionId, question } → Server-Sent Events stream:
 *                       a `sources` event first (retrieved chunks + scores),
 *                       then `token` events as the answer is generated,
 *                       then `done`.
 *   GET  /api/health  — liveness probe ({ ok: true }); the frontend also
 *                       pings this to warm up a cold-started server.
 *
 * Sessions are cached in memory and persisted to ./data/<sessionId> so they
 * survive server restarts (see lib/sessions.js). Uploading with an existing
 * sessionId adds the new PDF to that session (multi-document chat).
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { loadPdf } from './lib/loader.js';
import { chunkText } from './lib/chunker.js';
import { embedChunks } from './lib/embedder.js';
import { VectorStore } from './lib/vectorStore.js';
import { retrieveSources, streamAnswerTokens, REFUSAL_TEXT } from './lib/rag.js';
import { getSession, setSession, persistSession } from './lib/sessions.js';

const app = express();
app.use(cors()); // frontend runs on a different origin (Vite dev / Vercel)
app.use(express.json());

// Multer in memory storage: the PDF buffer goes straight to pdf-parse and is
// never written to disk. 15MB cap and PDF-only mimetype filter.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  },
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

/**
 * Ingest a PDF: LOAD → CHUNK → EMBED → STORE → persist to disk.
 *
 * Multi-document: pass an existing sessionId as a form field to add this
 * PDF to that session. Each chunk's metadata records its source filename,
 * so citations always name the right document.
 *
 * Returns { sessionId, filename, chunkCount, files, totalChunks }.
 */
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) {
        // Multer errors: wrong type (our fileFilter) or too large.
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large. The limit is 15MB.'
            : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Send a PDF in the "file" field.' });
      }

      const filename = req.file.originalname;

      // LOAD — throws a descriptive error for scanned/image-only PDFs,
      // which we surface to the user as a 422.
      let text;
      try {
        ({ text } = await loadPdf(req.file.buffer));
      } catch (loadErr) {
        return res.status(422).json({ error: loadErr.message });
      }

      // Adding to an existing session, or starting a fresh one?
      const requestedId = req.body?.sessionId;
      let sessionId = requestedId;
      let session = requestedId ? await getSession(requestedId) : null;

      if (requestedId && !session) {
        return res.status(404).json({ error: 'Session not found. Start a new chat and upload again.' });
      }
      if (!session) {
        sessionId = crypto.randomUUID();
        session = { store: new VectorStore(), files: [] };
      }

      // CHUNK → EMBED (input_type: search_document) → STORE
      const chunks = chunkText(text, filename);
      const vectors = await embedChunks(chunks.map((c) => c.text));
      session.store.add(vectors, chunks);
      session.files.push(filename);

      setSession(sessionId, session);
      // Persist so the session survives a server restart (Phase 3).
      await persistSession(sessionId, session);

      res.json({
        sessionId,
        filename,
        chunkCount: chunks.length,
        files: session.files,
        totalChunks: session.store.size,
      });
    } catch (e) {
      console.error('Upload failed:', e);
      res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
  });
});

/** Write one SSE event frame. */
function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Answer a question over SSE.
 *
 * Event order matters for the UX: `sources` goes out FIRST so the UI can
 * render the citations panel immediately, then the answer streams in
 * token-by-token on top of it.
 */
app.post('/api/chat', async (req, res) => {
  const { sessionId, question } = req.body ?? {};

  if (!sessionId || !question?.trim()) {
    return res.status(400).json({ error: 'Both sessionId and question are required.' });
  }

  // Memory first, then lazy-load from ./data/<sessionId> — this is what
  // lets an old session keep answering after the server restarts.
  const session = await getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found. Please upload a document first.' });
  }

  // Switch the response into SSE mode.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Stop generating if the browser disconnects mid-stream.
  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
  });

  try {
    // RETRIEVE, then send the chunks + similarity scores up front.
    const sources = await retrieveSources(question, session.store);
    sseSend(res, 'sources', sources);

    if (sources.length === 0) {
      sseSend(res, 'token', { token: REFUSAL_TEXT });
    } else {
      // GENERATE: forward each token as its own SSE event.
      for await (const token of streamAnswerTokens(question, sources)) {
        if (clientGone) break;
        sseSend(res, 'token', { token });
      }
    }

    if (!clientGone) sseSend(res, 'done', {});
  } catch (e) {
    console.error('Chat failed:', e);
    if (!clientGone) {
      sseSend(res, 'error', { message: 'Something went wrong while answering. Please try again.' });
    }
  } finally {
    res.end();
  }
});

// Single-container / single-service mode: if the frontend has been built
// (Docker image or Render full-stack deploy), serve it from this process so
// one URL hosts both the UI and the API. In local dev the dist folder is
// absent and Vite serves the UI on :5173 instead — nothing changes.
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontend', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: any non-API route gets index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log('Serving frontend from', distDir);
}

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`AskMyDocs API listening on http://localhost:${port}`);
});
