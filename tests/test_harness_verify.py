"""The independent verifier: the only thing that may say "complete".

WRITER != CERTIFIER. The agent that wants to finish can convince itself the
work is good enough. This module cannot be convinced: it reads the evidence
file and answers one question per rule. Each rule is tested both ways -- it
passes on the right evidence and fails on its absence or its contradiction --
because a verifier that only ever passes certifies nothing.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from harness.evidence import Store  # noqa: E402
from harness.state import Task, load, save, start  # noqa: E402
from harness.verify import Verdict, run, verify  # noqa: E402

NOW = "2026-09-02T10:00:00+00:00"


def _at(seconds: int) -> str:
    return f"2026-09-02T10:00:{seconds:02d}+00:00"


def _task(task_type: str, phase: str, risk: str = "medium") -> Task:
    made = start(task_type, "x", now=NOW, commit="abc1234", risk=risk)
    return Task(**{**made.__dict__, "phase": phase})


def _run(seconds: int, failed: int, exit_code: int | None = None, command: str = "pytest -q") -> dict[str, Any]:
    return {
        "at": _at(seconds), "kind": "command", "command": command,
        "exit_code": (1 if failed else 0) if exit_code is None else exit_code,
        "test_run": {"runner": "pytest", "passed": 5 - failed, "failed": failed, "errors": 0},
    }


def _change(seconds: int, role: str, path: str | None = None) -> dict[str, Any]:
    return {
        "at": _at(seconds), "kind": "file_change", "role": role,
        "path": path or ("tests/test_x.py" if role == "test" else "src/x.py"),
    }


def _verification(seconds: int, exit_code: int = 0) -> dict[str, Any]:
    return {"at": _at(seconds), "kind": "command", "command": "ruff check scripts", "exit_code": exit_code, "test_run": None}


def _rule(verdict: Verdict, name: str) -> Any:
    found = [r for r in verdict.rules if r.name == name]
    assert found, f"rule {name} was not evaluated; rules: {[r.name for r in verdict.rules]}"
    return found[0]


#: A complete, honest feature: test written, seen failing, code written, seen
#: passing, verification run. Every rule below starts from this and removes or
#: contradicts exactly one thing.
HONEST_FEATURE: list[dict[str, Any]] = [
    _change(1, "test"),
    _run(2, failed=1),
    _change(3, "production"),
    _run(4, failed=0),
    _verification(5),
]


class TestTheHonestCaseIsAPass:
    def test_a_feature_with_red_then_green_then_verification_passes(self) -> None:
        verdict = verify(_task("feature", "verify"), HONEST_FEATURE)
        assert verdict.status == "PASS", [r for r in verdict.rules if not r.ok]

    def test_a_bug_needs_root_cause_material_as_well(self) -> None:
        without = verify(_task("bug", "verify"), HONEST_FEATURE)
        assert without.status == "MORE_WORK"
        assert not _rule(without, "ROOT_CAUSE_RECORDED").ok

        with_it = [
            {"at": _at(0), "kind": "hypothesis", "text": "the lock is dropped"},
            {"at": _at(0), "kind": "reproduction", "how": "pytest -k save"},
            *HONEST_FEATURE,
        ]
        assert verify(_task("bug", "verify"), with_it).status == "PASS"


class TestRedBeforeGreen:
    def test_no_failing_run_at_all_is_more_work(self) -> None:
        never_red = [_change(1, "test"), _change(3, "production"), _run(4, failed=0), _verification(5)]
        verdict = verify(_task("feature", "verify"), never_red)
        assert verdict.status == "MORE_WORK"
        rule = _rule(verdict, "RED_BEFORE_GREEN")
        assert not rule.ok and "failing" in rule.detail.lower()

    def test_production_code_before_the_first_failing_run_is_more_work(self) -> None:
        code_first = [_change(1, "production"), _change(2, "test"), _run(3, failed=1), _change(4, "production"),
                      _run(5, failed=0), _verification(6)]
        verdict = verify(_task("feature", "verify"), code_first)
        assert not _rule(verdict, "RED_BEFORE_GREEN").ok

    def test_the_rule_does_not_apply_to_a_refactor_or_a_config_change(self) -> None:
        green_only = [_change(1, "production"), _run(2, failed=0), _verification(3)]
        for task_type, phase in (("refactor", "verify"), ("config", "verify")):
            verdict = verify(_task(task_type, phase), green_only)
            assert "RED_BEFORE_GREEN" not in [r.name for r in verdict.rules]
            assert verdict.status == "PASS", (task_type, [r for r in verdict.rules if not r.ok])


class TestGreenAfterTheLastChange:
    def test_a_change_after_the_last_run_is_more_work(self) -> None:
        stale = [*HONEST_FEATURE, _change(6, "production")]
        verdict = verify(_task("feature", "verify"), stale)
        assert verdict.status == "MORE_WORK"
        assert not _rule(verdict, "GREEN_AFTER_LAST_CHANGE").ok

    def test_a_red_latest_run_is_a_fail_not_more_work(self) -> None:
        """Contradicting evidence is worse than missing evidence, and says so."""
        red_last = [*HONEST_FEATURE, _change(6, "production"), _run(7, failed=2), _verification(8)]
        verdict = verify(_task("feature", "verify"), red_last)
        assert verdict.status == "FAIL"
        rule = _rule(verdict, "GREEN_AFTER_LAST_CHANGE")
        assert not rule.ok and "2 failed" in rule.detail

    def test_a_run_with_no_parsed_result_is_not_evidence_of_green(self) -> None:
        unparsed = [*HONEST_FEATURE[:-1], _change(6, "production"),
                    {"at": _at(7), "kind": "command", "command": "pytest", "exit_code": 0, "test_run": None},
                    _verification(8)]
        verdict = verify(_task("feature", "verify"), unparsed)
        assert not _rule(verdict, "GREEN_AFTER_LAST_CHANGE").ok

    def test_a_nonzero_exit_with_a_green_summary_is_not_green(self) -> None:
        """A runner that printed '5 passed' and then crashed on teardown is unknown."""
        odd = [*HONEST_FEATURE[:3], _run(4, failed=0, exit_code=1), _verification(5)]
        verdict = verify(_task("feature", "verify"), odd)
        assert not _rule(verdict, "GREEN_AFTER_LAST_CHANGE").ok


class TestTestsAreNotQuietlyChanged:
    def test_a_test_change_after_red_with_a_reason_is_fine(self) -> None:
        reasoned = [*HONEST_FEATURE[:3], _change(4, "test"),
                    {"at": _at(4), "kind": "reason", "text": "the requirement was corrected: 3 retries not 4"},
                    _run(5, failed=0), _verification(6)]
        assert _rule(verify(_task("feature", "verify"), reasoned), "TESTS_NOT_QUIETLY_CHANGED").ok

    def test_a_test_change_after_red_without_a_reason_is_more_work(self) -> None:
        quiet = [*HONEST_FEATURE[:3], _change(4, "test"), _run(5, failed=0), _verification(6)]
        verdict = verify(_task("feature", "verify"), quiet)
        assert verdict.status == "MORE_WORK"
        rule = _rule(verdict, "TESTS_NOT_QUIETLY_CHANGED")
        assert not rule.ok and "tests/test_x.py" in rule.detail

    def test_a_reason_given_before_the_change_does_not_cover_it(self) -> None:
        early = [*HONEST_FEATURE[:3], {"at": _at(3), "kind": "reason", "text": "x"}, _change(4, "test"),
                 _run(5, failed=0), _verification(6)]
        assert not _rule(verify(_task("feature", "verify"), early), "TESTS_NOT_QUIETLY_CHANGED").ok

    def test_writing_the_test_before_red_needs_no_reason(self) -> None:
        assert _rule(verify(_task("feature", "verify"), HONEST_FEATURE), "TESTS_NOT_QUIETLY_CHANGED").ok


class TestVerificationRan:
    def test_no_verification_after_the_last_change_is_more_work(self) -> None:
        verdict = verify(_task("feature", "verify"), HONEST_FEATURE[:-1])
        assert verdict.status == "MORE_WORK"
        assert not _rule(verdict, "VERIFICATION_RAN").ok

    def test_a_failed_verification_does_not_count(self) -> None:
        verdict = verify(_task("feature", "verify"), [*HONEST_FEATURE[:-1], _verification(5, exit_code=1)])
        assert not _rule(verdict, "VERIFICATION_RAN").ok

    def test_a_verification_before_the_last_change_does_not_count(self) -> None:
        verdict = verify(_task("feature", "verify"), [_verification(0), *HONEST_FEATURE[:-1]])
        assert not _rule(verdict, "VERIFICATION_RAN").ok

    def test_a_test_run_alone_is_not_static_verification(self) -> None:
        """GREEN already proves the tests. This rule is the other half -- types
        and lint -- so a second pytest run cannot stand in for ruff or pyright."""
        verdict = verify(_task("feature", "verify"), HONEST_FEATURE[:-1] + [_run(5, failed=0)])
        assert not _rule(verdict, "VERIFICATION_RAN").ok


class TestEvidenceBelongsToThisTask:
    """`.harness/evidence.jsonl` is one file for the life of the repository --
    1,500 rows here, task after task appended to the same log. The verifier was
    handed all of it, so a rule could be satisfied by something a PREVIOUS task
    did. Nothing in the file says which task a row belongs to; what it has is a
    time, and `task.started_at` is the line between them.

    This mattered little while every recorded command had `exit_code: null`,
    because no verification row could satisfy anything. It matters now that
    they carry a real 0.
    """

    def _before(self, seconds: int) -> str:
        return f"2026-09-02T09:59:{seconds:02d}+00:00"

    def test_a_verification_from_a_previous_task_does_not_count(self) -> None:
        """THE LEAK, EXACTLY. `_last_change_at` maxes over every change in the
        file, so a task that has changed nothing yet inherits the PREVIOUS
        task's last change as its line -- and any verification that task ran
        after it sits on the right side of the comparison. The new task has
        done nothing at all and its static check is already satisfied."""
        previous_task = [
            {"at": self._before(0), "kind": "file_change", "role": "production", "path": "src/old.py"},
            {"at": self._before(30), "kind": "command", "command": "ruff check scripts", "exit_code": 0, "test_run": None},
        ]
        verdict = verify(_task("feature", "verify"), previous_task)
        assert not _rule(verdict, "VERIFICATION_RAN").ok

    def test_a_verification_before_this_task_started_never_counts(self) -> None:
        stale = {"at": self._before(45), "kind": "command", "command": "ruff check scripts",
                 "exit_code": 0, "test_run": None}
        verdict = verify(_task("feature", "verify"), [stale, *HONEST_FEATURE[:-1]])
        assert not _rule(verdict, "VERIFICATION_RAN").ok

    def test_a_green_run_from_a_previous_task_does_not_count(self) -> None:
        stale = {"at": self._before(1), "kind": "command", "command": "pytest -q", "exit_code": 0,
                 "test_run": {"runner": "pytest", "passed": 5, "failed": 0, "errors": 0}}
        without_a_green_run = [_change(1, "test"), _run(2, failed=1), _change(3, "production"), _verification(5)]
        verdict = verify(_task("feature", "verify"), [stale, *without_a_green_run])
        assert not _rule(verdict, "GREEN_AFTER_LAST_CHANGE").ok

    def test_a_change_from_a_previous_task_does_not_move_the_line(self) -> None:
        """`_last_change_at` maxes over every change in the file. A change from
        a task that finished yesterday must not make today's verification look
        as though it ran too early."""
        stale = {"at": self._before(2), "kind": "file_change", "role": "production", "path": "src/old.py"}
        verdict = verify(_task("feature", "verify"), [stale, *HONEST_FEATURE])
        assert _rule(verdict, "VERIFICATION_RAN").ok

    def test_this_task_own_evidence_still_counts(self) -> None:
        """The line is `started_at`, and everything after it is this task's."""
        assert verify(_task("feature", "verify"), HONEST_FEATURE).status == "PASS"


