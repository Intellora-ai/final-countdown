# The local sandbox

One command before every push:

```bash
make sandbox-fast
```

## What it is

A **pinned Python virtualenv plus the repository's existing lockfiles**. Not Docker, not Compose,
not a devcontainer.

That is a decision made from evidence, not preference. This repository has no database, no queue, no
migrations, no ports, no volumes and no services — `src/` is 38 lines across four files, and the
product is the verification apparatus around it. The only external dependency is AXLE, a *hosted*
service that could not be containerised locally in any case. Adding Compose would have meant
inventing an architecture the repository does not have.

**Service lifecycle commands do not exist here.** There is no `sandbox-up`, `sandbox-down`,
`sandbox-reset`, `sandbox-logs` or `sandbox-status`, because there is no service to start, stop or
report on. A target that exists only to print `NOT_APPLICABLE` is still a placeholder, and
placeholders rot into fiction.

## Commands

| command | what it does |
|---|---|
| `make doctor` | prerequisites. Runs on the **system** interpreter, because reporting a missing venv is part of its job. Non-zero on a mandatory gap. |
| `make bootstrap` | creates `.venv` from `requirements.lock` and `package-lock.json`, installs the pre-push hook. Prints every action first. Nothing system-wide. |
| `make sandbox-fast` | the pre-push set. Always includes `pyright`. |
| `make sandbox-test` | every required context that can honestly run here. |
| `make typecheck` | `pyright` alone. |
| `make test` | `pytest -n auto --dist loadfile -m "not axle"`. No network. |
| `make test-axle` | the **only** target that reaches the hosted AXLE service. |
| `make sandbox-verify-determinism` | runs the contract twice and compares. |

## What runs here, and what does not

Selection comes from [`ci/local-execution.toml`](../../ci/local-execution.toml) — never from memory.
Every one of the seventeen required GitHub contexts appears there exactly once, marked
`locally_runnable = "yes"` with an exact argv, or `"no"` with an exact reason.

**8 run locally.** `pyright` · `coverage` · `mutmut` · `spec-strength` · `spec-composition` ·
`vacuity-check` · `counterexample-search` · `honest-report`

**9 do not**, each printed with its reason *before* any gate executes, so a first-gate failure can
never suppress the list:

| context | why not |
|---|---|
| `preflight` | chains `check_ruleset.py` (live GitHub API) and `tcb_gate.py` (needs an `origin/<base>` ref) |
| `axle-verify`, `correspondence` | require the hosted AXLE service |
| `bandit` | consumes a `bandit.sarif` built by a preceding workflow step, and runs `shellcheck`, which no lockfile pins |
| `codeql-python`, `codeql-actions`, `CodeQL` | produced by GitHub-hosted infrastructure |
| `e2e` | needs a Chromium binary outside the lockfiles, plus a generated `htmlcov/` fixture |
| `full` | aggregates artifacts from the same GitHub run; there is no local multi-job run |

**A local pass is a partial result, and the tool says so on every run.**

## The pre-push hook

`make bootstrap` runs `git config core.hooksPath .githooks` — repository-local, never global, and
the hook is version-controlled so it can be reviewed. A normal `git push` runs `make sandbox-fast`
first. On failure it prints the exact argv, exit code, duration and evidence path, then the contexts
that still run only on GitHub.

**It is not a security boundary.** `git push --no-verify`, the GitHub web UI, a direct API call, or
another machine all bypass it. GitHub's seventeen required contexts remain the final merge proof.

## Known limits

- **Interpreter drift.** This machine runs Python 3.14.7 and Node v26; the workflows declare 3.12
  and 24. `make doctor` reports both as `LIMIT`. A local pass does not promise a CI pass.
- **`shellcheck` is not installed** here, which is one reason `bandit` is GitHub-only.
- The sandbox proves nothing about the nine GitHub-only contexts. It never claims to.

## Evidence

Every run writes to `.evidence/<tier>/<run-id>/` — argv, working directory, start and end, duration,
exit code, captured output, the contexts selected, and the contexts that were not run locally.
Gitignored: it is generated and regenerated on demand.

## Elsewhere

[TRUST.md](../../TRUST.md) for what the verification system proves ·
[evidence.md](../../evidence.md) for the gate lifecycle and report schema ·
[docs/ci-benchmark.md](../ci-benchmark.md) for CI timing ·
[docs/merge-evidence.md](../merge-evidence.md) for PR claim binding ·
[baseline-and-safety.md](baseline-and-safety.md) ·
[measurement-and-definitions.md](measurement-and-definitions.md)
