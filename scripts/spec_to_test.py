#!/usr/bin/env python3
"""
SPEC -> TEST: Auto-generate Hypothesis tests from Lean specs.

Example:
  Lean:   theorem add_spec (a b : Int) : add a b = add b a := by sorry
  Python: @given(...) def test_add_spec(a, b): assert add(a, b) == add(b, a)

The claim is translated, not pattern-matched against English words. A property
containing "comm" is not how you detect commutativity — `add a b = add b a`
contains no such substring, which is why matching on it produced
`assert add(a, b) is not None`: a test that passes for any implementation.
"""

import argparse
import os
import re
import sys
from typing import Any
from collections.abc import Sequence

# `[^:=]+` cannot work: it stops at the first `=`, and every equality spec has
# one. Capture up to the final `:=` instead.
THEOREM = re.compile(
    r'theorem\s+(\w+?)_spec\s*\((?P<binders>[^)]*)\)'
    r'(?:\s*\(\s*\w+\s*:\s*(?P<hyp>[^)]*)\))?'
    r'\s*:\s*(?P<claim>.+?):=\s*by',
    re.DOTALL,
)
DEF = re.compile(r'\bdef\s+(\w+)\s*\(([^)]*)\)')

LEAN_TO_PY = [("≤", "<="), ("≥", ">="), ("≠", "!="), ("∧", " and "), ("∨", " or ")]


def parse_lean_spec(spec_file: str) -> dict[str, Any] | None:
    with open(spec_file, "r", encoding="utf-8") as f:
        content = f.read()

    thm = THEOREM.search(content)
    if not thm:
        return None

    binders = thm.group("binders")
    names_part, _, type_part = binders.rpartition(":")
    arg_names = names_part.split() or binders.split()

    return {
        "function_name": thm.group(1),
        "args": arg_names,
        "arg_type": type_part.strip() or "Int",
        "hypothesis": (thm.group("hyp") or "").strip(),
        "property": thm.group("claim").strip(),
        "has_def": bool(DEF.search(content)),
    }


def lean_expr_to_python(expr: str, func: str, args: Sequence[str]) -> str:
    """`add a b = add b a`  ->  `add(a, b) == add(b, a)`"""
    out = expr
    # Function application: `func x y` -> `func(x, y)`. Longest arity first.
    for arity in range(len(args), 0, -1):
        # numeric literals are operands too: `add a 0` must not become `add(a) 0`
        operand = r'(?:\([^()]*\)|[A-Za-z_][A-Za-z0-9_]*|\d+)'
        pattern = rf'\b{re.escape(func)}\b((?:\s+{operand}){{{arity}}})'
        out = re.sub(
            pattern,
            lambda m: f"{func}({', '.join(m.group(1).split())})",
            out,
        )
    for lean, py in LEAN_TO_PY:
        out = out.replace(lean, py)
    # `=` to `==`, but never touch `<=`, `>=`, `!=`, `==`.
    out = re.sub(r'(?<![<>!=])=(?!=)', '==', out)
    return " ".join(out.split())


def generate_hypothesis_test(spec_info: dict[str, Any]) -> str:
    func = spec_info["function_name"]
    args = spec_info["args"]
    strategy = {"Nat": "st.integers(min_value=0)", "Bool": "st.booleans()"}.get(
        spec_info["arg_type"], "st.integers(min_value=-10**6, max_value=10**6)"
    )

    assertion = lean_expr_to_python(spec_info["property"], func, args)
    guard = ""
    if spec_info["hypothesis"]:
        cond = lean_expr_to_python(spec_info["hypothesis"], func, args)
        guard = f"    assume({cond})\n"

    # Parameters are annotated and `assume` is imported only when a
    # precondition exists: pyright strict rejects untyped params and unused
    # imports, and generated files are checked like any other source.
    imports = "assume, given" if guard else "given"
    params = ", ".join(f"{a}: int" for a in args)
    return f'''"""Auto-generated from specs/{func}_spec.lean by scripts/spec_to_test.py.

Do not edit: regenerate instead. The assertion mirrors the Lean claim exactly.
"""

from hypothesis import {imports}, strategies as st

from src.{func} import {func}


@given({', '.join(strategy for _ in args)})
def test_{func}_spec({params}) -> None:
{guard}    assert {assertion}
'''


def spec_to_test(spec_file: str, output_file: str | None = None) -> bool:
    spec_info = parse_lean_spec(spec_file)
    if not spec_info:
        print(f"❌ Failed to parse {spec_file}")
        return False
    if not spec_info["has_def"]:
        print(f"❌ {spec_file} has no `def` — the claim is not about your function")
        return False

    if output_file is None:
        os.makedirs("tests/generated", exist_ok=True)
        output_file = f"tests/generated/test_{spec_info['function_name']}_spec.py"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(generate_hypothesis_test(spec_info))

    print(f"✓ Generated {output_file}")
    return True


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("spec_file")
    p.add_argument("output_file", nargs="?")
    ns = p.parse_args()
    sys.exit(0 if spec_to_test(ns.spec_file, ns.output_file) else 1)
