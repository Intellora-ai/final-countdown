"""PRODUCTION CODE MAY NOT SIT OUTSIDE EVERY COVERAGE SCOPE UNANNOUNCED.

WHY THIS EXISTS.

The `coverage` gate is required, blocks every merge, and says 95%. Measured on
2026-08-25, it measures 38 lines:

    pyproject.toml:19   source = ["src"]     ->   src/ is 5 files, 38 lines

Meanwhile `scripts/` holds 19,499 lines and `learning-os/src/` holds 7,992,
neither of them measured by anything.

THE ROOT CAUSE IS NOT "SOMEBODY SET IT TOO NARROW".

`ci/gates.toml:206` declares the gate as:

    must_contain = ["--cov-fail-under=95"]

That pins the THRESHOLD. Nothing pins or checks the SCOPE. So `gate_integrity`
has been verifying that the number 95 appears in the command and never asking
"95% of what?". The repository grew from 38 lines of production code to roughly
70,400 and every check stayed green the entire time.

That is SCOPE DRIFT, and this repository already knows the shape: it is the
same defect `check_ruleset.py` exists to catch between `ci/gates.toml` and the
live GitHub ruleset. Widening the scope once fixes today. It does not stop a
package added next year from drifting out of measurement in silence.

WHAT THIS GATE ACTUALLY ASSERTS.

Every directory holding production Python appears in exactly one declared list
in `ci/gates.toml`:

    measured    - a coverage scope measures it
    unmeasured  - production code with no coverage gate, reason REQUIRED
    excluded    - not production code, reason REQUIRED

A directory in NONE of them fails. That is the whole point: a new package is
a visible diff in the manifest or it is a red check, never a silent gap.

`unmeasured` exists because pretending is worse than admitting. `scripts/` has
no coverage floor today. Calling it `excluded` would be a lie, and leaving it
out entirely is exactly the drift being fixed. An unmeasured area with a
written reason is an honest gap; an undeclared one is an invisible one.

DECLARED, NEVER INFERRED.

The gate does not guess which directories are production. `reachability-gate.mjs`
already learned why (`:36-42`): a gate that infers its own scope can be
satisfied by the very input it exists to catch. Adding a directory to a list is
a diff somebody has to write and somebody has to review.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GATE = REPO / "scripts" / "coverage_scope_gate.py"
PY = sys.executable

CLEAN_MANIFEST = """\
[coverage]
measured = [
  { path = "app", scope = "app", floor = 95 },
]
unmeasured = [
  { path = "helpers", why = "no floor yet; measured by hand at 57%" },
]
excluded = [
  { path = "spec", why = "test code, not production code" },
]
"""


# EVERY REFUSAL MUST CARRY THE GATE'S OWN BANNER, AND THAT IS NOT DECORATION.
#
# The first version of this file asserted only `returncode != 0`. Run before
# the gate existed, `test_an_excluded_area_without_a_reason_is_refused` PASSED
# --- because a missing file also exits non-zero. A crash and a refusal were
# indistinguishable, which is the exact trap CLAUDE.md records from the
# no-symptom-patch hook: eleven tests asserting `exit == 2` that passed against
# a hook that was not installed.
#
# Requiring text only this gate prints means no crash, no typo in a path and no
# deleted file can satisfy a refusal test.
BANNER = "coverage-scope:"


def refused(result: subprocess.CompletedProcess[str], naming: str) -> None:
    """Assert the gate itself refused, and said which directory it was about."""
    assert result.returncode != 0, (
        f"the gate accepted this tree; stdout={result.stdout!r}"
    )
    assert BANNER in result.stdout, (
        "non-zero exit with no refusal banner, so this could equally be a "
        f"crash or a missing file.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )
    assert naming in result.stdout, (
        f"the gate refused but never named {naming!r}: {result.stdout!r}"
    )


def run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PY, str(GATE), "--root", str(root), "--manifest", str(root / "gates.toml")],
        capture_output=True, text=True, timeout=180,
    )


def _tree(tmp: Path, manifest: str, dirs: tuple[str, ...]) -> Path:
    """A miniature repository: some Python directories and a manifest."""
    root = tmp / "repo"
    root.mkdir()
    for d in dirs:
        target = root / d
        target.mkdir(parents=True, exist_ok=True)
        (target / "thing.py").write_text("VALUE = 1\n", encoding="utf-8")
    (root / "gates.toml").write_text(manifest, encoding="utf-8")
    return root


DIRS = ("app", "helpers", "spec")


def test_production_code_outside_every_scope_is_refused(tmp_path: Path) -> None:
    """THE ACTUAL BUG, in miniature.

    A new package appears and nobody adds it to any list. Today that is
    invisible: `--cov-fail-under=95` keeps passing because it is still
    measuring the same 38 lines it always measured.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST, (*DIRS, "billing"))
    refused(run(root), "billing")


