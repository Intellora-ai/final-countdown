#!/usr/bin/env python3
"""RUFF SCOPE GATE — refuse to lint under a rule set nobody wrote down.

WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT.

It does NOT run ruff. It asserts the two things that decide what running ruff
would MEAN, and then the workflow runs ruff itself in the next line of the same
`set -e` chain.

WHY THAT SPLIT.

The first version of this file shelled out to ruff. `scripts/security_gate.py`
refused it:

    UNRESOLVED  B404 scripts/ruff_gate.py:39   blacklist
    UNRESOLVED  B603 scripts/ruff_gate.py:105  subprocess_without_shell_equals_true

That gate derives an allowlist of provably-safe subprocess shapes from the AST
and will not accept a call it cannot prove, which is correct: a list built from
`*paths` is not a literal argv it can verify. The options were to widen the
security allowlist for a wrapper that adds no safety, or to stop wrapping. A
linter does not need a Python process in front of it, so the wrapper now checks
only what a shell command cannot check for itself.

WHAT IT CHECKS

  1. `[tool.ruff.lint] select` exists and is non-empty.

     Measured 2026-08-25, same ruff (0.16.3), same tree:

         no `select` in pyproject.toml     258 findings
         select = E4, E7, E9, F             12 findings

     Ruff's default set moves between releases. A gate whose scope is "whatever
     this version decided to check" reports something different after every
     upgrade, and the first time it reports MORE it fails a pull request that
     changed nothing --- which is how a check gets switched off rather than
     fixed.

  2. Every path it is handed exists.

     `ruff check srcc` matches no files and exits 0. Linting nothing is not a
     clean lint, and it is exactly the silent exemption ESLint's flat config
     produced four times in this repository's frontend.

Both are the same defect the coverage gate carried for its whole existence: a
threshold pinned, a scope not. Writing it twice in one repository would be
careless.
"""

from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

REPO_ROOT = Path(__file__).resolve().parents[1]

#: Printed on every verdict. Tests assert on it so a crash, a missing file or a
#: mistyped path can never be mistaken for a clean run --- the trap CLAUDE.md
#: records from eleven tests that passed against a hook nobody had installed.
BANNER = "ruff-gate:"


def _child(node: object, key: str) -> object:
    """One step down a TOML table, or None when the step is not there.

    Written as a helper taking `object` rather than a chain of `.get()` calls
    because pyright --strict cannot infer element types out of a `dict[str,
    Any]` walk, and the honest fix is a narrowing function rather than a
    `# pyright: ignore` on the line that lost the type.
    """
    if isinstance(node, dict):
        return cast("dict[str, Any]", node).get(key)
    return None


def pinned_rules(pyproject: Path) -> list[str]:
    """The `select` list, or an empty list when it is absent or malformed."""
    if not pyproject.is_file():
        return []
    node: object = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    for key in ("tool", "ruff", "lint", "select"):
        node = _child(node, key)
    if not isinstance(node, list):
        return []
    return [str(rule) for rule in cast("list[object]", node)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*")
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    args = parser.parse_args(argv)

    root: Path = args.root
    paths: list[str] = list(args.paths) or ["src", "scripts", "tests"]

    rules = pinned_rules(root / "pyproject.toml")
    if not rules:
        print(f"{BANNER} FAIL --- the rule set is not pinned")
        print(
            "  [tool.ruff.lint] in pyproject.toml declares no `select`, so ruff "
            "runs whatever its installed default happens to be. Measured on "
            "this tree that difference is 258 findings against 12."
        )
        print(
            "  Fix: add `select = [...]` naming the rule groups this gate "
            "enforces. Widen it deliberately; never leave it implicit."
        )
        return 1

    missing = [p for p in paths if not (root / p).exists()]
    if missing:
        print(f"{BANNER} FAIL --- {len(missing)} path(s) do not exist")
        for p in missing:
            print(f"  {p}: named on the command line but not present in {root}")
        print(
            "  `ruff check` over a path that matches no files exits 0. Linting "
            "nothing and linting cleanly are the same green tick from outside."
        )
        return 1

    print(
        f"{BANNER} PASS --- rule set pinned to {', '.join(rules)}; "
        f"scope {', '.join(paths)} present. ruff runs next in this chain."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
