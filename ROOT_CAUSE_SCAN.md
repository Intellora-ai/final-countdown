# Root cause scan: Railway production deploy crashes 6s after start

Depth: **Triage** (focused deploy-failure analysis, not a full 173-file repo sweep —
the symptom is a runtime/config failure of the deploy, not a code defect in the repo).

## Summary
One root cause, config-level. The Railway deployment of commit `4bd596ba` builds and
starts, then exits within ~6 seconds (`success → failure` in the GitHub deployment
statuses). The server intentionally calls `process.exit(1)` when no model API key is
present in its **runtime** environment. The key must live in **Railway → Variables**;
a key set in GitHub (Actions/Environment secrets) never reaches a Railway container.

## Symptom (observed vs inferred)
- Observed (GitHub deployments API): env `glistening-laughter / production`, deployment
  of ref `4bd596ba` went `in_progress → success (18:26:59Z) → failure (18:27:05Z)`.
- Observed (local): running the built server with no model key prints
  `no model is configured, so no lesson can be written` and the process exits.
- Cannot observe directly: Railway's own build/deploy logs and its Variables (no Railway
  API/MCP in this session); GitHub secret values (never exposed by the API to anyone).

## Root cause
### 1. No model API key in the Railway runtime environment — critical — flagged (user action)
- **Chain:** deploy shows failure ← container exits ~6s after start ← `main()` in
  `frontend/server/index.ts` throws "no model is configured" and the entrypoint catches
  it and calls `process.exit(1)` ← no `GROQ_API_KEY` (or other provider key) in the
  container's env ← **the key was not set in Railway Variables** (setting it in GitHub
  does not inject it into a Railway container).
- **Evidence:** `frontend/server/index.ts` — provider selection throws when no provider
  env var is set; the `if (import.meta.url …) { try { main() } catch { …; process.exit(1) } }`
  guard exits. Reproduced locally: with `GROQ_API_KEY` unset the process exits immediately;
  with a placeholder set it boots and serves.
- **Fix (belongs in Railway, not the repo):** add to the service's Variables —
  `GROQ_API_KEY` (free at console.groq.com), `ALMANAC_IDENTITY_SECRET`,
  `IDENTITY_COOKIE_SECURE=1`. Railway redeploys and the container boots.
- **Verified:** pending — will confirm against the live URL once the key is set and the
  redeploy is green (deploy watcher running).

## Ruled out
| Candidate | Why it isn't this |
|---|---|
| Build failure | The deployment reached `success` (build + start) before `failure`; a build break never reaches `success`. |
| Node/`node:sqlite` too old | Image pins `node:24-slim`; `node:sqlite` proven working there — it wrote `/data/canvas-memory.db` in a real container this session. |
| Missing `pg`/`zod` at runtime | Fixed already: the runtime stage installs both; the container boots with them present (proven). |
| Wrong `HOST`/`PORT` | Image sets `HOST=0.0.0.0`; server reads `PORT` from env (Railway injects it). |
| `/data` not writable without a volume | `mkdir -p /data` runs as root in the image; sqlite wrote there with no volume mounted (proven). |
| GitHub Actions CI failing | Unrelated to the Railway deploy; Railway builds from the repo directly, not via a workflow. |

## Unresolved — needs information
- The exact last lines of the Railway **deploy log** would make the root cause
  certain-by-observation rather than certain-by-strong-inference. Not required to act —
  the fix is the same — but it's the one piece only the Railway dashboard shows.

## Coverage
Focused scan: the deploy artifacts (`Dockerfile`, `railway.json`) and the server boot
path (`frontend/server/index.ts` entrypoint + provider selection) were read end to end.
A full repo sweep was deliberately not run — the symptom is a deploy/config failure with
a single confirmed root, not a latent code defect across modules.

## Needs human review
- Setting the API key is a **you-only** action (it's your secret, in your Railway
  account). No repo change fixes this; nothing to merge.
