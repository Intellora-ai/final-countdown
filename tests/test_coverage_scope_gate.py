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

[gates.coverage]
must_contain = ["--cov=app", "--cov-fail-under=95"]
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


# ---------------------------------------------------------------------------
# A FLOOR NOBODY ENFORCES IS A VERDICT WITH NO EVIDENCE.
#
# The gate above proves every production directory is DECLARED. It never asked
# whether a `measured` row's `floor` is enforced by anything that runs.
#
# So `{ path = "scripts", scope = "scripts", floor = 57 }` used to satisfy it
# completely while no job anywhere ran `--cov=scripts`. The manifest would read
# as "scripts is measured at 57%" and the number would be a sentence in a TOML
# file. That is the SAME defect one level up: the original bug was a threshold
# pinned with no scope, and this would be a scope declared with no threshold
# running.
#
# The check is deliberately strict about ONE gate carrying BOTH pins. Scope in
# one job and floor in another is not enforcement -- `--cov=scripts` with no
# floor never fails, and `--cov-fail-under=57` on a different scope is a
# measurement of something else.
# ---------------------------------------------------------------------------

GATES_SECTION = '\n[gates.coverage]\nmust_contain = ["--cov=app", "--cov-fail-under=95"]\n'


def test_a_measured_floor_that_no_gate_enforces_is_refused(tmp_path: Path) -> None:
    """THE SECOND-ORDER BUG, in miniature.

    Widening `unmeasured` to `measured` is the whole remaining work on the
    coverage gate. Without this check, that widening can be done by editing one
    TOML row and nothing would ever run the measurement it claims.
    """
    manifest = CLEAN_MANIFEST.replace(GATES_SECTION, "\n")
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")


def test_a_gate_pinning_a_different_floor_does_not_count(tmp_path: Path) -> None:
    """Graded by the NUMBER, not by the presence of the flag.

    A gate running `--cov-fail-under=90` does not enforce a declared floor of
    95. Without this, the manifest could advertise any number it liked as long
    as some gate somewhere passed some threshold.
    """
    manifest = CLEAN_MANIFEST.replace("--cov-fail-under=95", "--cov-fail-under=90")
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")


def test_a_gate_measuring_a_different_scope_does_not_count(tmp_path: Path) -> None:
    """Graded by the SCOPE too.

    `--cov=helpers --cov-fail-under=95` is a real, enforced 95% floor. It is
    not this row's floor. Checking only that the number appears somewhere is
    precisely the mistake `must_contain = ["--cov-fail-under=95"]` made.
    """
    manifest = CLEAN_MANIFEST.replace("--cov=app", "--cov=helpers")
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")


