def add (a b : Int) : Int := a + b

theorem add_spec (a b : Int) :
    add a 1 = a + 1 := by
  unfold add
  rfl
