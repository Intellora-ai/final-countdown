"""A required check that could not fail, and the two bugs that made it so.

`spec-strength` is one of seventeen required contexts. Measured on the real
repository before this file existed:

    ❌ specs/subself_spec.lean is too weak (0.33 < 0.90)
    ❌ specs/subtract_spec.lean is too weak (0.67 < 0.90)
       ... 6 of 10 specs below the threshold
    JOINT strength: 1.00 (3/3 killed by the set)
    exit 0

Six failures printed and a perfect score reported, by the gate whose entire job
is to reject weak specs.

TWO BUGS, EACH HIDING THE OTHER.

`scripts/mutate.py` named a mutant by its operator alone -- "return constant 0",
"swap operands". Those strings are not unique across files: `src/add.py` and
`src/subtract.py` each have a "return constant 0", and they are different
mutants of different code.

`scripts/check_composition.py` intersected survivor sets across every spec it
was given, and `spec-strength` gives it ten specs spanning four source files. So
add's kill of "return constant 0" cancelled subtract's survivor of an unrelated
mutant that happened to share the label.

Fixing only the names makes it worse in a way that is easier to see: qualified
survivor sets from different sources are DISJOINT, so the intersection is always
empty and the score is always exactly 1.00. The gate then *provably* cannot
fail, for any input naming two or more sources. That is what these tests pin.

WHY SYNTHETIC REPORTS. Scoring one spec end to end runs the real evaluator
against the hosted AXLE service; the ten-spec gate takes about twenty minutes.
That is long enough that the arithmetic was never unit-tested, which is how it
stayed wrong. `joint_score` was lifted out of `__main__` so the arithmetic can
be attacked in milliseconds, with the slow end-to-end behaviour asserted
separately by the gate itself in CI.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from check_composition import joint_score  # noqa: E402
from mutate import generate_mutants  # noqa: E402


def report(spec: str, mutants: int, survivors: list[str]) -> dict[str, Any]:
    """One scored spec, in the shape `spec_strength.evaluate` returns."""
    return {"spec": spec, "mutants": mutants, "survivors": survivors}


def source_of(spec: str) -> str:
    """Stands in for spec_source.source_for: specs/<stem>_spec.lean -> src/<x>.py."""
    return {
        "specs/add_spec.lean": "src/add.py",
        "specs/addid_spec.lean": "src/add.py",
        "specs/subself_spec.lean": "src/subtract.py",
        "specs/subtract_spec.lean": "src/subtract.py",
        "specs/clamp_spec.lean": "src/clamp.py",
    }[spec]


def score(scored: list[dict[str, Any]]) -> float:
    return joint_score(scored, source_of=source_of)[0]


# --- the defect ------------------------------------------------------------


def test_two_incomplete_sources_do_not_score_a_perfect_set() -> None:
    """THE BUG. Both sources have survivors; neither cancels the other.

    Reproduces the measured case exactly. `src/add.py` kills 1 of 2, so one
    mutant survives; `src/subtract.py` kills 1 of 3, so two survive. Under the
    old intersection the two sets were disjoint, the intersection was empty, and
    the score was 1.00 with exit 0.
    """
    scored = [
        report("specs/add_spec.lean", 2, ["src/add.py::return constant 0"]),
        report(
            "specs/subself_spec.lean",
            3,
            ["src/subtract.py::swap operands", "src/subtract.py::return constant 0"],
        ),
    ]
    assert score(scored) == pytest.approx(2 / 5), (
        "three mutants survive out of five; the set is 0.40, not 1.00"
    )
    assert score(scored) < 0.9, "this input must fail a 0.90 gate"


def test_adding_a_source_with_survivors_can_never_reach_a_perfect_score() -> None:
    """The signature of the old bug: more sources, score pinned at 1.00.

    Under the old intersection, every source added shrank the intersection, and
    at two or more sources it was empty by construction -- so the score was
    exactly 1.00 no matter how many mutants survived. Adding unspecified code
    RAISED the reported strength.

    The pooled ratio here legitimately moves either way as sources join: adding
    a source that kills 1 of 2 to one that kills 1 of 3 gives 2/5, which is
    above 1/3. That is a weighted average behaving normally, and asserting it
    must only decrease was this test's own first mistake. The invariant that
    actually distinguishes the fix from the bug is the ceiling: while any mutant
    anywhere survives its own function's spec set, the score is strictly below
    1.00 and no number of additional sources can lift it there.
    """
    weak = [
        report(
            "specs/subself_spec.lean",
            3,
            ["src/subtract.py::swap operands", "src/subtract.py::return constant 0"],
        )
    ]
    assert score(weak) == pytest.approx(1 / 3)

    for extra in (
        [report("specs/clamp_spec.lean", 2, ["src/clamp.py::binop Add->Sub"])],
        [report("specs/clamp_spec.lean", 2, []), report("specs/add_spec.lean", 2, [])],
    ):
        joined = score(weak + extra)
        assert joined < 1.0, (
            f"survivors remain and the set still scored {joined:.2f}; under the "
            f"old intersection this was exactly 1.00"
        )
        assert joined < 0.9, (
            f"a set containing an unkilled mutant must fail a 0.90 gate, "
            f"got {joined:.2f}"
        )


def test_a_single_surviving_mutant_anywhere_is_visible_in_the_score() -> None:
    """One survivor in four complete sources must not round away."""
    scored = [
        report("specs/add_spec.lean", 2, []),
        report("specs/clamp_spec.lean", 2, []),
        report("specs/subself_spec.lean", 3, ["src/subtract.py::swap operands"]),
    ]
    assert score(scored) == pytest.approx(6 / 7)
    assert score(scored) < 1.0


# --- what must NOT change: set-scoring within one source -------------------


def test_specs_of_one_function_still_score_as_a_set() -> None:
    """The documented reason the gate exists at all.

    check_composition.py's docstring: add's commutativity spec misses
    `return 0`; its identity spec misses `Add->Sub`. Each scores 0.50 alone and
    would be rejected. Together they kill everything, and gating per-spec would
    throw the correct set away. That argument is about specs of ONE function,
    and it is preserved exactly.
    """
    commutativity = report("specs/add_spec.lean", 2, ["src/add.py::return constant 0"])
    identity = report("specs/addid_spec.lean", 2, ["src/add.py::binop Add->Sub"])
    assert score([commutativity]) == pytest.approx(0.5)
    assert score([identity]) == pytest.approx(0.5)
    assert score([commutativity, identity]) == pytest.approx(1.0), (
        "two half-strength specs of one function must still compose to a "
        "complete set; per-spec gating is exactly what this gate rejects"
    )


def test_one_source_is_scored_identically_to_before() -> None:
    """`spec-composition` only ever receives one source's specs.

    With a single group the grouping is a no-op, so that gate's verdict is
    unchanged by this fix -- confirmed against the real repository: all four
    sources 1.00, exit 0, same as before.
    """
    scored = [
        report("specs/subself_spec.lean", 3, ["src/subtract.py::swap operands"]),
        report(
            "specs/subtract_spec.lean",
            3,
            ["src/subtract.py::swap operands", "src/subtract.py::return constant 0"],
        ),
    ]
    # Intersection within the source: only `swap operands` survives both.
    assert score(scored) == pytest.approx(2 / 3)


# --- the denominator -------------------------------------------------------


def test_the_denominator_is_every_mutant_not_the_largest_source() -> None:
    """`max(mutants)` across unrelated sources was never the size of anything.

    Four sources of 2, 2, 2 and 3 mutants are nine mutants. Taking the largest
    made the denominator 3 and the score a ratio of two unrelated quantities.
    """
    scored = [
        report("specs/add_spec.lean", 2, []),
        report("specs/clamp_spec.lean", 2, []),
        report("specs/subself_spec.lean", 3, []),
    ]
    _joint, _survivors, total, rows = joint_score(scored, source_of=source_of)
    assert total == 7, f"expected 2+2+3=7 mutants, got {total}"
    assert len(rows) == 3, "one row per source"


def test_a_complete_set_still_scores_one() -> None:
    """The control. The fix must not make a genuinely complete set fail.

    Measured on the real repository after the fix: add 2/2, clamp 2/2,
    multiply 2/2, subtract 3/3, JOINT 1.00 (9/9), exit 0 -- earned rather than
    structural.
    """
    scored = [
        report("specs/add_spec.lean", 2, []),
        report("specs/clamp_spec.lean", 2, []),
        report("specs/subself_spec.lean", 3, []),
    ]
    assert score(scored) == pytest.approx(1.0)


# --- mutant names ----------------------------------------------------------

ADD = "def add(a: int, b: int) -> int:\n    return a + b\n"
SUB = "def subtract(a: int, b: int) -> int:\n    return a - b\n"


def test_a_mutant_name_says_which_file_it_belongs_to() -> None:
    names = [m.name for m in generate_mutants(ADD, qualifier="src/add.py")]
    assert names, "the fixture generated no mutants"
    assert all(n.startswith("src/add.py::") for n in names), names


def test_the_same_operator_in_two_files_is_two_different_names() -> None:
    """The collision, directly. Both files have a `return constant 0`."""
    add = {m.name for m in generate_mutants(ADD, qualifier="src/add.py")}
    sub = {m.name for m in generate_mutants(SUB, qualifier="src/subtract.py")}
    assert add & sub == set(), (
        f"mutants of different files still share names: {add & sub}"
    )

    bare_add = {m.name for m in generate_mutants(ADD)}
    bare_sub = {m.name for m in generate_mutants(SUB)}
    assert bare_add & bare_sub, (
        "the unqualified names were expected to collide; if they no longer do, "
        "this test is asserting nothing and the operator set has changed"
    )


def test_an_unqualified_call_is_unchanged() -> None:
    """Callers that pass no qualifier keep the old names."""
    assert all("::" not in m.name for m in generate_mutants(ADD))
