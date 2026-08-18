"""Auto-generated from specs/add_spec.lean by scripts/spec_to_test.py.

Do not edit: regenerate instead. The assertion mirrors the Lean claim exactly.
"""

from hypothesis import assume, given, strategies as st

from src.add import add


@given(st.integers(min_value=-10**6, max_value=10**6), st.integers(min_value=-10**6, max_value=10**6))
def test_add_spec(a, b):
    assert add(a, b) == add(b, a)
