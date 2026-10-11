# final-countdown

The active product is the learning canvas in `frontend/`, packaged by the root
Dockerfile. Start with [canvas setup](frontend/README.md),
[protected deployment](frontend/RELEASE.md), and [release gates](docs/ci.md).

GitHub runs independent code/test, browser, container, workflow-integrity and
security checks. A final release verdict requires all of them to succeed.
The live branch ruleset must also require `release-gate` to enforce merges.
Passing checks does not establish perfect teaching or 100% coverage.

Legacy Python, Lean and backend sources remain for reference/manual testing;
they are not part of the canvas Docker deployment. Their old workflows and
verification claims are retired; [historical documentation](docs/legacy-verification.md)
records that scope. Existing legacy failures are not claimed to be resolved.
