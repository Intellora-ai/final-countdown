
## Hand-written engine companion does not meet the teaching arc

`frontend/src/canvas/lessons/handwritten/contract-honoured-by-hand.json` fails
`checkTeaching` at `arc: true` after Batch 4 raised the engine's output contract.

Measured, not guessed:

| Rule | Detail |
|---|---|
| `definition-too-long` | its definition block is 54 words; the cap is 30 |
| `definition-split-up` | that definition runs across two sentences |
| `no-summary` / `nothing-is-shown` | it has neither a summary nor a shown block |
| `nothing-marked` | no block marks a term |

Not fixed here because fixing it is AUTHORING -- rewriting a human's prose --
not a change to `learning_os/api/emit.py`, which is what Batch 4 is about. The
two engine-GENERATED lessons now pass the same gate, which is the claim Batch 4
makes. See `frontend/src/canvas/lessons/engineTeaches.test.ts`.

## Four tracked npm manifests are still unwatched by Dependabot

`.github/dependabot.yml` now has an `npm` entry, but it points at `/frontend`
only. Dependabot watches exactly one directory per entry, so every other
tracked JS manifest in this repository receives no version updates and no
security-update PRs.

Measured with `git ls-files`, not guessed:

| Path | Lockfile | What it is | Watched? |
|---|---|---|---|
| `frontend/` | `package-lock.json` | the dashboard app | **yes** |
| `./` (repo root) | `package-lock.json` | `@playwright/test` — runs in CI | no |
| `practice-map/` | `pnpm-lock.yaml` | Next.js 16 app, react 19 | no |
| `technology-universe/runtimes/javascript*/` (6 dirs) | `package-lock.json` | language sandboxes | no |
| `.claude/skills/gke-app-onboarding/assets/` | `package-lock.json` | vendored skill asset | no |

The root and `practice-map` entries are the two that plausibly matter: the root
lockfile pins the Playwright version CI actually executes, and `practice-map`
is a real application with runtime dependencies. Dependabot's `npm` ecosystem
covers pnpm, so `practice-map` needs no separate ecosystem — only its own
`directory:` entry.

Not fixed here because the task specified the frontend entry precisely and
naming the other directories is a scope decision, not a correction. Adding them
is additive and cannot break the existing entries.

## `.venv` is missing from this worktree

`tests/` cannot run with the worktree's own interpreter — bare `python3` has no
PyYAML. Verification for this task used the main checkout's interpreter at
`/Users/tanveersidhu/final countdown/.venv/bin/python3` against the worktree's
files. A `.venv` symlink in the worktree would remove the workaround.
