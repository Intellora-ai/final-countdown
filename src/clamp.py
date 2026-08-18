"""Bounded clamp — second worked example with a non-trivial contract."""


def clamp(lo: int, hi: int, x: int) -> int:
    """Clamp x into the inclusive range [lo, hi].

    Contract (mirrored by specs/clamp_spec.lean):
      - requires lo <= hi
      - result is always >= lo and <= hi
      - if lo <= x <= hi then result == x
    """
    if lo > hi:
        raise ValueError(f"lo ({lo}) must be <= hi ({hi})")
    return max(lo, min(hi, x))
