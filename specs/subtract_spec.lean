-- Lean model of src/subtract.py — the def is the contract's subject.
def subtract (a b : Int) : Int := a - b

theorem subtract_spec (a b : Int) :
    subtract a 0 = a := by sorry

