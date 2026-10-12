# final-countdown

The learning canvas lives in `frontend/`. Start with [canvas setup](frontend/README.md),
[protected deployment](frontend/RELEASE.md), and [release gates](docs/ci.md).
The root Dockerfile builds only this app.

GitHub runs independent tests, browser, container, workflow-integrity and security
checks. The final `release-gate` requires every check to succeed. Repository rules
require that status on `main`, with active enforcement and no bypass actors.
This connection cannot edit repository administration settings; obsolete extra
rules still need removal by an administrator. See the release audit for limits.

The unused Python/proof engines and their obsolete verification harness were
retired from main with user authorization. They remain recoverable in Git history.
See [verification scope](docs/verification-scope.md) for evidence and limits.
