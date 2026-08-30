# knowledge — pinned third-party sources

Background knowledge only. Each entry is a git submodule pinned to one
revision, so what is read today is what was read last week.

## Rules

- **Background only.** For anything time-sensitive — a live API, a library
  version, a free tier, a model id — **current official documentation supplies
  the truth**, and this corpus does not. A pinned source records what was true
  when it was pinned.

  This is not theoretical. A pinned model id, `llama-3.3-70b-versatile`, was
  withdrawn by its provider; every call returned `HTTP 404`, and the measurement
  harness reported the result as sixteen teaching refusals.

- **This repository's own code and tests outrank everything here.**
- Nothing is vendored. A submodule is a pointer; `git submodule update --init
  <path>` fetches it, and an uninitialised path is an empty directory rather
  than missing content.

## Sources

| Path | Upstream | Pinned | Licence |
|---|---|---|---|
| `knowledge/playwright` | [microsoft/playwright](https://github.com/microsoft/playwright) | `de214f4` | Apache-2.0 |

### `knowledge/playwright`

Added for the browser gates. `frontend-scenes` (2 shards) and `frontend-visual`
run real Chromium through Playwright, and `playwright.config.ts` pins
`workers: 1` / `fullyParallel: false` because the specs measure frame intervals
and input latency — parallel workers on one CPU fight for it and poison every
p95 they touch. That constraint is load-bearing and easy to undo by accident, so
the upstream reference for it lives here rather than in a link that may rot.

Sub-paths that answer questions this repository actually asks:

```
knowledge/playwright/docs/src/locators.md              # locator strategy, and why not CSS
knowledge/playwright/docs/src/other-locators.md
knowledge/playwright/docs/src/debug.md                 # trace viewer, for a scene that fails only in CI
knowledge/playwright/docs/src/running-tests-js.md      # sharding, retries, workers
knowledge/playwright/docs/src/accessibility-testing-js.md
knowledge/playwright/docs/src/api-testing-js.md
knowledge/playwright/tests/                            # how they test the tester
```

That last path is why this is worth having whole rather than as a documentation
link. Playwright's own suite is the largest available worked example of testing
a thing that is itself a test runner — which is exactly the problem
`frontend/scripts/gh-annotate.test.mjs` has, and the one that let a *skipped*
test be reported to GitHub as a *failure* on `main`.

## A note on the other 21 sources

They live on the unmerged branch behind PR #157 and are **not on `main`**, so
this file lists only what is actually present here. When #157 lands, the two
tables and the two `.gitmodules` files need merging by hand. That is an add/add
conflict, not a content disagreement, and it is expected.
