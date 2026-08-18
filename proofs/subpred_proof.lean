def subtract (a b : Int) : Int := a - b

theorem subtract_spec (a b : Int) :
    subtract a 1 = a - 1 := by
  unfold subtract
  rfl
