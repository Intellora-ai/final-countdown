#!/usr/bin/env python3
"""COVERAGE SCOPE GATE --- production code may not sit outside every scope.

WHY THIS EXISTS.

The `coverage` gate is required, blocks every merge, and reports 95%. Measured
on 2026-08-25 it measures 38 lines: `pyproject.toml:19` sets
`source = ["src"]`, and `src/` is five files. Meanwhile `scripts/` holds 19,499
lines and `learning-os/src/` holds 7,992, measured by nothing.

THE ROOT CAUSE IS NOT "SOMEBODY SET IT TOO NARROW".

`ci/gates.toml` declares the coverage gate with
`must_contain = ["--cov-fail-under=95"]`. That pins the THRESHOLD and says
nothing about the SCOPE, so `gate_integrity.py` has been checking that the
number 95 appears in the command and never asking "95% of what?". The
repository grew from 38 lines of production code to roughly 70,400 and every
required check stayed green throughout.

That is SCOPE DRIFT. This repository already knows the shape: it is what
`check_ruleset.py` catches between `ci/gates.toml` and the live GitHub ruleset.
Widening the scope once fixes today; it does nothing about the package somebody
adds next year.

WHAT IT CHECKS

Every directory holding production Python appears in exactly one list under
`[coverage]` in `ci/gates.toml`:

    measured    a coverage scope measures it
    unmeasured  production code with no coverage gate --- `why` REQUIRED
    excluded    not production code --- `why` REQUIRED

Six findings, each one blocking:

    1. a directory holding .py files that is in no list
    2. an `unmeasured` or `excluded` row with no `why`
    3. one path claimed by two lists
    4. a declared path that does not exist on disk
    5. a `measured` row with no `scope` or no integer `floor`
    6. a `measured` row whose floor NO gate enforces

FINDING 6 IS THE SAME DEFECT ONE LEVEL UP.

The original bug was a threshold pinned with nothing pinning its scope. A
`measured` row is the mirror image: a scope and a floor declared with nothing
running them. `{ path = "scripts", scope = "scripts", floor = 57 }` satisfied
every check above while no job anywhere passed `--cov=scripts`, so the manifest
would have read as "scripts is measured" and the number would have been a
sentence in a TOML file.

So a `measured` row is only accepted when ONE gate in `[gates.*]` pins BOTH
`--cov=<scope>` and `--cov-fail-under=<floor>`. One gate, because a job
measuring with no threshold never fails and a threshold over another scope
measures other code; added together they look like enforcement and enforce
nothing.

WHY `unmeasured` EXISTS, AND WHY IT IS NOT A LOOPHOLE

`scripts/` has no coverage floor today. Calling it `excluded` would be false,
and leaving it out is the drift being fixed. An unmeasured area with a written
reason is an honest gap that a reader can act on. An undeclared one is an
invisible gap that reads as complete. The `why` is what separates them, which
is why a row without one is refused.

DECLARED, NEVER INFERRED

The gate does not guess which directories hold production code.
`frontend/scripts/reachability-gate.mjs:36-42` records why: a gate that infers
its own scope can be satisfied by exactly the input it exists to catch. Here
the same trap would be "a directory nobody declared must not be important".
Adding a row is a diff somebody writes and somebody reviews.
"""

from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

#: Printed on every verdict. Tests assert on it so that a crash, a missing
#: file or a mistyped path can never be mistaken for a refusal --- the trap
#: CLAUDE.md records from eleven tests that passed against a hook which was
#: not installed.
BANNER = "coverage-scope:"

#: Never scanned. Tooling caches, dependency trees and build output are not
#: this repository's production code, and listing every one of them in the
#: manifest would bury the rows that matter.
SKIP = frozenset({
    ".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache",
    ".ruff_cache", ".hypothesis", ".mypy_cache", "dist", "build", ".claude",
    ".evidence", "site-packages", ".tox", "htmlcov", ".idea", ".vscode",
})

LISTS = ("measured", "unmeasured", "excluded")


def _rows(section: dict[str, Any], name: str) -> list[dict[str, Any]]:
    """The rows of one list, or an empty list when it is absent."""
    raw: object = section.get(name, [])
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:  # pyright: ignore[reportUnknownVariableType]
        if isinstance(item, dict):
            out.append(item)  # pyright: ignore[reportUnknownArgumentType]
    return out


def python_dirs(root: Path) -> set[str]:
    """Every directory that directly contains a `.py` file, relative to root.

    Directories rather than files, because the manifest declares areas. A row
    per file would be unmaintainable and would turn the gate into noise.
    """
    found: set[str] = set()
    for path in root.rglob("*.py"):
        rel = path.relative_to(root)
        if any(part in SKIP for part in rel.parts):
            continue
        parent = rel.parent
        found.add("." if parent == Path(".") else parent.as_posix())
    return found


def _owner(directory: str, declared: set[str]) -> str | None:
    """The declared path that owns this directory, if any.

    Longest match wins, so `learning-os/src` owns `learning-os/src/llm` while a
    sibling `learning-os/tests` keeps its own row. Without longest-match a
    shallow declaration would silently swallow a deep one.
    """
    best: str | None = None
    for entry in declared:
        if directory == entry or directory.startswith(entry + "/"):
            if best is None or len(entry) > len(best):
                best = entry
    return best


