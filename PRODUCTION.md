# PRODUCTION.md — what "ready for a public cloud launch" means here

Written 2026-08-30. Target chosen by the owner: **cloud, public launch, anyone
can use it.**

Every claim below was measured by reading the code on 2026-08-30, not taken
from `WORK.md` — which is stale (it lists the `authorConcept` wiring as the
current job; `CanvasRoute.tsx:29` already imports `explainAgain`).

---

## The state, measured

| Thing | Measured result | File |
|---|---|---|
| Serves the built app | **No.** No static serving anywhere | `server/index.ts` |
| Deployment artifact | **None.** No Dockerfile | repo root |
| `.dockerignore` | Written, detailed, **untracked** — refers to a Dockerfile that never existed | `.dockerignore` |
| Rate limiting | **None** | `server/handler.ts` |
| Inbound CORS / origin policy | **None** | `server/handler.ts` |
| Student identity | `body['studentId']`, **client-supplied and unverified** | `handler.ts:334` |
| Ledger concurrency | Atomic write, **no lock** — read-modify-write loses updates | `almanac/fileStore.ts` |
| Health endpoint | Present, names capabilities only | `handler.ts:111` |
| Body cap | 256 KB, enforced per chunk | `index.ts` |
| Bind address | `127.0.0.1` by default, `HOST` overrides | `index.ts` |

---

## What "public launch" adds that a private one does not

Three things, and each is a real defect at public scale rather than a nicety.

1. **Money.** Every `/api/lesson`, `/api/ask`, `/api/doubt` and `/api/search`
   call reaches a paid model. With no rate limit, one script drains the
   account. This is the highest-severity item on the list.
2. **Other people's data.** `studentId` arrives in the request body and is
   never verified, so any client can read or write any student's ledger by
   naming their id. At one user this is invisible. At two it is a breach.
3. **Minors.** The audience is school students. The safest design is to
   collect **no personal data at all** — an opaque device-generated id, no
   name, no email, no accounts. That removes the obligation rather than
   managing it.

---

## The order of work

Each tier is shippable on its own and is listed in the order that a launch
actually blocks on. A tier is done when its verification command passes.

### Tier 0 — it cannot serve at all — DONE

| # | Work | Verified by |
|---|---|---|
| 0.1 | Serve `frontend/dist/`, SPA fallback so `/canvas/gas` survives a refresh | 28 tests; scenarios "Sharing a link…", "Refreshing in the middle…" |
| 0.2 | Path-traversal refusal, every spelling, on the raw wire | 6 unit + 6 socket-level cases |
| 0.3 | Multi-stage `Dockerfile`, non-root, healthcheck | image builds, container answers, `healthy` |
| 0.4 | `0.0.0.0` set by the deployment, loopback still the source default | startup log states which, and warns |

### Tier 1 — public means money and strangers — DONE

| # | Work | Verified by |
|---|---|---|
| 1.1 | Per-caller and global rate limit on the four paid routes | 8 unit tests, 6/6 mutants killed; scenario "Nobody can spend the project's budget" |
| 1.2 | Every persisted or forwarded string bounded | 6 tests. Bounds measured against real data: longest CBSE concept id is 162 chars |
| 1.3 | No secret in the image; one package shipped, not the tree | `docker history` clean; image 694 MB → 358 MB, guarded by `server-externals.mjs --check` |

**The per-key limit is best effort and the global ceiling is the guarantee.**
A bounded table keyed on a caller-controlled value can always be flushed by
inventing keys. Measured, not assumed — a test asserting otherwise failed.

### Tier 2.2 — many users at once — DONE

The ledger is PostgreSQL when `ALMANAC_DATABASE_URL` is set, and every
operation is a single statement the database resolves:

| Operation | Statement | Why there is no lock |
|---|---|---|
| `markDone` | `INSERT … ON CONFLICT DO NOTHING` | the primary key IS the merge |
| `dayFor` | `INSERT … DO NOTHING RETURNING`, then read the winner | frozen once; the loser returns the winner's day, never an overwrite |

Measured against the shipped image, two replicas:

| | Before | After |
|---|---:|---:|
| 60 marks split across two replicas | **28 lost** | **0 lost** |
| 20 marks split across two replicas | **10 refused (500)** | **0 refused** |

The 500s were a second defect: `fileStore` wrote to a FIXED temporary name,
`<ledger>.writing`, so one process renamed the file out from under the other.

`CREATE TABLE IF NOT EXISTS` **is not race-free** — two replicas starting
together against an empty database killed one with a duplicate key on
`pg_type_typname_nsp_index`. The migration now takes `pg_advisory_xact_lock`
first, in one statement so it runs on one connection.

The file store remains for single-process development and now says so at
startup, and warns that running more than one copy against it loses work.

### Tier 2.1 — still open

`studentId` is bounded and validated but still **client-supplied and
unverified**. Any client can read or write any student's progress by naming
their id. That is the last item before this is safe for strangers.

### Tier 3 — operable once live — not started

| # | Work |
|---|---|
| 3.1 | Structured request logging, no secrets, no student text |
| 3.2 | Graceful shutdown on SIGTERM |

---

## How to run it

```bash
docker compose -f docker-compose.canvas.yml up -d     # 2 replicas + postgres
PYTHONPATH=features python -m behave features/        # 11 scenarios
```

## Rules this work does not get to break

- The API key never reaches the browser. `VITE_*` is compiled into the bundle,
  so a key there is a published key.
- The loopback default in `index.ts` stays. Exposure is a deployment decision,
  made with `HOST`, and the server says so in its startup log.
- A refusal is shown, never swallowed. A student told their question was
  answered when it was not is the failure this codebase was built to avoid.
- `handler.ts` stays a pure JSON function. Static serving is an HTTP-layer
  concern and lives in `index.ts`.
