-- Lean model of src/clamp.py — the def is the contract's subject.
def clamp (lo hi x : Int) : Int := max lo (min hi x)

theorem clamp_spec (lo hi x : Int) (h : lo ≤ hi) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by sorry

