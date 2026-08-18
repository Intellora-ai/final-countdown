def clamp (lo hi x : Int) : Int := max lo (min hi x)

theorem clamp_spec (lo hi x : Int) (h : lo ≤ hi) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  unfold clamp
  constructor
  · exact le_max_left lo (min hi x)
  · exact max_le h (min_le_left hi x)
