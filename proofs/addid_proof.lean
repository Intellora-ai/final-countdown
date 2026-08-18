def add (a b : Int) : Int := a + b

theorem add_spec (a b : Int) :
    add a 0 = a := by
  unfold add
  exact add_zero a

