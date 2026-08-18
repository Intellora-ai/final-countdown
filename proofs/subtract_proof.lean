def subtract (a b : Int) : Int := a - b

theorem subtract_spec (a b : Int) :
    subtract a 0 = a := by
  unfold subtract
  exact sub_zero a

