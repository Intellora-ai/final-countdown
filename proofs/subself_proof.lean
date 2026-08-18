def subtract (a b : Int) : Int := a - b

theorem subtract_spec (a b : Int) :
    subtract a a = 0 := by
  unfold subtract
  exact sub_self a