def _gate_pins(parsed: dict[str, Any]) -> dict[str, list[str]]:
    """Every `[gates.*]` name mapped to the tokens its command is pinned to.

    `must_contain` entries are pinned fragments of the command a gate runs, so
    a fragment may be one flag (`--cov=src`) or a whole invocation. Splitting
    on whitespace makes both read the same way, and makes the match exact:
    without it, `--cov=src` would also be satisfied by `--cov=srcfoo`.
    """
    raw: object = parsed.get("gates")
    if not isinstance(raw, dict):
        return {}
    gates: dict[str, Any] = raw  # pyright: ignore[reportUnknownVariableType]

    out: dict[str, list[str]] = {}
    for name, body in gates.items():
        if not isinstance(body, dict):
            continue
        section: dict[str, Any] = body  # pyright: ignore[reportUnknownVariableType]
        pinned: object = section.get("must_contain", [])
        tokens: list[str] = []
        if isinstance(pinned, list):
            entries: list[Any] = pinned  # pyright: ignore[reportUnknownVariableType]
            for entry in entries:
                if isinstance(entry, str):
                    tokens.extend(entry.split())
        out[name] = tokens
    return out


def _enforcement(
    path: str, scope: str, row: dict[str, Any], gate_pins: dict[str, list[str]]
) -> list[str]:
    """Problems with a `measured` row whose floor nothing actually enforces.

    A floor is a claim. `must_contain` on some gate is the evidence that a job
    runs the measurement and fails below it. Without this the remaining work on
    the coverage gate --- moving rows from `unmeasured` to `measured` --- could
    be done by editing one line of TOML while nothing new ever ran.

    BOTH pins must live in ONE gate. `--cov=<scope>` with no threshold never
    fails, and `--cov-fail-under=<floor>` on another scope measures other code;
    counting them together would accept exactly the split that enforces
    nothing.
    """
    floor: object = row.get("floor")
    if not isinstance(floor, int) or isinstance(floor, bool):
        return [
            f"{path}: listed as `measured` with no integer `floor`. A scope "
            "with no floor declares a measurement and no standard, so there "
            "is nothing for a gate to enforce."
        ]

    want_scope = f"--cov={scope}"
    want_floor = f"--cov-fail-under={floor}"
    for tokens in gate_pins.values():
        if want_scope in tokens and want_floor in tokens:
            return []

    return [
        f"{path}: declared `measured` at floor {floor} over scope {scope!r}, "
        f"but no gate in `[gates.*]` pins both `{want_scope}` and "
        f"`{want_floor}`. A floor no job enforces is a number in a file. Pin "
        "them on the gate that runs it, or move the row back to `unmeasured` "
        "and say why."
    ]


def check(root: Path, manifest_path: Path) -> list[str]:
    """Every problem found, as printable lines. Empty means consistent."""
    problems: list[str] = []

    if not manifest_path.is_file():
        return [f"manifest not found: {manifest_path}"]

    parsed: dict[str, Any] = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
    raw_section: object = parsed.get("coverage")
    if not isinstance(raw_section, dict):
        return [
            f"{manifest_path} has no [coverage] section, so nothing declares "
            "which directories hold production code. Add one; see this file's "
            "docstring for the three lists."
        ]
    section: dict[str, Any] = raw_section  # pyright: ignore[reportUnknownVariableType]
    gate_pins = _gate_pins(parsed)

    # ---- read the declarations, and refuse the malformed ones --------------
    claimed: dict[str, str] = {}
    for list_name in LISTS:
        for row in _rows(section, list_name):
            raw_path: object = row.get("path")
            if not isinstance(raw_path, str) or not raw_path:
                problems.append(
                    f"a row in `{list_name}` has no `path`. Every row names one "
                    "directory."
                )
                continue
            path = raw_path.rstrip("/")

            if path in claimed:
                problems.append(
                    f"{path}: declared in both `{claimed[path]}` and "
                    f"`{list_name}`. One directory gets one answer, or whichever "
                    "list is read first silently wins."
                )
                continue
            claimed[path] = list_name

            if list_name in ("unmeasured", "excluded"):
                why: object = row.get("why")
                if not isinstance(why, str) or not why.strip():
                    problems.append(
                        f"{path}: listed as `{list_name}` with no `why`. A gap "
                        "may be declared; it may not be declared silently. "
                        "State the reason a reader would need."
                    )

            if list_name == "measured":
                scope: object = row.get("scope")
                if not isinstance(scope, str) or not scope.strip():
                    problems.append(
                        f"{path}: listed as `measured` with no `scope`. Name the "
                        "coverage scope that measures it, or move it to "
                        "`unmeasured` and say why."
                    )
                else:
                    problems.extend(_enforcement(path, scope.strip(), row, gate_pins))

            if not (root / path).is_dir():
                problems.append(
                    f"{path}: declared in `{list_name}` but no such directory "
                    "exists. A stale row makes the manifest read as more "
                    "complete than it is. Delete it, or fix the path."
                )

    # ---- the finding this gate exists for ---------------------------------
    undeclared = sorted(
        d for d in python_dirs(root) if _owner(d, set(claimed)) is None
    )
    for directory in undeclared:
        problems.append(
            f"{directory}: holds Python and is in no list. Add it to "
            "`measured` (with its scope), `unmeasured` (with why it has no "
            "floor yet), or `excluded` (with why it is not production code)."
        )

    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    parser.add_argument("--manifest", type=Path, default=None)
    args = parser.parse_args(argv)

    root: Path = args.root
    manifest: Path = args.manifest if args.manifest is not None else root / "ci" / "gates.toml"

    problems = check(root, manifest)
    if problems:
        print(f"{BANNER} FAIL --- {len(problems)} problem(s)")
        for line in problems:
            print(f"  {line}")
        print()
        print(
            "  Why this blocks: the `coverage` gate pins a threshold and "
            "nothing pins its scope, so production code can drift out of "
            "measurement while every check stays green."
        )
        return 1

    print(
        f"{BANNER} PASS --- every directory holding Python is declared, and "
        "every declaration names a directory that exists"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
