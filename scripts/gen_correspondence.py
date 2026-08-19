#!/usr/bin/env python3
"""Generate, for one Python function, the Lean file pair that ties a theorem
to THAT function's semantics.

Each generated pair contains the fixed semantics, `<name>_ast` (the emitted
syntax tree of the actual source, as DATA), and three obligations the Lean
kernel must discharge:

  DENOTATION      evalFunc <name>_ast args = <closed form>, for ALL integers.
                  The closed form is derived from the same tree by the same
                  traversal that emitted it (scripts/pysem.py: `render_value`
                  and `render_ast` walk one `Node`). Nothing here is written
                  per function, and nothing here is trusted — a renderer that
                  disagreed with `eval` at any input would not typecheck.

  CORRESPONDENCE  evalFunc <name>_ast [pt] = <what CPython really returned>,
                  at 12 executed points, by `rfl`.

  PROPERTY        the mathematical claim, stated about `evalFunc <name>_ast`
                  — never about a separately written Lean function.

WHY THE DENOTATION DOES NOT REPLACE THE 12 POINTS.

  The denotation relates a tree to a formula. Both of those live inside Lean.
  Neither has ever touched Python, so on its own it is a statement about a data
  structure that this repository chose to call a syntax tree.

  The correspondence is the only place the real interpreter is involved: the
  function was EXECUTED and its output recorded. Composing the two gives
  `<closed form> = CPython's output` at those points, which is the link that
  actually crosses the language boundary.

WHY THE 12 POINTS DO NOT REPLACE THE DENOTATION.

  Twelve points constrain twelve inputs. `if a == 99991: return 0` agrees with
  addition everywhere the sample looks and is a different function. Before the
  denotation, the strongest machine-checked statement about the tree covered a
  finite set; now it covers every integer, and the sample only has to carry the
  claim that Python agrees.

WHAT EACH LAYER REFUTES, MEASURED (tests/test_correspondence.py):

  `a - b` without regenerating   -> FRESHNESS: the pair describes other Python
  `a * b` regenerated            -> KERNEL, property: commutativity survives,
                                    the identity law `f [a,0] = some a` does not
  `a + b if a != 99991 else 0`   -> UNSUPPORTED: a conditional expression has no
                                    semantics here, so no claim is produced
  a renderer that emits `+` for
  `.sub`                         -> KERNEL, denotation: the closed form and
                                    `eval` disagree, over all integers
  `b + a` regenerated            -> ACCEPTED, correctly: it is the same function
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pysem  # noqa: E402
from pysem_lean import SEMANTICS  # noqa: E402

# Deliberately NOT specs/ and proofs/. Those hold the hand-written contract
# corpus, and scripts/spec_source.py resolves each of those files to a src/*.py
# by its first `def` line — which here would be `def lookupVar`, part of the
# semantics. Separate directories keep both invariants clean.
SPECS = Path("semantics/specs")
PROOFS = Path("semantics/proofs")

# How many observed points become kernel obligations. Enough to separate the
# mutants that matter, small enough that `rfl` stays cheap.
GROUND_TRUTH_POINTS = 12

# Where a generated statement wraps. Not style: the wrap point is part of the
# bytes the freshness check compares, so it has to be a rule, not a judgement.
LINE_BUDGET = 79

# The mathematical property, per function, stated over `evalFunc <name>_ast`.
# `{f}` is the AST's name. The proof script is what AXLE must accept.
PROPERTIES: dict[str, tuple[str, str, str]] = {
    # Each property must PIN the function, not merely hold of it. Commutativity
    # alone accepts `a * b` and `0`; the identity law is what rejects them, so
    # every entry here carries a law that fails for the obvious neighbours.
    "add": (
        "{f}_is_addition",
        "(a b : Int) :\n"
        "    evalFunc {f} [a, b] = evalFunc {f} [b, a]\n"
        "    ∧ evalFunc {f} [a, (0 : Int)] = some a",
        "  refine ⟨?_, ?_⟩\n"
        "  · simp [evalFunc, {f}, runGuards, eval, lookupVar, Int.add_comm]\n"
        "  · simp [evalFunc, {f}, runGuards, eval, lookupVar]\n",
    ),
    "multiply": (
        "{f}_is_multiplication",
        "(a b : Int) :\n"
        "    evalFunc {f} [a, b] = evalFunc {f} [b, a]\n"
        "    ∧ evalFunc {f} [a, (1 : Int)] = some a",
        "  refine ⟨?_, ?_⟩\n"
        "  · simp [evalFunc, {f}, runGuards, eval, lookupVar, Int.mul_comm]\n"
        "  · simp [evalFunc, {f}, runGuards, eval, lookupVar]\n",
    ),
    "subtract": (
        # Fully characterising: no other function satisfies it.
        "{f}_is_subtraction",
        "(a b : Int) : evalFunc {f} [a, b] = some (a - b)",
        "  simp [evalFunc, {f}, runGuards, eval, lookupVar]\n",
    ),
    "clamp": (
        "{f}_clamps",
        "(lo hi x : Int) (h : lo ≤ hi) :\n"
        "    (∃ r, evalFunc {f} [lo, hi, x] = some r ∧ lo ≤ r ∧ r ≤ hi)\n"
        "    ∧ (lo ≤ x → x ≤ hi → evalFunc {f} [lo, hi, x] = some x)",
        "  constructor\n"
        "  · refine ⟨max lo (min hi x), ?_, ?_, ?_⟩\n"
        "    · simp [evalFunc, {f}, runGuards, eval, lookupVar, not_lt.mpr h]\n"
        "    · exact le_max_left _ _\n"
        "    · exact max_le h (min_le_left _ _)\n"
        "  · intro hlo hhi\n"
        "    simp [evalFunc, {f}, runGuards, eval, lookupVar, not_lt.mpr h,\n"
        "          min_eq_right hhi, max_eq_right hlo]\n",
    ),
}

# The lemmas that unfold the semantics down to arithmetic. Every generated
# tactic starts from exactly this set, so a proof that needs more than the
# definitions is visible as an addition rather than hidden in a blob.
def simp_set(ast_name: str) -> str:
    return f"evalFunc, {ast_name}, runGuards, eval, lookupVar"


def lean_int(n: int) -> str:
    return f"({n} : Int)"


def denotes(e: pysem.Emitted, ast_name: str) -> tuple[str, str]:
    """The denotation theorem: statement, and its proof script.

    Both are derived. The binders are the Python parameter names (pysem.py has
    already rejected any that cannot be Lean binders), the right-hand side is
    the closed form of the tree, and the tactic is one case split per guard
    followed by unfolding the semantics. No entry in this file is per-function.
    """
    binder = f"({' '.join(e.params)} : Int) " if e.params else ""
    arglist = "[" + ", ".join(e.params) + "]"
    one_line = f"    evalFunc {ast_name} {arglist} = {e.denotation}"
    claim = (one_line if len(one_line) <= LINE_BUDGET
             else f"    evalFunc {ast_name} {arglist}\n"
                  f"      = {e.denotation}")
    statement = f"{binder}:\n{claim}"

    if not e.guard_props:
        return statement, f"  simp [{simp_set(ast_name)}]\n"
    # Each guard is `if <cond> then ... else ...` on both sides of the equation.
    # Splitting on the same condition the closed form branches on reduces both
    # sides to the same normal form; `simp` finishes the arithmetic.
    names = [f"hguard{i}" for i in range(len(e.guard_props))]
    splits = " <;> ".join(f"by_cases {n} : {p}"
                          for n, p in zip(names, e.guard_props))
    return statement, (f"  {splits} <;>\n"
                       f"    simp [{simp_set(ast_name)}, {', '.join(names)}]\n")


def obligations(e: pysem.Emitted, ast_name: str) -> tuple[str, str]:
    """The correspondence theorem: statement, and its proof script."""
    points = e.ground_truth[:GROUND_TRUTH_POINTS]
    conjuncts: list[str] = []
    for args, result in points:
        arglist = "[" + ", ".join(lean_int(a) for a in args) + "]"
        rhs = "none" if result is None else f"some {lean_int(result)}"
        conjuncts.append(f"    evalFunc {ast_name} {arglist} = {rhs}")
    body = "\n    ∧\n".join(conjuncts)
    proof = "  exact ⟨" + ", ".join("rfl" for _ in points) + "⟩\n"
    return body, proof


def render(e: pysem.Emitted) -> tuple[str, str]:
    ast_name = f"{e.name}_ast"
    if e.name not in PROPERTIES:
        raise SystemExit(f"no property declared for {e.name!r}; a function with "
                         "no stated property gets no proof")
    thm_name, thm_sig, thm_proof = PROPERTIES[e.name]
    thm_name = thm_name.format(f=ast_name)
    thm_sig = thm_sig.format(f=ast_name)
    thm_proof = thm_proof.format(f=ast_name)

    denot_sig, denot_proof = denotes(e, ast_name)
    corr_body, corr_proof = obligations(e, ast_name)

    header = f"""
