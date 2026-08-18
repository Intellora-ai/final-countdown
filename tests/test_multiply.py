"""Authoritative intent for src.multiply — hand written, not generated."""

from src.multiply import multiply


def test_multiply_positive() -> None:
    assert multiply(2, 3) == 6


def test_multiply_by_zero() -> None:
    assert multiply(7, 0) == 0


def test_multiply_identity() -> None:
    assert multiply(9, 1) == 9


def test_multiply_negative() -> None:
    assert multiply(-4, 3) == -12
