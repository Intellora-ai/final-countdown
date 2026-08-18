"""Tests for src.add — mirrors specs/add_spec.lean."""

import pytest
from hypothesis import given, strategies as st

from src.add import add

ints = st.integers(min_value=-10**9, max_value=10**9)


def test_add_basic() -> None:
    assert add(2, 3) == 5


def test_add_negative() -> None:
    assert add(-2, -3) == -5


def test_add_zero_identity() -> None:
    assert add(7, 0) == 7


@given(ints, ints)
def test_add_is_commutative(a: int, b: int) -> None:
    """Mirrors add_comm_spec: a + b = b + a."""
    assert add(a, b) == add(b, a)


@given(ints)
def test_add_zero_is_identity(a: int) -> None:
    assert add(a, 0) == a


@given(ints, ints, ints)
def test_add_is_associative(a: int, b: int, c: int) -> None:
    assert add(add(a, b), c) == add(a, add(b, c))
