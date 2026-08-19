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

ONE TREE, TWO RENDERERS.
CPython's `ast` is lowered exactly once into the `Node` type below. Two
renderers walk that same structure:

    render_ast      the Lean `PyExpr` VALUE — `(.add (.var "a") (.var "b"))`,
                    which is what `evalFunc` consumes.
    render_value    the Lean EXPRESSION the tree denotes — `(a + b)`.

The second one is NOT trusted, and does not have to be. `denotation()`
assembles it into the right-hand side of

    theorem add_ast_denotes (a b : Int) :
        evalFunc add_ast [a, b] = some (a + b)

which the Lean kernel proves or rejects over ALL integers. A renderer that
disagreed with `eval` at any input would stop typechecking there. That is what
makes it safe to read the closed form as "what this Python means" — the
alternative, sampling the function at a handful of points, leaves every other
input unclaimed.

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
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TypeAlias


class Unsupported(Exception):
    """This program is outside the formally supported subset.

    Raised, never swallowed. A program that cannot be given semantics must not
    acquire a formal claim by default.
    """


# --------------------------------------------------------------------------
# The parsed expression, lowered exactly once.
#
# Everything downstream — the Lean AST data, the closed-form denotation, the
# guard conditions the proof tactic splits on — is a walk over THIS. Two
# representations of the same program that are built by two separate passes
# over CPython's `ast` are two representations that drift.
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class Lit:
    """An integer literal. Python ints are unbounded, so this is a Lean `Int`."""

    value: int


@dataclass(frozen=True)
class Var:
    """A parameter reference. Nothing else in scope has semantics here."""

    name: str


@dataclass(frozen=True)
class Op:
    """A binary node. `op` is the Lean `PyExpr` constructor name, verbatim."""

    op: str
    left: Node
    right: Node


Node: TypeAlias = "Lit | Var | Op"


@dataclass(frozen=True)
class Guard:
    """One `if` at the top of a body.

    `action is None` is `raise`: the function is undefined there, which is
    `none` in the semantics, not an error value.
    """

    cond: Node
    action: Node | None


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

# Lean surface syntax per `PyExpr` constructor. A node can stand in two
# positions and they are not the same rendering:
#
#   VALUE      it denotes an `Int`             `(a + b)`
#   CONDITION  its truthiness denotes a `Prop`  `a > b`
#
# `eval` sends `.gt a b` to `some (if a > b then 1 else 0)` and `runGuards`
# tests `≠ 0`, so `(if a > b then 1 else 0) ≠ 0` IS `a > b`. That equivalence
# is why a comparison guard renders as a bare proposition, and why the kernel
# accepts the result instead of choking on an arithmetic encoding.
VALUE_INFIX: dict[str, str] = {"add": "+", "sub": "-", "mul": "*"}
VALUE_PREFIX: dict[str, str] = {"pmax": "max", "pmin": "min"}
COMPARISONS: dict[str, str] = {
    "lt": "<", "le": "≤", "gt": ">", "ge": "≥", "eq": "=", "ne": "≠",
}


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
    denotation: str
    guard_props: list[str]
    ground_truth: GroundTruth = field(default_factory=_no_observations)


# --------------------------------------------------------------------------
# The two renderers
# --------------------------------------------------------------------------
def render_ast(node: Node) -> str:
    """The Lean `PyExpr` VALUE. This is the tree every theorem is about."""
    if isinstance(node, Lit):
        return f"(.lit ({node.value}))"
    if isinstance(node, Var):
        return f'(.var "{node.name}")'
    return f"(.{node.op} {render_ast(node.left)} {render_ast(node.right)})"


def render_value(node: Node) -> str:
    """The Lean EXPRESSION the tree denotes, as an `Int`.

    Not trusted. The denotation theorem hands this to the kernel to check
    against `eval` over every integer, so a mistake here is a compile error,
    not a wrong claim.
    """
    if isinstance(node, Lit):
        return f"({node.value} : Int)"
    if isinstance(node, Var):
        return node.name
    left, right = render_value(node.left), render_value(node.right)
    infix = VALUE_INFIX.get(node.op)
    if infix is not None:
        return f"({left} {infix} {right})"
    prefix = VALUE_PREFIX.get(node.op)
    if prefix is not None:
        return f"({prefix} {left} {right})"
    # A comparison used as a value: Python's bool, as the semantics encodes it.
    return f"(if {left} {COMPARISONS[node.op]} {right} then (1 : Int) else (0 : Int))"


