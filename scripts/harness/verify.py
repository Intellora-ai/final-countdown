"""The independent verifier: the only authority that may write `complete`.

WRITER != CERTIFIER. The agent that wants to finish can talk itself into
"good enough". This module cannot be talked to: it reads `.harness/`, answers
one question per rule from the evidence alone, and writes a verdict. A rule
that lacks evidence is MORE_WORK with the gap named; a rule that is
contradicted by evidence (the latest test run is red) is FAIL. Only PASS moves
the task to `complete`.

No subprocess, no model, no clock of its own.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from harness.evidence import Store, looks_like_verification
from harness.state import Task, complete, load, save

VERDICT_FILE = "verdict.json"

#: What an attack review may conclude. `rejected` means weaknesses were found
#: and not fixed, so it does not satisfy the rule.
ATTACK_OUTCOMES = ("accepted", "hardened", "rejected")


@dataclass(frozen=True)
class RuleResult:
    name: str
    ok: bool
    detail: str
    #: True when evidence contradicts the claim, not merely lacks it.
    contradiction: bool = False


@dataclass(frozen=True)
class Verdict:
    status: str  # PASS | MORE_WORK | FAIL
    rules: list[RuleResult]

    def as_dict(self) -> dict[str, Any]:
        return {"status": self.status, "rules": [asdict(r) for r in self.rules]}

    def gaps(self) -> list[RuleResult]:
        return [r for r in self.rules if not r.ok]


# --- readers ----------------------------------------------------------------


def _kind(evidence: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [r for r in evidence if r.get("kind") == kind]


def _at(record: dict[str, Any]) -> str:
    return str(record.get("at", ""))


def _test_runs(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in _kind(evidence, "command") if isinstance(r.get("test_run"), dict)]


def _failures(run: dict[str, Any]) -> tuple[int, int]:
    counts = run["test_run"]
    return int(counts.get("failed", 0)), int(counts.get("errors", 0))


def _is_red(run: dict[str, Any]) -> bool:
    failed, errors = _failures(run)
    return failed > 0 or errors > 0


def _changes(evidence: list[dict[str, Any]], role: str | None = None) -> list[dict[str, Any]]:
    found = _kind(evidence, "file_change")
    return found if role is None else [r for r in found if r.get("role") == role]


def _last_change_at(task: Task, evidence: list[dict[str, Any]]) -> str:
    return max((_at(r) for r in _changes(evidence)), default=task.started_at)


def _first_red_at(evidence: list[dict[str, Any]]) -> str | None:
    reds = [_at(r) for r in _test_runs(evidence) if _is_red(r)]
    return min(reds) if reds else None


# --- the rules ---------------------------------------------------------------


def root_cause_recorded(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    has_hypothesis = bool(_kind(evidence, "hypothesis"))
    has_reproduction = bool(_kind(evidence, "reproduction")) or any(
        r.get("exit_code") not in (None, 0) for r in _kind(evidence, "command")
    )
    missing = [
        name for name, present in (("a hypothesis", has_hypothesis), ("a reproduction", has_reproduction))
        if not present
    ]
    if missing:
        return RuleResult("ROOT_CAUSE_RECORDED", False, "missing " + " and ".join(missing))
    return RuleResult("ROOT_CAUSE_RECORDED", True, "hypothesis and reproduction on record")


def finding_recorded(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    if _kind(evidence, "hypothesis"):
        return RuleResult("FINDING_RECORDED", True, "a finding is on record")
    return RuleResult("FINDING_RECORDED", False, "no finding on record (harness hypothesis \"...\")")


def red_before_green(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    first_red = _first_red_at(evidence)
    if first_red is None:
        return RuleResult(
            "RED_BEFORE_GREEN", False,
            "no failing test run on record: the test was never seen failing",
        )
    early = [r for r in _changes(evidence, "production") if _at(r) < first_red]
    if early:
        paths = ", ".join(str(r.get("path", "?")) for r in early[:3])
        return RuleResult(
            "RED_BEFORE_GREEN", False,
            f"production code changed before the first failing run ({paths}): code before tests",
        )
    return RuleResult("RED_BEFORE_GREEN", True, f"first failing run at {first_red}")


def green_after_last_change(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    since = _last_change_at(task, evidence)
    recent = [r for r in _test_runs(evidence) if _at(r) >= since]
    if not recent:
        return RuleResult(
            "GREEN_AFTER_LAST_CHANGE", False,
            f"no parsed test run after the last change at {since}",
        )
    latest = max(recent, key=_at)
    failed, errors = _failures(latest)
    if failed or errors:
        return RuleResult(
            "GREEN_AFTER_LAST_CHANGE", False,
            f"the latest test run is red: {failed} failed, {errors} errors", contradiction=True,
        )
    exit_code = latest.get("exit_code")
    if exit_code not in (None, 0):
        return RuleResult(
            "GREEN_AFTER_LAST_CHANGE", False,
            f"the latest test run printed a green summary but exited {exit_code}: unknown, rerun it",
        )
    return RuleResult("GREEN_AFTER_LAST_CHANGE", True, f"latest run green at {_at(latest)}")


def _entered_red_at(task: Task) -> str:
    """When the task's own red phase began. A bug's reproduction run is a
    failing run too, but it comes BEFORE the regression test is written; the
    change that writes that test must not be audited as a change after red."""
    for entry in task.history:
        if entry.get("to") == "red":
            return str(entry.get("at", task.started_at))
    return task.started_at


def tests_not_quietly_changed(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    since_red_began = _entered_red_at(task)
    reds = [_at(r) for r in _test_runs(evidence) if _is_red(r) and _at(r) >= since_red_began]
    first_red = min(reds) if reds else None
    if first_red is None:
        return RuleResult("TESTS_NOT_QUIETLY_CHANGED", True, "no red run yet, so no test change to audit")
    reasons = [_at(r) for r in _kind(evidence, "reason")]
    quiet = [
        r for r in _changes(evidence, "test")
        if _at(r) > first_red and not any(when >= _at(r) for when in reasons)
    ]
    if quiet:
        paths = ", ".join(str(r.get("path", "?")) for r in quiet[:3])
        return RuleResult(
            "TESTS_NOT_QUIETLY_CHANGED", False,
            f"test files changed after the first failing run with no reason recorded: {paths} "
            "(harness reason \"...\")",
        )
    return RuleResult("TESTS_NOT_QUIETLY_CHANGED", True, "every test change after red carries a reason")


def verification_ran(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    since = _last_change_at(task, evidence)
    ran = [
        r for r in _kind(evidence, "command")
        if _at(r) >= since and looks_like_verification(str(r.get("command", ""))) and r.get("exit_code") == 0
    ]
    if not ran:
        return RuleResult(
            "VERIFICATION_RAN", False,
            f"no static check (ruff, pyright, mypy, tsc, eslint, typecheck, lint) ran green after the last change at {since}",
        )
    return RuleResult("VERIFICATION_RAN", True, f"{ran[-1].get('command')} exited 0 at {_at(ran[-1])}")


def attack_reviewed(task: Task, evidence: list[dict[str, Any]]) -> RuleResult:
    since = _last_change_at(task, evidence)
    reviews = [r for r in _kind(evidence, "attack") if _at(r) >= since]
    if not reviews:
        return RuleResult(
            "ATTACK_REVIEWED", False,
            "risk is high and no attack review is on record after the last change (harness attack / attacked)",
        )
    latest = max(reviews, key=_at)
    outcome = str(latest.get("outcome", ""))
    if outcome not in ("accepted", "hardened"):
        return RuleResult("ATTACK_REVIEWED", False, f"the latest attack review concluded {outcome!r}", contradiction=True)
    return RuleResult("ATTACK_REVIEWED", True, f"attack review {outcome} at {_at(latest)}")


Rule = Callable[[Task, list[dict[str, Any]]], RuleResult]

_RULES_BY_TYPE: dict[str, tuple[Rule, ...]] = {
    "bug": (root_cause_recorded, red_before_green, green_after_last_change, tests_not_quietly_changed, verification_ran),
    "feature": (red_before_green, green_after_last_change, tests_not_quietly_changed, verification_ran),
    "refactor": (green_after_last_change, verification_ran),
    "config": (green_after_last_change, verification_ran),
    "investigation": (finding_recorded,),
    "spike": (finding_recorded,),
}


def verify(task: Task, evidence: list[dict[str, Any]]) -> Verdict:
    rules: list[Rule] = list(_RULES_BY_TYPE[task.type])
    if task.risk == "high":
        rules.append(attack_reviewed)
    results = [rule(task, evidence) for rule in rules]
    if any(r.contradiction for r in results):
        status = "FAIL"
    elif any(not r.ok for r in results):
        status = "MORE_WORK"
    else:
        status = "PASS"
    return Verdict(status, results)


# --- the entry point the CLI and the completion gate share -------------------


def run(root: Path, *, now: str, commit: bool = True) -> Verdict:
    """Verify the task on disk, write `verdict.json`, record the verdict as
    evidence, and -- when `commit` is true and the verdict is PASS -- mark the
    task complete. `commit=False` is `harness verify`: look, do not touch."""
    task = load(root)
    if task is None:
        verdict = Verdict("MORE_WORK", [RuleResult("TASK_EXISTS", False, f"no task at {root / 'task.json'}")])
        _write(root, verdict, now)
        return verdict
    if task.phase == "complete":
        verdict = Verdict("PASS", [RuleResult("ALREADY_COMPLETE", True, "the task was completed by an earlier verdict")])
        _write(root, verdict, now)
        return verdict

    store = Store(root)
    verdict = verify(task, store.read())
    _write(root, verdict, now)
    store.append({"at": now, "kind": "verdict", "status": verdict.status, "gaps": [r.name for r in verdict.gaps()]})
    if commit and verdict.status == "PASS":
        save(root, complete(task, now=now))
    return verdict


def _write(root: Path, verdict: Verdict, now: str) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / VERDICT_FILE).write_text(json.dumps({**verdict.as_dict(), "at": now}, indent=2) + "\n", encoding="utf-8")