def test_scope_and_floor_split_across_two_gates_does_not_count(tmp_path: Path) -> None:
    """BOTH pins must live in ONE gate's command.

    A job measuring `--cov=app` with no threshold never fails. A different job
    passing `--cov-fail-under=95` over other code says nothing about `app`.
    Added together they look like enforcement and enforce nothing.
    """
    manifest = CLEAN_MANIFEST.replace(
        GATES_SECTION,
        '\n[gates.measure-only]\nmust_contain = ["--cov=app"]\n'
        '\n[gates.threshold-only]\nmust_contain = ["--cov-fail-under=95"]\n',
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")


def test_a_measured_row_with_no_floor_is_refused(tmp_path: Path) -> None:
    """`scope` alone was the whole requirement, and it is not enough.

    A row naming a scope and no floor claims measurement while declaring no
    standard, so there is nothing for a gate to enforce and nothing for a
    reader to check it against.
    """
    manifest = CLEAN_MANIFEST.replace(
        '{ path = "app", scope = "app", floor = 95 }',
        '{ path = "app", scope = "app" }',
    )
    root = _tree(tmp_path, manifest, DIRS)
    result = run(root)
    refused(result, "app")
    # MUTATION EVIDENCE, 2026-08-29. Deleting the `floor` type check left this
    # test green: with no floor the gate looked for the literal pin
    # `--cov-fail-under=None`, found none, and refused for the wrong reason
    # while still naming "app". Refusing by accident is not the same as
    # refusing on purpose -- the reason has to be asserted.
    assert "no integer `floor`" in result.stdout, (
        "refused, but not for the missing floor. A row with no floor must be "
        f"named as such, not caught by the enforcement lookup: {result.stdout!r}"
    )


def test_a_gate_pinning_the_whole_command_counts(tmp_path: Path) -> None:
    """A `must_contain` entry may be a whole invocation, not one flag.

    `[gates.pyright]` in the real manifest pins entire commands this way, and
    the coverage job's own pins sit inside one long pytest line. Comparing
    entries whole would reject that and quietly push every future gate towards
    one-flag-per-entry.

    MUTATION EVIDENCE, 2026-08-29: replacing `entry.split()` with
    `entry.append` killed no test, because every fixture and the real manifest
    happened to pin each flag as its own entry.
    """
    manifest = CLEAN_MANIFEST.replace(
        'must_contain = ["--cov=app", "--cov-fail-under=95"]',
        'must_contain = ["pytest -n auto --cov=app --cov-branch '
        '--cov-fail-under=95 -m \'not axle\'"]',
    )
    root = _tree(tmp_path, manifest, DIRS)
    result = run(root)
    assert result.returncode == 0, (
        "a gate pinning the whole command was read as enforcing nothing: "
        f"{result.stdout!r}"
    )
    assert BANNER in result.stdout, result.stdout


def test_a_near_miss_scope_inside_a_command_is_not_a_match(tmp_path: Path) -> None:
    """Splitting is what makes the match exact, and that cuts both ways.

    `--cov=application` contains `--cov=app`. A substring test would read that
    long command as enforcing this row's floor over a scope it never measures.
    """
    manifest = CLEAN_MANIFEST.replace(
        'must_contain = ["--cov=app", "--cov-fail-under=95"]',
        'must_contain = ["pytest --cov=application --cov-fail-under=95"]',
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")


def test_a_boolean_floor_is_not_an_integer_floor(tmp_path: Path) -> None:
    """`floor = true` is not a percentage, and Python will not say so for you.

    MUTATION EVIDENCE, 2026-08-29: dropping the `isinstance(floor, bool)` guard
    killed no test. `bool` is a subclass of `int`, so `true` passed the type
    check, became the pin `--cov-fail-under=True`, matched nothing, and was
    refused for the wrong reason -- reading as a floor no gate enforces rather
    than as a value that is not a floor at all.
    """
    manifest = CLEAN_MANIFEST.replace(
        '{ path = "app", scope = "app", floor = 95 }',
        '{ path = "app", scope = "app", floor = true }',
    )
    root = _tree(tmp_path, manifest, DIRS)
    result = run(root)
    refused(result, "app")
    assert "no integer `floor`" in result.stdout, (
        f"a boolean was accepted as a floor value: {result.stdout!r}"
    )


def test_a_malformed_gates_entry_refuses_instead_of_crashing(tmp_path: Path) -> None:
    """A gate that crashes on bad input is not a gate that failed safely.

    `[gates.*]` is hand-edited TOML, so a scalar where a table belongs is a
    typo somebody will make. If that raises, the exit code is non-zero and the
    banner is absent -- indistinguishable from a missing file, which is the
    exact trap this suite exists to avoid. The right answer is the normal
    refusal: the floor is unenforced, and the gate says so.

    MUTATION EVIDENCE, 2026-08-29: keeping a non-dict gate body instead of
    skipping it killed no test.
    """
    manifest = CLEAN_MANIFEST.replace(
        GATES_SECTION, '\n[gates]\ncoverage = "not-a-table"\n'
    )
    root = _tree(tmp_path, manifest, DIRS)
    refused(run(root), "app")
