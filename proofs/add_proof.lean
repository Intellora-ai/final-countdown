def add (a b : Int) : Int := a + b

theorem add_spec (a b : Int) :
    add a b = add b a := by
  unfold add
  exact add_comm a b
