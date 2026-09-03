# OWNER.md — what only you can do

Three things were on this list. On 2026-09-03 all three were taken on and
done here, so what follows is the record and the one thing genuinely left.

## 1. The socket-bound tests — DONE, and they found six real defects

They had never run on this machine. They run now, through the `socket-tests`
entry in `.claude/launch.json`, which executes outside the sandbox that
blocked them:

```bash
cd frontend && npx vitest run server/ src/api/
```

**First run: 81 files, 1,087 tests, 6 failed.** All six were real, all six are
fixed at the root, and the suite is now **81 files, 1,096 tests, 0 failed**.

One caveat, measured rather than waved away: `m4-startup-contention` waits 30
seconds for a second process to release a lock, and under load it runs out of
time. Alone on an idle machine it is 3 tests in 4.5 seconds, green; inside a
loaded full run it failed 2 of 4 times today, and both failures were runs that
took 34 seconds instead of 21. Its budget was left alone. Re-run it by itself
(the `one-socket-test` entry) before believing a failure.

| what was wrong | where |
|---|---|
| a page the web served was dropped from the search reply instead of being returned and flagged | `openweb.ts`, and both consumers |
| `/api/health` published the vendor and the local model's name on the most public route | `handler.ts` — my own Part I change, against a law that predates it |
| an oversized body was refused by dropping the connection, so the 413 never arrived | `index.ts` |
| the no-provider law cleared 3 of the 9 ways to configure a model, so the server started anyway | `boot.test.ts` |

## 2. The big model — MEASURED, and the work it was wanted for is done

`gemma3:12b` is **8.1 GB**; this machine had **7.3 GB** available with every
server of mine stopped. It does not fit, and forcing it would swap. So it was
not run.

`qwen3:8b` is **5.2 GB** and fits, measured live: available fell to 2.3 GB and
held, with no meaningful rise in paging. On three topics where `qwen2.5:7b`
had returned a single concept, given the identical brief and the identical
locked syllabus page, it returned **13, 3 and 7**.

So the answer to "when is the machine free for the big model" is: it is free
for a model up to about 6 GB right now, and would need roughly another 1 GB
free for `gemma3:12b`. Closing a few applications would do it.

## 3. The 49 knowledge candidates — DONE, with the reasons written down

Ten topics are now `verified` and on screen, 65 concepts, every quotation
re-checked against the sha256-locked PDFs. Five were left with a reason each
(they said nothing the title did not). One was sent back over a generator
defect. The 29 weak ones were re-run on `qwen3:8b`.

Every decision and every reason is in
`frontend/src/data/knowledge/candidates/README.md`.

---

## What is actually left for you

**Nothing blocking.** Two standing decisions remain yours by design:

- **`INTELLIGENCE_MODE`** on the server you run: `off` (today) → `shadow` →
  `canary` (with `INTELLIGENCE_CANARY_PERCENT`) → `primary`. The report is
  `GET /api/intelligence/report` on any server whose mode is not off; the
  disagreement queue is the `shadow_runs` table in that server's database.
  Promotion is never automatic and the report says so on every reply.
- **Pushing.** Everything is committed on `codex` and nothing is pushed.

If you want `gemma3:12b` used for the next knowledge batch, free about 1 GB
and say so; the batch is one entry in `.claude/launch.json`
(`knowledge-rebatch`) with `KNOWLEDGE_MODEL` changed.
