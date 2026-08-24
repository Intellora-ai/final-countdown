"""No gates is not all gates passing.

`scripts/aggregate_gates.py` decides whether a commit is mergeable by comparing
the reports it found against the gate set `ci/gates.toml` declares. It used to
treat an absent manifest as an empty declaration, and an empty declaration
flows straight to success: no expected gates, therefore nothing missing,
therefore nothing blocking, therefore PASS.

Measured before the fix, on a copy with no manifest:

    [GATE MANIFEST] overall=PASS  mergeable=True
    expected 0 gate(s), admissible reports 0            exit 0

Deleting one file turned twelve gates into zero and reported success -- in the
one component whose stated purpose is that absence must be fail-closed.

WHY IT WAS FIXED ANYWAY, GIVEN IT WAS UNREACHABLE. Removing `ci/gates.toml`
also reddens `preflight`, so CI would have caught it. That is a second control
happening to cover this one. A control that is only safe because another
control notices is not fail-closed, and the coupling is invisible: nothing
records that `preflight` is load-bearing for the finalizer's correctness.

THE DISTINCTION THAT MATTERS. This returns 2, not 1. Exit 1 means "aggregated,
and something failed" -- a verdict about the change. Exit 2 means "the expected
set is unknown, so no verdict exists". Collapsing them would tell a reader
their code is broken when in fact the verifier is.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
AGGREGATE = REPO / "scripts" / "aggregate_gates.py"
PY = sys.executable


def workspace(tmp_path: Path, manifest: str | None) -> Path:
    """A tree with the real finalizer and a manifest we control."""
    work = tmp_path / "w"
    (work / "ci").mkdir(parents=True)
    (work / "evidence").mkdir()
    for name in ("aggregate_gates.py", "blocker_report.py"):
        shutil.copy(REPO / "scripts" / name, work / name)
    if manifest is not None:
        (work / "ci" / "gates.toml").write_text(manifest, encoding="utf-8")
    return work


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PY, "aggregate_gates.py", "--evidence-root", "evidence"],
        cwd=work,
        capture_output=True,
        text=True,
        timeout=120,
    )


# Each of these leaves the expected gate set unknown. None may report a verdict.
@pytest.mark.parametrize(
    ("label", "manifest"),
    [
        ("missing", None),
        ("empty file", ""),
        ("no gates table", "[ruleset]\nid = 20990225\n"),
        ("empty gates table", "[gates]\n"),
        ("malformed toml", "[gates\nthis is not toml"),
    ],
)
def test_an_unknown_gate_set_is_never_a_pass(
    tmp_path: Path, label: str, manifest: str | None
) -> None:
    result = run(workspace(tmp_path, manifest))
    assert result.returncode == 2, (
        f"{label}: expected INFRASTRUCTURE_FAILURE (exit 2), got "
        f"{result.returncode}\n{result.stdout[-600:]}"
    )
    assert "INFRASTRUCTURE_FAILURE" in result.stdout, (
        f"{label}: the status was not stated"
    )
    assert "PASS" not in result.stdout.replace("INFRASTRUCTURE_FAILURE", ""), (
        f"{label}: the word PASS appeared in a run that judged nothing"
    )


def test_the_reason_is_stated_not_just_the_status(tmp_path: Path) -> None:
    """A reader must be told which of the five conditions occurred."""
    result = run(workspace(tmp_path, None))
    assert "missing" in result.stdout
    assert "No gates is not all gates passing" in result.stdout


def test_an_annotation_is_emitted_so_it_appears_on_the_pull_request(
    tmp_path: Path,
) -> None:
    """This failure has no file to point at, so the annotation is title-only.

    It still has to reach the PR: a finalizer that could not run is the most
    important thing on the page, and burying it in a log nobody opens is how
    an infrastructure failure gets re-run until it goes away.
    """
    result = run(workspace(tmp_path, None))
    assert "::error title=gate manifest::" in result.stdout


def test_exit_two_is_distinct_from_a_real_gate_failure(tmp_path: Path) -> None:
    """The control, and the point of the whole file.

    A valid manifest whose gates did not report is a VERDICT -- exit 1, the
    gates are missing and the merge is blocked. An absent manifest is exit 2.
    If these collapsed to the same code, "your change is broken" and "the
    verifier is broken" would be indistinguishable to the person reading it.
    """
    valid = (
        "[gates.pyright]\n"
        'workflow = "verify.yml"\n'
        'job = "pyright"\n'
        "mandatory = true\n"
        'role = "gate"\n'
        'evidence = "reports/pyright.json"\n'
    )
    result = run(workspace(tmp_path, valid))
    assert result.returncode == 1, (
        "a declared-but-unreported gate must be a verdict (1), not an "
        f"infrastructure failure (2)\n{result.stdout[-600:]}"
    )
    assert "INFRASTRUCTURE_FAILURE" not in result.stdout


def test_the_real_repository_manifest_still_aggregates(tmp_path: Path) -> None:
    """The fix must not reject the manifest this repository actually ships."""
    work = workspace(tmp_path, (REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    result = run(work)
    assert result.returncode == 1, (
        "the real manifest with no evidence should block (1), not fail to "
        f"load (2)\n{result.stdout[-600:]}"
    )
    assert "INFRASTRUCTURE_FAILURE" not in result.stdout, (
        "the real ci/gates.toml was rejected as unreadable"
    )
