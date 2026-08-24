"""The wrapper must recover a real position from the tool output it captured.

WHY THIS EXISTS.

`scripts/run_gate.py` wraps every tool that is not itself built on `gate.py` --
bandit, pyright, coverage, mutmut, pytest. When one fails it recorded
`where=" ".join(cmd[:3])`, which is the command. The command is already stored
in `scope.command`, and it is not a place a reader can open.

Meanwhile the tools do print a position. Bandit prints
`UNRESOLVED B603 scripts/ci_metrics.py:43`; pyright prints
`/abs/path/x.py:12:5 - error: ...`; pytest prints
`FAILED tests/x.py:64: AssertionError`. All of it stayed as prose inside the
last six lines of output, so the finalizer had no location for these gates and
every annotation it could emit for them was empty.

WHAT MUST NOT HAPPEN. The extracted string becomes a GitHub annotation, which
is a claim a reader acts on. Pointing at a file that is not in the tree, or at
a number lifted out of a percentage or a duration, sends someone to read
nothing. So the parser verifies the file exists in this repository before
returning it, and returns "" otherwise -- at which point the caller keeps the
old command string and nothing is worse than before.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import run_gate  # noqa: E402

# --- shapes the real tools in this repository actually print ---------------


@pytest.mark.parametrize(
    ("output", "expected"),
    [
        (
            "  UNRESOLVED  B603 scripts/ci_metrics.py:43  subprocess_without_shell",
            "scripts/ci_metrics.py:43",
        ),
        (
            "FAILED tests/test_codeowners.py:64: AssertionError",
            "tests/test_codeowners.py:64",
        ),
        ("  ./scripts/gate.py:12: something", "scripts/gate.py:12"),
    ],
)
def test_a_real_relative_position_is_recovered(output: str, expected: str) -> None:
    assert run_gate.first_location(output) == expected


@pytest.mark.parametrize(
    "output",
    [
        "Total coverage: 91.2%",  # a percentage is not a line
        "duration 1:30",  # nor is a clock
        "scripts/definitely_not_a_real_file.py:9",  # file is not in the tree
        "mutation discrimination: 19/20",  # nor is a ratio
        "no position anywhere in this line",
        "",
    ],
)
def test_nothing_is_returned_when_there_is_no_provable_position(output: str) -> None:
    """Silence is the correct answer. The caller falls back to the command."""
    assert run_gate.first_location(output) == ""


def test_the_first_real_position_wins_over_an_earlier_unreal_one() -> None:
    """Tool output interleaves. A bogus path must not consume the match."""
    text = (
        "scripts/not_a_file_at_all.py:5 noise\n"
        "  UNRESOLVED B603 scripts/gate.py:31 real"
    )
    assert run_gate.first_location(text) == "scripts/gate.py:31"


# --- absolute paths, which is how pyright reports -------------------------


def test_an_absolute_path_inside_the_repository_is_made_relative(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """pyright prints absolute paths; an annotation needs the relative form.

    Built against a temporary tree rather than this repository on purpose:
    this checkout lives at a path containing a space ("final countdown"), and
    the position pattern cannot cross one, so the real-world case cannot be
    exercised here. A GitHub runner checks out to
    /home/runner/work/<repo>/<repo>, which has no spaces, so this reconstructs
    that shape instead of asserting against a path that would never occur in
    CI.
    """
    root = tmp_path / "work" / "final-countdown"
    (root / "scripts").mkdir(parents=True)
    target = root / "scripts" / "thing.py"
    target.write_text("x = 1\n", encoding="utf-8")
    monkeypatch.setattr(run_gate, "REPO", root)

    line = f"  {target}:12:5 - error: Expected str but received Unknown"
    assert run_gate.first_location(line) == "scripts/thing.py:12"


def test_an_absolute_path_outside_the_repository_is_skipped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A warning from site-packages is a real file, but not one in this diff.

    Annotating it would point a reader at a dependency they cannot edit here.
    """
    root = tmp_path / "repo"
    (root / "scripts").mkdir(parents=True)
    outside = tmp_path / "elsewhere" / "dep.py"
    outside.parent.mkdir(parents=True)
    outside.write_text("y = 2\n", encoding="utf-8")
    monkeypatch.setattr(run_gate, "REPO", root)

    assert run_gate.first_location(f"{outside}:9: warning") == ""


def test_a_position_is_only_returned_for_a_file_that_exists(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The control for the two tests above: existence is what is checked."""
    root = tmp_path / "repo"
    (root / "scripts").mkdir(parents=True)
    monkeypatch.setattr(run_gate, "REPO", root)
    assert run_gate.first_location("scripts/ghost.py:3") == ""

    (root / "scripts" / "ghost.py").write_text("z = 3\n", encoding="utf-8")
    assert run_gate.first_location("scripts/ghost.py:3") == "scripts/ghost.py:3"
