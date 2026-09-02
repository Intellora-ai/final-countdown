# Engineering Harness — design

**Date:** 2026-09-02
**Status:** approved by the owner in the message that specified it; this document
translates that message into the mechanisms this repository can actually run.

## The fundamental truth this is built on

Claude generates decisions probabilistically. An instruction is not a guarantee.
Any architecture whose correctness depends on Claude always obeying CLAUDE.md is
unsound, and the day this was written proved it three times: a link "verified"
in the wrong browser, three example topics hardcoded against an explicit
instruction, and a test pushed without ever being run.

So the harness does not ask Claude to remember. It gives the work a state that
lives outside Claude's attention, records what actually happened as evidence,
and lets an independent, deterministic verifier decide whether the work is
complete. Claude keeps its judgment; it loses its unilateral authority to
declare success.

```
PROMPTS  → guidance         (CLAUDE.md, skills)      influence
TOOLS    → capabilities     (hooks, preconditions)   control what is possible
TESTS    → behavioural constraints                   show what happened
GATES    → enforcement      (verifier, CI)           prevent unsupported claims
```

## Scope

**In:** the five V1 mechanisms the owner named — workflow state, evidence store,
test oracle, independent verifier, completion gate — plus the event-driven
hooks that feed them, a task router that suggests (never forces) a skill, a
test-attacker prompt for risk-bounded adversarial review, and failure memory
built on the flight recorder's fingerprints that already exist in this repo.

**Out:** any change to CI gate files (`.github/workflows/*`, `ci/gates.toml`,
gate scripts) — those change only with the owner's explicit per-change yes.
No second LLM is wired in; the attacker is a prompt a person or a subagent is
handed. No new required check.

## Where it lives, and why there

| Piece | Path | Reason |
|---|---|---|
| Library | `scripts/harness/` | `scripts/` is already pyright-strict, ruff-linted, bandit-scanned and listed unmeasured for coverage in `ci/gates.toml`. No gate file changes. |
| Hook entry points | `scripts/harness/hooks/*.py` | The sandbox forbids Bash writes under `.claude/hooks`; scripts in the repo are writable and are referenced by absolute path from settings. |
| Tests | `tests/test_harness_*.py` | Root `tests/` is what CI's pytest already runs. |
| Runtime state | `.harness/` (gitignored) | Per-checkout state, never committed. |
| Hook wiring | `.claude/settings.json` → `hooks` | The project settings file Claude Code reads. |
| Docs | `docs/superpowers/{specs,plans}/` | Where the restored superpowers skills expect them. |

## The five mechanisms

### 1. Workflow state — `scripts/harness/state.py`

One task at a time, in `.harness/task.json`:

```json
{
  "type": "bug",
  "title": "…",
  "phase": "investigate",
  "risk": "medium",
  "policy": "warn",
  "started_at": "2026-09-02T…",
  "history": [{"at": "…", "from": "investigate", "to": "root_cause", "because": "…"}]
}
```

Task types and their phase sequences:

| Type | Phases |
|---|---|
| `bug` | investigate → root_cause → red → green → refactor → verify → complete |
| `feature` | spec → red → green → refactor → verify → complete |
| `refactor` | baseline → refactor → verify → complete |
| `investigation` | investigate → report → complete |
| `spike` | probe → report → complete |
| `config` | change → verify → complete |

A transition is a pure function `advance(task, evidence) -> Task | Blocked`.
It succeeds only when the evidence store already contains what the next phase
requires. Claude can *request* a transition; it cannot fabricate one, because the
preconditions are read from evidence, not from Claude's message.

