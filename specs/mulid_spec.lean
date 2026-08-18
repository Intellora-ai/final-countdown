-- Lean model of src/multiply.py — the def is the contract's subject.
def multiply (a b : Int) : Int := a * b

theorem multiply_spec (a b : Int) :
    multiply a 1 = a := by sorry

