#!/usr/bin/env python3
"""THE DATABASE SUITE IS NOT VACUOUS — a floor on how much it may shrink.

WHY pytest's OWN EXIT CODE IS NOT ENOUGH
----------------------------------------
pytest exits 5 when it collects nothing, so a suite that vanished entirely
already fails the job. That covers the catastrophic case and nothing else. A
suite that fell from twenty tests to one still exits 0, still prints a green
line, and still reports success -- while covering almost nothing.

This repository has already shipped that failure in a different shape: eleven
tests asserted `exit == 2` and passed against a hook that did not exist, because
a missing file also exits 2. The lesson recorded then was to assert on the
evidence rather than the symptom. A count IS the evidence here.

WHY A FLOOR AND NOT AN EXACT NUMBER
-----------------------------------
An exact count has to be edited every time a test is added, and a number edited
on every commit stops being read. A floor only moves when somebody deliberately
raises it, and it only fails when coverage went DOWN -- which is the only
direction anyone needs to be told about.

Raise `FLOOR` when the suite grows. Never lower it to make a build pass: that is
the shape this file exists to refuse.

USAGE
    python3 scripts/db_suite_floor.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

#: The smallest number of database tests that may exist.
#:
#: Set from the measured count at the time Phase 5 landed, minus nothing. If
#: this file and the suite disagree, one of them changed and the diff says
#: which.
FLOOR = 8

#: Where the database suite lives, relative to the repository root.
SUITE = Path("learning-os") / "tests" / "db"


def collected(root: Path) -> int:
    """How many tests pytest can actually collect from the database suite.

    `--collect-only` rather than a real run, because this gate answers "does the
    coverage still exist", not "does it pass". Those are different questions and
    the run answers the second one already.
    """
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell, no user input
        [
            sys.executable,
            "-m",
            "pytest",
            str(SUITE),
            "--collect-only",
            "-q",
            "--no-header",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )

    # Exit 5 is "collected nothing". Reported here rather than left to the
    # generic parse failure below, because "the suite is empty" and "this gate
    # could not read pytest's output" are different problems with different
    # fixes, and collapsing them sends the reader down the wrong path.
    if result.returncode == 5:
        print(
            f"::error::{SUITE} collected NO tests at all.\n"
            "The database suite has vanished. Every invariant it enforced is "
            "now unenforced, and the job that runs it would still be green.",
            file=sys.stderr,
        )
        return 0

    count = _parse(result.stdout)
    if count is not None:
        return count

    print(
        "::error::could not read a collected count from pytest.\n"
        f"exit={result.returncode}\n--- stdout ---\n{result.stdout}\n"
        f"--- stderr ---\n{result.stderr}",
        file=sys.stderr,
    )
    raise SystemExit(2)


#: `path/to/test_file.py: 8` -- pytest 9's `-q --collect-only` format, one line
#: per file and no summary line at all.
_PER_FILE = re.compile(r"^\S+\.py: (\d+)$")

#: `8 tests collected` / `collected 8 items` -- the older summary forms. Kept
#: because this gate is not the place to discover that a pytest upgrade changed
#: an output format: it would report "could not read a count", which reads as a
#: broken gate rather than as a version difference.
_SUMMARY = re.compile(r"^(?:collected (\d+) items?|(\d+) tests? collected)")


def _parse(stdout: str) -> int | None:
    """The collected count, from whichever format this pytest produced.

    Returns `None` when no format matched, so the caller can print the raw
    output and fail loudly. Returning 0 here would be indistinguishable from an
    empty suite, and those need opposite fixes.
    """
    per_file = [
        int(match.group(1))
        for line in stdout.splitlines()
        if (match := _PER_FILE.match(line.strip()))
    ]
    if per_file:
        return sum(per_file)

    for line in stdout.splitlines():
        match = _SUMMARY.match(line.strip())
        if match:
            return int(match.group(1) or match.group(2))

    return None


def main(argv: list[str] | None = None) -> int:
    root = Path(argv[0]) if argv else Path.cwd()
    count = collected(root)

    if count < FLOOR:
        print(
            f"::error::the database suite has shrunk: {count} tests collected, "
            f"floor is {FLOOR}.\n"
            "Tests were removed or stopped being collected. If the removal was "
            "deliberate, lower FLOOR in the same commit and say why in the "
            "message -- do not lower it to make an unrelated build pass.",
            file=sys.stderr,
        )
        return 1

    print(f"database suite: {count} tests collected, floor {FLOOR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
