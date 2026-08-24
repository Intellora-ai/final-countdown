"""ADVERSARIAL TESTS for gate_integrity clause (d) — the annotator escape hatch.

Clause (d) exists to stop a real check from hiding as a harmless reporter. A
`continue-on-error` step with no `id` can never appear in the verification gate
condition, so it can never fail the job whatever it finds. Clause (d) permits
exactly one exception: annotators, which only re-report what an already-enforced
step already decided.

THE HOLE THIS MODULE CLOSES. The exception was decided by reading the step's
NAME and never what the step RUNS:

    elif not name.startswith("Annotate"):

Holding the payload constant at a genuine check (`npm run coverage`,
continue-on-error, no id) and varying only the name flipped the verdict:

    name='Coverage threshold'             -> gate FIRES
    name='Annotate coverage threshold'    -> gate SILENT
    name='Annotated coverage threshold'   -> gate SILENT   (startswith, no space)
    name='Annotate'                       -> gate SILENT

Same command every time. And because it was `startswith` rather than a
prefix-with-separator, the unrelated word "Annotated" opened it too.

WHAT MAKES IT SHARP: the gate's own remediation text recommended the bypass.
It said to "rename it to 'Annotate …' if it genuinely only reports". Someone hits
the failure, follows the advice, renames the step — the gate goes quiet while the
check still runs and still enforces nothing. A fix instruction that is also an
exploit is worse than no instruction.

THE REPLACEMENT IS STRUCTURAL, NOT TEXTUAL, which is how this repo already
thinks about gates ("dead exports are a call graph, not an import count"). Every
genuine annotator in the workflow consumes an artifact that an enforced step
produced:

    Annotate typecheck    < "$RUNNER_TEMP/tsc.log"       <- written by Typecheck
    Annotate lint         < "$RUNNER_TEMP/eslint.json"   <- written by Lint
    Annotate unit tests   < "$RUNNER_TEMP/vitest.json"   <- written by Unit tests
    Annotate bundle budget  reads "$RUNNER_TEMP/budget.log" <- written by Bundle budget

A step that reads none of them is not reporting on someone else's verdict; it is
producing its own, unenforced. That is the property worth checking, and it is
already true of all four annotators, so it lands without touching the workflow.

Tests come in pairs. A clause asserted only to fire is satisfied by rejecting
everything, exactly as one asserted only to stay silent is satisfied by
`return True`.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
PY = sys.executable

FRONTEND_WF = ".github/workflows/learning-canvas-frontend.yml"

#: Mirrors test_playwright_project_coverage.SANDBOX_PATHS. Duplicated rather
#: than imported: a cross-module import between test files makes collection
#: order load-bearing, and this module must be runnable on its own.
SANDBOX_PATHS = (
    "scripts",
    "ci",
    ".github/workflows",
    "frontend/playwright.config.ts",
    "frontend/scripts",
    "frontend/e2e/util",
    "frontend/src/canvas",
)

#: The real annotator this module sabotages. Its payload is replaced while its
#: name is left alone, which is the whole point of the experiment.
GENUINE_ANNOTATOR_RUN = 'node scripts/gh-annotate.mjs tsc < "$RUNNER_TEMP/tsc.log"'


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


def hides_a_check(result: subprocess.CompletedProcess[str]) -> bool:
    """Did clause (d) fire on the sabotaged step?"""
    return (
        "enforces nothing" in result.stdout
        or "is an annotator" in result.stdout
        or "continue-on-error with no id" in result.stdout
    )


def test_the_harness_is_not_vacuous(sandbox: Path) -> None:
    """The clean sandbox must PASS with a non-zero passed count.

    Without this, every other result in this file is void: a gate that dies at
    import reports zero findings, which is indistinguishable from a gate that
    looked carefully and found nothing.
    """
    result = integrity(sandbox)
    assert result.returncode == 0, result.stdout[-3000:]
    assert "passed=0" not in result.stdout, "gate collected nothing"
    assert "PASS" in result.stdout


def test_the_real_workflow_still_passes(sandbox: Path) -> None:
    """All four genuine annotators must remain legal. The fix must not be a
    blanket ban on id-less continue-on-error steps — that would break four
    working reporters to satisfy a rule."""
    result = integrity(sandbox)
    assert result.returncode == 0, result.stdout[-3000:]
    assert not hides_a_check(result)


def test_a_real_check_named_Annotate_is_caught(sandbox: Path) -> None:
    """THE DEFECT. Payload swapped for a genuine check; name left untouched.

    Before the fix this passed silently: `npm run coverage` ran on every build,
    could never fail the job, and the gate said nothing because the step was
    called 'Annotate typecheck'.
    """
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        "npm run coverage",
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert hides_a_check(result), result.stdout[-3000:]
    assert result.returncode != 0


def test_the_startswith_near_miss_is_also_caught(sandbox: Path) -> None:
    """`Annotated` is not `Annotate `, and `startswith` could not tell them apart.

    Kept as its own case because the two failures have different causes: this one
    survives even a name-based fix that forgets the trailing separator.
    """
    edit_workflow(
        sandbox,
        "- name: Annotate typecheck",
        "- name: Annotated coverage threshold",
        why="the annotator step name moved",
    )
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        "npm run coverage",
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert hides_a_check(result), result.stdout[-3000:]


def test_a_check_that_WRITES_the_artifact_is_not_an_annotator(sandbox: Path) -> None:
    """THE SECOND BYPASS, and it defeats the naive version of the fix.

    "Reads an artifact" is easy to approximate as "mentions $RUNNER_TEMP". That
    approximation is wrong in a way an attacker does not even have to intend:

        npm run coverage > "$RUNNER_TEMP/cov.log"

    mentions the artifact directory while CONSUMING NOTHING. It runs a real
    check, produces its own verdict, cannot fail the job, and a mention-based
    rule waves it through.

    Producing an artifact is the opposite of re-reporting one. A step that
    writes and does not read is the exact thing clause (d) exists to catch.
    """
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        'npm run coverage > "$RUNNER_TEMP/cov.log"',
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert hides_a_check(result), result.stdout[-3000:]
    assert result.returncode != 0


def test_a_check_that_tees_the_artifact_is_not_an_annotator(sandbox: Path) -> None:
    """The same bypass wearing the shape the real enforced steps use.

    `Typecheck` and `Bundle budget` both legitimately `tee` into $RUNNER_TEMP —
    but they carry ids and are enforced. Copying that shape into an id-less step
    produces a real check that looks maximally like the surrounding code, which
    is the version most likely to survive review.
    """
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        'set -o pipefail; npm run coverage 2>&1 | tee "$RUNNER_TEMP/cov.log"',
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert hides_a_check(result), result.stdout[-3000:]


def test_the_bare_magic_word_is_caught(sandbox: Path) -> None:
    """`Annotate` alone, with a real payload. The shortest possible bypass."""
    edit_workflow(
        sandbox,
        "- name: Annotate typecheck",
        "- name: Annotate",
        why="the annotator step name moved",
    )
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        "npm run coverage",
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert hides_a_check(result), result.stdout[-3000:]


def test_an_annotator_that_reads_without_a_redirect_stays_legal(sandbox: Path) -> None:
    """The pair for the write-vs-read rule, and it must not become
    "must contain a `<`". `Annotate bundle budget` greps the artifact by path
    with no redirect at all, and it is a genuine annotator. A rule that only
    recognised `<` would break a working reporter to satisfy a pattern."""
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        'grep -q "some marker" "$RUNNER_TEMP/tsc.log" && echo found',
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert result.returncode == 0, result.stdout[-3000:]
    assert not hides_a_check(result)


def test_a_gate_clause_naming_a_step_that_does_not_exist_is_caught(
    sandbox: Path,
) -> None:
    """THE ROOT, not the surface — the reverse direction of clause (c).

    Clause (c) walks the STEPS and asks whether each id'd step appears in the
    gate condition. Nothing ever walked the CONDITION to ask whether each id it
    names still resolves to a step.

    So the condition can keep a clause pointing at a step that is gone. GitHub
    evaluates the missing outcome as empty, `'' == 'failure'` is false forever,
    and that clause enforces nothing while reading as though it does. It is the
    dead-anchor shape: a check that stopped running without anyone being told.

    ISOLATED ON PURPOSE. The step is DELETED rather than renamed or stripped of
    its id, because both of those leave a step behind for clauses (c) and (d) to
    catch — and then this test would pass without the new check existing. With
    the step gone there is nothing for the step-walking clauses to look at, so
    only a condition-walking check can fire.
    """
    edit_workflow(
        sandbox,
        """      - name: Bundle budget
        id: budget
        continue-on-error: true
        shell: bash
        run: |
          set -o pipefail
          npm run budget 2>&1 | tee "$RUNNER_TEMP/budget.log"
