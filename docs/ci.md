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

The measured unit baseline is about 75.98% lines, 68.30% statements, 69.23%
functions and 64.43% branches, including entry points. Floors are 75/68/69/64;
these prevent regression, not certify high or complete coverage. Production
server tests run subprocesses and browser checks run Chromium, so their executed
lines are not counted in that unit percentage. They remain separate gates.
No executable application files are excluded to improve the number. The
checker compares coverage evidence with discovered src/server files and compares
test evidence with discovered test files. Declaration-only `.d.ts` files are
not executable scope.

147 tests and 16 files are the current minimum regression floor, not a target
for inflated case counts. Generated cases remain loops within the actual test
count. The strength check deliberately breaks retrieval and excerpt selection
in an isolated copy and requires the corresponding assertions to fail.
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
Git retains their complete history. Legacy Python/proof/backend sources remain
in the repository but are not packaged into the canvas image. Their tests are
available through the manual, non-release `legacy-checks.yml`; existing legacy
failures remain unresolved. `ci/gates.toml` and older verifier scripts describe
that retired topology and do not authorize canvas releases. Security scanning
still includes the legacy source.

Model teaching accuracy, real provider quota/latency and physical microphone
quality require live testing. The release workflow uses local provider/browser
fixtures and does not consume model API keys. Passing it is evidence of the
listed checks, not a perfection certificate or production hosting deployment.
