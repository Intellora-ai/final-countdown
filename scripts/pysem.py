#!/usr/bin/env python3
"""PYTHON → FORMAL SEMANTICS. The supported subset, and nothing else.

THE PROBLEM THIS EXISTS TO SOLVE.

    src/add.py           def add(a, b): return a + b
    specs/add_spec.lean  def add (a b : Int) : Int := a + b

Two artifacts a person wrote separately. Lean proves a theorem about the
second one. Change the first to `a - b` and every proof stays green, because
nothing in the system ever related them. The theorem was true and it was about
a different program.

WHY NOT TRANSLATE PYTHON INTO A LEAN FUNCTION.
A translator that emits `def add (a b : Int) : Int := a + b` has to be trusted
to preserve meaning, and its correctness is not something Lean can check: Lean
sees only the output, never the input. The trusted base becomes the whole
translator, and it grows with every construct.

WHAT THIS DOES INSTEAD.
The syntax tree is emitted as DATA, and the meaning of that data is given by an
interpreter written once, in Lean, checked by the kernel:

    PyFunc          an inductive value — the actual parsed AST, as a term
    evalFunc        the semantics — one function, ~40 lines, never generated

Then the theorem is not about a translated function. It is about
`evalFunc add_ast`, which is the meaning of the emitted tree. Nothing has to
be trusted to preserve semantics across the boundary, because nothing crosses
the boundary except data.

This shrinks the trusted base to three things, all stated in TRUST.md:
CPython's `ast` module, this file's faithfulness in serialising that AST, and
the claim that Lean's `evalFunc` agrees with CPython on the supported subset.
The third is attacked directly: this emits ground-truth obligations from the
REAL function's observed output, which the Lean kernel must discharge by `rfl`.

UNSUPPORTED PYTHON FAILS CLOSED. Every construct outside the subset raises
Unsupported. There is no approximation, no dropping, no "close enough" — an
unsupported program produces no correspondence and therefore no claim.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


class Unsupported(Exception):
    """This program is outside the formally supported subset.

    Raised, never swallowed. A program that cannot be given semantics must not
    acquire a formal claim by default.
    """


# Python binary operators with a defined meaning in the Lean semantics.
BINOPS: dict[type[ast.operator], str] = {
    ast.Add: "add", ast.Sub: "sub", ast.Mult: "mul",
}
# Comparisons. Python's `<` yields a bool; the semantics maps that to 1/0 and
# treats non-zero as true, which is Python's own truthiness for ints.
CMPOPS: dict[type[ast.cmpop], str] = {
    ast.Lt: "lt", ast.LtE: "le", ast.Gt: "gt", ast.GtE: "ge",
    ast.Eq: "eq", ast.NotEq: "ne",
}
BUILTINS = {"max": "pmax", "min": "pmin"}


GroundTruth = list[tuple[list[int], "int | None"]]


def _no_observations() -> GroundTruth:
    """Typed factory: `default_factory=list` infers list[Unknown]."""
    return []


@dataclass
class Emitted:
    """Everything needed to state a theorem about this exact source file."""
    name: str
    source_path: str
    source_sha256: str
    params: list[str]
    lean_ast: str
    guards: int
    ground_truth: GroundTruth = field(default_factory=_no_observations)


# --------------------------------------------------------------------------
# Expressions
# --------------------------------------------------------------------------
def expr(node: ast.expr, params: set[str]) -> str:
    """One Python expression as a Lean `PyExpr` term. Total or raises."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, int):
            raise Unsupported(f"only int literals are supported, got "
                              f"{type(node.value).__name__}")
        return f"(.lit ({node.value}))"

    if isinstance(node, ast.Name):
        if node.id not in params:
            # A free name could be a global, a builtin, or a closure cell. None
            # of those have semantics here, so none of them may enter a proof.
            raise Unsupported(f"name {node.id!r} is not a parameter; globals, "
                              "closures and builtins are outside the subset")
        return f'(.var "{node.id}")'

    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        # -x is sugar for 0 - x, which the semantics already defines.
        return f'(.sub (.lit (0)) {expr(node.operand, params)})'

    if isinstance(node, ast.BinOp):
        op = BINOPS.get(type(node.op))
        if op is None:
            # Division especially: Python's // floors toward -infinity and / is
            # float. Neither is modelled, so neither is admitted.
            raise Unsupported(f"operator {type(node.op).__name__} has no "
                              "defined semantics in this subset")
        return f"(.{op} {expr(node.left, params)} {expr(node.right, params)})"

    if isinstance(node, ast.Compare):
        if len(node.ops) != 1 or len(node.comparators) != 1:
            raise Unsupported("chained comparison (a < b < c) is not modelled")
        op = CMPOPS.get(type(node.ops[0]))
        if op is None:
            raise Unsupported(f"comparison {type(node.ops[0]).__name__} is "
                              "outside the subset")
        return (f"(.{op} {expr(node.left, params)} "
                f"{expr(node.comparators[0], params)})")

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in BUILTINS:
            raise Unsupported("only the builtins max/min are callable here")
        if node.keywords or len(node.args) != 2:
            raise Unsupported(f"{node.func.id} is modelled only with exactly "
                              "two positional arguments")
        return (f"(.{BUILTINS[node.func.id]} {expr(node.args[0], params)} "
                f"{expr(node.args[1], params)})")

    raise Unsupported(f"expression {type(node).__name__} is outside the "
                      "formally supported subset")


