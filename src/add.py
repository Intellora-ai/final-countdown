"""Integer addition — the worked example for the AXLE + Lean 4 pipeline."""


def add(a: int, b: int) -> int:
    """Return the sum of two integers.

    Contract (mirrored by specs/add_spec.lean):
      - commutative: add(a, b) == add(b, a)
      - identity:    add(a, 0) == a
      - associative: add(add(a, b), c) == add(a, add(b, c))
    """
    return a + b
