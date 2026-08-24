#!/usr/bin/env python3
"""THE FORMAL SEMANTICS, as a single Lean text. Written once, never generated.

This is the whole reason the chain can close. Every spec and proof embeds this
verbatim, so what the kernel checks is always the same interpreter — not a
per-function translation that would have to be trusted separately.

`evalFunc f args` IS the definition of what a supported Python function means.
It is total: an unbound name, an arity mismatch, or a raised guard all evaluate
to `none`, which is how partiality (clamp's ValueError) enters the mathematics
instead of being ignored.

READ THE SEMANTIC CHOICES, THEY ARE NOT NEUTRAL:

  Int              Python ints are unbounded, so Lean's `Int` is the right
                   carrier. A machine word would be a different language.
  comparisons      Python's `<` yields a bool; here it yields 1 or 0, and
                   truthiness is `≠ 0`. That is Python's own rule for ints.
  guards           `if c: raise` is `none` — undefined, not an error value.
                   `if c: return e` short-circuits, in source order.
  no division      `/` is float and `//` floors toward −∞. Neither is modelled,
                   so neither may appear in a program that gets a proof.
  no else, no loop, no assignment
                   Not "hard" — simply undefined. Undefined must not acquire a
                   theorem by default, so scripts/pysem.py rejects it.
"""

SEMANTICS = r"""import Mathlib

/-!
FORMAL SEMANTICS OF THE SUPPORTED PYTHON SUBSET.

Fixed text, identical in every spec and proof. The theorems below are about
`evalFunc applied to a syntax tree`, not about a separately written Lean
function, so no translation step has to be trusted to preserve meaning.
-/

inductive PyExpr where
  | lit  : Int → PyExpr
  | var  : String → PyExpr
  | add  : PyExpr → PyExpr → PyExpr
  | sub  : PyExpr → PyExpr → PyExpr
  | mul  : PyExpr → PyExpr → PyExpr
  | pmax : PyExpr → PyExpr → PyExpr
  | pmin : PyExpr → PyExpr → PyExpr
  | lt   : PyExpr → PyExpr → PyExpr
  | le   : PyExpr → PyExpr → PyExpr
  | gt   : PyExpr → PyExpr → PyExpr
  | ge   : PyExpr → PyExpr → PyExpr
  | eq   : PyExpr → PyExpr → PyExpr
  | ne   : PyExpr → PyExpr → PyExpr

abbrev PyEnv := List (String × Int)

def lookupVar : PyEnv → String → Option Int
  | [], _ => none
  | (k, v) :: rest, x => if k = x then some v else lookupVar rest x

/-- Meaning of an expression. `none` is "undefined here", never a value. -/
def eval (env : PyEnv) : PyExpr → Option Int
  | .lit n  => some n
  | .var x  => lookupVar env x
  | .add a b => match eval env a, eval env b with
      | some x, some y => some (x + y) | _, _ => none
  | .sub a b => match eval env a, eval env b with
      | some x, some y => some (x - y) | _, _ => none
  | .mul a b => match eval env a, eval env b with
      | some x, some y => some (x * y) | _, _ => none
  | .pmax a b => match eval env a, eval env b with
      | some x, some y => some (max x y) | _, _ => none
  | .pmin a b => match eval env a, eval env b with
      | some x, some y => some (min x y) | _, _ => none
  | .lt a b => match eval env a, eval env b with
      | some x, some y => some (if x < y then 1 else 0) | _, _ => none
  | .le a b => match eval env a, eval env b with
      | some x, some y => some (if x ≤ y then 1 else 0) | _, _ => none
  | .gt a b => match eval env a, eval env b with
      | some x, some y => some (if x > y then 1 else 0) | _, _ => none
  | .ge a b => match eval env a, eval env b with
      | some x, some y => some (if x ≥ y then 1 else 0) | _, _ => none
  | .eq a b => match eval env a, eval env b with
      | some x, some y => some (if x = y then 1 else 0) | _, _ => none
  | .ne a b => match eval env a, eval env b with
      | some x, some y => some (if x ≠ y then 1 else 0) | _, _ => none

/-- A supported function: parameters, ordered guards, and one final return.
`none` as a guard action is `raise`, which makes the function partial. -/
structure PyFunc where
  params : List String
  guards : List (PyExpr × Option PyExpr)
  ret    : PyExpr

def runGuards (env : PyEnv) (fallback : PyExpr) :
    List (PyExpr × Option PyExpr) → Option Int
  | [] => eval env fallback
  | (c, act) :: rest =>
      match eval env c with
      | none => none
      | some v =>
          if v ≠ 0 then
            match act with
            | none   => none
            | some e => eval env e
          else runGuards env fallback rest

/-- THE SEMANTICS. Arity mismatch is undefined, exactly as calling a Python
function with the wrong number of arguments is not a value. -/
def evalFunc (f : PyFunc) (args : List Int) : Option Int :=
  if f.params.length = args.length then
    runGuards (f.params.zip args) f.ret f.guards
  else none
"""
