"""Auto-generated from specs/subtract_spec.lean by scripts/spec_to_test.py.

Do not edit: regenerate instead. The assertion mirrors the Lean claim exactly.
"""

from hypothesis import given, strategies as st

from src.subtract import subtract


@given(st.integers(min_value=-10**6, max_value=10**6), st.integers(min_value=-10**6, max_value=10**6))
def test_subtract_spec(a: int, b: int) -> None:
    assert subtract(a, 0) == a
