# Release gates

The active product is the frontend canvas packaged by the root Dockerfile.
`.github/workflows/ci.yml` is its release workflow; `ci/release-gates.json` is
its command/dependency contract. Every push and PR runs the checks, without
path filters that could leave a required check missing. An optional manual run
is also available. Superseded runs cancel; current runs have bounded timeouts.

Five independent jobs run in parallel:

| Gate | Failure it detects |
| --- | --- |
| integrity | Deleted/conditional/suppressed checks, missing commands, mutable action pins, write-token escalation and invalid workflow syntax |
| core | Unit failures/skips/empty collection, missing test files, coverage regression/exclusions, surviving deliberate faults, type/build failures, production API failures and dependency advisories |
| browser | Real Chromium desktop/phone failures in the production app; upload/memory also exercised under Vite. Flaky tests fail rather than retry into green |
| container | A broken deployable image, root execution, authentication/static/PDF-worker failures and lost quota after restart; runs with read-only filesystem and dropped capabilities |
| security | CodeQL analysis of Actions, JavaScript/TypeScript and Python across the repository; SARIF warning/error findings fail even when upload succeeds |

The `release-gate` job runs even if dependencies fail or skip. It accepts only
an exact, complete set of successful results. Require this one status context
from GitHub Actions (integration 15368) on main. A green run alone does not
prevent an owner from bypassing it when the ruleset is disabled.

## Coverage and test strength

Dependabot groups React, React DOM and both type packages into one PR so
coupled major upgrades are validated together. Node type major upgrades are
held for an intentional runtime upgrade; the deployed runtime is Node 24.

The measured unit baseline is 85.46% lines, 80.35% statements, 79.92%
functions and 77.46% branches, including entry points. Floors are 85/80/79/76;
these prevent regression, not certify high or complete coverage. Production
server tests run subprocesses and browser checks run Chromium, so their executed
lines are not counted in that unit percentage. They remain separate gates.
No executable application files are excluded to improve the number. The
checker compares coverage evidence with discovered src/server files and compares
test evidence with discovered test files. Declaration-only `.d.ts` files are
not executable scope.

270 tests and 21 files are the current minimum regression floor, not a target
for inflated case counts. Generated cases remain loops within the actual test
count. The strength check generates 200 type-valid source mutations across voice,
visuals, memory, uploads and server code using the existing TypeScript parser.
It runs isolated copies against related behavioral tests and records exact
source/test/runner hashes, locations and outcomes. Invalid compilation, surviving
mutations and timeouts are separate from failing-assertion detection. The report
is retained as a GitHub artifact. An independent checker rejects stale source,
test or runner hashes, fabricated kills, incorrect bailout counts, survivors and
timeouts. A report is not proof of perfect correctness.
Adversarial CI tests sabotage commands, conditions, dependencies, evidence,
coverage, permissions and scanner output. The external actionlint binary is
pinned to an official release and SHA256; GitHub actions use immutable commits.
The gate contract, verifier code and tests still need human review: code cannot
provide an independent proof of its own honesty.

## Local reproduction

From the repository root:

```sh
python3 ci/check_workflows.py
python3 -m unittest discover -s ci/tests
python3 ci/install_actionlint.py  # Linux amd64
.ci-tools/actionlint -color
```

From frontend:

```sh
npm ci
npm run test:ci
npm run test:strength
npm run build
npm run test:production
npm audit --audit-level=moderate
npx --no-install playwright install --with-deps chromium
TEST_PRODUCTION=1 npm run test:e2e -- --fail-on-flaky-tests
npm run test:e2e -- tests/browser/learning.spec.ts --fail-on-flaky-tests
```

Then from the root build `docker build -t canvas-ci .` and run
`node frontend/scripts/check-container.mjs canvas-ci`. Enterprise proxy
certificates, when needed, use the Dockerfile's cloud_ca BuildKit secret;
TLS verification must remain enabled. Test containers/volumes are uniquely
named and removed, including on failure. Node 24+ is required.

## What was retired

The previous 13 workflows included checks for removed frontend paths, a
credential-dependent live tutor, redundant annotation/run reconciliation and
AI workflows with write permissions. Their historical failures were not
"fixed" by renaming them green. Those release workflows were removed.
Git retains their complete history. With explicit user authorization, the unused
Python/proof/backend systems and their obsolete harness, fixtures and dependency
bundles were also retired from main. Their observed failures were recorded
before deletion; deletion is not a claim they were repaired. The duplicate practice-map app was also retired; the canvas is the single retained application.
See [verification scope](verification-scope.md) for the retained components.

Model teaching accuracy, real provider quota/latency and physical microphone
quality require live testing. The release workflow uses local provider/browser
fixtures and does not consume model API keys. Passing it is evidence of the
listed checks, not a perfection certificate or production hosting deployment.

## Installation evidence

The first GitHub run at commit 13e2958 passed integrity, unit/coverage/strength,
production API, browser, container and Python/Actions security checks. Its
JavaScript security scan found `js/xss-through-dom`; the release verdict
correctly failed. Detailed diagnostics located it at the uploaded EPUB/HTML
parsing boundary, which now sanitizes markup with the existing DOMPurify
dependency. MathML also retains sanitization as additional defense. No scanner
suppression was added. A browser test reload race was corrected by waiting for
the visible answer and completed turn before testing persisted memory.

The initial attempt to activate ruleset 20990225 through the GitHub integration
returned HTTP 403. It has since been activated and requires `release-gate`
from GitHub Actions (integration 15368), with no bypass actors. Additional legacy
Bandit, code-quality and 95%-coverage requirements still need an administrator
to reconcile; this connection cannot update that endpoint. They can block a PR
even when the release workflow passes. See the current [verification scope](verification-scope.md).

Scanner findings now emit GitHub error annotations with the SARIF source file,
line and column when provided, rule identifier, diagnostic and the rule's
remediation documentation link. Every finding in a report is printed before
failure, including suppressed findings. Command values are escaped so untrusted
source text cannot forge workflow commands. Missing locations are reported
without inventing a line. Automated fixes are not applied to protected branches;
changes must pass the same gates. This is diagnostic guidance, not a promise
that a scanner can generate a correct repair for every bug.

Verified GitHub run for cd21f80: all eight jobs succeeded in approximately
84 seconds: https://github.com/Intellora-ai/final-countdown/actions/runs/38170035443.
That run included 150 unit tests across 17 files, 20 browser checks, mutation,
production API, deployable container, workflow integrity and three CodeQL scans.
The annotation enhancements additionally have adversarial tests for exact
locations, remediation links, command injection and reporting multiple findings.
