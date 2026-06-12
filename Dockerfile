# AskMyDocs — single-container build: API + built frontend in one image.
# The same image works locally (docker compose up) and on any container host.
#
# Multi-stage layout keeps the final image lean:
#   1. backend-deps   — full node image (has gcc/make/python) to compile the
#                       hnswlib-node native addon
#   2. frontend-build — builds the React app; no VITE_API_URL is set, so the
#                       bundle calls the same origin that serves it
#   3. runtime        — slim image with only what's needed to run

# ---- Stage 1: backend dependencies (compiles hnswlib-node) ----
FROM node:20 AS backend-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: frontend build ----
FROM node:20 AS frontend-build
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=backend-deps /app/node_modules ./node_modules
COPY package.json config.js server.js ./
COPY lib ./lib
COPY --from=frontend-build /fe/dist ./frontend/dist

# Persisted vector indexes live here — mount a volume to keep sessions
# across container restarts (docker-compose does this automatically).
VOLUME /app/data

EXPOSE 3001
CMD ["node", "server.js"]
