"""The harness CLI, driven the way a person or Claude drives it: as a process.

Every case here runs `python3 scripts/harness/cli.py ...` in a temporary git
repository with HARNESS_ROOT pointing at a temporary state directory, and
asserts on exit codes, printed text and the files left behind. Nothing is
imported from the CLI module; the interface under test is the command line.

Spec: docs/superpowers/specs/2026-09-02-engineering-harness-design.md
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
CLI = REPO / "scripts" / "harness" / "cli.py"
sys.path.insert(0, str(REPO / "scripts"))

from harness.evidence import Store  # noqa: E402


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """A real git repository with one commit, so `start` can record a commit."""
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.email", "t@example.com"], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.name", "t"], check=True)
    (tmp_path / "README.md").write_text("hello\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", "README.md"], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "commit", "-q", "-m", "first"], check=True)
    return tmp_path


def harness(project: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "HARNESS_ROOT": str(project / ".harness")}
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=project, env=env, capture_output=True, text=True, check=False, timeout=60,
    )


def task_on_disk(project: Path) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads((project / ".harness" / "task.json").read_text(encoding="utf-8"))
    return loaded


def _at(seconds: int) -> str:
    return f"2099-01-01T00:00:{seconds:02d}+00:00"


class TestStartingAndSeeing:
    def test_start_creates_the_task_with_the_repo_commit(self, project: Path) -> None:
        done = harness(project, "start", "bug", "the save button crashes", "--risk", "high", "--policy", "block")
        assert done.returncode == 0, done.stderr
        task = task_on_disk(project)
        assert task["type"] == "bug" and task["phase"] == "investigate"
        assert task["risk"] == "high" and task["policy"] == "block"
        head = subprocess.run(["git", "-C", str(project), "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, check=True).stdout.strip()
        assert task["start_commit"] == head

    def test_start_refuses_a_second_task_while_one_is_open(self, project: Path) -> None:
        assert harness(project, "start", "bug", "one").returncode == 0
        again = harness(project, "start", "feature", "two")
        assert again.returncode == 1
        assert "abandon" in (again.stdout + again.stderr).lower()
        assert task_on_disk(project)["title"] == "one"

    def test_start_refuses_an_unknown_type_with_the_list(self, project: Path) -> None:
        done = harness(project, "start", "chore", "x")
        assert done.returncode != 0
        assert "bug" in (done.stdout + done.stderr) and "feature" in (done.stdout + done.stderr)

    def test_status_names_the_phase_and_what_the_next_one_needs(self, project: Path) -> None:
        harness(project, "start", "bug", "x")
        done = harness(project, "status")
        assert done.returncode == 0
        assert "investigate" in done.stdout
        assert "hypothesis" in done.stdout.lower() and "reproduction" in done.stdout.lower()

    def test_status_with_no_task_says_so(self, project: Path) -> None:
        done = harness(project, "status")
        assert done.returncode == 0
        assert "no task" in done.stdout.lower()


class TestRecordingInWords:
    def test_hypothesis_reproduce_reason_and_attacked_append_records(self, project: Path) -> None:
        harness(project, "start", "bug", "x")
        assert harness(project, "hypothesis", "the lock is dropped early").returncode == 0
        assert harness(project, "reproduce", "pytest -k save fails on the second write").returncode == 0
        assert harness(project, "reason", "the requirement was corrected").returncode == 0
        assert harness(project, "attacked", "accepted", "tried null and empty; both refused").returncode == 0
        kinds = [r["kind"] for r in Store(project / ".harness").read()]
        assert kinds == ["hypothesis", "reproduction", "reason", "attack"]
        last = Store(project / ".harness").read()[-1]
        assert last["outcome"] == "accepted" and "null" in last["notes"]

    def test_an_attack_outcome_must_be_one_of_the_known_words(self, project: Path) -> None:
        harness(project, "start", "bug", "x")
        done = harness(project, "attacked", "fine", "…")
        assert done.returncode != 0
        assert "accepted" in (done.stdout + done.stderr)

    def test_recording_without_a_task_is_refused(self, project: Path) -> None:
        done = harness(project, "hypothesis", "x")
        assert done.returncode == 1
        assert "no task" in (done.stdout + done.stderr).lower()


class TestAdvancingIsGatedByEvidence:
    def test_advance_refuses_with_the_gap_and_moves_with_the_evidence(self, project: Path) -> None:
        harness(project, "start", "bug", "x")
        refused = harness(project, "advance")
        assert refused.returncode == 1
        assert "hypothesis" in refused.stdout.lower()
        assert task_on_disk(project)["phase"] == "investigate"

        harness(project, "hypothesis", "the lock is dropped early")
        harness(project, "reproduce", "pytest -k save")
        moved = harness(project, "advance")
        assert moved.returncode == 0, moved.stdout + moved.stderr
        assert task_on_disk(project)["phase"] == "root_cause"
        assert "root_cause" in moved.stdout

    def test_advance_cannot_reach_complete(self, project: Path) -> None:
        harness(project, "start", "spike", "x")
        assert harness(project, "advance").returncode == 0  # probe -> report needs nothing
        blocked = harness(project, "advance")
        assert blocked.returncode == 1
        assert "verifier" in blocked.stdout.lower() or "done" in blocked.stdout.lower()
        assert task_on_disk(project)["phase"] == "report"


class TestDoneIsTheVerifierNotAClaim:
    def test_done_refuses_with_the_named_gap(self, project: Path) -> None:
        harness(project, "start", "feature", "x")
        done = harness(project, "done")
        assert done.returncode == 1
        assert "MORE_WORK" in done.stdout
        assert "RED_BEFORE_GREEN" in done.stdout
        assert task_on_disk(project)["phase"] != "complete"

    def test_done_passes_only_on_evidence(self, project: Path) -> None:
        harness(project, "start", "feature", "x")
        store = Store(project / ".harness")
        for record in (
            {"at": _at(1), "kind": "file_change", "path": "tests/test_x.py", "role": "test"},
            {"at": _at(2), "kind": "command", "command": "pytest", "exit_code": 1,
             "test_run": {"runner": "pytest", "passed": 0, "failed": 1, "errors": 0}},
            {"at": _at(3), "kind": "file_change", "path": "src/x.py", "role": "production"},
            {"at": _at(4), "kind": "command", "command": "pytest", "exit_code": 0,
             "test_run": {"runner": "pytest", "passed": 1, "failed": 0, "errors": 0}},
            {"at": _at(5), "kind": "command", "command": "ruff check src", "exit_code": 0, "test_run": None},
        ):
            store.append(record)
        done = harness(project, "done")
        assert done.returncode == 0, done.stdout + done.stderr
        assert "PASS" in done.stdout
        assert task_on_disk(project)["phase"] == "complete"

    def test_verify_reports_without_changing_anything(self, project: Path) -> None:
        harness(project, "start", "feature", "x")
        seen = harness(project, "verify")
        assert seen.returncode == 1
        assert "MORE_WORK" in seen.stdout
        assert (project / ".harness" / "verdict.json").exists()
        assert task_on_disk(project)["phase"] == "spec"


class TestAbandoning:
    def test_abandon_closes_the_task_with_the_reason_on_record(self, project: Path) -> None:
        harness(project, "start", "bug", "x")
        done = harness(project, "abandon", "superseded by the rewrite")
        assert done.returncode == 0
        assert not (project / ".harness" / "task.json").exists()
        closed = json.loads((project / ".harness" / "abandoned.jsonl").read_text(encoding="utf-8").splitlines()[-1])
        assert closed["title"] == "x" and closed["why"] == "superseded by the rewrite"
        assert harness(project, "start", "feature", "next").returncode == 0
