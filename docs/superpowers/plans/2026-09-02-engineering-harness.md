# Engineering Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give engineering work in this repository an externally-held state, an evidence store, a deterministic verifier and a completion gate, so that "tests before code" and "not done until verified" are observable facts rather than instructions Claude must remember.

**Architecture:** A small pure-Python library at `scripts/harness/` (state machine, evidence store, test-output oracle, verifier) driven by five Claude Code hooks (`UserPromptSubmit`, `PostToolUse` ×2, `PreToolUse`, `Stop`) and a CLI. Runtime state in `.harness/` (gitignored). No model calls anywhere in the harness.

**Tech Stack:** Python 3.12 stdlib only (json, dataclasses, pathlib, re, argparse, subprocess-free hooks). pytest + hypothesis for tests. ruff (E4,E7,E9,F) and pyright strict, which already cover `scripts/` and `tests/`.

**Spec:** `docs/superpowers/specs/2026-09-02-engineering-harness-design.md`

## Global Constraints

- No edits to `.github/workflows/*`, `ci/gates.toml`, or any gate script. No new required check.
- Hooks read stdin JSON, never raise, exit 0 on internal error, and never run subprocesses.
- Every rule is tested in both directions: passes on the right evidence, fails on its absence or contradiction.
- Tests drive the real interface: hooks and CLI are exercised as subprocesses with real JSON on stdin and a temporary `.harness/`.
- Tests are written first and watched failing before the code that makes them pass.
- `.harness/` is never committed.

---

### Task 1: Workflow state

**Files:**
- Create: `scripts/harness/__init__.py`
- Create: `scripts/harness/state.py`
- Test: `tests/test_harness_state.py`

**Interfaces:**
- Produces: `Task` dataclass `(type, title, phase, risk, policy, started_at, start_commit, history)`; `PHASES: dict[str, tuple[str, ...]]`; `start(type, title, *, risk, policy, now, commit) -> Task`; `next_phase(task) -> str | None`; `advance(task, evidence: list[dict], now) -> Task` raising `Blocked(gap: str)`; `load(root) -> Task | None`; `save(root, task)`; `complete(task, now) -> Task` (only `verify.py` calls it).

