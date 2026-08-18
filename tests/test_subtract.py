"""Authoritative intent for src.subtract — hand written, not generated.

These assertions are the semantic anchor: they state what subtraction is
supposed to do, independently of any Lean spec. sufficiency_loop.py consults
them to decide whether a surviving witness contradicts intent.
"""

from src.subtract import subtract


def test_subtract_positive() -> None:
    assert subtract(5, 3) == 2


def test_subtract_to_negative() -> None:
    assert subtract(2, 3) == -1


def test_subtract_zero_is_identity() -> None:
    assert subtract(7, 0) == 7


def test_subtract_self_is_zero() -> None:
    assert subtract(4, 4) == 0


def test_subtract_negative_operand() -> None:
    assert subtract(5, -3) == 8
