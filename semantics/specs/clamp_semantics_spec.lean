import Mathlib

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

/-!
CORRESPONDENCE AND PROPERTY FOR `src/clamp.py`.

  function      clamp(lo, hi, x)
  source sha256 0c83870f895651d2ff5d7c53871a2389712d495dfa66bde9d21f83168d97c689
  guards        1

`clamp_ast` below is the syntax tree of that exact source, emitted as data by
scripts/pysem.py. Every theorem here is about `evalFunc clamp_ast` — the
meaning the semantics above assigns to that tree — so no translation has to be
trusted to preserve behaviour between Python and Lean.

The sha256 pins WHICH BYTES were parsed. It says nothing about meaning; the
correspondence theorem is what ties the tree to observed behaviour.
-/

def clamp_ast : PyFunc :=
  { params := ["lo", "hi", "x"]
  , guards := [((.gt (.var "lo") (.var "hi")), none)]
  , ret := (.pmax (.var "lo") (.pmin (.var "hi") (.var "x"))) }

/-- CORRESPONDENCE. Each conjunct is a point where the real CPython function
was executed and its output recorded. The kernel must agree by `rfl`, so a
disagreement between Lean's `evalFunc` and CPython at any sampled point makes
this file fail to compile. A finite sample refutes; it does not prove. -/
theorem clamp_ast_matches_cpython :
    evalFunc clamp_ast [(-7 : Int), (0 : Int), (3 : Int)] = some (0 : Int)
    ∧
    evalFunc clamp_ast [(-7 : Int), (-7 : Int), (-7 : Int)] = some (-7 : Int)
    ∧
    evalFunc clamp_ast [(-3 : Int), (1 : Int), (5 : Int)] = some (1 : Int)
    ∧
    evalFunc clamp_ast [(-3 : Int), (-3 : Int), (-3 : Int)] = some (-3 : Int)
    ∧
    evalFunc clamp_ast [(-1 : Int), (2 : Int), (8 : Int)] = some (2 : Int)
    ∧
    evalFunc clamp_ast [(-1 : Int), (-1 : Int), (-1 : Int)] = some (-1 : Int)
    ∧
    evalFunc clamp_ast [(0 : Int), (3 : Int), (17 : Int)] = some (3 : Int)
    ∧
    evalFunc clamp_ast [(0 : Int), (0 : Int), (0 : Int)] = some (0 : Int)
    ∧
    evalFunc clamp_ast [(1 : Int), (5 : Int), (-7 : Int)] = some (1 : Int)
    ∧
    evalFunc clamp_ast [(1 : Int), (1 : Int), (1 : Int)] = some (1 : Int)
    ∧
    evalFunc clamp_ast [(2 : Int), (8 : Int), (-3 : Int)] = some (2 : Int)
    ∧
    evalFunc clamp_ast [(2 : Int), (2 : Int), (2 : Int)] = some (2 : Int) := by
  sorry

/-- PROPERTY. Stated over the semantics of the tree, never over a separately
written Lean function — that is the whole difference. -/
theorem clamp_ast_clamps (lo hi x : Int) (h : lo ≤ hi) :
    (∃ r, evalFunc clamp_ast [lo, hi, x] = some r ∧ lo ≤ r ∧ r ≤ hi)
    ∧ (lo ≤ x → x ≤ hi → evalFunc clamp_ast [lo, hi, x] = some x) := by
  sorry
