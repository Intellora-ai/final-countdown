# The engineering harness

Claude reasons and acts freely. This harness remembers where the work is,
records what actually happened, and decides from evidence, never from a
sentence, whether the work is complete. Claude keeps its judgment; it loses
the authority to declare success by itself.

Spec: `docs/superpowers/specs/2026-09-02-engineering-harness-design.md`.
Plan: `docs/superpowers/plans/2026-09-02-engineering-harness.md`.

## What runs, and when

| Event | Script | Does |
|---|---|---|
| a prompt is submitted | `hooks/route.py` | classifies it (bug, feature, refactor, investigation, spike, config), opens a task if none is open, and suggests a skill |
| a Bash command finishes | `hooks/record_command.py` | records the command, its exit code, and the parsed test summary if it was a test run; recalls a known failure fingerprint |
| a file is edited or written | `hooks/record_change.py` | records the path and whether it is a test or production; asks for a reason when a test changes after red |
| before a file is edited | `hooks/precondition.py` | in phase `red`, warns (or denies, with `--policy block`) when production code is touched before a failing test run exists |
| Claude tries to stop | `hooks/completion_gate.py` | runs the verifier; blocks the stop with the named gaps, at most twice for the same evidence, then steps aside saying UNVERIFIED |

Wired in `.claude/settings.json`. Each command looks for the hook under the
session directory first, then the Claude project directory and its children,
and exits 0 if it finds nothing: `$CLAUDE_PROJECT_DIR` is the folder Claude
Code was opened in, which is not always the git repository, and a hook that
cannot find its script must never block an edit. That was measured, not
assumed: the first wiring blocked its own author's writes.

State lives in `.harness/` (gitignored): `task.json`, `evidence.jsonl`,
`verdict.json`, `memory/`.

## The command line

```
python3 scripts/harness/cli.py start <bug|feature|refactor|investigation|spike|config> "<title>" [--risk low|medium|high] [--policy warn|block]
python3 scripts/harness/cli.py status
python3 scripts/harness/cli.py hypothesis "<what you think is going on>"
python3 scripts/harness/cli.py reproduce "<how the failure was reproduced>"
python3 scripts/harness/cli.py reason "<why a test changed after red>"
python3 scripts/harness/cli.py advance
python3 scripts/harness/cli.py attack          # prints the attacker prompt with this task's diff
python3 scripts/harness/cli.py attacked <accepted|hardened|rejected> "<notes>"
python3 scripts/harness/cli.py verify          # look, touch nothing
python3 scripts/harness/cli.py done            # the verifier decides; only PASS completes
python3 scripts/harness/cli.py abandon "<why>"
```

## The rules the verifier holds

| Rule | Applies to | Passes when |
|---|---|---|
| ROOT_CAUSE_RECORDED | bug | a hypothesis and a reproduction are on record |
| RED_BEFORE_GREEN | bug, feature | a failing test run exists and no production change precedes it |
| GREEN_AFTER_LAST_CHANGE | all code tasks | the latest parsed test run after the last change is green with exit 0 (red is FAIL) |
| TESTS_NOT_QUIETLY_CHANGED | bug, feature | every test-file change after the first red run carries a reason |
| VERIFICATION_RAN | all code tasks | a static check (ruff, pyright, mypy, tsc, eslint, typecheck, lint) ran green after the last change |
| ATTACK_REVIEWED | risk high | an attack review concluded accepted or hardened after the last change |
| FINDING_RECORDED | investigation, spike | a finding is on record |

## Why it is shaped like this

An instruction in CLAUDE.md is guidance; it can be forgotten. A phase that
cannot change without a record of what happened is enforcement. The day this
was built, three instructions were ignored in one afternoon; none of these
rules can be.

The harness never calls a model, never runs a subprocess from a hook, and
never edits a CI gate. It is small on purpose: five mechanisms, one file of
evidence, one verdict.
