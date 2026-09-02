# OWNER.md — what only you can do

Real blockers only. Everything else is being done without you.

## 1. Run the socket-bound tests

Fourteen test files bind a local port, which my sandbox cannot do, so they have
never been run by me. The vault fix on 2026-09-03 and every shadow-mode change
adds to the store they cover.

```bash
cd frontend && npx vitest run server/ src/api/
```

If any of these are red, tell me the exact words on your screen.

## 2. Tell me when the machine is free for the big local model

Shadow runs use `gemma3:12b` when they can. Last time it ran beside two dev
servers the machine had 11 % memory left. The shadow queue is built to wait;
it needs to know when.

## 3. Each promotion is your decision, by design

- The 49 knowledge candidates in `frontend/src/data/knowledge/candidates/` —
  about 18 look right to me; none becomes `verified` without your eyes.
- `INTELLIGENCE_MODE=shadow` → `canary` → `primary`, with
  `INTELLIGENCE_CANARY_PERCENT`, set on the server you run (your `api` entry on
  8787 is `off`; `api-shadow` on 8791 and `api-canary` on 8792 exist for
  proofs). The report is `GET /api/intelligence/report` on a server whose mode
  is not off; the disagreement queue is the `shadow_runs` table in that
  server's database. I do not flip the switch.

## Not blockers (so they stop being asked)

- Cloud keys at 429 — the local model covers everything here.
- `VITE_TUTOR_ENDPOINT` — the intelligence work is server-side; `/quick-question`
  is left as it is.
- Pushing — the commits on `codex` wait for your word.
