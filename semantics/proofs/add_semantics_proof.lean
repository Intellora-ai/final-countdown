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
CORRESPONDENCE AND PROPERTY FOR `src/add.py`.

  function      add(a, b)
  source sha256 baa72f5f96ee5522c0373417fd463ca53f69d090dcdd40c1d430d8caa8af5b05
  guards        0

`add_ast` below is the syntax tree of that exact source, emitted as data by
scripts/pysem.py. Every theorem here is about `evalFunc add_ast` — the
meaning the semantics above assigns to that tree — so no translation has to be
trusted to preserve behaviour between Python and Lean.

The sha256 pins WHICH BYTES were parsed. It says nothing about meaning; the
correspondence theorem is what ties the tree to observed behaviour.
-/

def add_ast : PyFunc :=
  { params := ["a", "b"]
  , guards := []
  , ret := (.add (.var "a") (.var "b")) }

/-- CORRESPONDENCE. Each conjunct is a point where the real CPython function
was executed and its output recorded. The kernel must agree by `rfl`, so a
disagreement between Lean's `evalFunc` and CPython at any sampled point makes
this file fail to compile. A finite sample refutes; it does not prove. -/
theorem add_ast_matches_cpython :
    evalFunc add_ast [(-7 : Int), (0 : Int)] = some (-7 : Int)
    ∧
    evalFunc add_ast [(-7 : Int), (-7 : Int)] = some (-14 : Int)
    ∧
    evalFunc add_ast [(-3 : Int), (1 : Int)] = some (-2 : Int)
    ∧
    evalFunc add_ast [(-3 : Int), (-3 : Int)] = some (-6 : Int)
    ∧
    evalFunc add_ast [(-1 : Int), (2 : Int)] = some (1 : Int)
    ∧
    evalFunc add_ast [(-1 : Int), (-1 : Int)] = some (-2 : Int)
    ∧
    evalFunc add_ast [(0 : Int), (3 : Int)] = some (3 : Int)
    ∧
    evalFunc add_ast [(0 : Int), (0 : Int)] = some (0 : Int)
    ∧
    evalFunc add_ast [(1 : Int), (5 : Int)] = some (6 : Int)
    ∧
    evalFunc add_ast [(1 : Int), (1 : Int)] = some (2 : Int)
    ∧
    evalFunc add_ast [(2 : Int), (8 : Int)] = some (10 : Int)
    ∧
    evalFunc add_ast [(2 : Int), (2 : Int)] = some (4 : Int) := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- PROPERTY. Stated over the semantics of the tree, never over a separately
written Lean function — that is the whole difference. -/
theorem add_ast_is_addition (a b : Int) :
    evalFunc add_ast [a, b] = evalFunc add_ast [b, a]
    ∧ evalFunc add_ast [a, (0 : Int)] = some a := by
  refine ⟨?_, ?_⟩
  · simp [evalFunc, add_ast, runGuards, eval, lookupVar, Int.add_comm]
  · simp [evalFunc, add_ast, runGuards, eval, lookupVar]

#print axioms add_ast_matches_cpython
#print axioms add_ast_is_addition
