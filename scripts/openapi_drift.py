#!/usr/bin/env python3
"""OPENAPI DRIFT GATE — the committed schema must be what the code produces.

WHY A COMMITTED FILE AT ALL
---------------------------
The document could be generated on demand, and then nothing would ever drift --
because nothing could ever disagree. That is the failure mode, not the fix. A
generated-on-demand schema agrees with the code by construction, so it can never
tell a reviewer that this pull request changed the API. The committed file is
the thing a human reads in a diff.

Same reasoning as `frontend/src/canvas/spec/__fixtures__/engine-lesson.json`,
which `learning_os.api.cli --check` guards for exactly the same reason: a
fixture regenerated in CI detects nothing.

WHAT DRIFT ACTUALLY COSTS
-------------------------
Phase 7 generates its Schemathesis suite from this document and Phase 8 checks
Pact contracts against it. A stale document means both suites test an API that
no longer exists, and both go green while doing it. That is worse than no suite:
a red suite stops a merge, a vacuous green one waves it through.

WHY THIS LIVES IN scripts/ BUT RUNS IN THE learning-os JOB
-----------------------------------------------------------
Importing the app needs fastapi, which is in `learning-os/requirements-learning-os.lock`
and deliberately not in the root lock. So the file sits with the other gates and
is invoked by `.github/workflows/learning-os.yml`, which is the only job with the
dependency installed. Running it from a root job would fail on import and read as
a broken gate rather than a missing one.

USAGE
    python3 scripts/openapi_drift.py            # check; non-zero on drift
    python3 scripts/openapi_drift.py --write    # regenerate the committed file
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

#: The committed document, relative to the repository root.
SCHEMA = Path("learning-os/openapi.json")


def render(document: dict[str, Any]) -> str:
    """The exact bytes the committed file must hold.

    `sort_keys` because FastAPI builds the document from dictionaries whose
    insertion order is an implementation detail; without it, an unrelated
    refactor that moved a route reorders the JSON and reports drift that is not
    drift. A gate that cries wolf gets switched off.

    A trailing newline because every other text file here has one, and its
    absence is a one-character diff the first person to open the file in an
    editor will silently "fix".
    """
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def generated() -> str:
    """What the code says the API is, right now."""
    # Imported inside the function so `--help` works, and so an import failure
    # names this gate rather than surfacing as a bare traceback at module load.
    from learning_os.http.app import build_app

    return render(build_app().openapi())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="regenerate the committed schema instead of checking it",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="repository root (defaults to the working directory)",
    )
    args = parser.parse_args(argv)

    target: Path = args.root / SCHEMA
    current = generated()

    if args.write:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(current, encoding="utf-8")
        print(f"wrote {SCHEMA}")
        return 0

    if not target.exists():
        print(
            f"::error::{SCHEMA} is missing. The API has no committed schema, so "
            "every generated contract test would be checking nothing.\n"
            "Create it with: python3 scripts/openapi_drift.py --write",
            file=sys.stderr,
        )
        return 1

    committed = target.read_text(encoding="utf-8")
    if committed != current:
        print(
            f"::error::{SCHEMA} does not match the code.\n"
            "The routes changed and the committed schema did not, so Schemathesis "
            "and Pact would both be generated from an API that no longer exists.\n"
            f"Regenerate with: python3 scripts/openapi_drift.py --write\n"
            f"{_first_difference(committed, current)}",
            file=sys.stderr,
        )
        return 1

    print(f"{SCHEMA} matches the code")
    return 0


def _first_difference(committed: str, current: str) -> str:
    """Name the first line that differs.

    A gate that says only "these differ" on a two-thousand-line JSON document
    sends the reader to a diff tool. Naming the line is the difference between a
    gate that is read and a gate that is regenerated blindly.
    """
    left = committed.splitlines()
    right = current.splitlines()
    for number, (a, b) in enumerate(zip(left, right, strict=False), start=1):
        if a != b:
            return f"first difference at line {number}:\n  committed: {a}\n  code:      {b}"
    if len(left) != len(right):
        return f"line count differs: committed {len(left)}, code {len(right)}"
    return ""


if __name__ == "__main__":
    raise SystemExit(main())
