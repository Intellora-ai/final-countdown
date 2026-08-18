-- Lean model of src/add.py — the def is the contract's subject.
def add (a b : Int) : Int := a + b

theorem add_spec (a b : Int) :
    add a 0 = a := by sorry

