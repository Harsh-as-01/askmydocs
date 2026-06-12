/**
 * Central configuration for the RAG pipeline.
 *
 * These constants control the chunking / retrieval trade-offs:
 *  - Bigger chunks  = more context per retrieved piece, but less precise retrieval.
 *  - Smaller chunks = sharper retrieval, but answers may lack surrounding context.
 *  - Overlap ensures a fact that straddles a chunk boundary is fully present
 *    in at least one chunk instead of being cut in half.
 */
export const CONFIG = {
  // Target chunk size in *tokens*. We estimate tokens as chars / 4 (a good
  // rule of thumb for English), so 500 tokens ≈ 2000 characters.
  CHUNK_SIZE: 500,

  // Tokens of overlap carried from the end of one chunk into the next.
  CHUNK_OVERLAP: 50,

  // Rough chars-per-token ratio used to convert the token targets above
  // into character budgets the chunker can actually measure.
  CHARS_PER_TOKEN: 4,

  // How many chunks to retrieve per question. Too few risks missing the
  // answer; too many dilutes the context and invites the LLM to drift.
  TOP_K: 4,

  // Cohere embed-english-v3.0 produces 1024-dimensional vectors.
  EMBED_DIM: 1024,
  EMBED_MODEL: 'embed-english-v3.0',

  // Groq-hosted Llama 3.3 70B for answer generation.
  GENERATION_MODEL: 'llama-3.3-70b-versatile',

  // Low temperature = deterministic, factual output. We want the model to
  // repeat what the document says, not get creative.
  GENERATION_TEMPERATURE: 0.1,

  // How many past chat messages are considered when rewriting a follow-up
  // question ("what voids it?") into a standalone one for retrieval.
  MAX_HISTORY_MESSAGES: 6,

  // Guardrails for the public demo: caps per session and per IP address.
  // These protect the (rate-limited, quota'd) Groq and Cohere API keys
  // behind the server from being drained by a single visitor or bot.
  MAX_DOCS_PER_SESSION: 5,
  RATE_LIMIT: {
    UPLOADS_PER_HOUR: 10,
    CHATS_PER_15_MIN: 30,
  },
};
