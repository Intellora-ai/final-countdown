# Verification scope and remaining gaps

The shipped product is `frontend/`, built by the root Dockerfile. Its release
workflow covers every executable frontend/server TypeScript file in the unit
coverage denominator, type checks the application, exercises desktop/phone
Chromium, checks the production API and deployable container, and runs CodeQL
for JavaScript/TypeScript, Python and GitHub Actions across the repository.
Coverage floors prevent regression; they are not 100% coverage or correctness.

## Component inventory

| Component | Purpose and observed verification | Release status |
| --- | --- | --- |
| frontend | Canvas, provider adapter, memory, uploads, visuals and browser voice; 150 unit tests, 20 browser checks, production/container smoke and deliberate fault checks passed on GitHub | Canvas release checks |
| ci | Workflow/evidence/SARIF/verdict integrity; 21 adversarial tests and actionlint pass | Canvas release checks |
| practice-map | Separate Next.js practice application; frozen install, 32 tests, TypeScript and production build passed locally | Separate manual job; no production/browser certification |
| learning-os | Legacy Python teaching backend; 867 passes, 12 failures with documented import path enabled; database suite not run | Not packaged; unresolved old canvas fixture/renderer integration |
| root src/tests/scripts/proofs/specs | Legacy formal-verification and workflow harness; root offline suite produced 1244 passes, 178 failures, 5 skips and 13 hosted-proof deselections | Not packaged; retired-workflow contracts remain broken |
| technology-universe/registry | Historical catalog data, not application imports | Not a supported runtime |

The 49 tracked files under `technology-universe/runtimes` were removed after
checking that frontend, practice-map, learning-os, current workflows and scripts
have no references to their installation paths. They installed hundreds of
unrelated libraries but supplied no shipped application behavior. Their source
and locks remain recoverable from Git history before this cleanup. The registry
is historical inventory, not evidence that those libraries are installed.

## Reproduce and inspect gaps

Root legacy tests: `.venv/bin/python -m pytest -m 'not axle' --tb=short`.
Learning backend: from learning-os, `PYTHONPATH=src ../.venv/bin/python -m pytest
 tests --ignore=tests/db --tb=short`. These suites are intentionally still red;
no assertions were removed to hide their retired-contract failures.
Practice-map: from practice-map, `corepack pnpm install --frozen-lockfile` then
`corepack pnpm run check`. The manual legacy workflow includes the documented
Python import path and repeats practice-map's checks.

Physical microphone/speaker behavior, real provider teaching quality and quotas,
database integration and hosted formal proofs are not established by fixture
checks. Scanners cannot detect every bug and passing tests do not imply every
line's behavior was checked.

## Merge enforcement

The repository ruleset is disabled. Updating it through this connection returns
HTTP 403, `Resource not accessible by integration`. Administration access must
activate an up-to-date ruleset requiring the GitHub Actions `release-gate`
context, with no bypasses. A workflow cannot grant its own token repository
administration permission. Until the ruleset is active, failed checks can still
be bypassed by repository writes. Do not describe enforcement as complete.
