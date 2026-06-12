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
import rateLimit from 'express-rate-limit';
import { CONFIG } from './config.js';
import { loadPdf } from './lib/loader.js';
import { chunkText } from './lib/chunker.js';
import { embedChunks } from './lib/embedder.js';
import { VectorStore } from './lib/vectorStore.js';
import {
  retrieveSources,
  streamAnswerTokens,
  rewriteQuestion,
  suggestQuestions,
  REFUSAL_TEXT,
} from './lib/rag.js';
import { getSession, setSession, persistSession } from './lib/sessions.js';

const app = express();
// Render/most PaaS terminate TLS at a proxy; trust exactly one hop so the
// rate limiter sees the real client IP from X-Forwarded-For, not the proxy's.
app.set('trust proxy', 1);
app.use(cors()); // frontend runs on a different origin (Vite dev / Vercel)
app.use(express.json());

// Per-IP rate limits. This is a public demo running on the owner's API
// keys — without limits, one bot could drain the Groq/Cohere quotas and
// take the demo down for everyone.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: CONFIG.RATE_LIMIT.UPLOADS_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload limit reached for this hour. Please try again later.' },
});
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: CONFIG.RATE_LIMIT.CHATS_PER_15_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many questions in a short time. Please wait a few minutes.' },
});

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
 * Returns { sessionId, filename, chunkCount, files, totalChunks, suggestions }.
 */
app.post('/api/upload', uploadLimiter, (req, res) => {
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
      if (session && session.files.length >= CONFIG.MAX_DOCS_PER_SESSION) {
        return res.status(400).json({
          error: `A session can hold at most ${CONFIG.MAX_DOCS_PER_SESSION} documents. Start a new chat for more.`,
        });
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

      // Best-effort: 3 clickable starter questions from the document's
      // opening chunks, so new users aren't staring at an empty input.
      const suggestions = await suggestQuestions(
        chunks.slice(0, 3).map((c) => c.text).join('\n\n')
      );

      res.json({
        sessionId,
        filename,
        chunkCount: chunks.length,
        files: session.files,
        totalChunks: session.store.size,
        suggestions,
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
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { sessionId, question, history } = req.body ?? {};

  if (!sessionId || !question?.trim()) {
    return res.status(400).json({ error: 'Both sessionId and question are required.' });
  }

  // Sanitize client-supplied history: cap turns and length, allow only the
  // two chat roles. It's only used for query rewriting, never stored.
  const cleanHistory = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-CONFIG.MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

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
    // Resolve follow-ups ("what voids it?") into standalone questions
    // before retrieval — see rewriteQuestion() for why this matters.
    const standalone = await rewriteQuestion(question, cleanHistory);

    // RETRIEVE, then send the chunks + similarity scores up front.
    const sources = await retrieveSources(standalone, session.store);
    sseSend(res, 'sources', sources);

    if (sources.length === 0) {
      sseSend(res, 'token', { token: REFUSAL_TEXT });
    } else {
      // GENERATE: forward each token as its own SSE event.
      for await (const token of streamAnswerTokens(standalone, sources)) {
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
