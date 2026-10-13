# Release gates

The active product is the frontend canvas packaged by the root Dockerfile.
`.github/workflows/ci.yml` is its release workflow; `ci/release-gates.json` is
its command/dependency contract. Every push and PR runs the checks, without
path filters that could leave a required check missing. An optional manual run
is also available. Superseded runs cancel; current runs have bounded timeouts.

Five jobs run in parallel; a sixth publishes the successful core coverage result:

| Gate | Failure it detects |
| --- | --- |
| integrity | Deleted/conditional/suppressed checks, missing commands, mutable action pins, write-token escalation and invalid workflow syntax |
| core | Unit failures/skips/empty collection, missing test files, coverage regression/exclusions, surviving deliberate faults, type/build failures, production API failures and dependency advisories |
| browser | Real Chromium desktop/phone failures in the production app; upload/memory also exercised under Vite. Flaky tests fail rather than retry into green |
| container | A broken deployable image, root execution, authentication/static/PDF-worker failures and lost quota after restart; runs with read-only filesystem and dropped capabilities |
| security | CodeQL analysis of Actions, JavaScript/TypeScript and Python across the repository; SARIF warning/error findings fail even when upload succeeds |
| coverage | Publishes verified Cobertura line evidence to GitHub Code Quality; upload errors or processing timeouts block release |

The `release-gate` job runs even if dependencies fail or skip. It accepts only
an exact, complete set of successful results. Require this one status context
from GitHub Actions (integration 15368) on main. A green run alone does not
prevent an owner from bypassing it when the ruleset is disabled.

## Coverage and test strength

Dependabot groups React, React DOM and both type packages into one PR so
coupled major upgrades are validated together. Node type major upgrades are
held for an intentional runtime upgrade; the deployed runtime is Node 24.

The measured baseline is 100% lines (681/681), 99.73% statements (1137/1140),
98.84% functions (256/259) and 97.30% branches (829/852), including entry points.
All four floors are 95%. These are execution measurements, not a correctness
certificate. New in-process tests exercise the actual HTTP server and React
bootstrap inside Vitest. Existing subprocess and Chromium checks remain separate
evidence and their execution is not added to the unit percentage.
No executable application files are excluded to improve the number. The
checker compares coverage evidence with discovered src/server files and compares
test evidence with discovered test files. Declaration-only `.d.ts` files are
not executable scope.

467 tests and 28 files are the current minimum regression floor, not a target
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

GitHub's native 95% rule evaluates uploaded aggregate line coverage. The official
publisher uses repository-relative Cobertura paths for the exact PR head. A
separate job holds only contents/read, pull-requests/read and code-quality/write;
tested repository code runs with the default read-only token. JSON totals,
per-file counts, XML source paths and actual XML hit counts must agree before
publishing. Upload errors remain fatal and the action waits for processing.
Native publishing needs GitHub Code Quality enabled; artifacts alone do not
enable the feature. GitHub documents availability on Team or Enterprise Cloud.
The current integration receives HTTP 403 when reading the administration-only
`code-quality/setup` endpoint, so it cannot establish the feature state. A
repository owner can open [repository settings](https://github.com/Intellora-ai/final-countdown/settings),
then Security → Code quality → Enable code quality → Save changes, if available.
See [GitHub enablement instructions](https://docs.github.com/en/code-security/how-tos/maintain-quality-code/enable-code-quality).
An unavailable feature must be resolved with GitHub; the 95% floors are not lowered.
Fork/stale-head uploads may be intentionally skipped by the
official action; the local 95% gate still applies and native evidence must not
be claimed for such skips.

The latest published actionlint 1.7.12 does not recognize GitHub's new documented
code-quality permission. Its only diagnostic exception matches that exact scope;
the independent workflow checker requires the exact coverage-only grant and
rejects all other permissions. All remaining lint diagnostics remain fatal.

## Local reproduction

From the repository root:

```sh
python3 ci/check_workflows.py
python3 -m unittest discover -s ci/tests
python3 ci/install_actionlint.py  # Linux amd64
.ci-tools/actionlint -color -ignore '^unknown permission scope "code-quality"\.'
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
Bandit and code-quality requirements remain in place, and the user's 95% coverage
requirement is explicitly preserved. This connection cannot edit that
administration endpoint. The actual 95%-coverage run at `8cf036b` passed core,
integrity, browser, container and Python/Actions security, but native coverage
upload returned HTTP 404 and JavaScript security found an unsafe XML decoder
in a new test. The decoder now uses an isolated Node XML document with scripts
and resources disabled, preserving raw malformed-XML failures. Upload errors
remain fatal; no native evidence is claimed until GitHub accepts the report.
See [verification scope](verification-scope.md).

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
