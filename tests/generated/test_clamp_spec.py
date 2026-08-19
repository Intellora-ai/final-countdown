"""Auto-generated from specs/clamp_spec.lean by scripts/spec_to_test.py.

Do not edit: regenerate instead. The assertion mirrors the Lean claim exactly.
"""

from hypothesis import HealthCheck, assume, given, settings, strategies as st

from src.clamp import clamp


@settings(max_examples=500,
          suppress_health_check=[HealthCheck.filter_too_much])
@given(st.integers(min_value=-10**6, max_value=10**6), st.integers(min_value=-10**6, max_value=10**6), st.integers(min_value=-10**6, max_value=10**6))
def test_clamp_spec(lo: int, hi: int, x: int) -> None:
    assume(lo <= x and x <= hi)
    assert clamp(lo, hi, x) == x
