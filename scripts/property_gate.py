#!/usr/bin/env python3
"""PROPERTY GATE — Hypothesis was EXECUTED, not merely installed.

WHAT THIS IS ACTUALLY ABOUT
---------------------------
Hypothesis has been a dependency of this repository for a long time and is used
in a handful of files. Nothing has ever checked that those property tests RAN.

The failure that makes this worth a gate is quiet and total: someone removes a
`@given` while refactoring, or a collection error takes out the one file holding
most of them, and the suite still reports a large green number. Generated
coverage stops existing and no signal changes. This repository has already
shipped that exact shape once, when a broken import made Playwright report
`Total: 0 tests in 0 files` for days.

COLLECTED IS NOT EXECUTED
-------------------------
The count comes from a per-suite ledger under `reports/`, which that suite's
`conftest.py` writes from the CALL phase of tests Hypothesis wrapped. A test that was collected
and then errored in setup never reached a single generated example, and counting
collection would call it a property test that ran.

WHY A FLOOR AND NOT AN EXACT NUMBER
-----------------------------------
An exact count has to be edited on every commit that adds a property, and a
number edited that often stops being read. A floor only moves when somebody
raises it deliberately, and it only fails when generated coverage went DOWN --
the one direction anybody needs telling about.

Raise `FLOOR` when properties are added. Never lower it to make a build pass:
that is the shape this file exists to refuse.

WHY THERE IS NO `property` MARKER TO COUNT INSTEAD
--------------------------------------------------
Because a marker is a deselection handle. `-m "not property"` would switch every
one of them off while the suite stayed green -- which is the failure this gate
exists to detect, made available as a command-line flag. Hypothesis tags the
functions it wraps with `is_hypothesis_test`, which is a structural fact rather
than a label anybody maintains, so a new property test is counted the moment it
is written.

WHY PER-SUITE FLOORS RATHER THAN ONE TOTAL
------------------------------------------
The root suite and the learning-os suite run in DIFFERENT CI JOBS, on different
filesystems. A gate summing both could only ever run somewhere that had both
ledgers, which is nowhere. So each job enforces its own floor, and a suite whose
properties vanish fails in the job that owns it -- which is also the job whose
red is easiest to act on.

USAGE
    python3 -m pytest tests -q
    python3 scripts/property_gate.py --suite root

    cd learning-os && python3 -m pytest tests -q --ignore=tests/db
    python3 scripts/property_gate.py --suite learning-os
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

#: Each suite's ledger, and the smallest number of property tests it may run.
#:
#: MEASURED, not estimated. root=7 is what the root suite executed before Phase
#: 9 touched anything; learning-os=6 is the review-scheduling properties this
#: phase adds.
#:
#: Separate files because two independent pytest roots writing one path would
#: each overwrite the other -- whichever ran last would decide the count, and
#: running one suite would report the other's properties as gone.
#:
#: Raise a floor when properties are added. Never lower one to make a build
#: pass: that is the shape this file exists to refuse.
SUITES: dict[str, int] = {
    "root": 7,
    "learning-os": 6,
}

#: A suite's ledger is `property-execution-<suite>.json`, written ONCE.
#:
#: Under `pytest -n auto` the session-finish hook fires in every xdist worker
#: AND in the controller. Measured on a four-worker run: the workers wrote
#: 3 + 0 + 2 + 2 and the controller wrote all 7, so summing every file read 14
#: for a suite containing 7 -- a floor met by double-counting, which would then
#: halve and fail the moment xdist was removed.
#:
#: The conftest writes only from the controller, which is the side that receives
#: every worker's forwarded reports. One writer, one file, one true count.
def _ledger_name(suite: str) -> str:
    return f"property-execution-{suite}.json"

#: Where they land.
REPORTS = Path("reports")


def read(root: Path, suite: str) -> int:
    """How many property tests that suite executed.

    THE LEDGER MUST EXIST. A missing one means the suite did not run, which is a
    different thing from running and finding nothing -- and treating it as zero
    would let "the job was skipped" look identical to "somebody deleted its
    property tests".

    Staleness cannot inflate the number in CI, because a runner starts from a
    clean checkout and `reports/` is gitignored. Locally a stale ledger from an
    earlier run can, which is stated here rather than defended against: the
    authority is the CI run, and this note is what stops a green local result
    being mistaken for one.
    """
    target = root / REPORTS / _ledger_name(suite)

    if not target.is_file():
        print(
            f"::error::{REPORTS / _ledger_name(suite)} does not exist.\n"
            "Each suite writes one at the end of a pytest session, so an absent "
            "file means the suite did not run -- not that it ran and found "
            "nothing.\n"
            f"Run the {suite} suite first, then this gate.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    try:
        return int(json.loads(target.read_text(encoding="utf-8"))["executed"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        # Reported rather than swallowed. A truncated ledger and an empty suite
        # need opposite fixes, and treating a parse failure as "0 executed"
        # would send the reader after the wrong one.
        print(
            f"::error::{target} is not a readable ledger: {error}",
            file=sys.stderr,
        )
        raise SystemExit(2) from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--suite",
        choices=sorted(SUITES),
        required=True,
        help="which suite's ledger to enforce",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="repository root (defaults to the working directory)",
    )
    args = parser.parse_args(argv)

    floor = SUITES[args.suite]
    executed = read(args.root, args.suite)

    if executed < floor:
        print(
            f"::error::the {args.suite} suite executed only {executed} property "
            f"tests; its floor is {floor}.\n"
            "Generated coverage has gone down. Either a `@given` was removed, a "
            "collection error took a file out of the run, or tests were "
            "deselected.\n"
            "If the removal was deliberate, lower the floor in the same commit "
            "and say why -- do not lower it to make an unrelated build pass.",
            file=sys.stderr,
        )
        return 1

    print(f"{args.suite}: {executed} property tests executed (floor {floor})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
