def multiply (a b : Int) : Int := a * b

theorem multiply_spec (a b : Int) :
    multiply a b = multiply b a := by
  unfold multiply
  exact mul_comm a b

