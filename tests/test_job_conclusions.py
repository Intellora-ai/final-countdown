"""A cancelled job can upload a report that says PASS.

`scripts/gate.py` writes `reports/<gate>.json` in `Gate.__exit__`, and every
upload step in `verify.yml` carries `if: always()`. So a job cancelled AFTER
that write uploads an artifact claiming PASS, every file-based check in
`aggregate_gates.py` agrees with it, and the finalizer certifies a cancelled
required check as passing.

The window is small -- the gate step is the last substantive step in every gate
job -- but `cancel-in-progress` is on for pull requests, so cancellation is the
routine case on every push, not an exotic one. And a cancelled required check
certified as passing is precisely the failure this repository exists to prevent.

`SKIPPED` is the same mechanism and matters more than it looks: GitHub counts a
skipped job as SATISFYING its required status check. A gate conditioned into
skipping is green in the ruleset, and the finalizer is the only thing that can
see it.

THE DIRECTION IS THE WHOLE DESIGN. GitHub's conclusions may turn a PASS into a
block. They may never turn a block into a PASS. An absent, empty or malformed
conclusions file is "no opinion": the verdict falls back to exactly what the
reports say, where missing evidence still blocks. An aggregator that could be
made to pass by handing it a file would have replaced one false green with a
better-hidden one, so the fail-safe cases below are as load-bearing as the
detection itself.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
PY = sys.executable

MANIFEST = '''[schema]
version = "1.2"
run_identity = { commit = "GITHUB_SHA", run_id = "GITHUB_RUN_ID", \
run_attempt = "GITHUB_RUN_ATTEMPT", workflow = "GITHUB_WORKFLOW" }

[gates.alpha]
workflow = "verify.yml"
job = "alpha"
mandatory = true
role = "gate"
evidence = "reports/alpha.json"
'''

PASSING_REPORT: dict[str, Any] = {
    "schema_version": "1.2", "gate": "alpha", "status": "PASS",
    "mergeable_contribution": True, "commit": "local", "run_id": "local",
    "run_attempt": "local", "workflow": "local", "duration_ms": 10,
    "checks_passed": 1, "checks_failed": 0,
    "failures": [], "warnings": [], "scope": {},
}


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """The real finalizer, a one-gate manifest, and a PASSING report."""
    work = tmp_path / "w"
    (work / "ci").mkdir(parents=True)
    (work / "evidence" / "reports-alpha").mkdir(parents=True)
    for name in ("aggregate_gates.py", "blocker_report.py"):
        shutil.copy(REPO / "scripts" / name, work / name)
    (work / "ci" / "gates.toml").write_text(MANIFEST, encoding="utf-8")
    (work / "evidence" / "reports-alpha" / "alpha.json").write_text(
        json.dumps(PASSING_REPORT), encoding="utf-8")
    return work


# The aggregator binds evidence to the current run through these. Inside GitHub
# Actions they are SET, so a fixture report saying commit="local" is correctly
# rejected as belonging to another run and every assertion below sees a FAIL it
# did not ask for. Stripping them makes the sandbox identity "local" on a runner
# and on a laptop alike. Learned the expensive way: this file passed locally and
# failed in CI, which is the exact class of bug the rest of the suite exists to
# catch.
RUN_IDENTITY_ENV = ("GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT",
                    "GITHUB_WORKFLOW")


def sandbox_env() -> dict[str, str]:
    import os
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)  # never write to the real summary
    for var in RUN_IDENTITY_ENV:
        env.pop(var, None)
    return env


def aggregate(work: Path, conclusions: str | None = None
              ) -> subprocess.CompletedProcess[str]:
    args = [PY, "aggregate_gates.py", "--evidence-root", "evidence"]
    if conclusions is not None:
        (work / "jobs.json").write_text(conclusions, encoding="utf-8")
        args += ["--job-conclusions", "jobs.json"]
    return subprocess.run(args, cwd=work, capture_output=True, text=True,
                          timeout=120, env=sandbox_env())


def conclusion(name: str, verdict: str) -> str:
    return json.dumps({"jobs": [{"name": name, "conclusion": verdict}]})


# --- the hole ---------------------------------------------------------------

def test_a_passing_report_from_a_cancelled_job_blocks(workspace: Path) -> None:
    """THE DEFECT. Same artifact, opposite verdict, because GitHub disagrees."""
    clean = aggregate(workspace)
    assert clean.returncode == 0, "the baseline report must pass on its own"

    result = aggregate(workspace, conclusion("alpha", "cancelled"))
    assert result.returncode == 1, (
        "a report saying PASS from a job GitHub cancelled was certified\n"
        + result.stdout[-600:])
    assert "CANCELLED" in result.stdout
    assert "cancelled_checks=1" in result.stdout


def test_a_passing_report_from_a_skipped_job_blocks(workspace: Path) -> None:
    """GitHub counts a skipped job as satisfying its required check.

    So the ruleset is green and this is the only place the gate's absence is
    visible. It has to be a distinct count, not folded into missing evidence:
    a skipped job and a crashed one need different fixes.
    """
    result = aggregate(workspace, conclusion("alpha", "skipped"))
    assert result.returncode == 1
    assert "unexpectedly_skipped_checks=1" in result.stdout


def test_the_reason_is_stated_not_just_the_status(workspace: Path) -> None:
    """"no report produced" would be a lie here -- a report WAS produced."""
    result = aggregate(workspace, conclusion("alpha", "cancelled"))
    assert "GitHub concluded" in result.stdout
    assert "cut short" in result.stdout


# --- fail-safe: no opinion is not a pass, and never a rescue ----------------

@pytest.mark.parametrize(("label", "body"), [
    ("malformed json", "not json at all {"),
    ("jobs is not a list", '{"jobs": "nope"}'),
    ("no jobs key", "{}"),
    ("empty jobs", '{"jobs": []}'),
    ("conclusion still null", '{"jobs": [{"name": "alpha", "conclusion": null}]}'),
])
def test_an_unusable_conclusions_file_leaves_the_verdict_to_the_reports(
        workspace: Path, label: str, body: str) -> None:
    """Every one of these must behave exactly as if the flag were not passed.

    A transient API failure must not be able to fail the finalizer. It must
    equally not be able to pass it -- which is the next test.
    """
    result = aggregate(workspace, body)
    assert result.returncode == 0, f"{label}: an unusable file changed the verdict"
    assert "overall=PASS" in result.stdout


def test_a_missing_conclusions_file_is_not_an_error(workspace: Path) -> None:
    result = subprocess.run(
        [PY, "aggregate_gates.py", "--evidence-root", "evidence",
         "--job-conclusions", "no-such-file.json"],
        cwd=workspace, capture_output=True, text=True, timeout=120,
        env=sandbox_env())
    assert result.returncode == 0
    assert "unavailable" in result.stdout
    assert "absence still blocks" in result.stdout


def test_a_success_conclusion_cannot_rescue_missing_evidence(
        workspace: Path) -> None:
    """THE INVARIANT THAT MATTERS MOST.

    Conclusions may turn a PASS into a block. They may never turn a block into
    a PASS. If GitHub saying `success` could clear a gate that produced no
    evidence, this change would have replaced one false green with one that is
    harder to see -- an artifact you can forge by not uploading one.
    """
    shutil.rmtree(workspace / "evidence" / "reports-alpha")
    result = aggregate(workspace, conclusion("alpha", "success"))
    assert result.returncode == 1, (
        "a success conclusion cleared a gate with no evidence")
    assert "no report produced" in result.stdout


def test_a_cancelled_job_with_no_evidence_says_cancelled(
        workspace: Path) -> None:
    """Both block; only one of them is a defect in the change.

    "no report produced — the gate did not run, crashed before writing, or its
    artifact never arrived" sends a reader to look for a bug that is not there
    when the real answer is that someone pushed again.
    """
    shutil.rmtree(workspace / "evidence" / "reports-alpha")
    result = aggregate(workspace, conclusion("alpha", "cancelled"))
    assert result.returncode == 1
    assert "CANCELLED" in result.stdout
    assert "work that was stopped" in result.stdout


# --- controls ---------------------------------------------------------------

def test_a_success_conclusion_leaves_a_passing_gate_passing(
        workspace: Path) -> None:
    result = aggregate(workspace, conclusion("alpha", "success"))
    assert result.returncode == 0
    assert "overall=PASS" in result.stdout
    assert "cancelled_checks=0" in result.stdout


def test_the_finalizers_own_null_conclusion_is_ignored(workspace: Path) -> None:
    """`full` reads this list while it is itself running, so its own entry is
    null. Treating null as "not success" would make the finalizer block on
    itself, every time, forever."""
    body = json.dumps({"jobs": [
        {"name": "alpha", "conclusion": "success"},
        {"name": "full", "conclusion": None},
    ]})
    result = aggregate(workspace, body)
    assert result.returncode == 0, result.stdout[-500:]


def test_the_counters_are_reported_even_on_a_green_run(
        workspace: Path) -> None:
    """A count only printed when it is non-zero teaches a reader nothing about
    whether it was measured at all."""
    result = aggregate(workspace, conclusion("alpha", "success"))
    assert "cancelled_checks=0" in result.stdout
    assert "unexpectedly_skipped_checks=0" in result.stdout
    assert "checks_missing_evidence=0" in result.stdout


def test_the_workflow_grants_actions_read_only_to_the_finalizer() -> None:
    """The permission is real, and it is not workflow-wide.

    Twelve gate jobs have no business reading the Actions API. A permission is
    easiest to reason about where it is smallest, and this asserts the scope
    rather than trusting the diff that introduced it.

    The allowlist is named rather than open-ended, and that is the point: a job
    that needs the Actions API has to be added HERE, in a test, by someone who
    can say which API call needs it. `merge-evidence` reads the check runs on
    the pull request, which is the same API surface. Any job not on this list
    that acquires `actions` still fails, which is the whole enforcement value.
    """
    import yaml
    may_read_actions = {"full", "merge-evidence"}
    spec = yaml.safe_load(
        (REPO / ".github" / "workflows" / "verify.yml").read_text(
            encoding="utf-8"))
    assert spec["permissions"] == {"contents": "read"}, (
        "the workflow-level permission grew; actions: read belongs to `full`")
    assert spec["jobs"]["full"]["permissions"] == {
        "contents": "read", "actions": "read"}
    for name, job in spec["jobs"].items():
        if name in may_read_actions:
            continue
        assert "actions" not in (job.get("permissions") or {}), (
            f"job {name} was granted actions access it does not need")
