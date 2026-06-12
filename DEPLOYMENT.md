# Deployment runbook

Three ways to put AskMyDocs in front of people, from simplest to most flexible.
All of them need just two secrets: `GROQ_API_KEY` and `COHERE_API_KEY`.

---

## Option A — One Render service (recommended: a single always-reachable URL)

The Express server also serves the built React app, so one Render web service
hosts everything. `render.yaml` in the repo root automates it.

1. Push this repository to GitHub.
2. In the [Render dashboard](https://dashboard.render.com): **New → Blueprint**, pick the repo.
   Render reads `render.yaml` and creates the `askmydocs` web service.
3. When prompted, fill in the two env vars:
   - `GROQ_API_KEY` = your Groq key
   - `COHERE_API_KEY` = your Cohere key
4. Deploy. Your app is live at `https://askmydocs-<hash>.onrender.com` — UI and API on the same URL.
5. Paste that URL into the README's "Live demo" placeholder.

Manual alternative (no blueprint): **New → Web Service** → pick the repo →
Build command: `npm install && npm --prefix frontend install --include=dev && npm --prefix frontend run build`
Start command: `npm start` → add the two env vars → Create.

**Free-tier realities:**
- The service **sleeps after ~15 min idle**; the first visit takes ~30–60s to wake.
  The UI handles this: it pings `/api/health` on load and shows a "waking up the server" banner until it responds.
- The **disk is ephemeral** — persisted sessions vanish on redeploy/restart of the instance. Fine for a demo; a paid disk or S3 would fix it for production.
- 512MB RAM — plenty, because embeddings are API calls, not a local model.
- For a truly always-on demo (no sleep), upgrade the service to the Starter plan (~$7/mo).

## Option B — Render backend + Vercel frontend (the classic split)

Use this if you want the frontend on Vercel's CDN (instant loads even when the API is asleep).

**Backend on Render:**
1. **New → Web Service** → pick the repo.
2. Build command: `npm install` · Start command: `npm start` (no frontend build needed).
3. Env vars: `GROQ_API_KEY`, `COHERE_API_KEY`.
4. Note the service URL, e.g. `https://askmydocs-api.onrender.com`.

**Frontend on Vercel:**
1. [Vercel dashboard](https://vercel.com/new) → Import the same repo.
2. **Root Directory: `frontend`** (important — the React app lives in a subfolder).
3. Framework preset: Vite (auto-detected). Build command `npm run build`, output `dist` (defaults).
4. Env var: `VITE_API_URL` = your Render URL from step 4 above (no trailing slash).
   ⚠ This is baked in at **build time** — if you change it later, redeploy.
5. Deploy. The UI is served from Vercel, calls the Render API, and CORS is already enabled server-side.

## Option C — Docker (any host, or a local "demo box")

The repo ships a multi-stage `Dockerfile` (backend deps + frontend build + slim runtime) and a `docker-compose.yml`.

**Local always-running demo:**
```bash
cp .env.example .env   # paste the two keys
docker compose up -d --build
# → http://localhost:3001
```
- `restart: unless-stopped` keeps it alive across crashes and reboots (enable "Start Docker Desktop when you sign in" on Windows).
- Sessions persist in `./data` on the host.
- Stop with `docker compose down`; update with `docker compose up -d --build`.
- Note: localhost is only reachable on your own machine/network. To let outsiders test it, deploy the same image to a host (below) — or, for a quick temporary share, a tunnel like `cloudflared` or `ngrok` works.
- Prereq on Windows: [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) with WSL2 (one-time install + reboot).

**Same image on a cloud host:** any service that runs containers works —
Render (choose "Deploy from Dockerfile" instead of the Node runtime; set the two env vars),
Railway, Fly.io, or a $4 VPS with `docker compose up -d`. The image needs no
configuration beyond the two env vars and (optionally) a volume at `/app/data`.

---

## Environment variable summary

| Variable | Where | Value |
|---|---|---|
| `GROQ_API_KEY` | Render service / Docker `.env` | from console.groq.com |
| `COHERE_API_KEY` | Render service / Docker `.env` | from dashboard.cohere.com |
| `PORT` | optional everywhere | defaults to 3001 (Render injects its own) |
| `VITE_API_URL` | **Vercel only** (Option B) | the Render backend URL |

`VITE_API_URL` is deliberately absent in Options A and C: the production bundle
falls back to same-origin requests, because the API and UI share one URL.

## Post-deploy smoke test

1. Open the app URL → if free-tier Render was asleep, the amber "waking up" banner shows, then clears.
2. Upload `sample.pdf` → "sample.pdf · 2 chunks" appears.
3. Ask *"What does error code E02 mean?"* → streamed, cited answer.
4. Ask *"What is the capital of France?"* → "I couldn't find that in the document."
5. `GET <url>/api/health` → `{"ok":true}`.
