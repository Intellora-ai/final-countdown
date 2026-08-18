def multiply (a b : Int) : Int := a * b

theorem multiply_spec (a b : Int) :
    multiply a 1 = a := by
  unfold multiply
  exact mul_one a