class TestAReproductionCanBeSeen:
    """A BUG'S REPRODUCTION HAS TO BE OBSERVABLE, and on this build it was not.

    `root_cause_recorded` accepts a command whose exit code is non-zero. A
    foreground command that fails produces no hook event at all here -- measured
    -- and a piped one records no exit code, so that branch could never fire and
    the only way past the rule was to type `harness reproduce` by hand. The
    gap message offered an option that could not happen.

    A RED TEST RUN IS a failing command on record, and it is the one the
    harness already parses out of the text.
    """

    def test_a_red_test_run_is_a_reproduction(self) -> None:
        evidence = [
            {"at": _at(1), "kind": "hypothesis", "text": "save() returns its input"},
            _run(2, failed=2, exit_code=None),
        ]
        assert _rule(verify(_task("bug", "root_cause"), evidence), "ROOT_CAUSE_RECORDED").ok

    def test_a_red_run_with_no_exit_code_still_counts(self) -> None:
        """The shape this build actually produces: piped, so the shell exits 0
        and the failure is only in the numbers."""
        red = {"at": _at(2), "kind": "command", "command": "pytest -q 2>&1 | tail -3", "exit_code": None,
               "test_run": {"runner": "pytest", "passed": 3, "failed": 2, "errors": 0}}
        evidence = [{"at": _at(1), "kind": "hypothesis", "text": "x"}, red]
        assert _rule(verify(_task("bug", "root_cause"), evidence), "ROOT_CAUSE_RECORDED").ok

    def test_a_green_run_is_not_a_reproduction(self) -> None:
        evidence = [{"at": _at(1), "kind": "hypothesis", "text": "x"}, _run(2, failed=0)]
        assert not _rule(verify(_task("bug", "root_cause"), evidence), "ROOT_CAUSE_RECORDED").ok

    def test_a_hypothesis_alone_is_still_not_enough(self) -> None:
        evidence = [{"at": _at(1), "kind": "hypothesis", "text": "x"}]
        result = _rule(verify(_task("bug", "root_cause"), evidence), "ROOT_CAUSE_RECORDED")
        assert not result.ok and "reproduction" in result.detail