def render_prop(node: Node) -> str:
    """The Lean PROP a node means in CONDITION position — Python truthiness."""
    if isinstance(node, Op) and node.op in COMPARISONS:
        return (f"{render_value(node.left)} {COMPARISONS[node.op]} "
                f"{render_value(node.right)}")
    return f"{render_value(node)} ≠ (0 : Int)"


def render_guard(g: Guard) -> str:
    """One entry of the Lean `guards` list, as data."""
    if g.action is None:
        return f"({render_ast(g.cond)}, none)"
    return f"({render_ast(g.cond)}, some {render_ast(g.action)})"


def denotation(guards: list[Guard], ret: Node) -> str:
    """The closed form of the WHOLE function, as one Lean `Option Int` term.

    Guards short-circuit in source order, so they nest as `if`s with the final
    `return` at the bottom. `raise` is `none`: partiality is in the formula,
    not swept aside.
    """
    if not guards:
        return f"some {render_value(ret)}"
    head = guards[0]
    taken = ("none" if head.action is None
             else f"some {render_value(head.action)}")
    return (f"(if {render_prop(head.cond)} then {taken} "
            f"else {denotation(guards[1:], ret)})")


# --------------------------------------------------------------------------
# Parameter names
#
# A parameter becomes a BINDER in the denotation theorem, so its name has to be
# a Lean identifier that captures nothing the statement or its tactic refers
# to. A parameter called `max` would silently rebind `max lo (min hi x)` to an
# integer; one called `hguard0` would collide with the generated case split.
# Both are rejected rather than renamed: a theorem whose binders do not match
# the Python parameter names is a theorem a reader has to decode before they
# can check it.
# --------------------------------------------------------------------------
LEAN_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
GENERATED_HYPOTHESIS = re.compile(r"^hguard[0-9]+$")
LEAN_RESERVED = frozenset({
    # Lean 4 keywords and command heads.
    "abbrev", "at", "attribute", "axiom", "by", "calc", "catch", "class",
    "def", "deriving", "do", "else", "end", "example", "exists", "extends",
    "finally", "for", "forall", "from", "fun", "have", "if", "import", "in",
    "inductive", "instance", "let", "macro", "match", "mutual", "namespace",
    "noncomputable", "notation", "open", "partial", "private", "protected",
    "rec", "return", "section", "set_option", "show", "sorry", "structure",
    "syntax", "then", "theorem", "this", "try", "universe", "unless", "unsafe",
    "variable", "where", "while", "with",
    # Everything the fixed semantics defines, plus what the generated
    # statements and proofs name. Shadowing any of these changes what the
    # theorem says without changing how it reads.
    "PyExpr", "PyEnv", "PyFunc", "lookupVar", "eval", "evalFunc", "runGuards",
    "lit", "var", "add", "sub", "mul", "pmax", "pmin", "lt", "le", "gt", "ge",
    "eq", "ne", "params", "guards", "ret", "env", "fallback", "args",
    "max", "min", "some", "none", "Option", "Int", "List", "String", "Prop",
    "Type", "Nat", "Bool", "Decidable",
})


def check_param_name(name: str, func_name: str) -> None:
    """Reject a parameter that cannot be a binder in the denotation theorem."""
    if name == "_" or not LEAN_IDENTIFIER.match(name):
        raise Unsupported(f"parameter {name!r} is not a Lean identifier, so it "
                          "cannot be bound in the denotation theorem")
    if name in LEAN_RESERVED:
        raise Unsupported(f"parameter {name!r} is a Lean keyword or an "
                          "identifier the semantics defines; binding it would "
                          "change what the theorem means")
    if GENERATED_HYPOTHESIS.match(name):
        raise Unsupported(f"parameter {name!r} collides with the hypothesis "
                          "names the generated guard split introduces")
    if name == f"{func_name}_ast":
        raise Unsupported(f"parameter {name!r} shadows the syntax tree the "
                          "theorem is about")


