#!/usr/bin/env python3
"""A ratchet on how much of this suite tests PROPERTIES rather than examples.

WHAT THIS IS FOR
================
Measured 2026-09-01, across the whole repository:

    Python   tests/ + learning-os/tests/     74 files,   2 using @given
    Frontend src/ + server/                 142 files,   2 property-shaped
                                            ---------   -------------------
                                            216 files,   4  (about 2%)

That 2% is the mechanical cause of the hardcoding this repository keeps
rediscovering in itself, and the reason is worth stating precisely, because the
intuitive explanation -- somebody was careless -- leads to useless fixes.

An example-based test names its input:

    answer('{"text": "why does recursion need a base case?"}') -> a lesson

The cheapest code that passes is `if q == "why does recursion...": return LESSON`.
A lookup table. The test cannot distinguish that from a real implementation,
because every input it will ever use is visible to whoever writes the code. The
hardcoded version is not a lapse; it is the correct answer to the question the
test asked.

A property test generates its inputs at run time. Nothing can have seen them, so
a lookup table cannot pass. Generality stops being a rule someone is asked to
follow and becomes the only thing that works.

WHY A RATCHET AND NOT A THRESHOLD
=================================
A fixed threshold is a number in a file, and a number in a file is a number
somebody lowers at 2am to get a release out. This repository already has the
scar: `run-real-tests.sh` carries a comment about a gate that could be switched
off by deleting the thing it guarded.

So this stores the best ratio ever ACHIEVED and refuses anything below it.
Raising the floor is automatic and needs no decision; lowering it requires
editing a committed file, which is visible in a diff and cannot happen by
accident.

WHAT THIS GATE IS NOT
=====================
It is NOT the backstop, and pretending otherwise would repeat the mistake this
repository is trying to leave behind: it counts test files that USE a property
library, and a file can import `hypothesis`, write `@given(st.just(1))` and
satisfy it while proving nothing.

The ungameable check is mutation testing -- break the code, confirm the tests go
red -- and `frontend/scripts/mutation-gate.mjs` already does it. A test that
cannot kill a mutant does not count there, however it is written. This gate
shapes the DEFAULT; the mutation gate is what actually holds the line. Both run
in `.github/workflows/real-life.yml`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
FLOOR_FILE = REPO / "ci" / "property-floor.json"

#: Where tests live, and what marks one as testing a property rather than an
#: example. Both libraries are named because the repository is two languages and
#: a gate that watched only one would let the other rot unobserved.
SUITES: dict[str, tuple[tuple[str, str], ...]] = {
    "python": (
        ("tests", "test_*.py"),
        ("learning-os/tests", "test_*.py"),
    ),
    "frontend": (
        ("frontend/src", "*.test.ts"),
        ("frontend/src", "*.test.tsx"),
        ("frontend/server", "*.test.ts"),
    ),
}

#: `@given` for hypothesis, `fc.assert`/`fc.property` for fast-check. Matched on
#: the CALL rather than the import: a file that imports a property library and
#: never uses it is an example-based file with an unused import.
PROPERTY_MARKERS = re.compile(r"@given\b|fc\.assert\b|fc\.property\b")


def _test_files(suite: str) -> list[Path]:
    found: list[Path] = []
    for directory, pattern in SUITES[suite]:
        root = REPO / directory
        if root.is_dir():
            found.extend(sorted(root.rglob(pattern)))
    return found


def measure() -> dict[str, dict[str, int | float]]:
    """The current ratio per suite, as data rather than as a verdict."""
    result: dict[str, dict[str, int | float]] = {}
    for suite in SUITES:
        files = _test_files(suite)
        using = [
            path
            for path in files
            if PROPERTY_MARKERS.search(path.read_text(encoding="utf-8", errors="replace"))
        ]
        total = len(files)
        result[suite] = {
            "test_files": total,
            "property_files": len(using),
            # A suite with no tests scores 0 rather than dividing by zero. It is
            # also not a passing state: an empty suite must never ratchet the
            # floor down to nothing.
            "ratio": round(len(using) / total, 4) if total else 0.0,
        }
    return result


def _load_floor() -> dict[str, float]:
    if not FLOOR_FILE.is_file():
        return {}
    stored = json.loads(FLOOR_FILE.read_text(encoding="utf-8"))
    return {suite: float(value) for suite, value in stored.get("floors", {}).items()}


def _save_floor(floors: dict[str, float], current: dict[str, dict[str, int | float]]) -> None:
    FLOOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    FLOOR_FILE.write_text(
        json.dumps(
            {
                "_what": (
                    "The highest proportion of property-based test files this "
                    "repository has ever reached, per suite. Raised automatically "
                    "by scripts/property_floor.py --update. Lowering a number here "
                    "is a deliberate, reviewable edit and never an accident."
                ),
                "_why": (
                    "An example-based test can be passed by a lookup table, because "
                    "its inputs are visible to whoever writes the code. A property "
                    "test generates inputs at run time and cannot be. See the module "
                    "docstring."
                ),
                "_not_the_backstop": (
                    "This counts files that USE a property library and can be gamed "
                    "with a trivial property. Mutation testing is what actually "
                    "proves a test can fail; both run in .github/workflows/real-life.yml."
                ),
                "floors": floors,
                "measured": current,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update",
        action="store_true",
        help="raise the stored floor to the current ratio where it has improved",
    )
    args = parser.parse_args(argv)

    current = measure()
    floors = _load_floor()

    print("property-based test coverage")
    print("-" * 60)
    failures: list[str] = []
    raised: list[str] = []

    for suite, numbers in sorted(current.items()):
        ratio = float(numbers["ratio"])
        floor = floors.get(suite, 0.0)
        mark = "ok" if ratio >= floor else "BELOW FLOOR"
        print(
            f"  {suite:9} {numbers['property_files']:>4}/{numbers['test_files']:<4} "
            f"files = {ratio:6.1%}   floor {floor:6.1%}   {mark}"
        )

        if ratio < floor:
            failures.append(
                f"{suite}: {ratio:.1%} of test files test properties, and this "
                f"repository has previously reached {floor:.1%}. A suite does not "
                f"get to become more example-based over time -- that is the drift "
                f"this gate exists to stop. Add a property test to the code you "
                f"changed, or lower the floor in {FLOOR_FILE.relative_to(REPO)} in "
                f"a commit that says why."
            )
        elif ratio > floor:
            raised.append(f"{suite}: {floor:.1%} -> {ratio:.1%}")
            floors[suite] = ratio

    if args.update:
        _save_floor(floors, current)
        if raised:
            print("\nfloor raised:")
            for line in raised:
                print(f"  {line}")
        else:
            print("\nfloor unchanged")
        return 0

    if failures:
        print()
        for line in failures:
            print(f"BLOCKED: {line}", file=sys.stderr)
        return 1

    if raised:
        print(
            "\nThe ratio has improved above the stored floor. Run with --update to "
            "lock the improvement in."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