class TestRiskBoundedAttack:
    def test_high_risk_needs_an_attack_outcome_after_the_last_change(self) -> None:
        verdict = verify(_task("feature", "verify", risk="high"), HONEST_FEATURE)
        assert verdict.status == "MORE_WORK"
        assert not _rule(verdict, "ATTACK_REVIEWED").ok

        attacked = [*HONEST_FEATURE, {"at": _at(6), "kind": "attack", "outcome": "accepted", "notes": "nothing found"}]
        assert verify(_task("feature", "verify", risk="high"), attacked).status == "PASS"

    def test_an_attack_before_the_last_change_is_stale(self) -> None:
        stale = [{"at": _at(0), "kind": "attack", "outcome": "accepted", "notes": ""}, *HONEST_FEATURE]
        assert not _rule(verify(_task("feature", "verify", risk="high"), stale), "ATTACK_REVIEWED").ok

    def test_low_and_medium_risk_do_not_require_it(self) -> None:
        for risk in ("low", "medium"):
            verdict = verify(_task("feature", "verify", risk=risk), HONEST_FEATURE)
            assert "ATTACK_REVIEWED" not in [r.name for r in verdict.rules]


class TestInvestigationsAndSpikesNeedOnlyTheirFinding:
    def test_an_investigation_with_a_finding_passes_without_code(self) -> None:
        finding = [{"at": _at(1), "kind": "hypothesis", "text": "the cause is the proxy"}]
        assert verify(_task("investigation", "report"), finding).status == "PASS"

    def test_an_investigation_without_a_finding_is_more_work(self) -> None:
        assert verify(_task("investigation", "report"), []).status == "MORE_WORK"


