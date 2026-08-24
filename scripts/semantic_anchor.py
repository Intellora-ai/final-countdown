#!/usr/bin/env python3
"""LAYER 1 — SEMANTIC ANCHOR.

A property is only meaningful relative to something authoritative about intent.
Without an anchor, "the spec is true" is a statement about the code as written,
not about what the code was supposed to do — so a bug faithfully described by a
true property still passes.

Anchors, in descending authority:
  reference  an independent implementation to differential-test against
  tests      hand-written examples asserting intended behaviour
  contract   docstring clauses and type hints (weakest: prose, not executable)
"""

import ast
import re
import sys
from pathlib import Path
from typing import Any


def _docstring_contract(doc: str | None) -> list[dict[str, str]]:
    """Clauses under a 'Contract' heading, or any 'name: claim' bullet lines."""
    if not doc:
        return []
    clauses: list[dict[str, str]] = []
    for raw in doc.splitlines():
        line = raw.strip().lstrip("-*").strip()
        m = re.match(r"^([a-z][a-z_ ]{2,30}):\s+(.+)$", line)
        if m and not line.lower().startswith(("args", "returns", "raises", "example")):
            clauses.append({"name": m.group(1).strip(), "claim": m.group(2).strip()})
    return clauses


def anchor_for(source_file: str) -> dict[str, Any] | None:
    src = Path(source_file).read_text(encoding="utf-8")
    tree = ast.parse(src)
    fn = next((n for n in tree.body if isinstance(n, ast.FunctionDef)), None)
    if fn is None:
        return None

    hints: dict[str, str | None] = {}
    for arg in fn.args.args:
        hints[arg.arg] = ast.unparse(arg.annotation) if arg.annotation else None
    returns = ast.unparse(fn.returns) if fn.returns else None

    name = fn.name
    tests: list[str] = []
    for candidate in (Path("tests") / f"test_{name}.py",):
        if candidate.is_file():
            ttree = ast.parse(candidate.read_text(encoding="utf-8"))
            for node in ast.walk(ttree):
                if isinstance(node, ast.Assert):
                    tests.append(ast.unparse(node.test))

    reference = Path("reference") / f"{name}.py"

    return {
        "function": name,
        "contract": _docstring_contract(ast.get_docstring(fn)),
        "type_hints": {"args": hints, "returns": returns},
        "tests": tests,
        "reference": str(reference) if reference.is_file() else None,
    }


def strength(anchor: dict[str, Any] | None) -> str:
    if anchor is None:
        return "ABSENT"
    if anchor["reference"]:
        return "STRONG (reference implementation)"
    if anchor["tests"]:
        return f"MODERATE ({len(anchor['tests'])} authoritative assertions)"
    if anchor["contract"]:
        return f"WEAK ({len(anchor['contract'])} docstring clauses, prose only)"
    return "ABSENT"


if __name__ == "__main__":
    for path in sys.argv[1:]:
        a = anchor_for(path)
        print(f"── {path}")
        if a is None:
            print("   ABSENT: no function found")
            continue
        print(f"   function : {a['function']}")
        print(f"   anchor   : {strength(a)}")
        for c in a["contract"]:
            print(f"   contract : {c['name']}: {c['claim']}")
        print(
            f"   hints    : {a['type_hints']['args']} -> {a['type_hints']['returns']}"
        )
        print(f"   tests    : {len(a['tests'])} assertions")
        print(f"   reference: {a['reference'] or 'none'}")