# --------------------------------------------------------------------------
# Expressions
# --------------------------------------------------------------------------
def expr(node: ast.expr, params: set[str]) -> Node:
    """One Python expression, lowered. Total or raises."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, int):
            raise Unsupported(f"only int literals are supported, got "
                              f"{type(node.value).__name__}")
        return Lit(node.value)

    if isinstance(node, ast.Name):
        if node.id not in params:
            # A free name could be a global, a builtin, or a closure cell. None
            # of those have semantics here, so none of them may enter a proof.
            raise Unsupported(f"name {node.id!r} is not a parameter; globals, "
                              "closures and builtins are outside the subset")
        return Var(node.id)

    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        # -x is sugar for 0 - x, which the semantics already defines.
        return Op("sub", Lit(0), expr(node.operand, params))

    if isinstance(node, ast.BinOp):
        op = BINOPS.get(type(node.op))
        if op is None:
            # Division especially: Python's // floors toward -infinity and / is
            # float. Neither is modelled, so neither is admitted.
            raise Unsupported(f"operator {type(node.op).__name__} has no "
                              "defined semantics in this subset")
        return Op(op, expr(node.left, params), expr(node.right, params))

    if isinstance(node, ast.Compare):
        if len(node.ops) != 1 or len(node.comparators) != 1:
            raise Unsupported("chained comparison (a < b < c) is not modelled")
        cmp = CMPOPS.get(type(node.ops[0]))
        if cmp is None:
            raise Unsupported(f"comparison {type(node.ops[0]).__name__} is "
                              "outside the subset")
        return Op(cmp, expr(node.left, params),
                  expr(node.comparators[0], params))

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in BUILTINS:
            raise Unsupported("only the builtins max/min are callable here")
        if node.keywords or len(node.args) != 2:
            raise Unsupported(f"{node.func.id} is modelled only with exactly "
                              "two positional arguments")
        return Op(BUILTINS[node.func.id], expr(node.args[0], params),
                  expr(node.args[1], params))

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
def guard(stmt: ast.stmt, params: set[str]) -> Guard:
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
        return Guard(cond, None)
    if isinstance(inner, ast.Return) and inner.value is not None:
        return Guard(cond, expr(inner.value, params))
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
    for p in params:
        check_param_name(p, func_name)
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
    guard_list = [guard(s, pset) for s in body[:-1]]
    ret = expr(final.value, pset)

    lean = ("{ params := [" + ", ".join(f'"{p}"' for p in params) + "]\n"
            "  , guards := [" + ", ".join(render_guard(g) for g in guard_list)
            + "]\n"
            "  , ret := " + render_ast(ret) + " }")

    return Emitted(name=func_name, source_path=str(path),
                   source_sha256=hashlib.sha256(source.encode()).hexdigest(),
                   params=params, lean_ast=lean, guards=len(guard_list),
                   denotation=denotation(guard_list, ret),
                   guard_props=[render_prop(g.cond) for g in guard_list])


# --------------------------------------------------------------------------
# Ground truth — the machine-checked link to CPython's ACTUAL behaviour
#
# The denotation theorem relates the tree to a formula, and both of those live
# inside Lean. Neither has touched Python. So the REAL function is executed
# here, and its observed outputs become obligations the Lean kernel has to
# discharge by `rfl`. If `evalFunc` disagrees with CPython at any sampled
# point, the proof does not typecheck.
#
# This is a finite sample, so it is refutation, not equivalence. Stated as such
# in TRUST.md rather than dressed up. What the denotation changed is which job
# the sample has to do: it no longer has to stand in for "what the program
# means" — that is now quantified over all integers — only for "and Python
# really does that".
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
            "denotation": e.denotation, "guard_props": e.guard_props,
            "ground_truth": [{"args": a, "result": r} for a, r in e.ground_truth],
        }
        print(json.dumps(payload, indent=2))
    else:
        print(e.lean_ast)
    return 0


if __name__ == "__main__":
    sys.exit(main())