class TestRunWritesTheVerdictAndOnlyPassCompletes:
    def test_pass_completes_the_task_and_records_it(self, tmp_path: Path) -> None:
        save(tmp_path, _task("feature", "verify"))
        store = Store(tmp_path)
        for record in HONEST_FEATURE:
            store.append(record)

        verdict = run(tmp_path, now=_at(9))

        assert verdict.status == "PASS"
        assert json.loads((tmp_path / "verdict.json").read_text(encoding="utf-8"))["status"] == "PASS"
        after = load(tmp_path)
        assert after is not None and after.phase == "complete"
        assert after.history[-1]["because"] == "verifier PASS"
        assert store.read()[-1]["kind"] == "verdict" and store.read()[-1]["status"] == "PASS"

    def test_more_work_leaves_the_phase_alone(self, tmp_path: Path) -> None:
        save(tmp_path, _task("feature", "verify"))
        store = Store(tmp_path)
        for record in HONEST_FEATURE[:-1]:
            store.append(record)

        verdict = run(tmp_path, now=_at(9))

        assert verdict.status == "MORE_WORK"
        after = load(tmp_path)
        assert after is not None and after.phase == "verify"
        written = json.loads((tmp_path / "verdict.json").read_text(encoding="utf-8"))
        assert any(not r["ok"] for r in written["rules"])

    def test_no_task_is_a_verdict_that_says_so(self, tmp_path: Path) -> None:
        verdict = run(tmp_path, now=_at(1))
        assert verdict.status == "MORE_WORK"
        assert not _rule(verdict, "TASK_EXISTS").ok

    def test_an_already_complete_task_stays_complete_and_passes(self, tmp_path: Path) -> None:
        save(tmp_path, _task("spike", "complete"))
        verdict = run(tmp_path, now=_at(1))
        assert verdict.status == "PASS"
