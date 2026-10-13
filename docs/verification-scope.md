# Verification scope

The shipped product is `frontend/`, built by the root Dockerfile. Its release
workflow includes every executable frontend/server TypeScript file in the unit
coverage denominator, type checks the application, runs desktop/phone Chromium,
checks the production API and container, and scans repository JavaScript,
Python and GitHub Actions with CodeQL.

| Retained component | Verified behavior | Release scope |
| --- | --- | --- |
| frontend | 468 tests in 28 files; 100% measured lines with all four coverage floors at 95%; 20 production browser checks plus 2 development checks, production/container smoke and 200 source mutations | Canvas release |
| ci | 86 adversarial workflow/evidence/verdict/annotation tests, native coverage publishing and actionlint | Canvas release |

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

The branch ruleset is active, requires `release-gate` from GitHub Actions and has
no bypass actors. Updating it through this connection still returns
HTTP 403 `Resource not accessible by integration`. Repository administration
access is needed for administration changes. The 95% coverage rule is retained;
CI produces matching Cobertura line evidence and attempts native publishing.
The observed upload at `8cf036b` returned HTTP 404, so no accepted native report
is claimed and the final gate stays blocked. Feature availability and the
remaining Bandit/code-quality requirements must be verified separately. A
workflow cannot grant itself administration permission.

A permanent gate test first failed when an extra `.yaml` workflow escaped the
integrity checker. The checker now examines both GitHub-supported YAML extensions;
the current gate suite preserves that regression alongside evidence and command-integrity checks.