- [ ] **Step 1: Write the failing tests** — every task type has the spec's phase sequence; `advance` refuses `investigate→root_cause` without a `hypothesis` and a `reproduction` record and accepts with both; refuses `red→green` when no failing `test_run` exists after the last test change, and when a production change precedes the failing run; accepts when a failing run sits between the test change and the first production change; refuses `verify→complete` always; `load` of a corrupt file returns `None`; `save`/`load` round-trip.
- [ ] **Step 2: Run to verify failure** — `pytest tests/test_harness_state.py -q` fails with `ModuleNotFoundError: harness`.
- [ ] **Step 3: Implement `state.py`** minimally.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(harness): workflow state with evidence-gated transitions`.

### Task 2: Evidence store and test oracle

**Files:**
- Create: `scripts/harness/evidence.py`
- Test: `tests/test_harness_evidence.py`

**Interfaces:**
- Produces: `Store(root)` with `append(record: dict) -> None`, `read() -> list[dict]` (skips a torn last line); `classify_path(path) -> "test"|"production"|"other"`; `looks_like_test_command(cmd) -> str | None` (runner name); `looks_like_verification(cmd) -> bool`; `parse_test_output(runner, text) -> dict | None` with keys `passed, failed, errors`.

- [ ] **Step 1: Write the failing tests** — verbatim pytest (`3 passed, 2 failed, 1 error in 0.12s`; `12 passed`; `1 failed`), vitest (`Tests  30 failed | 31 passed (61)`, `Tests  124 passed (124)`), playwright (`1 failed`, `12 passed (2.6m)`) summaries parse to the right numbers; garbage parses to `None`; path classification for every pattern in the spec both ways; torn last line is skipped; `looks_like_verification` for `ruff`, `pyright`, `tsc --noEmit`, `npm run typecheck`, `npm run lint`, and not for `git status`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** **Step 4: Verify pass.** **Step 5: Commit** `feat(harness): evidence store and test-output oracle`.

### Task 3: Verifier

**Files:**
- Create: `scripts/harness/verify.py`
- Test: `tests/test_harness_verify.py`

**Interfaces:**
- Consumes: `Task`, `Store.read()`.
- Produces: `Verdict(status: "PASS"|"MORE_WORK"|"FAIL", rules: list[RuleResult(name, ok, detail)])`; `verify(task, evidence) -> Verdict`; `run(root, now) -> Verdict` which also writes `.harness/verdict.json` and, on PASS, saves the task as `complete`.

- [ ] **Step 1: Write the failing tests** — one test per rule, both directions: RED_BEFORE_GREEN, GREEN_AFTER_LAST_CHANGE (red last run → FAIL; no run after last change → MORE_WORK), TESTS_NOT_QUIETLY_CHANGED (test change after RED with and without a following `reason`), ROOT_CAUSE_RECORDED (bug only), VERIFICATION_RAN, ATTACK_REVIEWED (high risk only); `run` writes `verdict.json` and only PASS sets `complete`.
- [ ] **Step 2–5** as above. Commit `feat(harness): deterministic verifier and completion authority`.

### Task 4: CLI

**Files:**
- Create: `scripts/harness/cli.py`
- Test: `tests/test_harness_cli.py`

- [ ] **Step 1: Write the failing tests** (subprocess, `cwd=tmp repo`, `HARNESS_ROOT` env pointing at the temp dir): `start bug "x"` creates `task.json`; `status` prints phase and the next requirement; `hypothesis`/`reproduce`/`reason`/`attacked` append records; `advance` refuses with the gap and succeeds with evidence; `done` prints the verdict and exit code 1 unless PASS; `abandon` records and closes.
- [ ] **Step 2–5.** Commit `feat(harness): cli`.

### Task 5: Hooks

**Files:**
- Create: `scripts/harness/hooks/_common.py`, `route.py`, `record_command.py`, `record_change.py`, `precondition.py`, `completion_gate.py`
- Test: `tests/test_harness_hooks.py`

- [ ] **Step 1: Write the failing tests** (each hook run with `python3 <hook> < json`, `cwd` at a temp project root containing `.harness/`):
  - `record_command`: a Bash PostToolUse with pytest output appends `command` + `test_run {passed:3, failed:2}`; a non-test command appends `command` with `test_run: null`; a known fingerprint in `test-results/failures.json` yields `additionalContext` with the recorded root cause; malformed stdin → exit 0, nothing written.
  - `record_change`: production path → `role: production`; test path during `green` → `additionalContext` asking for a reason; never a `deny`.
  - `precondition`: `bug` in `red` with no failing run, production file, `policy=warn` → `additionalContext` mentions "RED"; `policy=block` → `permissionDecision: deny`; with a failing run → no output; test file → no output; no task → no output.
  - `route`: "fix the crash when saving" → task type `bug`, suggested `systematic-debugging`; "add a button to export" → `feature` + `brainstorming`; an active task is not replaced; `additionalContext` names the phase.
  - `completion_gate`: no task → no output; incomplete task → `decision: block` with the gap; `stop_hook_active: true` → no block; PASS verdict → no block and task `complete`.
- [ ] **Step 2–5.** Commit `feat(harness): event-driven hooks`.

### Task 6: Attacker prompt, risk rule, failure memory

**Files:**
- Create: `scripts/harness/prompts/attacker.md`, `scripts/harness/memory.py`
- Modify: `scripts/harness/cli.py` (`attack`), `scripts/harness/hooks/record_command.py` (memory lookup), `scripts/harness/verify.py` (already has ATTACK_REVIEWED)
- Test: `tests/test_harness_memory.py`, extend `tests/test_harness_cli.py`

- [ ] **Step 1: Write the failing tests** — `attack` prints the template with the diff placeholder filled (git diff of a temp repo with one change); `memory.remember(root, fingerprints, root_cause, fix_commit)` writes one file per fingerprint; `memory.recall(root, fingerprints)` returns recorded entries only; the hook surfaces a recalled root cause; an unknown fingerprint surfaces nothing.
- [ ] **Step 2–5.** Commit `feat(harness): attacker prompt and failure memory`.

### Task 7: Wiring and docs

**Files:**
- Create: `.claude/settings.json` (hooks only)
- Modify: `.gitignore` (add `.harness/`)
- Create: `scripts/harness/README.md`
- Test: `tests/test_harness_wiring.py`

- [ ] **Step 1: Write the failing test** — `.claude/settings.json` parses; every hook command references a file that exists under `scripts/harness/hooks/`; every event in the spec's table is wired with the right matcher; `.harness/` is gitignored (`git check-ignore .harness/x`).
- [ ] **Step 2–5.** Commit `feat(harness): wire the hooks`.

### Task 8: Dogfood and ship

- [ ] Run `ruff check scripts/harness tests/test_harness_*.py` and `pyright scripts/harness tests/test_harness_*.py` clean.
- [ ] Run the whole new suite plus `tests/test_ci_integrity.py -k advisory` to prove nothing about gates changed.
- [ ] Drive one real task through the CLI and hooks as subprocesses (start → hypothesis → reproduce → red run → production change → green run → verification run → done) and keep the printed verdict as evidence in the commit message.
- [ ] Commit, push.
