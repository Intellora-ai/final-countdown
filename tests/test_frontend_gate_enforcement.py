"""ADVERSARIAL TESTS for gate_integrity check_frontend clauses (a)-(e).

WHAT GUARDS WHAT, AND WHY THIS FILE EXISTS.

`learning-canvas-frontend.yml` runs nine `continue-on-error: true` steps, so the
job is green with failures in it by construction. The verdict is restored by one
final `Verification gate` step that reads `steps.<id>.outcome` for each. That
design is sound and it is also fragile in a specific way: every clause of it can
be removed by an edit that looks harmless, and the workflow stays green.

`check_frontend` in `scripts/gate_integrity.py` is what makes those edits fail
preflight. Its five clauses are:

    (a) the gate step is not itself continue-on-error
    (b) the gate step contains `exit 1`
    (c) every continue-on-error step WITH an id appears in the gate condition
    (d) every continue-on-error step WITHOUT an id is an annotator
    (e) a step the gate reads sets `pipefail` if it pipes

All five work. Nothing tested any of them. `check_frontend` was exercised in one
file, `tests/test_playwright_project_coverage.py`, whose own docstring says it
covers checks (f) and (j); a search of `tests/` for `Verification gate`,
`pipefail` and `steps.*.outcome` returned nothing at all. So the guard on nine
unenforceable steps worked today and nothing would have noticed if it stopped.

THE VACUOUS-HARNESS TRAP, WHICH IS THE MORE DANGEROUS HALF.

`gate_integrity.py` imports `yaml` at module scope. Under a bare interpreter:

    $ python3 scripts/gate_integrity.py
    ModuleNotFoundError: No module named 'yaml'
    exit = 1

Exit 1, zero checks run. A saboteur suite written the obvious way -- plant a
defect, assert non-zero exit -- would therefore PASS on every clause, including
clauses that detect nothing, because the interpreter dies before reaching any of
them. Every test below would be green and worthless.

`test_the_harness_is_not_vacuous` is the negative control for the tests
themselves: it asserts the UNSABOTAGED sandbox exits 0 AND reports a non-zero
number of passed checks. If that fails, every result in this file is void and
the message says so.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
PY = sys.executable

FRONTEND_WF = ".github/workflows/learning-canvas-frontend.yml"

#: Mirrors test_ci_integrity.SANDBOX_PATHS. Duplicated rather than imported so
#: this module runs standalone without making collection order load-bearing.
SANDBOX_PATHS = (
    "scripts",
    "ci",
    ".github/workflows",
    "frontend/playwright.config.ts",
    "frontend/scripts",
    "frontend/e2e/util",
    "frontend/src/canvas",
)


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    """A copy of the verification system that tests may sabotage freely."""
    for rel in SANDBOX_PATHS:
        src = REPO / rel
        dst = tmp_path / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    (tmp_path / "reports").mkdir()
    return tmp_path


def integrity(cwd: Path) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)
    return subprocess.run(
        [PY, str(cwd / "scripts" / "gate_integrity.py")],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
        env=env,
    )


def edit_workflow(sandbox: Path, old: str, new: str, *, why: str) -> None:
    path = sandbox / FRONTEND_WF
    text = path.read_text(encoding="utf-8")
    assert old in text, f"stale saboteur: {why}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def passed_count(result: subprocess.CompletedProcess[str]) -> int:
    m = re.search(r"passed=(\d+)", result.stdout)
    return int(m.group(1)) if m else 0


# --- the negative control for the harness itself -----------------------------


def test_the_harness_is_not_vacuous(sandbox: Path) -> None:
    """IF THIS FAILS, EVERY OTHER RESULT IN THIS FILE IS VOID.

    `gate_integrity.py` does `import yaml` at module scope, so a bare
    interpreter exits 1 having run nothing. Under such an interpreter a
    "plant defect, expect non-zero" assertion passes for every clause,
    including a clause that detects nothing at all.

    So the clean sandbox must exit 0 AND report checks it actually ran. Both
    halves matter: exit 0 alone would also be satisfied by a gate that returned
    early, and a passed count alone says nothing about the verdict.
    """
    result = integrity(sandbox)
    assert result.returncode == 0, (
        "the UNSABOTAGED sandbox does not pass, so no saboteur result below "
        f"means anything.\n{result.stdout[-2000:]}{result.stderr[-2000:]}"
    )
    assert passed_count(result) > 0, (
        "the gate reported zero passed checks on a clean tree — it is dying "
        "before it checks anything (missing PyYAML is the usual cause), and "
        f"every test in this file would pass vacuously.\n{result.stderr[-2000:]}"
    )


# --- (a) the gate step must not be able to soft-fail -------------------------


def test_a_continue_on_error_on_the_gate_step_is_caught(sandbox: Path) -> None:
    """The gate decides the job. A gate that cannot fail makes all nine advisory."""
    edit_workflow(
        sandbox,
        "      - name: Verification gate\n",
        "      - name: Verification gate\n        continue-on-error: true\n",
        why="the Verification gate step is not where it was",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "the verification gate cannot fail the job" in result.stdout


# --- (b) the gate must actually exit non-zero --------------------------------


def test_b_gate_that_never_exits_non_zero_is_caught(sandbox: Path) -> None:
    """A gate whose condition fires and then exits 0 reports and enforces nothing.

    This is the shape that is hardest to see in review: the step is present, the
    condition is correct, the summary table is written, and the job is green.
    """
    edit_workflow(
        sandbox,
        "          exit 1",
        "          exit 0",
        why="the gate step no longer contains `exit 1`",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "the verification gate does not fail" in result.stdout


# --- (c) an id'd step dropped from the condition -----------------------------


def test_c_step_dropped_from_the_gate_condition_is_caught(sandbox: Path) -> None:
    """Deleting one clause silently un-enforces one check and nothing else moves.

    The step still runs, still reports, still shows in the summary table. Only
    the `||` clause is gone, and with `continue-on-error` on the step, its
    failure stops reaching the job's verdict.
    """
    edit_workflow(
        sandbox,
        "          steps.budget.outcome == 'failure'",
        "          false",
        why="the gate condition no longer names steps.budget.outcome",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "reports but cannot fail the job" in result.stdout
    assert "budget" in result.stdout


# --- (d) an id-less step that is not an annotator ----------------------------


def test_d_id_less_soft_failing_step_is_caught(sandbox: Path) -> None:
    """WITHOUT AN ID A STEP CAN NEVER REACH THE CONDITION.

    This is the half that stops a real check hiding as a reporter: drop the id
    and there is no `steps.<id>.outcome` to write, so the step can never fail
    the job whatever it finds. Renaming an annotator is the cheapest way to
    produce that shape without touching anything else.
    """
    edit_workflow(
        sandbox,
        "      - name: Annotate lint\n",
        "      - name: Check lint results\n",
        why="the 'Annotate lint' step is not where it was",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "is continue-on-error with no id" in result.stdout
    assert "Check lint results" in result.stdout


# --- (e) the pipefail class --------------------------------------------------


def test_e_piping_without_pipefail_is_caught(sandbox: Path) -> None:
    """`npm run typecheck | tee` reports tee's status under GitHub's `bash -e`.

    That is not hypothetical here: this exact defect made the typecheck clause
    of the verification gate dead for the entire life of the workflow. The
    instance was fixed; clause (e) is what makes the class impossible.
    """
    path = sandbox / FRONTEND_WF
    text = path.read_text(encoding="utf-8")
    before = text.count("set -o pipefail")
    assert before >= 1, "no step sets pipefail — this saboteur is stale"
    # Only the first, so the sandbox still differs from the real file in exactly
    # one place and the finding names one step rather than several.
    path.write_text(
        text.replace("          set -o pipefail\n", "", 1), encoding="utf-8"
    )

    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "pipes without pipefail" in result.stdout


# --- the residual bypass, documented rather than closed ----------------------


def test_a_dangling_gate_clause_is_not_detected_by_anything(sandbox: Path) -> None:
    """A KNOWN HOLE, LARGER THAN THE ONE IT WAS WRITTEN FOR. Pinned, not blessed.

    Clause (d) permits an id-less `continue-on-error` step whose name starts
    with `Annotate`, on the reasoning that annotators only report. The control
    is a STRING, not a semantic property, and that is documented intent at
    `scripts/gate_integrity.py:677`.

    Following that thread turned up a second gap that is worse. Rename a real
    check to `Annotate ...` and drop its id, and the result is:

        gate_integrity -> exit 0, passed=92, failed=0, PASS
        gate condition -> still names steps.lint.outcome, 3 occurrences

    Clause (d) is silent because of the name. Clause (c) is silent for a
    different reason: it walks STEPS and asks whether each id'd step appears in
    the condition. It never walks the CONDITION and asks whether each id it
    names still exists. So the gate keeps a clause pointing at a step that is
    gone, GitHub evaluates the missing outcome as empty, `'' == 'failure'` is
    false forever, and Lint can fail with the job green.

    That is precisely the failure `check_frontend` exists to prevent, reached
    through a rename, and the whole verification system reports PASS.

    NOT FIXED HERE ON PURPOSE. The instruction covering this work was to
    document the residual bypass, not to redesign it. The missing check is the
    reverse direction of clause (c): every id named in the gate condition must
    resolve to a step that exists.

    IF THIS TEST FAILS, THAT IS GOOD NEWS -- someone added that check. Update
    this test to describe the new rule rather than restoring the hole.
    """
    edit_workflow(
        sandbox,
        "      - name: Lint\n        id: lint\n",
        "      - name: Annotate lint quality\n",
        why="the Lint step is not in the expected shape",
    )
    result = integrity(sandbox)

    still_referenced = (
        (sandbox / FRONTEND_WF).read_text(encoding="utf-8").count("steps.lint.outcome")
    )
    assert still_referenced > 0, "the saboteur removed the clause too; it should not"

    assert result.returncode == 0, (
        "something now rejects a real check renamed to 'Annotate ...' with its "
        "id dropped. The hole this test documents has been closed — update the "
        f"test to describe the new rule.\n{result.stdout[-1500:]}"
    )
    assert "failed=0" in result.stdout, (
        "the gate reported findings on this sabotage; the hole is narrower than "
        f"documented.\n{result.stdout[-1500:]}"
    )


def test_the_name_prefix_is_the_load_bearing_part_of_that_bypass(
    sandbox: Path,
) -> None:
    """Same sabotage WITHOUT the rename, to isolate which clause is doing work.

    Dropping the id alone leaves the name as `Lint`, which does not start with
    `Annotate`, so clause (d) fires. That is what proves the previous test
    documents a bypass rather than a general blindness: the string is the only
    thing standing between the two outcomes.
    """
    edit_workflow(
        sandbox,
        "      - name: Lint\n        id: lint\n",
        "      - name: Lint\n",
        why="the Lint step is not in the expected shape",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "is continue-on-error with no id" in result.stdout
