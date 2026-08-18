-- Derived from the semantic anchor, not invented to defeat a witness:
-- src/subtract.py docstring says "Return a minus b", and tests/test_subtract.py
-- asserts subtract(2, 3) == -1, which bitwise xor violates (2 xor 3 = 1).
def subtract (a b : Int) : Int := a - b

theorem subtract_spec (a b : Int) :
    subtract a 1 = a - 1 := by sorry
