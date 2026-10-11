# Verification scope

The shipped product is `frontend/`, built by the root Dockerfile. Its release
workflow includes every executable frontend/server TypeScript file in the unit
coverage denominator, type checks the application, runs desktop/phone Chromium,
checks the production API and container, and scans repository JavaScript,
Python and GitHub Actions with CodeQL.

| Retained component | Verified behavior | Release scope |
| --- | --- | --- |
| frontend | 150 unit tests, 20 browser checks, production/container smoke and deliberate fault detection | Canvas release |
| ci | 22 adversarial workflow/evidence/verdict/annotation tests and actionlint | Canvas release |

## Retired systems

The user authorized retirement of unused engines to keep the canvas minimal.
The duplicate practice-map app, Python teaching backend, Lean proofs, old root verification harness,
related fixtures/configuration/documentation and unused dependency catalog were
removed from main. They supplied no current canvas runtime behavior. Git history
before this retirement preserves them; removal is not a claim their failures
were fixed. Before retirement, the root offline suite had 1244 passes and 178
failures; the Python teaching backend had 867 passes and 12 failures. Those
failures largely concerned interfaces removed from the earlier canvas.

Practice-map had 32 passing tests and a passing local build, but its separate
Next.js runtime had dependency advisories and no canvas consumers. It was retired
as an unused duplicate app, not described as repaired.

The root Docker build context now includes only frontend files. Retired app,
retired code and unrelated local data are excluded. Application dependencies
come from each retained application's own manifest/lockfile. Dependabot checks
the remaining npm application and GitHub Actions.

## Limits and enforcement

Coverage floors prevent regression; they are not 100% coverage or correctness.
Physical microphone/speaker behavior and real provider teaching quality/quotas
need live testing. Scanners cannot detect every bug and passing tests do not
prove every line's behavior correct.

The branch ruleset remains disabled. Updating it through this connection returns
HTTP 403 `Resource not accessible by integration`. Repository administration
access must activate an up-to-date ruleset requiring GitHub Actions `release-gate`
with no bypasses. A workflow cannot grant itself administration permission.
Until then, successful checks do not establish mandatory merge enforcement.

A permanent gate test first failed when an extra `.yaml` workflow escaped the
integrity checker. The checker now examines both GitHub-supported YAML extensions;
all 22 gate tests pass after the fix.