# --------------------------------------------------------------------------
# Function bodies
#
# The subset is deliberately the smallest shape that covers this repository:
#
#     def f(p1, .., pn):
#         [docstring]
#         if <cond>: raise ...      # zero or more guards, each a bare raise
#         if <cond>: return <expr>  #   or an early return
#         return <expr>             # exactly one final return
#
# No loops, no assignment, no nesting, no else. Those are not "hard"; they are
# simply not defined, and anything undefined must not acquire a proof.
# --------------------------------------------------------------------------
def guard(stmt: ast.stmt, params: set[str]) -> str:
    if not isinstance(stmt, ast.If):
        raise Unsupported(f"statement {type(stmt).__name__} is outside the "
                          "subset; only `if` guards and a final `return`")
    if stmt.orelse:
        raise Unsupported("`else` is not modelled; use a following guard")
    if len(stmt.body) != 1:
        raise Unsupported("a guard body must be exactly one statement")
    cond = expr(stmt.test, params)
    inner = stmt.body[0]
    if isinstance(inner, ast.Raise):
        # A raise makes the function partial: the semantics is `none` there.
        return f"({cond}, none)"
    if isinstance(inner, ast.Return) and inner.value is not None:
        return f"({cond}, some {expr(inner.value, params)})"
    raise Unsupported("a guard body must be `raise ...` or `return <expr>`")


def emit(path: Path, func_name: str) -> Emitted:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))

    funcs = [n for n in tree.body
             if isinstance(n, ast.FunctionDef) and n.name == func_name]
    if len(funcs) != 1:
        raise Unsupported(f"expected exactly one `def {func_name}` at module "
                          f"level, found {len(funcs)}")
    fn = funcs[0]

    if fn.decorator_list:
        raise Unsupported("decorators change what the function means")
    a = fn.args
    if a.vararg or a.kwarg or a.posonlyargs or a.kwonlyargs or a.defaults:
        raise Unsupported("only plain positional parameters are modelled")
    params = [p.arg for p in a.args]
    if len(set(params)) != len(params):
        raise Unsupported("duplicate parameter names")
    pset = set(params)

    body = list(fn.body)
    if body and isinstance(body[0], ast.Expr) and \
            isinstance(body[0].value, ast.Constant) and \
            isinstance(body[0].value.value, str):
        body = body[1:]                      # docstring: no runtime meaning
    if not body:
        raise Unsupported("function body is empty after the docstring")

    final = body[-1]
    if not isinstance(final, ast.Return) or final.value is None:
        raise Unsupported("the last statement must be `return <expr>`; a "
                          "function that can fall off the end returns None, "
                          "which is not an Int")
    guards = [guard(s, pset) for s in body[:-1]]
    ret = expr(final.value, pset)

    lean = ("{ params := [" + ", ".join(f'"{p}"' for p in params) + "]\n"
            "  , guards := [" + ", ".join(guards) + "]\n"
            "  , ret := " + ret + " }")

    return Emitted(name=func_name, source_path=str(path),
                   source_sha256=hashlib.sha256(source.encode()).hexdigest(),
                   params=params, lean_ast=lean, guards=len(guards))


# --------------------------------------------------------------------------
# Ground truth — the machine-checked link to CPython's ACTUAL behaviour
#
# Emitting the AST proves nothing about what Lean's `evalFunc` does with it.
# A wrong interpreter would still prove commutativity of something. So the
# REAL function is executed here, and its observed outputs become obligations
# the Lean kernel has to discharge by `rfl`. If `evalFunc` disagrees with
# CPython at any sampled point, the proof does not typecheck.
#
# This is a finite sample, so it is refutation, not equivalence. Stated as such
# in TRUST.md rather than dressed up.
# --------------------------------------------------------------------------
SAMPLES = [-7, -3, -1, 0, 1, 2, 3, 5, 8, 17]


def observe(path: Path, func_name: str, params: list[str]
            ) -> list[tuple[list[int], int | None]]:
    """Run the real function. `None` records that it raised."""
    spec = importlib.util.spec_from_file_location(f"_pysem_{func_name}", path)
    if spec is None or spec.loader is None:
        raise Unsupported(f"cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fn = getattr(module, func_name)

    points: list[list[int]] = []
    n = len(params)
    for i, v in enumerate(SAMPLES):
        # A diagonal plus rotations: cheap, and it separates argument
        # positions, which a symmetric grid would not.
        points.append([SAMPLES[(i + k * 3) % len(SAMPLES)] for k in range(n)])
        points.append([v] * n)
    out: list[tuple[list[int], int | None]] = []
    for args in points:
        try:
            result = fn(*args)
        except Exception:                    # noqa: BLE001 - any raise is `none`
            out.append((args, None))
            continue
        if not isinstance(result, int) or isinstance(result, bool):
            raise Unsupported(f"{func_name}{tuple(args)} returned "
                              f"{type(result).__name__}, not int")
        out.append((args, result))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source")
    ap.add_argument("--function", required=True)
    ap.add_argument("--json", action="store_true")
    ns = ap.parse_args()

    path = Path(ns.source)
    try:
        e = emit(path, ns.function)
        e.ground_truth = observe(path, ns.function, e.params)
    except Unsupported as exc:
        print(f"UNSUPPORTED_CONSTRUCT: {path}: {exc}", file=sys.stderr)
        return 2

    if ns.json:
        payload: dict[str, Any] = {
            "name": e.name, "source_path": e.source_path,
            "source_sha256": e.source_sha256, "params": e.params,
            "guards": e.guards, "lean_ast": e.lean_ast,
            "ground_truth": [{"args": a, "result": r} for a, r in e.ground_truth],
        }
        print(json.dumps(payload, indent=2))
    else:
        print(e.lean_ast)
    return 0


if __name__ == "__main__":
    sys.exit(main())
