# Deploy to production (Railway)

This app is a Vite frontend + a long-running Node API server that share one
process and one URL. It deploys from GitHub to Railway the way the video
deploys a Next.js app to Vercel — connect the repo, set env vars, get a live
`*.up.railway.app` URL, and every push auto-redeploys. Railway (not Vercel)
because the server is long-running and holds the model key; Render works the
same way if you prefer it.

Repo: **`Intellora-ai/final-countdown`**  ·  Branch: **`codex`**

## What is already in the repo (no account needed)

- **`Dockerfile`** — builds the SPA and bundles the server, ships a Node 24
  image that serves both. Pinned to Node 24 because the server uses
  `node:sqlite`, which needs Node ≥ 23.4.
- **`railway.json`** — tells Railway to build from the Dockerfile, health-check
  `/api/health`, and restart on failure.
- **`.dockerignore`** — keeps the 8 GB working tree out of the build (context is
  ~56 kB).
- **`frontend/.env.example`** — every env var the server reads, with meanings.

The server serves the built frontend at `/` and the API at `/api/*` — one
service, one domain. Proven locally and in the Docker image (see the bottom).

---

## Steps only your account can do — do these, then paste me the URL

### 1. Create the service from GitHub
1. Go to **railway.com → New Project → Deploy from GitHub repo**.
2. Authorize Railway on GitHub if asked, then pick **`Intellora-ai/final-countdown`**.
3. In the service’s **Settings → Source**, set the **Branch** to **`codex`**
   (or merge to `main` first and deploy `main`).
4. Railway detects `railway.json` and builds from the `Dockerfile` — no build
   command to type.

### 2. Add a Volume (so a student’s work survives a redeploy)
1. On the service: **New → Volume** (or **Settings → Volumes → Add**).
2. **Mount path:** `/data`  ← must be exactly this; the image writes the sqlite
   memory, ledger, and identity secret there.

### 3. Add environment Variables (Settings → Variables)
Set these (values are yours — never commit them):

| Variable | Value | Why |
|---|---|---|
| `GROQ_API_KEY` | a free key from console.groq.com | **Required** — without a model key the app loads but can’t author a lesson |
| `ALMANAC_IDENTITY_SECRET` | any long random string | stable student identity across restarts |
| `IDENTITY_COOKIE_SECURE` | `1` | Railway serves https; the cookie must be `Secure` |

Do **not** set `PORT` (Railway injects it) or `HOST` (the image sets
`0.0.0.0`). `CANVAS_MEMORY_DB`, `ALMANAC_LEDGER`, and
`ALMANAC_IDENTITY_SECRET_FILE` already default to `/data/...` in the image, so
they land on the volume automatically.

### 4. (Optional, the video’s Neon step) Postgres for the ledger
1. On the project: **New → Database → Add PostgreSQL** (or use a Neon DB).
2. Copy its connection string into a variable **`ALMANAC_DATABASE_URL`**.
3. The ledger then lives in Postgres (shared, safe for many servers); canvas
   memory stays on the sqlite volume.

### 5. Deploy and grab the URL
1. Railway builds and deploys automatically. Watch **Deployments → Logs** — a
   healthy boot prints:
   `almanac server listening on http://0.0.0.0:<port>` and
   `frontend: /app/frontend/dist (served at / — one service, one URL)`.
2. **Settings → Networking → Generate Domain** → you get a
   `*.up.railway.app` URL. **Paste it to me.**

### 6. (Optional) Custom domain + SSL
**Settings → Networking → Custom Domain**, add your domain, create the CNAME
record Railway shows at your DNS provider; SSL is automatic.

---

## After it’s live — the production-testing loop (I drive this)

Paste me the URL and I will, against the **real production URL**:
1. confirm the canvas loads at `/` and `/api/health` returns 200;
2. ask a real question on the canvas and watch whether a lesson is authored
   (this proves the model key + server + volume are wired);
3. when something fails in prod but worked locally (a missing env var, the
   cookie-secure flag, a DB path, an absent model key), I diagnose it, fix the
   **code/config**, and hand you “pushed — please redeploy” (Railway also
   auto-redeploys on every push to the deployed branch);
4. then I test the live URL again — repeat until it works in production.

## Verify the CI/CD loop (the video’s final proof)
Push any trivial commit to `codex` → Railway auto-redeploys → the change is
live. That closes the loop: code → GitHub → production, on every push.

---

## Proven locally before you touch Railway

- `cd frontend && npx vite build && npx vite build --config vite.server.config.ts`
  then `CANVAS_MEMORY_DB=/tmp/x.db GROQ_API_KEY=… PORT=8799 node dist-server/index.js`
  → `http://localhost:8799/` serves the app and `/api/health` returns 200 on the
  same port.
- `docker build -t final-countdown-deploy .` then
  `docker run -e GROQ_API_KEY=… -e PORT=8080 -p 8080:8080 final-countdown-deploy`
  → the exact image Railway runs, serving both on one port.
