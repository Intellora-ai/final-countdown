# Contributing

## The one command

```bash
make sandbox-fast
```

Run it before every push. `make bootstrap` installs a repository-local pre-push hook that
runs it for you, so a normal `git push` cannot skip it.

## Why it exists

On 2026-08-20 four CI runs went red in a row. The first was `pyright` — one of the
seventeen required GitHub contexts, simply missing from the set of checks run before
pushing. Nothing in the repository answered "run what CI runs", so that set came from
memory, and memory dropped one.

`make sandbox-fast` answers it from [`ci/local-execution.toml`](ci/local-execution.toml),
which records every required context exactly once: either an exact command that runs here,
or an exact reason it cannot.

## Setup

```bash
make doctor      # prerequisites; works before the venv exists
make bootstrap   # creates .venv from the lockfiles, installs the pre-push hook
```

`bootstrap` prints every action before taking it, installs nothing system-wide, and
installs only what `requirements.lock` and `package-lock.json` pin.

## What the local run does and does not prove

Nine of the seventeen required contexts cannot honestly run here — AXLE needs a hosted
service, CodeQL is produced by GitHub, `e2e` needs a browser binary outside the lockfiles.
They are printed with their exact reasons *before* any gate executes, so a first failure
can never hide them. **A local pass is a partial result.**

The hook is not a security boundary. `git push --no-verify`, the GitHub web UI, a direct
API call, or another machine all bypass it. GitHub's seventeen required contexts remain
the final merge proof.

## Everything else

| topic | authority |
|---|---|
| what the verification system proves, and does not | [TRUST.md](TRUST.md) |
| the evidence schema and gate lifecycle | [evidence.md](evidence.md) |
| CI timing measurements | [docs/ci-benchmark.md](docs/ci-benchmark.md) |
| PR measured-claim binding | [docs/merge-evidence.md](docs/merge-evidence.md) |
| local sandbox usage in detail | [docs/engineering/local-sandbox.md](docs/engineering/local-sandbox.md) |
| word definitions and measurement rules | [docs/engineering/measurement-and-definitions.md](docs/engineering/measurement-and-definitions.md) |
| baseline facts and safety boundaries | [docs/engineering/baseline-and-safety.md](docs/engineering/baseline-and-safety.md) |
