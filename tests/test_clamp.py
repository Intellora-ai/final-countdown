"""Tests for src.clamp — mirrors specs/clamp_spec.lean."""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from src.clamp import clamp

ints = st.integers(min_value=-(10**6), max_value=10**6)


def test_clamp_below_range() -> None:
    assert clamp(0, 10, -5) == 0


def test_clamp_above_range() -> None:
    assert clamp(0, 10, 50) == 10


def test_clamp_inside_range() -> None:
    assert clamp(0, 10, 7) == 7


def test_clamp_rejects_inverted_bounds() -> None:
    with pytest.raises(ValueError, match="must be <="):
        clamp(10, 0, 5)


@given(ints, ints, ints)
def test_clamp_result_within_bounds(lo: int, hi: int, x: int) -> None:
    """Mirrors clamp_bounds: lo <= result and result <= hi."""
    if lo > hi:
        pytest.skip("precondition lo <= hi")
    result = clamp(lo, hi, x)
    assert lo <= result <= hi


@given(ints, ints, ints)
def test_clamp_is_identity_inside_range(lo: int, hi: int, x: int) -> None:
    if not (lo <= x <= hi):
        pytest.skip("x outside range")
    assert clamp(lo, hi, x) == x