def test_a_fully_declared_tree_passes(tmp_path: Path) -> None:
    """THE PAIR. Without it, `return 1` satisfies every other test here.

    A gate that refuses everything is not a gate. It is an outage that has not
    been noticed yet.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST, DIRS)
    result = run(root)
    assert result.returncode == 0, (
        f"a completely declared tree was refused: {result.stdout!r}"
    )
    assert BANNER in result.stdout, (
        "exit 0 with no banner: a gate that printed nothing and a gate that "
        f"never ran look identical. stdout={result.stdout!r}"
    )


def test_an_unmeasured_area_without_a_reason_is_refused(tmp_path: Path) -> None:
    """A gap may be declared. It may not be declared silently.

    `unmeasured` with no `why` is how "we will get to it" becomes permanent
    and unexplained. The reason is the whole difference between an accepted
    limitation and an unnoticed one.
    """
    manifest = CLEAN_MANIFEST.replace(
        '{ path = "helpers", why = "no floor yet; measured by hand at 57%" }',
        '{ path = "helpers" }',
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "helpers")


def test_an_excluded_area_without_a_reason_is_refused(tmp_path: Path) -> None:
    """Same rule, other list. Excluding without saying why is how production
    code gets quietly relabelled as not-production."""
    manifest = CLEAN_MANIFEST.replace(
        '{ path = "spec", why = "test code, not production code" }',
        '{ path = "spec" }',
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "spec")


def test_a_directory_declared_twice_is_refused(tmp_path: Path) -> None:
    """One directory, one answer.

    A path in both `measured` and `excluded` means the manifest disagrees with
    itself, and whichever list is read first silently wins. That is the kind of
    ambiguity that reads as a pass.
    """
    manifest = CLEAN_MANIFEST.replace(
        'excluded = [\n  { path = "spec", why = "test code, not production code" },\n]',
        'excluded = [\n  { path = "spec", why = "test code" },\n'
        '  { path = "app", why = "also claimed here" },\n]',
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")


def test_a_declaration_for_a_directory_that_no_longer_exists_is_refused(
    tmp_path: Path,
) -> None:
    """Stale declarations rot into permission slips.

    A row naming a deleted directory is not harmless. It is a line that says
    "this was considered" about something nobody has looked at in a year, and
    it makes the manifest read as more complete than it is.
    """
    manifest = CLEAN_MANIFEST.replace(
        "excluded = [",
        'excluded = [\n  { path = "deleted-last-year", why = "gone" },',
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "deleted-last-year")


def test_this_repository_declares_every_production_directory() -> None:
    """The real tree. If this fails, the finding is in the repository.

    It is the one test here that will fail the day somebody adds a package and
    forgets the manifest, which is the entire reason the gate exists.
    """
    result = subprocess.run(
        [PY, str(GATE)], cwd=REPO, capture_output=True, text=True, timeout=180
    )
    assert result.returncode == 0, result.stdout + result.stderr