/-!
DENOTATION, CORRESPONDENCE AND PROPERTY FOR `{e.source_path}`.

  function      {e.name}({', '.join(e.params)})
  source sha256 {e.source_sha256}
  guards        {e.guards}

`{ast_name}` below is the syntax tree of that exact source, emitted as data by
scripts/pysem.py. Every theorem here is about `evalFunc {ast_name}` — the
meaning the semantics above assigns to that tree — so no translation has to be
trusted to preserve behaviour between Python and Lean.

THE CHAIN NEEDS BOTH KERNEL LINKS, AND THEY DO DIFFERENT JOBS.

  DENOTATION      `evalFunc {ast_name} args = <closed form>` for ALL integers.
                  The closed form is derived from this tree, by the traversal
                  that emitted it. It says what the program MEANS, everywhere,
                  not at a sample. What it cannot say is anything about Python:
                  a tree and a formula are both Lean objects.

  CORRESPONDENCE  `evalFunc {ast_name} [pt] = <observed>` at 12 points, by
                  `rfl`, where <observed> is what CPython printed when the real
                  function was run. This is the only obligation in the file
                  that crosses the language boundary. Composed with the
                  denotation it reads `<closed form> = CPython's output`.

Neither is the chain. A denotation with no correspondence proves a formula
about a data structure nobody checked against Python; a correspondence with no
denotation pins 12 inputs and leaves every other integer unclaimed.

