theorem clamp_bounds (lo hi x : Int) (h : lo ≤ hi) :
    lo ≤ max lo (min hi x) ∧ max lo (min hi x) ≤ hi := by
  constructor
  · exact le_max_left lo (min hi x)
  · exact max_le h (min_le_left hi x)
