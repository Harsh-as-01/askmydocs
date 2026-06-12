# AskMyDocs — Chat with your PDFs, with receipts

**Live demo:** _[link placeholder — deployed on Render]_
**Stack:** Node.js + Express · React (Vite) + Tailwind · Groq (Llama 3.3 70B) · Cohere embeddings · HNSW vector search

---

## The business problem

Teams sit on piles of PDFs — product manuals, contracts, policies, research reports — and finding one specific fact means scrolling, Ctrl+F guessing, or asking a colleague. Generic chatbots are worse than useless here: ask ChatGPT about *your* warranty terms and it will confidently invent an answer.

The hard requirement for document Q&A in any serious setting isn't intelligence — it's **trust**. An answer is only useful if you can check where it came from, and a system that admits *"that's not in the document"* beats one that guesses.

## The solution

AskMyDocs is a Retrieval-Augmented Generation (RAG) app: upload one or more PDFs and ask questions in plain English. Every answer is

- **grounded** — generated strictly from passages retrieved out of *your* documents,
- **cited** — statements carry [1]-style references you can expand to see the exact source passage, its file, and its similarity score,
- **honest** — if the documents don't contain the answer, it says exactly that instead of hallucinating.

Sessions support multiple documents with per-file citation attribution, stream answers token-by-token, and survive server restarts via disk-persisted vector indexes.

## How it works — the RAG pipeline

```
                         INGESTION (per upload)
┌─────────┐   ┌──────────┐   ┌─────────────┐   ┌──────────────────┐
│  1 LOAD │ → │ 2 CHUNK  │ → │  3 EMBED    │ → │  4 STORE         │
│ pdf-parse│  │ ~500 tok │   │ Cohere v3   │   │ HNSW index +     │
│ PDF→text│   │ 50 overlap│  │ 1024-d vecs │   │ metadata array   │
└─────────┘   └──────────┘   └─────────────┘   └──────────────────┘
                                                        │
                         QUERY (per question)           ▼
┌──────────┐   ┌────────────────┐   ┌──────────────────────────────┐
│ question │ → │ 5 RETRIEVE     │ → │ 6 GENERATE                   │
│          │   │ embed question,│   │ Groq Llama 3.3 70B, temp 0.1 │
│          │   │ cosine top-4   │   │ answers ONLY from context,   │
│          │   │ chunks         │   │ cites [n], refuses if absent │
└──────────┘   └────────────────┘   └──────────────────────────────┘
```

The retrieved chunks are streamed to the browser *before* the answer (so citations render instantly), then the answer streams token-by-token over Server-Sent Events.

## Key engineering decisions

**Cohere API embeddings instead of a local model.** A local embedding model (e.g. sentence-transformers) means a ~500MB+ model in RAM — a guaranteed out-of-memory crash on the 512MB instances that free/cheap hosting provides. Calling Cohere's `embed-english-v3.0` keeps the server footprint tiny and deployment boring. Crucially, Cohere v3 embeds documents and queries asymmetrically (`input_type: "search_document"` vs `"search_query"`), which measurably improves retrieval over symmetric embedding.

**Citations as a first-class feature, not an afterthought.** The model receives chunks as a numbered list and must cite `[n]`; the UI maps those numbers back to the exact passages with their similarity scores and source filenames. The user can audit every claim. For document Q&A, this is the difference between a demo and a tool someone will actually rely on.

**Temperature 0.1.** Generation should repeat what the document says, not get creative. Near-zero temperature minimizes drift and keeps answers reproducible — the right trade for factual Q&A, the wrong one for creative writing.

**Chunk size 500 tokens with 50-token overlap.** The central RAG trade-off: bigger chunks carry more context but blur retrieval precision (one vector has to represent too many topics); smaller chunks retrieve sharply but strand facts without context. ~500 tokens with sentence-boundary splitting is a strong default, and the 50-token overlap ensures a fact straddling a chunk boundary survives intact in at least one chunk. Both knobs live in `config.js`.

**HNSW in-process instead of a vector database.** For sessions of one-to-a-few PDFs, a dedicated vector DB is infrastructure for its own sake. `hnswlib-node` provides the same approximate-nearest-neighbor algorithm the big DBs use, in-process, with zero external services — and the index serializes to disk so sessions survive restarts.

**Honest refusal, enforced by prompt.** The system prompt pins an exact refusal sentence ("I couldn't find that in the document.") and forbids outside knowledge. Tested explicitly: off-topic questions get the refusal, not plausible fiction.

## Run it locally

Prereqs: Node 18+, a [Groq API key](https://console.groq.com/keys) (free), a [Cohere API key](https://dashboard.cohere.com/api-keys) (free).

```bash
# 1. Backend
cp .env.example .env        # then paste your two API keys into .env
npm install
npm start                   # → http://localhost:3001

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                 # → http://localhost:5173
```

### Or with Docker (one command, runs continuously)

```bash
cp .env.example .env        # paste your keys
docker compose up -d --build
# → http://localhost:3001  (UI + API on one port)
```

The container restarts automatically after crashes or reboots (`restart: unless-stopped`), and sessions persist in `./data`.

## Try it

Two sample documents are included:

- `sample.pdf` — a standing-desk user manual. Ask: *"How long is the warranty on the frame?"*, *"What does error code E02 mean?"*, *"Explain the return policy in full detail."*
- `sample2.pdf` — an espresso-machine guide. Add it to the same chat via **+ Add PDF**, then ask *"How often should I descale?"* and watch the citation name the right file.

Then test the honesty: ask *"Who is the CEO?"* — it isn't in either document, and the app will tell you exactly that.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full runbook (Render blueprint, Render + Vercel split, or any Docker host).

## Project layout

```
config.js            tunable constants (chunk size, top-K, temperature…)
lib/loader.js        stage 1 — PDF → text
lib/chunker.js       stage 2 — sentence-aware overlapping chunks
lib/embedder.js      stage 3 — Cohere embeddings (document/query asymmetry)
lib/vectorStore.js   stages 4+5 — HNSW index + metadata, save/load
lib/rag.js           stage 6 — grounded generation, streaming, refusal
lib/sessions.js      session cache + disk persistence + lazy reload
server.js            Express API: upload, SSE chat, health, static UI
ingest.js            CLI: run the whole pipeline from the terminal
frontend/            React chat UI with streaming + citation panels
```
