"""Workflow state: one task, a phase, and transitions gated by evidence.

WHY A STATE MACHINE AND NOT A PROMPT. "Use TDD" is an instruction Claude can
forget. "`red` cannot become `green` until a failing test run is on record,
after the test was written and before any production change" is a fact this
module checks. The instruction lives in CLAUDE.md; the enforcement lives here.

Every precondition below reads the evidence list only. Nothing in this module
runs a command, calls a model, or trusts a message.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, cast

#: Phase sequences per task type, ending in `complete`, which only the verifier
#: may write (see `advance`).
PHASES: dict[str, tuple[str, ...]] = {
    "bug": ("investigate", "root_cause", "red", "green", "refactor", "verify", "complete"),
    "feature": ("spec", "red", "green", "refactor", "verify", "complete"),
    "refactor": ("baseline", "refactor", "verify", "complete"),
    "investigation": ("investigate", "report", "complete"),
    "spike": ("probe", "report", "complete"),
    "config": ("change", "verify", "complete"),
}

RISKS = ("low", "medium", "high")
POLICIES = ("warn", "block")

TASK_FILE = "task.json"


class Blocked(Exception):
    """A transition refused for lack of evidence. `gap` names what is missing."""

    def __init__(self, gap: str) -> None:
        super().__init__(gap)
        self.gap = gap


@dataclass
class Task:
    type: str
    title: str
    phase: str
    risk: str
    policy: str
    started_at: str
    start_commit: str
    history: list[dict[str, str]] = field(default_factory=list)


def start(
    task_type: str,
    title: str,
    *,
    now: str,
    commit: str,
    risk: str = "medium",
    policy: str = "warn",
) -> Task:
    if task_type not in PHASES:
        raise ValueError(f"unknown task type {task_type!r}; one of {', '.join(PHASES)}")
    if risk not in RISKS:
        raise ValueError(f"risk must be one of {', '.join(RISKS)}, not {risk!r}")
    if policy not in POLICIES:
        raise ValueError(f"policy must be one of {', '.join(POLICIES)}, not {policy!r}")
    return Task(
        type=task_type,
        title=title,
        phase=PHASES[task_type][0],
        risk=risk,
        policy=policy,
        started_at=now,
        start_commit=commit,
    )


def next_phase(task: Task) -> str | None:
    sequence = PHASES[task.type]
    at = sequence.index(task.phase)
    return sequence[at + 1] if at + 1 < len(sequence) else None


def entered_phase_at(task: Task) -> str:
    """When the current phase began: the last transition into it, else the start."""
    for entry in reversed(task.history):
        if entry.get("to") == task.phase:
            return entry.get("at", task.started_at)
    return task.started_at


# --- the evidence readers the preconditions are built from -------------------


def _of_kind(evidence: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [r for r in evidence if r.get("kind") == kind]


def _test_runs(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in _of_kind(evidence, "command") if isinstance(r.get("test_run"), dict)]


def _is_red(run: dict[str, Any]) -> bool:
    counts = run["test_run"]
    return int(counts.get("failed", 0)) > 0 or int(counts.get("errors", 0)) > 0


def _is_green(run: dict[str, Any]) -> bool:
    counts = run["test_run"]
    exit_code = run.get("exit_code")
    return (
        int(counts.get("failed", 0)) == 0
        and int(counts.get("errors", 0)) == 0
        and (exit_code is None or int(exit_code) == 0)
    )


def _changes(evidence: list[dict[str, Any]], role: str | None = None) -> list[dict[str, Any]]:
    found = _of_kind(evidence, "file_change")
    return found if role is None else [r for r in found if r.get("role") == role]


def _latest_at(records: list[dict[str, Any]]) -> str | None:
    return max((str(r.get("at", "")) for r in records), default=None)


def _since(evidence: list[dict[str, Any]], moment: str) -> list[dict[str, Any]]:
    return [r for r in evidence if str(r.get("at", "")) >= moment]


def _has_reproduction(evidence: list[dict[str, Any]]) -> bool:
    """See `verify.root_cause_recorded`: a failing command leaves no event on
    this build, so a red TEST RUN is what a reproduction actually looks like.
    The two must answer alike, or `advance` and the verifier disagree about
    the same evidence."""
    if _of_kind(evidence, "reproduction"):
        return True
    if any(r.get("exit_code") not in (None, 0) for r in _of_kind(evidence, "command")):
        return True
    return any(_is_red(r) for r in _of_kind(evidence, "command"))


# --- the preconditions, one per transition that carries a rule --------------


def _needs_root_cause_material(evidence: list[dict[str, Any]]) -> None:
    missing: list[str] = []
    if not _of_kind(evidence, "hypothesis"):
        missing.append("a hypothesis (harness hypothesis \"...\")")
    if not _has_reproduction(evidence):
        missing.append("a reproduction (a failing command on record, or harness reproduce \"...\")")
    if missing:
        raise Blocked("root cause needs " + " and ".join(missing))


def _needs_red(evidence: list[dict[str, Any]], window_start: str) -> None:
    """Tests before code, as an observable fact.

    A failing run must exist, after the last test-file change, and no
    production file may have changed before that failing run within this
    phase's window. A production edit that precedes the first failing run means
    the test was written after the code, or never failed."""
    window = _since(evidence, window_start)
    last_test_change = _latest_at(_changes(window, "test"))
    red_runs = [
        r for r in _test_runs(window)
        if _is_red(r) and (last_test_change is None or str(r.get("at", "")) >= last_test_change)
    ]
    if not red_runs:
        raise Blocked(
            "green needs a failing test run on record after the test was written "
            "(run the test and watch it fail before touching production code)"
        )
    first_red_at = min(str(r.get("at", "")) for r in red_runs)
    early_production = [r for r in _changes(window, "production") if str(r.get("at", "")) < first_red_at]
    if early_production:
        paths = ", ".join(str(r.get("path", "?")) for r in early_production[:3])
        raise Blocked(
            f"production code changed before the first failing run ({paths}): "
            "that is code before tests, not tests before code"
        )


def _needs_green_after_last_change(evidence: list[dict[str, Any]], what: str) -> None:
    last_change = _latest_at(_changes(evidence))
    runs = _test_runs(evidence)
    recent = [r for r in runs if last_change is None or str(r.get("at", "")) >= last_change]
    if not recent:
        raise Blocked(f"{what} needs a test run after the last file change")
    latest = max(recent, key=lambda r: str(r.get("at", "")))
    if not _is_green(latest):
        counts = latest["test_run"]
        raise Blocked(
            f"{what} needs the latest test run green; it has "
            f"{counts.get('failed', 0)} failed and {counts.get('errors', 0)} errors"
        )


def _needs_any_change(evidence: list[dict[str, Any]]) -> None:
    if not _changes(evidence):
        raise Blocked("verify needs at least one file change on record")


def _needs_a_finding(evidence: list[dict[str, Any]]) -> None:
    if not _of_kind(evidence, "hypothesis"):
        raise Blocked("report needs a finding on record (harness hypothesis \"...\")")


def advance(task: Task, evidence: list[dict[str, Any]], *, now: str) -> Task:
    """The next phase, if the evidence allows it; `Blocked` with the gap if not."""
    target = next_phase(task)
    if target is None:
        raise Blocked("the task is complete; nothing comes after")
    if target == "complete":
        raise Blocked("only the verifier may mark a task complete (harness done)")

    step = (task.phase, target)
    window_start = entered_phase_at(task)
    if step in {("investigate", "root_cause")}:
        _needs_root_cause_material(evidence)
    elif step == ("investigate", "report"):
        _needs_a_finding(evidence)
    elif step == ("red", "green"):
        _needs_red(evidence, window_start)
    elif step in {("green", "refactor"), ("refactor", "verify")}:
        _needs_green_after_last_change(evidence, target)
    elif step == ("baseline", "refactor"):
        _needs_green_after_last_change(evidence, "refactor")
    elif step == ("change", "verify"):
        _needs_any_change(evidence)
    # ("root_cause", "red"), ("spec", "red"), ("probe", "report") need nothing extra.

    return _moved(task, target, now, because="evidence on record")


def complete(task: Task, *, now: str) -> Task:
    """Written by the verifier alone. See `verify.run`."""
    return _moved(task, "complete", now, because="verifier PASS")


def _moved(task: Task, target: str, now: str, *, because: str) -> Task:
    return Task(
        **{
            **asdict(task),
            "phase": target,
            "history": [*task.history, {"at": now, "from": task.phase, "to": target, "because": because}],
        }
    )


# --- persistence ------------------------------------------------------------


def save(root: Path, task: Task) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / TASK_FILE).write_text(json.dumps(asdict(task), indent=2) + "\n", encoding="utf-8")


def load(root: Path) -> Task | None:
    """The task on disk, or None when there is none or it is unreadable.

    A corrupt file is reported by `harness status`; the hooks treat it as no
    task, because a hook that raises takes the session down with it."""
    path = root / TASK_FILE
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(raw, dict):
        return None
    data = cast(dict[str, Any], raw)
    try:
        task = Task(
            type=str(data["type"]),
            title=str(data["title"]),
            phase=str(data["phase"]),
            risk=str(data["risk"]),
            policy=str(data["policy"]),
            started_at=str(data["started_at"]),
            start_commit=str(data.get("start_commit", "")),
            history=[
                {str(k): str(v) for k, v in cast(dict[str, Any], h).items()}
                for h in cast(list[Any], data.get("history", []))
                if isinstance(h, dict)
            ],
        )
    except (KeyError, TypeError, ValueError):
        return None
    if task.type not in PHASES or task.phase not in PHASES[task.type]:
        return None
    return task
