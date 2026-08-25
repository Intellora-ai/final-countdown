"""The database-suite floor gate, tested in both directions.

This gate exists because pytest's exit code only catches a suite that vanished
entirely. A suite that shrank from eight tests to one still exits 0. So the
interesting tests here are the shrinking ones, not the healthy one.

No database is needed. The output parser is a pure function over pytest's
stdout, and the floor comparison is a pure function over a count, so both are
tested directly rather than by standing up PostgreSQL to produce a number.
"""

from __future__ import annotations

import importlib.util
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]


def _load() -> ModuleType:
    path = REPO_ROOT / "scripts" / "db_suite_floor.py"
    spec = importlib.util.spec_from_file_location("db_suite_floor", path)
    assert spec is not None and spec.loader is not None, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules["db_suite_floor"] = module
    spec.loader.exec_module(module)
    return module


GATE = _load()


def _counting(value: int) -> Callable[[Path], int]:
    """A stand-in for `collected` that reports a fixed number.

    A typed function rather than a lambda: pyright --strict cannot infer a
    lambda parameter's type here, and reported the substitution as partially
    unknown. Naming the signature also documents what `collected` is -- a
    function from a repository root to a count.
    """

    def counted(_root: Path) -> int:
        return value

    return counted


# ---------------------------------------------------------------------------
# Parsing pytest's output, which is not one format
# ---------------------------------------------------------------------------


def test_parses_the_per_file_format_pytest_9_emits() -> None:
    """pytest 9's `-q --collect-only` prints one line per file and NO summary.

    The first version of this gate looked only for a summary line, found none,
    and reported "could not read a collected count" -- a gate that failed on a
    healthy suite. That is worse than no gate, because it teaches the reader to
    ignore it.
    """
    assert GATE._parse("tests/db/test_seed_determinism.py: 8\n") == 8


def test_sums_across_several_files() -> None:
    """A per-file format means the count is a SUM, not the last number seen."""
    stdout = "tests/db/test_a.py: 8\ntests/db/test_b.py: 5\n"
    assert GATE._parse(stdout) == 13


def test_parses_the_older_collected_items_format() -> None:
    assert GATE._parse("collected 12 items\n") == 12


def test_parses_the_older_tests_collected_format() -> None:
    assert GATE._parse("12 tests collected\n") == 12


def test_parses_a_single_item_without_the_plural() -> None:
    # "1 item" and "1 test", not "items"/"tests". A regex demanding the plural
    # reads a one-test suite as unparseable, which is the exact case the floor
    # is meant to catch.
    assert GATE._parse("collected 1 item\n") == 1
    assert GATE._parse("1 test collected\n") == 1


def test_returns_none_when_no_format_matches() -> None:
    """`None`, not 0.

    0 means "the suite is empty" and `None` means "this gate could not read the
    output". Those need opposite fixes, and collapsing them sends the reader to
    the wrong one.
    """
    assert GATE._parse("something entirely unexpected\n") is None


def test_does_not_mistake_a_collected_node_id_for_a_count() -> None:
    """A collected node id must not be read as a per-file count line."""
    assert GATE._parse("tests/db/test_seed.py::test_thing\n") is None


# ---------------------------------------------------------------------------
# The floor itself
# ---------------------------------------------------------------------------


def test_passes_when_the_count_meets_the_floor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(GATE, "collected", _counting(GATE.FLOOR))
    assert GATE.main() == 0


def test_passes_when_the_count_has_grown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(GATE, "collected", _counting(GATE.FLOOR + 40))
    assert GATE.main() == 0


def test_fails_when_the_count_shrinks_by_one(monkeypatch: pytest.MonkeyPatch) -> None:
    """The whole point. One test short is a failure, not a rounding error.

    Without this the gate is satisfied by `return 0`, and the paired test above
    would never notice.
    """
    monkeypatch.setattr(GATE, "collected", _counting(GATE.FLOOR - 1))
    assert GATE.main() == 1


def test_fails_when_the_count_is_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(GATE, "collected", _counting(0))
    assert GATE.main() == 1


def test_the_floor_is_not_zero() -> None:
    """A floor of zero is a gate that cannot fail.

    Somebody under pressure will reach for it, and it would pass every build
    forever while looking exactly like an enforced floor.
    """
    assert GATE.FLOOR > 0


def test_the_floor_matches_the_tests_that_exist_today() -> None:
    """The floor must describe a real suite, not an aspiration.

    A floor set above the actual count fails every build immediately; one set
    far below it never fires. Counting the test functions on disk keeps the
    number honest without running pytest.
    """
    db_tests_dir = REPO_ROOT / GATE.SUITE
    assert db_tests_dir.is_dir(), f"{GATE.SUITE} does not exist"

    found = sorted(
        path
        for path in db_tests_dir.iterdir()
        if path.name.startswith("test_") and path.suffix == ".py"
    )
    assert found, f"no test files in {GATE.SUITE}"

    functions = sum(
        line.strip().startswith("def test_")
        for path in found
        for line in path.read_text(encoding="utf-8").splitlines()
    )
    assert functions >= GATE.FLOOR, (
        f"FLOOR is {GATE.FLOOR} but only {functions} test functions exist in "
        f"{GATE.SUITE}. The floor would fail every build."
    )
