"""ADVERSARIAL TESTS for gate_integrity checks (f) and (j) — frontend coverage.

Check (f) answers one question: does CI actually exercise every viewport that
`playwright.config.ts` declares? Check (j) answers a sibling: does the reporter's
machine-readable output leave the runner? A declared-but-never-run project, and
a findings file nobody retrieves, are both coverage claims with no evidence.

Both checks read job `frontend` and nothing else, because when they were written
there was one job. Sharding the browser guards to one runner per project moves
the `--project=` flags into a matrix job, and moves the findings file with them
— canvas-reporter only runs under Playwright. So both checks had to widen to
scan every job, and (f) had to resolve `${{ matrix.key }}` before matching.

Widening a gate is the dangerous direction. These tests pin it from BOTH sides:

  * `test_narrow_check_cannot_see_the_sharded_workflow` proves the widening is
    load-bearing — the old implementation fails a workflow whose coverage is
    complete.
  * `test_matrix_missing_one_project_is_caught` and
    `test_matrix_that_lists_projects_without_running_them_is_caught` prove it did
    not widen into "anything with a matrix passes", which is the failure mode
    that would silently reopen the hole check (f) exists to close.

Before this module, `check_frontend` had no test of any kind.
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

#: Mirrors test_ci_integrity.SANDBOX_PATHS. Duplicated rather than imported: a
#: cross-module import between test files makes collection order load-bearing,
#: and this module must be runnable on its own.
SANDBOX_PATHS = (
    "scripts",
    "ci",
    ".github/workflows",
    "frontend/playwright.config.ts",
    "frontend/scripts",
    "frontend/e2e/util",
    "frontend/src/canvas",
)

#: The five projects `playwright.config.ts` declares.
ALL_PROJECTS = (
    "desktop-1440",
    "square-900",
    "mobile-375",
    "reduced-motion",
    "keyboard",
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


def workflow(sandbox: Path) -> Path:
    return sandbox / FRONTEND_WF


def edit_workflow(sandbox: Path, old: str, new: str, *, why: str) -> None:
    path = workflow(sandbox)
    text = path.read_text(encoding="utf-8")
    assert old in text, f"stale saboteur: {why}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def narrow_the_check(sandbox: Path) -> None:
    """Revert check (f) to the pre-sharding implementation, in the sandbox only.

    The old version read the `run:` text of job `frontend` and nothing else,
    with a capture class of `[A-Za-z0-9_-]+` that `$` cannot satisfy.
    """
    path = sandbox / "scripts" / "gate_integrity.py"
    text = path.read_text(encoding="utf-8")
    widened = """        invoked: set[str] = set()
        for candidate in jobs.values():
            if isinstance(candidate, dict):
                invoked |= projects_invoked(cast("dict[str, Any]", candidate))"""
    assert widened in text, "widened check (f) not found — this saboteur is stale"
    narrow = """        steps_here = steps_of(cast("dict[str, Any]", job))
        run_text = "\\n".join(str(s.get("run", "")) for s in steps_here)
        invoked = set(re.findall(r"--project=([A-Za-z0-9_-]+)", run_text))"""
    path.write_text(text.replace(widened, narrow, 1), encoding="utf-8")


def missing(result: subprocess.CompletedProcess[str], name: str) -> bool:
    return f"Playwright project '{name}' is declared and never run" in result.stdout


def test_the_declared_project_list_is_still_five() -> None:
    """If the config grows a project, these fixtures are stale and must be updated."""
    cfg = (REPO / "frontend" / "playwright.config.ts").read_text(encoding="utf-8")
    block = cfg.partition("projects:")[2].partition("webServer:")[0]
    assert tuple(re.findall(r"name:\s*'([^']+)'", block)) == ALL_PROJECTS


def test_the_real_workflow_passes(sandbox: Path) -> None:
    """The shipped workflow satisfies both widened checks. The baseline."""
    result = integrity(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr


def test_narrow_check_cannot_see_the_sharded_workflow(sandbox: Path) -> None:
    """THE WIDENING IS LOAD-BEARING.

    Same workflow as the test above — coverage is complete — but the old
    implementation reports every project missing, because the flags live in a
    sibling job and behind a matrix expression. It would fail hardest exactly
    when coverage became complete, which is why check (f) could not be left
    alone once the guards were sharded.
    """
    narrow_the_check(sandbox)
    result = integrity(sandbox)
    assert result.returncode != 0
    for name in ALL_PROJECTS:
        assert missing(result, name), f"narrow check should not have seen {name}"


def test_matrix_missing_one_project_is_caught(sandbox: Path) -> None:
    """THE WIDENING DID NOT BECOME A RUBBER STAMP.

    Drop one viewport from the matrix. The gate must name that one, and must not
    smear the accusation across the four still covered — a check that fails with
    the wrong name is only marginally better than one that cannot fail.
    """
    omitted = ALL_PROJECTS[-1]
    edit_workflow(
        sandbox,
        f"          - {omitted}\n",
        "",
        why=f"matrix no longer lists {omitted}",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert missing(result, omitted)
    for name in ALL_PROJECTS[:-1]:
        assert not missing(result, name), f"{name} is covered and was accused anyway"


def test_matrix_that_lists_projects_without_running_them_is_caught(
    sandbox: Path,
) -> None:
    """A MATRIX IS NOT EVIDENCE. RUNNING THE PROJECT IS.

    The tempting shortcut when widening this check is to credit any name that
    appears in `strategy.matrix`. That would pass this workflow, where all five
    are listed and the browser step ignores the matrix entirely — coverage on
    paper, which is the exact thing check (f) was written to refuse.
    """
    edit_workflow(
        sandbox,
        '--project="$PROJECT"',
        "--project=desktop-1440",
        why="browser step no longer reads the matrix through env",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    for name in ALL_PROJECTS[1:]:
        assert missing(result, name), f"{name} is uncovered and was not caught"


def test_findings_upload_deleted_entirely_is_caught(sandbox: Path) -> None:
    """CHECK (j) WIDENED, BUT DID NOT STOP CHECKING.

    Scanning every job must not become "assume some job does it". Remove the
    upload from the whole workflow and the gate must still refuse: a reporter
    writing a file nobody retrieves is the same as not writing it.
    """
    edit_workflow(
        sandbox,
        "          name: learning-canvas-frontend-findings-${{ matrix.project }}\n"
        "          path: frontend/ci-findings.json\n",
        "          name: learning-canvas-frontend-findings-${{ matrix.project }}\n"
        "          path: frontend/nothing-here.json\n",
        why="findings upload no longer has the expected path",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "ci-findings.json is written and never uploaded" in result.stdout


def test_findings_upload_must_still_be_unconditional(sandbox: Path) -> None:
    """A findings file that only survives a green run is useless.

    The run it is needed for is the red one. Widening (j) across jobs must not
    lose the `if: always()` half of it.
    """
    edit_workflow(
        sandbox,
        """      - name: Upload failure findings
        if: always()""",
        """      - name: Upload failure findings
        if: success()""",
        why="findings upload no longer guarded by if: always()",
    )
    result = integrity(sandbox)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "the findings artifact is not uploaded on failure" in result.stdout
