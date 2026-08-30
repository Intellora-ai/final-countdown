"""The property gate, tested in both directions.

The gate exists because generated coverage can vanish silently: a `@given`
removed in a refactor, or a collection error taking out the file that holds most
of them, and the suite still reports a large green number.

So the interesting tests here are the ones where the count DROPS. A gate
asserted only to pass is satisfied by `return 0`, and this one would then report
a healthy floor forever while property tests disappeared underneath it.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]


def _load() -> ModuleType:
    path = REPO_ROOT / "scripts" / "property_gate.py"
    spec = importlib.util.spec_from_file_location("property_gate", path)
    assert spec is not None and spec.loader is not None, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules["property_gate"] = module
    spec.loader.exec_module(module)
    return module


GATE = _load()


def _ledger(root: Path, suite: str, executed: int) -> None:
    target = root / GATE.REPORTS / f"property-execution-{suite}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"executed": executed, "tests": []}), encoding="utf-8")


@pytest.mark.parametrize("suite", sorted(GATE.SUITES))
def test_a_suite_meeting_its_floor_passes(tmp_path: Path, suite: str) -> None:
    floor = GATE.SUITES[suite]
    _ledger(tmp_path, suite, floor)
    assert GATE.main(["--suite", suite, "--root", str(tmp_path)]) == 0


@pytest.mark.parametrize("suite", sorted(GATE.SUITES))
def test_a_suite_one_property_short_fails(tmp_path: Path, suite: str) -> None:
    """The whole point. One property fewer is a failure, not a rounding error.

    Without this the gate is satisfied by `return 0`, and the paired test above
    would never notice.
    """
    floor = GATE.SUITES[suite]
    _ledger(tmp_path, suite, floor - 1)
    assert GATE.main(["--suite", suite, "--root", str(tmp_path)]) == 1


@pytest.mark.parametrize("suite", sorted(GATE.SUITES))
def test_a_suite_that_ran_no_properties_fails(tmp_path: Path, suite: str) -> None:
    _ledger(tmp_path, suite, 0)
    assert GATE.main(["--suite", suite, "--root", str(tmp_path)]) == 1


def test_a_suite_that_grew_passes(tmp_path: Path) -> None:
    floor = GATE.SUITES["root"]
    _ledger(tmp_path, "root", floor + 100)
    assert GATE.main(["--suite", "root", "--root", str(tmp_path)]) == 0


def test_a_missing_ledger_is_an_error_not_a_zero(tmp_path: Path) -> None:
    """Exit 2, not exit 1, and not exit 0.

    "The suite did not run" and "the suite ran and found nothing" need opposite
    fixes. Treating a missing ledger as zero would report deleted property tests
    when the real problem was a skipped job, and sending the reader after the
    wrong one costs more than the failure itself.
    """
    with pytest.raises(SystemExit) as raised:
        GATE.main(["--suite", "root", "--root", str(tmp_path)])
    assert raised.value.code == 2


def test_a_corrupt_ledger_is_an_error_not_a_zero(tmp_path: Path) -> None:
    target = tmp_path / GATE.REPORTS / "property-execution-root.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("{not json", encoding="utf-8")

    with pytest.raises(SystemExit) as raised:
        GATE.main(["--suite", "root", "--root", str(tmp_path)])
    assert raised.value.code == 2


def test_a_ledger_without_the_count_is_an_error(tmp_path: Path) -> None:
    """A well-formed document missing the one field that matters.

    This is what a ledger written by an older conftest looks like, and reading
    it as zero would fail the build for the wrong reason.
    """
    target = tmp_path / GATE.REPORTS / "property-execution-root.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"tests": []}), encoding="utf-8")

    with pytest.raises(SystemExit) as raised:
        GATE.main(["--suite", "root", "--root", str(tmp_path)])
    assert raised.value.code == 2


def test_no_floor_is_zero() -> None:
    """A floor of zero is a gate that cannot fail.

    Somebody under pressure will reach for it, and it would pass every build
    forever while looking exactly like an enforced floor.
    """
    for suite, floor in GATE.SUITES.items():
        assert floor > 0, f"{suite} has a floor of {floor}"


def test_every_suite_says_what_its_ledger_counts() -> None:
    """A suite with no noun crashes the gate instead of failing it.

    `COUNTS` exists because the suites do not all count the same thing: two
    count Hypothesis properties and `human` counts pytest-bdd scenarios, and
    "executed only 3 property tests" would send a reader hunting for a `@given`
    nobody ever wrote.

    The failure without this test is worse than a wrong word. `main` reads
    `COUNTS[suite]` unguarded, so a fourth suite added to `SUITES` alone raises
    KeyError in CI -- and a gate that crashes reads as a broken gate rather than
    as the missing floor it actually is.
    """
    assert GATE.SUITES.keys() == GATE.COUNTS.keys(), (
        "every suite must say what its ledger counts: "
        f"{sorted(GATE.SUITES.keys() ^ GATE.COUNTS.keys())} appear in one and not the other"
    )


def test_only_the_controller_writes_a_ledger(tmp_path: Path) -> None:
    """The xdist double-count, pinned so it cannot come back.

    Under `pytest -n auto` the session-finish hook fires in every worker AND in
    the controller. Measured on a four-worker run: workers wrote 3 + 0 + 2 + 2
    and the controller wrote all 7. A gate that globbed and summed read 14 for a
    suite of 7 -- a floor met by double-counting, which would halve and fail the
    moment xdist was removed.

    The conftest now writes only from the controller. This asserts the gate
    reads exactly one file, so a future change reintroducing per-worker files
    fails here rather than inflating the number.
    """
    floor = GATE.SUITES["root"]
    _ledger(tmp_path, "root", floor)
    # A stray per-worker file, as an older conftest would have written.
    stray = tmp_path / GATE.REPORTS / "property-execution-root-gw0.json"
    stray.write_text(json.dumps({"executed": 999, "tests": []}), encoding="utf-8")

    assert GATE.main(["--suite", "root", "--root", str(tmp_path)]) == 0
    # And the stray did NOT contribute: dropping the real ledger below the floor
    # must fail even though the stray alone would clear it many times over.
    _ledger(tmp_path, "root", floor - 1)
    assert GATE.main(["--suite", "root", "--root", str(tmp_path)]) == 1
