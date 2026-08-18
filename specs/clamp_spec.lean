theorem clamp_bounds (lo hi x : Int) (h : lo ≤ hi) :
    lo ≤ max lo (min hi x) ∧ max lo (min hi x) ≤ hi := by sorry