""",
        "",
        why="the Bundle budget step is not in the expected shape",
    )

    wf = (sandbox / FRONTEND_WF).read_text(encoding="utf-8")
    assert "steps.budget.outcome" in wf, (
        "the saboteur removed the gate clause as well as the step; it must "
        "leave the clause dangling or this test proves nothing"
    )

    result = integrity(sandbox)
    assert result.returncode != 0, (
        "a gate clause naming a step that does not exist was accepted. That "
        f"clause can never fail the job.\n{result.stdout[-2000:]}"
    )
    assert "budget" in result.stdout


def test_every_clause_in_the_real_condition_resolves(sandbox: Path) -> None:
    """The pair. The real workflow's condition must name only real steps, so
    the new check is not satisfied by rejecting everything."""
    result = integrity(sandbox)
    assert result.returncode == 0, result.stdout[-2000:]
    assert "names no step" not in result.stdout


def test_an_annotator_that_consumes_an_artifact_stays_legal(sandbox: Path) -> None:
    """The other half of the pair, and the one that stops this becoming a
    blanket ban: a NEW annotator, never seen before, is accepted purely because
    it reads an artifact an enforced step wrote."""
    edit_workflow(
        sandbox,
        GENUINE_ANNOTATOR_RUN,
        'node scripts/gh-annotate.mjs tsc < "$RUNNER_TEMP/some-new.log"',
        why="the genuine annotator payload moved",
    )
    result = integrity(sandbox)
    assert result.returncode == 0, result.stdout[-3000:]
    assert not hides_a_check(result)