Preconditions (the ones that carry the owner's rules):

| Transition | Requires in evidence |
|---|---|
| investigate → root_cause | a `reproduction` event (a command run whose exit code was non-zero, or an explicit `harness reproduce` record) and a `hypothesis` record |
| root_cause → red, spec → red | nothing extra (the test comes next) |
| red → green | a `test_run` with `failed > 0` that happened **after** the last test-file change and **before** any production-file change since `red` began — that is "tests before code" as an observable fact |
| green → refactor | a `test_run` with `failed == 0` after the last production change |
| refactor → verify | tests still green after the last change |
| verify → complete | never by `advance`; only the verifier (below) may write `complete` |

`policy` is `warn` or `block`; it decides what the precondition hook does when
production code is edited without RED evidence. Default `warn`, because a rigid
system rejects everything and the owner already rejected that.

### 2. Evidence store — `scripts/harness/evidence.py`

Append-only JSONL at `.harness/evidence.jsonl`. Every record has `at`, `kind`,
and kind-specific fields. Kinds:

- `command` — `{command, exit_code, stdout_tail, stderr_tail}` from the Bash
  PostToolUse hook. If the command looks like a test runner, the record also
  carries `test_run: {runner, passed, failed, errors}` parsed from the output
  (pytest's summary line, vitest's `Tests N passed | M failed`, playwright's
  `N passed / M failed`).
- `file_change` — `{path, role: "test"|"production"|"other", tool}` from the
  Edit/Write/MultiEdit PostToolUse hook. Role is decided by path: anything under
  a `tests/`, `test/`, `e2e/`, `features/` directory, or named `*.test.*`,
  `*.spec.*`, `test_*.py`, `*_test.py`, `conftest.py` is a test; `src/`,
  `server/`, `scripts/`, `learning-os/src/` are production; the rest `other`.
- `hypothesis`, `reproduction`, `reason`, `verdict`, `attack` — written by the
  CLI when Claude (or a person) records them in words.

Evidence is what the verifier reads. Claude's sentences are not evidence.

### 3. Test oracle — inside `evidence.py`

Parsing test output into numbers is the oracle: it turns "I ran the tests" into
`passed=187 failed=0 exit=0`. It never runs anything itself; the hook hands it
the output of what Claude already ran. A command that looks like a test runner
but whose output cannot be parsed is recorded as `test_run: null`, which the
verifier treats as **no evidence**, not as a pass.

### 4. Independent verifier — `scripts/harness/verify.py`

Deterministic, reads only `.harness/`, writes `.harness/verdict.json`. Never
calls a model. It answers one question per rule and reports the first failing
rule with the exact evidence gap:

| Rule | What it checks |
|---|---|
| RED_BEFORE_GREEN | for `bug`/`feature`: some test run failed before the first production change of the task |
| GREEN_AFTER_LAST_CHANGE | the latest `test_run` is after the latest `file_change` and has `failed == 0`, `errors == 0`, `exit_code == 0` |
| TESTS_NOT_QUIETLY_CHANGED | every test-file `file_change` after RED is followed by a `reason` record |
| ROOT_CAUSE_RECORDED | for `bug`: a `hypothesis` and a `reproduction` exist |
| VERIFICATION_RAN | for phases past `green`: at least one `command` whose command matches a verification pattern (`ruff`, `pyright`, `mypy`, `tsc`, `typecheck`, `lint`, `eslint`, `vitest`, `pytest`, `playwright`) ran after the last change with exit 0 |
| ATTACK_REVIEWED | for `risk == high`: an `attack` record with `outcome` exists after the last change |

Verdict is `PASS`, `MORE_WORK` (a rule failed for lack of evidence, with the
gap named) or `FAIL` (a rule failed on contradicting evidence, e.g. the last
test run is red). Only a `PASS` verdict moves the task to `complete`.

### 5. Completion gate — `scripts/harness/hooks/completion_gate.py`

A `Stop` hook. When `.harness/task.json` exists and its phase is not
`complete`, it runs the verifier. If the verdict is not `PASS` it blocks the
stop **once** (honouring `stop_hook_active` so it can never loop) and hands
Claude the named gap. If there is no active task it does nothing. It cannot be
satisfied by words: the only way through is evidence in the store.

## The hooks (event-driven, cheap, narrow)

| Event | Matcher | Script | Does |
|---|---|---|---|
| `UserPromptSubmit` | — | `route.py` | Classifies the prompt (bug / feature / refactor / investigation / spike / config) by keywords, opens a task if none is active, and returns `additionalContext`: current phase, evidence summary, and the *suggested* skill. Claude may override with a stated reason. |
| `PostToolUse` | `Bash` | `record_command.py` | Appends a `command` record, with `test_run` parsed when it is a test runner. |
| `PostToolUse` | `Edit\|Write\|MultiEdit` | `record_change.py` | Appends a `file_change`. If a test file changed while the phase is `green`/`refactor`/`verify`, returns `additionalContext` asking for the reason and telling Claude to record it with `harness reason "…"`. Never blocks. |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `precondition.py` | For `bug`/`feature` in phase `red`, when the target is a production file and no failing `test_run` exists yet: `policy=warn` → `additionalContext` "no RED evidence"; `policy=block` → `permissionDecision: deny` with the reason. |
| `Stop` | — | `completion_gate.py` | As above. |

Every hook reads its JSON from stdin, exits 0 on any internal error (a broken
hook must never take the session down), and finishes in well under a second —
they touch one JSONL file and one JSON file.

## The CLI — `scripts/harness/cli.py`

```
harness start <type> "<title>" [--risk low|medium|high] [--policy warn|block]
harness status                       phase, evidence counts, what the next phase needs
harness hypothesis "<text>"          records a hypothesis
harness reproduce "<how>"            records a reproduction in words (commands are recorded by the hook)
harness reason "<why the test changed>"
harness advance                      requests the next phase; prints the gap if refused
harness attack                       prints the attacker prompt filled with the task's diff, for a subagent or a person
harness attacked <outcome> "<notes>" records the attack's outcome
harness verify                       runs the verifier, prints the verdict
harness done                         runs the verifier; moves to complete only on PASS
harness abandon "<why>"              closes the task without completion, recorded as such
```

`python3 scripts/harness/cli.py …` is the full spelling; a `harness` wrapper is
not installed anywhere, to keep the footprint to files in the repo.

## The router (skills: select, don't force)

| Classified as | Suggested skill |
|---|---|
| bug, test failure | `systematic-debugging` |
| feature, architecture | `brainstorming`, then `test-driven-development` |
| refactor | `test-driven-development` + `verification-before-completion` |
| investigation, spike | none forced; `verification-before-completion` at the end |
| config | `verification-before-completion` |

Classification is keyword-based and deliberately dumb; it is a suggestion in
`additionalContext`, and the record of what was suggested is evidence too.

## The attacker (risk-bounded)

`scripts/harness/prompts/attacker.md` is a prompt template: "Here is the diff
and the tests. How could this implementation pass these tests while being
wrong?" with the owner's attack list (null, empty, large, invalid, race,
concurrent, timeout, retry, reordering, stale, constant return, hardcoded
answer, mock-only satisfaction). `harness attack` fills it with `git diff`
against the task's start commit. It is required by the verifier only for
`risk == high`; suggested for `medium`; skipped for `low`. The attacker cannot
reject permanently: its outcome is a record the verifier reads, and a person
can overrule by recording `attacked accepted "…"`.

