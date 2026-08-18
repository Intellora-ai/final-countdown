def clamp (lo hi x : Int) : Int := max lo (min hi x)

theorem clamp_spec (lo hi x : Int) (h : lo ≤ x ∧ x ≤ hi) :
    clamp lo hi x = x := by
  unfold clamp
  omega
