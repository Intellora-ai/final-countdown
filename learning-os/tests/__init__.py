"""Marks `tests` as a package, which is what its own imports already assume.

`test_mastery_properties.py` does `from tests.strategies import ...`. Without
this file mypy reaches the same source two ways -- as top-level `strategies`
when it walks the directory, and as `tests.strategies` when it follows that
import -- and refuses to continue:

    tests/strategies.py: error: Source file found twice under different module
    names: "strategies" and "tests.strategies"

which stopped the whole `learning-os` check before it type-checked anything.
"""
