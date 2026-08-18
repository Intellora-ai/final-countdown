"""Auto-generated from specs/multiply_spec.lean by scripts/spec_to_test.py.

Do not edit: regenerate instead. The assertion mirrors the Lean claim exactly.
"""

from hypothesis import given, strategies as st

from src.multiply import multiply


@given(st.integers(min_value=-10**6, max_value=10**6), st.integers(min_value=-10**6, max_value=10**6))
def test_multiply_spec(a: int, b: int) -> None:
    assert multiply(a, b) == multiply(b, a)