## Failure memory

On every `test_run` with failures, the hook also reads `test-results/failures.json`
if the flight recorder wrote one and copies its `FP-…` fingerprints into the
evidence record. On `harness done`, the task's fingerprints, hypothesis and
root cause are appended to `.harness/memory/<fingerprint>.json`. On the next
failure carrying a known fingerprint, `record_command.py` returns
`additionalContext` with the recorded root cause and fix commit. Nothing is
inferred; only what was recorded is replayed.

## What Claude keeps, and what it loses

| Decision | Claude | Harness |
|---|---|---|
| how to investigate, which files, which hypothesis, which tests, how to implement, which edge cases, risk level | decides | records |
| declare tests passed | no | the parsed test run |
| declare complete | no | the verifier |
| modify a test after RED | allowed | audited; a reason is required |
| ignore a hard failure | may explain | policy decides |

## Error handling

Hooks never raise to the harness: every entry point wraps its body, and on any
exception writes nothing and exits 0. A corrupt `task.json` is reported by
`harness status` and treated as no task by the hooks. The evidence file is
append-only; a torn final line is skipped by the reader. The verifier's output
is always a complete verdict with named rules.

## Testing this design

Everything above is testable without a model:

- `state.py` and `verify.py` are pure: table-driven tests over evidence lists,
  both directions for every rule (the rule passes on the right evidence and
  fails on its absence or contradiction).
- Each hook is run as a real subprocess with a real hook JSON on stdin and a
  temporary `.harness/` directory, asserting the file it appended and the JSON
  it printed — the interface Claude Code actually uses, not a function call.
- The test-output parser is tested on verbatim pytest, vitest and playwright
  summaries, including a summary it cannot parse (must yield no evidence).
- The completion gate is tested for: no task → no output; task incomplete →
  block with the gap; `stop_hook_active` → never block; verdict PASS → allow.
- A dogfood run: the harness is used on its own final task, and the evidence
  file from that run is the proof it works end to end.

## Phases of delivery

1. State + evidence + oracle (library, tests).
2. Verifier + CLI.
3. Hooks + settings wiring + `.gitignore`.
4. Attacker prompt + risk rule; failure memory.
5. Dogfood, docs, commit, push.
