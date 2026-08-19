#!/usr/bin/env python3
"""Generate, for one Python function, the Lean file pair that ties a theorem
to THAT function's semantics.

Each generated pair contains three things and nothing else:

  1. the fixed semantics (scripts/pysem_lean.py, byte-identical everywhere)
  2. `<name>_ast`, the emitted syntax tree of the actual source, as DATA
  3. two obligations the Lean kernel must discharge

     CORRESPONDENCE   evalFunc <name>_ast [args] = <what CPython really returned>
                      for every sampled point, by `rfl`.
     PROPERTY         the mathematical claim, stated about `evalFunc <name>_ast`
                      — never about a separately written Lean function.

NEITHER OBLIGATION IS SUFFICIENT ALONE, and that is the point.

  `return a * b` satisfies commutativity. The property theorem accepts it; the
  correspondence rejects it, because CPython returns 6 for (2,3) and the tree
  now means 6 where the recorded observation says 5.

  `return 0` also satisfies commutativity — measured, not assumed: AXLE returns
  okay=true for it. Only the correspondence rejects it.

  `if a > 0: return a + b` / `return a - b` satisfies the correspondence at the
  sampled points where the guard is taken, but not commutativity.

Together they rejected every semantically different mutant tried. The
correspondence is a finite sample, so it refutes rather than proves; that limit
is written down in TRUST.md instead of being papered over.
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


def lean_int(n: int) -> str:
    return f"({n} : Int)"


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

    corr_body, corr_proof = obligations(e, ast_name)

    header = f"""
/-!
CORRESPONDENCE AND PROPERTY FOR `{e.source_path}`.

  function      {e.name}({', '.join(e.params)})
  source sha256 {e.source_sha256}
  guards        {e.guards}

`{ast_name}` below is the syntax tree of that exact source, emitted as data by
scripts/pysem.py. Every theorem here is about `evalFunc {ast_name}` — the
meaning the semantics above assigns to that tree — so no translation has to be
trusted to preserve behaviour between Python and Lean.

The sha256 pins WHICH BYTES were parsed. It says nothing about meaning; the
correspondence theorem is what ties the tree to observed behaviour.
-/

def {ast_name} : PyFunc :=
  {e.lean_ast}

/-- CORRESPONDENCE. Each conjunct is a point where the real CPython function
was executed and its output recorded. The kernel must agree by `rfl`, so a
disagreement between Lean's `evalFunc` and CPython at any sampled point makes
this file fail to compile. A finite sample refutes; it does not prove. -/
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
    audit = (f"\n#print axioms {ast_name}_matches_cpython\n"
             f"#print axioms {thm_name}\n")
    spec = SEMANTICS + header + "  sorry\n" + prop + "  sorry\n"
    proof = SEMANTICS + header + corr_proof + prop + thm_proof + audit
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