The sha256 pins WHICH BYTES were parsed. It says nothing about meaning.
-/

def {ast_name} : PyFunc :=
  {e.lean_ast}
"""
    denot = f"""
/-- DENOTATION. Universally quantified: this is the primary Python↔Lean link,
and it holds at every integer, not at a sample. The right-hand side is derived
from `{ast_name}` itself, so it is not a second hand-written model that could
drift — and it is not trusted either, because the kernel is what closes the
gap between it and `eval`. -/
theorem {ast_name}_denotes {denot_sig} := by
"""
    corr = f"""
/-- CORRESPONDENCE. Each conjunct is a point where the real CPython function
was executed and its output recorded. The kernel must agree by `rfl`, so a
disagreement between Lean's `evalFunc` and CPython at any sampled point makes
this file fail to compile. A finite sample refutes; it does not prove — which
is why the denotation above carries the quantified claim and this carries the
contact with Python. -/
theorem {ast_name}_matches_cpython :
{corr_body} := by
"""
    prop = f"""
/-- PROPERTY. Stated over the semantics of the tree, never over a separately
written Lean function — that is the whole difference. -/
theorem {thm_name} {thm_sig} := by
"""
    # The axiom query is part of the proof file so the audit runs every time,
    # not once by hand. A `sorry` anywhere in a proof shows up here as
    # `sorryAx`, and a custom axiom that simply assumes the result shows up by
    # name. scripts/correspondence_gate.py reads these lines and fails on
    # anything outside Lean's three foundational axioms.
    audit = (f"\n#print axioms {ast_name}_denotes\n"
             f"#print axioms {ast_name}_matches_cpython\n"
             f"#print axioms {thm_name}\n")
    spec = (SEMANTICS + header + denot + "  sorry\n" + corr + "  sorry\n"
            + prop + "  sorry\n")
    proof = (SEMANTICS + header + denot + denot_proof + corr + corr_proof
             + prop + thm_proof + audit)
    return spec, proof


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--function", required=True)
    ap.add_argument("--source")
    ap.add_argument("--out-dir", default=".")
    ns = ap.parse_args()

    src = Path(ns.source) if ns.source else Path("src") / f"{ns.function}.py"
    try:
        e = pysem.emit(src, ns.function)
        e.ground_truth = pysem.observe(src, ns.function, e.params)
    except pysem.Unsupported as exc:
        print(f"UNSUPPORTED_CONSTRUCT: {src}: {exc}", file=sys.stderr)
        return 2

    spec, proof = render(e)
    out = Path(ns.out_dir)
    (out / SPECS).mkdir(parents=True, exist_ok=True)
    (out / PROOFS).mkdir(parents=True, exist_ok=True)
    sp = out / SPECS / f"{e.name}_semantics_spec.lean"
    pp = out / PROOFS / f"{e.name}_semantics_proof.lean"
    sp.write_text(spec, encoding="utf-8")
    pp.write_text(proof, encoding="utf-8")
    print(f"{sp}\n{pp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
