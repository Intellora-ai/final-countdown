"""The exclusion rule, attacked.

A mutant excluded from the denominator raises the spec's score. So the rule that
decides exclusion is a false-green path, and these tests attack it in the only
direction that matters: mutants that a finite witness set would WRONGLY call the
same function.

Two claims are deliberately never conflated here:

  * OBSERVATIONAL EQUIVALENCE UNDER A WITNESS SET — no distinguishing input was
    FOUND, among a stated number of derived witnesses, at a stated seed. This is
    what the code establishes, and `SampleVerdict.indistinguishable` is exactly
    this.
  * SEMANTIC EQUIVALENCE — no distinguishing input EXISTS. Undecidable for
    arbitrary Python (Rice's theorem) and unreachable by sampling over an
    infinite integer domain. Nothing here claims it.

`legacy_indistinguishable` below reproduces the sample the code used before this
test file existed. Every adversarial case asserts BOTH that the current check
catches it AND that the old six-point sample did not — the second half is what
makes "widened" a measurement instead of an adjective.

THE CASE THAT MOTIVATED THE WITNESS GENERATOR
---------------------------------------------
`if a * a == 99980001: return 0` differs from `a + b` at exactly two integers,
±9999, and neither is written anywhere. No amount of extra random or Hypothesis
examples finds a measure-zero target. The tests below therefore assert not only
that the mutant stays in the denominator but WHICH STRATEGY produced the witness
and WHAT ITS VALUE IS. A test that only checked "not excluded" would pass if the
generator got lucky; asserting the provenance is what makes the derivation the
thing under test.
"""

from __future__ import annotations

import itertools
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import mutation_gate  # noqa: E402
import run_gate  # noqa: E402
from mutate import Mutant  # noqa: E402
from spec_strength import (  # noqa: E402
    AXIS_COMPANIONS,
    BOUNDARY_VALUES,
    DISTINGUISHER_EXAMPLES,
    OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET,
    PROV_ADVERSARIAL,
    PROV_BRANCH,
    PROV_ISQRT,
    PROV_LITERAL,
    RANDOM_SAMPLE_TUPLES,
    SAMPLE_SEED,
    Witness,
    adversarial_witnesses,
    branch_witnesses,
    grid_values,
    literal_witnesses,
    load_module,
    observationally_equivalent_under_witness_set,
    observe,
    predicate_witnesses,
    provenance_rank,
    search_for_distinguishing_input,
    witness_points,
    witness_set,
)

# --------------------------------------------------------------------------
# The sample the exclusion rule used to run on, reproduced verbatim so the
# "would the old code have been fooled?" question has an executable answer.
# --------------------------------------------------------------------------
LEGACY_SAMPLE = (-7, -1, 0, 1, 3, 11)


def legacy_indistinguishable(
    original_src: str, mutant_src: str, func_name: str, arity: int
) -> bool:
    """The pre-change check: six values per argument, any exception => False."""
    try:
        original = load_module(original_src)
        mutant = load_module(mutant_src)
    except Exception:
        return False
    f = cast("Callable[..., object]", getattr(original, func_name))
    g = cast("Callable[..., object]", getattr(mutant, func_name))
    for values in itertools.product(LEGACY_SAMPLE, repeat=arity):
        try:
            a, b = f(*values), g(*values)
        except Exception:
            return False
        if a != b:
            return False
    return True


def guarded(condition: str, body: str = "return 0") -> str:
    """`a + b`, with one guard in front of it. The guard is the whole mutant."""
    return (
        f"def f(a: int, b: int) -> int:\n"
        f"    if {condition}:\n"
        f"        {body}\n"
        f"    return a + b\n"
    )


ORIGINAL = "def f(a: int, b: int) -> int:\n    return a + b\n"
COMMUTED = "def f(a: int, b: int) -> int:\n    return b + a\n"


def verdict_for(mutant_source: str):  # type: ignore[no-untyped-def]
    return observationally_equivalent_under_witness_set(ORIGINAL, mutant_source, "f", 2)


# ══════════════════════════════════════════════════════════════════════════════
# THE BUG THIS GENERATOR EXISTS TO KILL — a difference at one COMPUTED point.
# ══════════════════════════════════════════════════════════════════════════════
def test_the_computed_square_point_is_derived_not_stumbled_on() -> None:
    """`a*a == 99980001` is true only at ±9999, a literal in neither source.

    Before the witness generator this mutant was excluded from the denominator,
    which raised the spec's score for a bug the spec never caught. The witness
    has to come from solving the predicate: isqrt(99980001) == 9999 and
    9999**2 == 99980001 exactly, so 9999 is emitted with provenance
    `predicate:isqrt`.
    """
    mutant = guarded("a * a == 99980001")
    verdict = verdict_for(mutant)

    assert not verdict.indistinguishable, (
        "the mutant left the denominator — the spec's score went UP for a bug "
        "it never caught"
    )
    assert verdict.distinguishing_input is not None
    assert verdict.distinguishing_input[0] == 9999, verdict.distinguishing_input
    assert verdict.witness_provenance == PROV_ISQRT, (
        f"caught, but by {verdict.witness_provenance} — if the isqrt rule is "
        f"not what found it, the derivation is not what is being tested"
    )
    # 9999 is nowhere in either file: it cannot have come from the literal band.
    assert "9999" not in ORIGINAL and "9999\n" not in mutant
    assert Witness(9999, PROV_ISQRT) in witness_set(ORIGINAL, mutant)


def test_a_small_exact_square_is_solved_the_same_way() -> None:
    """isqrt on a value the boundaries already cover must still be credited.

    2 is in BOUNDARY_VALUES, so this mutant was caught before. The assertion is
    about ATTRIBUTION: predicate provenance outranks adversarial, so the report
    names the rule that derives the witness rather than the leg that happened to
    contain it.
    """
    verdict = verdict_for(guarded("a * a == 4"))
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None
    assert verdict.distinguishing_input[0] ** 2 == 4, verdict.distinguishing_input
    assert verdict.witness_provenance == PROV_ISQRT


def test_a_non_square_emits_no_isqrt_witness() -> None:
    """`a*a == 99980002` has no integer solution — isqrt(k)**2 != k.

    Without the exactness guard the rule would emit 9999 anyway, and 9999 does
    NOT satisfy the guard, so the "witness" would distinguish nothing. A witness
    that cannot fire is noise in the search budget and a lie in the provenance
    report. This mutant is genuinely equivalent, and the correct verdict is to
    exclude it.
    """
    mutant = guarded("a * a == 99980002")
    assert not [w for w in predicate_witnesses(mutant) if w.provenance == PROV_ISQRT], (
        "the isqrt rule fired on a value that is not a perfect square"
    )
    verdict = verdict_for(mutant)
    assert verdict.indistinguishable, (
        "no integer satisfies the guard, so nothing can distinguish this mutant"
    )


def test_an_exact_divisor_is_solved_for_the_variable() -> None:
    """`a*3 == 30000` is true only at 10000, which no band around 3 or 30000
    reaches. k % c == 0, so k // c is the witness."""
    mutant = guarded("a * 3 == 30000")
    assert Witness(10000, "predicate:divisor") in witness_set(ORIGINAL, mutant)
    verdict = verdict_for(mutant)
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None
    assert verdict.distinguishing_input[0] == 10000
    assert verdict.witness_provenance == "predicate:divisor"


def test_a_modulus_residue_is_solved_for_the_variable() -> None:
    """`a % 7 == 3` is true on a whole residue class; k, k+c, k+2c name it."""
    mutant = guarded("a % 7 == 3")
    assert Witness(3, "predicate:modulus") in witness_set(ORIGINAL, mutant)
    verdict = verdict_for(mutant)
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None
    assert verdict.distinguishing_input[0] == 3
    assert verdict.witness_provenance == "predicate:modulus"


def test_the_solver_walks_nested_binops() -> None:
    """`(a+1)*(a+1) == k` needs isqrt AND the offset inverse, composed.

    The outermost specific rule keeps the credit, so this still reports
    `predicate:isqrt` rather than the offset step that finishes it.
    """
    verdict = verdict_for(guarded("(a + 1) * (a + 1) == 99980001"))
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None
    assert (verdict.distinguishing_input[0] + 1) ** 2 == 99980001
    assert verdict.witness_provenance == PROV_ISQRT


def test_the_constant_may_sit_on_either_side() -> None:
    """`99980001 == a*a` is the same predicate written the other way round."""
    verdict = verdict_for(guarded("99980001 == a * a"))
    assert not verdict.indistinguishable
    assert verdict.witness_provenance == PROV_ISQRT


def test_a_negative_threshold_is_read_as_a_constant() -> None:
    """`-100000` parses as UnaryOp(USub, Constant), not Constant."""
    assert Witness(-100000, PROV_LITERAL) in literal_witnesses(guarded("a < -100000"))
    verdict = verdict_for(guarded("a < -100000"))
    assert not verdict.indistinguishable


# ══════════════════════════════════════════════════════════════════════════════
# THE SIX LEGACY ADVERSARIAL MUTANTS — every one still caught.
# ══════════════════════════════════════════════════════════════════════════════
ADVERSARIAL: dict[str, str] = {
    # A single magic point, far outside a small sample. The constant is in the
    # mutant's own text, which is why scanning both sources catches it.
    "single_far_point": guarded("a == 997"),
    # Wrong only deep in the negatives — beyond the old sample's -7 floor.
    "far_negative_only": guarded("a < -100000"),
    # Wrong only above a billion — beyond the old sample's ceiling of 11.
    "far_positive_only": guarded("a > 1000000000", "return a"),
    # Needs BOTH arguments large at once: a per-argument sweep that never pairs
    # large values would still miss this. Only the cartesian grid leg finds it.
    "both_arguments_large": guarded("a > 500 and b > 500"),
    # Same value, different type. `0 == 0.0` is True, so comparing values alone
    # calls these the same function; they are not.
    "returns_a_float": ("def f(a: int, b: int) -> float:\n    return float(a + b)\n"),
    # Raises where the original returns. An exception is an observation.
    "raises_at_a_far_point": guarded("a == 1000001", "raise ValueError('boom')"),
}

# Same exception class, different message. The old rule abandoned the comparison
# on any exception, so this was never compared at all; comparing the class alone
# would still call it the same function.
RAISER = "def f(a: int, b: int) -> int:\n    raise ValueError(f'bad {a}')\n"
RAISER_MUTATED_MESSAGE = (
    "def f(a: int, b: int) -> int:\n    raise ValueError(f'bad {a + 1}')\n"
)


def test_a_changed_error_message_is_a_difference() -> None:
    verdict = observationally_equivalent_under_witness_set(
        RAISER, RAISER_MUTATED_MESSAGE, "f", 2
    )
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None


def test_the_same_raise_is_not_a_difference() -> None:
    verdict = observationally_equivalent_under_witness_set(RAISER, RAISER, "f", 2)
    assert verdict.indistinguishable


@pytest.mark.parametrize("name", sorted(ADVERSARIAL))
def test_adversarial_mutant_is_not_classified_indistinguishable(name: str) -> None:
    """A real behavioural change must never leave the denominator."""
    verdict = verdict_for(ADVERSARIAL[name])
    assert not verdict.indistinguishable, (
        f"{name} was excluded from the denominator — a spec that never caught "
        f"this bug would score higher for it"
    )
    assert verdict.distinguishing_input is not None, (
        "a rejected mutant must name the input that rejected it"
    )
    assert verdict.witness_provenance is not None, (
        "a rejected mutant must name the strategy that rejected it"
    )
    point = verdict.distinguishing_input
    assert observe(
        cast("Callable[..., object]", load_module(ORIGINAL).f), point
    ) != observe(
        cast("Callable[..., object]", load_module(ADVERSARIAL[name]).f),
        point,
    ), "the reported distinguishing input does not actually distinguish"


@pytest.mark.parametrize("name", sorted(ADVERSARIAL))
def test_the_old_six_point_sample_was_fooled_by_these(name: str) -> None:
    """The widening is measured against what it replaced, not asserted.

    Every case above is one the previous rule called equivalent. If any stops
    fooling the old check, it has stopped being an adversarial case and the
    coverage claim above is weaker than it reads.
    """
    assert legacy_indistinguishable(ORIGINAL, ADVERSARIAL[name], "f", 2), (
        f"{name} no longer fools the six-point sample, so it no longer "
        f"demonstrates that the sample needed widening"
    )


def test_the_old_six_point_sample_was_fooled_by_the_computed_square() -> None:
    """And so was the widened-sample version this generator replaced."""
    assert legacy_indistinguishable(ORIGINAL, guarded("a * a == 99980001"), "f", 2)


# ══════════════════════════════════════════════════════════════════════════════
# THE MUTANT THAT REALLY IS THE SAME FUNCTION.
# ══════════════════════════════════════════════════════════════════════════════
def test_a_genuinely_equivalent_mutant_is_excluded() -> None:
    """`a + b` -> `b + a`. Nothing can distinguish it, so nothing should try."""
    verdict = verdict_for(COMMUTED)
    assert verdict.indistinguishable
    assert verdict.distinguishing_input is None
    assert verdict.witness_provenance is None
    assert verdict.note == OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET
    assert verdict.points_tested > 0, "an exclusion with no points tested is a guess"
    assert verdict.witness_set_size > 0, "an exclusion with no witnesses is a guess"
    assert verdict.hypothesis_examples == DISTINGUISHER_EXAMPLES
    assert verdict.seed == SAMPLE_SEED
    assert sum(n for _, n in verdict.strategy_counts) == verdict.witness_set_size


def test_the_verdict_does_not_claim_equivalence() -> None:
    """The word is the bug. The label carries the smaller claim in its name."""
    verdict = verdict_for(COMMUTED)
    assert not hasattr(verdict, "equivalent")
    assert OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET == (
        "OBSERVATIONALLY_EQUIVALENT_UNDER_WITNESS_SET"
    )
    assert "WITNESS_SET" in verdict.note


# ══════════════════════════════════════════════════════════════════════════════
# THE SIX STRATEGIES, each measured on its own.
# ══════════════════════════════════════════════════════════════════════════════
def test_strategy_1_literals_carry_a_band() -> None:
    derived = literal_witnesses(guarded("a == 997"))
    for near in (996, 997, 998):
        assert Witness(near, PROV_LITERAL) in derived


def test_strategy_3_branch_makes_every_if_test_true_and_false() -> None:
    """Independent of strategy 2 by construction: it walks `if` tests only.

    It is deliberately redundant with predicate solving, which is why the
    printed strategy counts exist — the overlap is a measured number, not an
    assumption. What it uniquely adds is the bare-truthiness test, which
    contains no comparison for the solver to reach.
    """
    derived = branch_witnesses(guarded("a >= 4096"))
    assert {w.value for w in derived} >= {4095, 4096, 4097}
    assert all(w.provenance == PROV_BRANCH for w in derived)

    truthy = branch_witnesses(
        "def f(a: int) -> int:\n    if a:\n        return 0\n    return 1\n"
    )
    assert {w.value for w in truthy} >= {0, 1}


def test_strategy_4_adversarial_covers_word_boundaries_and_magnitudes() -> None:
    values = {w.value for w in adversarial_witnesses()}
    assert {0, 1, -1, 2, -2, 3, -3} <= values
    assert {2**31, -(2**31), 2**63, -(2**63)} <= values
    assert all(10**e in values and -(10**e) in values for e in range(13))
    assert all(2**e in values and -(2**e) in values for e in range(40))
    assert set(BOUNDARY_VALUES) <= values, (
        "the cartesian grid must be a subset of the adversarial set, or a grid "
        "value would have no provenance at all"
    )


def test_strategy_5_random_leg_is_seed_stable_and_leaves_the_grid() -> None:
    witnesses = (Witness(7, PROV_LITERAL),)
    grid = (0, 1, -1)
    first = witness_points(witnesses, grid, 2)
    second = witness_points(witnesses, grid, 2)
    assert first == second, "same seed produced a different witness expansion"

    tail = first[-RANDOM_SAMPLE_TUPLES:]
    assert all(prov == "random" for _, prov in tail)
    cells = set(itertools.product(grid, repeat=2))
    assert {p for p, _ in tail} - cells, (
        "the random leg contributed nothing beyond the grid"
    )


def test_strategy_6_hypothesis_finds_what_the_grid_cannot() -> None:
    """The last line of defence, exercised where the other legs are blind."""

    def f(a: int) -> int:
        return a

    def g(a: int) -> int:
        return 0 if a >= 4 else a

    pool = (0, 1, -1)
    assert all(
        observe(f, p) == observe(g, p) for p in itertools.product(pool, repeat=1)
    ), "this grid must be blind to the difference, or the test proves nothing"

    searched, witness = search_for_distinguishing_input(f, g, pool, 1)
    assert searched and witness is not None, "hypothesis missed a wide difference"
    assert witness[0] >= 4


def test_the_search_reports_when_it_found_nothing() -> None:
    """A function against itself: the search runs, and finds nothing to report.

    `searched` is what separates "looked and found nothing" from "could not
    look". Only the first buys an exclusion.
    """

    def f(a: int) -> int:
        return a

    searched, witness = search_for_distinguishing_input(f, f, (0, 1), 1)
    assert searched and witness is None


# ══════════════════════════════════════════════════════════════════════════════
# HOW THE STRATEGIES ARE UNIONED.
# ══════════════════════════════════════════════════════════════════════════════
def test_provenance_resolves_most_specific_first() -> None:
    """10000 is a power of ten AND the solution of `a*3 == 30000`.

    Whichever leg lists it, the reported strategy must be the one that DERIVED
    it. Otherwise every derived witness would be reported as `adversarial` and
    the provenance would carry no information.
    """
    assert provenance_rank("predicate:divisor") < provenance_rank(PROV_ADVERSARIAL)
    assert provenance_rank(PROV_BRANCH) < provenance_rank(PROV_LITERAL)
    assert provenance_rank(PROV_LITERAL) < provenance_rank(PROV_ADVERSARIAL)
    merged = {
        w.value: w.provenance for w in witness_set(ORIGINAL, guarded("a * 3 == 30000"))
    }
    assert merged[10000] == "predicate:divisor"
    assert 10000 in {w.value for w in adversarial_witnesses()}


def test_the_witness_set_is_deduplicated_and_ordered_derived_first() -> None:
    merged = witness_set(ORIGINAL, guarded("a * a == 99980001"))
    values = [w.value for w in merged]
    assert len(values) == len(set(values)), "a duplicated witness is wasted budget"
    derived = [i for i, w in enumerate(merged) if w.provenance == PROV_ISQRT]
    adversarial = [i for i, w in enumerate(merged) if w.provenance == PROV_ADVERSARIAL]
    assert max(derived) < min(adversarial), (
        "derived witnesses must be tried first, or the reported strategy is "
        "whichever leg ran first rather than the one that earned it"
    )


def test_the_axis_sweep_pins_a_witness_into_every_argument_position() -> None:
    """A derived witness must reach argument 0 AND argument 1.

    `if b * b == 99980001` is the same bug in the other operand; a sweep that
    only ever varied the first argument would miss it entirely.
    """
    verdict = verdict_for(guarded("b * b == 99980001"))
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None
    assert verdict.distinguishing_input[1] == 9999
    assert verdict.witness_provenance == PROV_ISQRT

    points = {p for p, _ in witness_points((Witness(4242, PROV_LITERAL),), (0,), 2)}
    for companion in AXIS_COMPANIONS:
        assert (4242, companion) in points
        assert (companion, 4242) in points


def test_a_mutant_missing_the_function_is_not_excluded() -> None:
    """Nothing observed is not the same as no difference observed."""
    verdict = observationally_equivalent_under_witness_set(
        ORIGINAL, "def g(x: int) -> int:\n    return x\n", "f", 2
    )
    assert not verdict.indistinguishable
    assert verdict.points_tested == 0
    assert "missing" in verdict.note


def test_the_grid_stays_small_enough_to_cross_product() -> None:
    """The grid is the one leg that costs |values| ** arity.

    clamp/3 is the widest arity here. If the enlarged witness set ever leaked
    into the grid, this gate would go from seconds to hours, so the bound is
    asserted rather than hoped for.
    """
    grid = grid_values(ORIGINAL, guarded("a * a == 99980001"))
    assert len(grid) <= 32, f"grid grew to {len(grid)} values — cost is len**arity"
    assert len(witness_set(ORIGINAL, guarded("a * a == 99980001"))) > len(grid), (
        "the witness set must be strictly richer than the grid it replaces"
    )


# --------------------------------------------------------------------------
# Zero denominator. Every mutant excluded means nothing was measured.
# --------------------------------------------------------------------------
ADD_SPECS = ["specs/add_spec.lean", "specs/addid_spec.lean", "specs/addsucc_spec.lean"]
ADD_COMMUTED = (
    (REPO / "src" / "add.py")
    .read_text(encoding="utf-8")
    .replace("return a + b", "return b + a")
)


def test_all_mutants_excluded_is_a_hard_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    """0/0 is not 100%, and must not be rescued by a permissive threshold.

    Threshold 0.0 is the point of the test. The previous code computed
    `killed/total if total else 0.0` and then `PASS if score >= threshold`,
    so at --min-score 0 an all-excluded run returned PASS having killed nothing.
    """
    monkeypatch.chdir(REPO)

    # `qualifier` is accepted because the real generate_mutants takes it: a
    # mutant is named `src/add.py::swap operands` so names cannot collide
    # across files. A double whose signature drifts from the function it
    # replaces stops testing that function.
    def only_a_commuted_mutant(_source: str, qualifier: str = "") -> list[Mutant]:
        name = f"{qualifier}::swap operands" if qualifier else "swap operands"
        return [Mutant(name=name, source=ADD_COMMUTED)]

    monkeypatch.setattr(mutation_gate, "generate_mutants", only_a_commuted_mutant)

    result = mutation_gate.score(ADD_SPECS, 0.0)
    assert result["mutants"] == 0
    assert result["observationally_equivalent"] == 1
    assert result["mutation_score"] == 0.0
    assert result["verdict"] == "FAIL", (
        "every mutant excluded, nothing killed, and the gate said PASS"
    )
    assert "zero denominator" in str(result["fail_reason"])


def test_no_mutants_at_all_is_also_a_hard_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(REPO)

    def no_mutants(_source: str, qualifier: str = "") -> list[Mutant]:
        return []

    monkeypatch.setattr(mutation_gate, "generate_mutants", no_mutants)
    result = mutation_gate.score(ADD_SPECS, 0.0)
    assert result["verdict"] == "FAIL"
    assert result["mutants"] == 0
    assert "zero denominator" in str(result["fail_reason"])


def test_a_real_run_still_has_a_denominator() -> None:
    """The hard fail must not fire on the specs this repository actually ships."""
    result = mutation_gate.score(ADD_SPECS, 0.95)
    assert result["mutants"] > 0
    assert result["fail_reason"] is None
    assert result["verdict"] == "PASS"
    assert result["observationally_equivalent"] == 1
    assert result["witness_set_size"] > 0
    # Every mutant left in the denominator names the strategy that kept it there.
    assert result["distinguished_by"] and all(
        v for v in result["distinguished_by"].values()
    )


def test_the_deprecated_key_still_carries_the_same_count() -> None:
    """scripts/honest_report.py reads `equivalent_excluded` and is not owned here."""
    result = mutation_gate.score(ADD_SPECS, 0.95)
    assert result["equivalent_excluded"] == result["observationally_equivalent"]
    assert result["indistinguishable_on_sample"] == result["observationally_equivalent"]


# --------------------------------------------------------------------------
# The claim has to be legible in the output, or it is not a claim.
# --------------------------------------------------------------------------
def run_mutation_gate(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PY, "scripts/mutation_gate.py", *ADD_SPECS, *args],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=300,
    )


def test_output_states_the_witness_set_and_the_seed() -> None:
    out = run_mutation_gate("--min-score", "0.95")
    assert out.returncode == 0, out.stdout + out.stderr
    assert "observationally equivalent under witness set" in out.stdout
    assert "smallest witness set:" in out.stdout
    assert "derived values" in out.stdout
    assert f"seed {SAMPLE_SEED}" in out.stdout
    assert f"{DISTINGUISHER_EXAMPLES} hypothesis examples" in out.stdout
    assert "points each" in out.stdout
    assert "NOT proven equivalent" in out.stdout


def test_output_says_it_is_not_semantic_equivalence() -> None:
    out = run_mutation_gate("--min-score", "0.95")
    assert "NOT proven semantic equivalence" in out.stdout
    assert "not a proof that none EXISTS" in out.stdout


def test_output_names_the_strategy_for_every_mutant_it_kept() -> None:
    """The derivation has to be visible in the run, not only in the source."""
    out = run_mutation_gate("--min-score", "0.95")
    assert "by strategy" in out.stdout
    assert re.search(r"distinguished: .+ by strategy \S+", out.stdout)


def test_output_does_not_call_them_equivalent_mutants() -> None:
    out = run_mutation_gate("--min-score", "0.95")
    assert "equivalent mutants" not in out.stdout.lower(), (
        "the gate is claiming equivalence it did not establish"
    )


def test_the_evidence_scraper_still_matches_this_gate() -> None:
    """scripts/run_gate.py lifts the exclusion count out of this stdout.

    That file is not owned here and its own comment records what happens when a
    gate renames a line: the regex dies silently and a scope field stops being
    populated. So the rename kept the scraped phrase verbatim, and this test is
    what stops the next rename from breaking it quietly.
    """
    out = run_mutation_gate("--min-score", "0.95")
    pattern = next(
        p
        for p, field in run_gate.SCOPE_PATTERNS
        if field == "indistinguishable_on_sample"
    )
    match = pattern.search(out.stdout)
    assert match is not None, (
        "run_gate.py can no longer scrape the exclusion count from this gate"
    )
    assert match.group(1) == "1"


def test_same_seed_same_classification_across_two_runs() -> None:
    """Cached in-process, so the cache is cleared to make the second run real."""
    computed_point = guarded("a * a == 99980001")
    observationally_equivalent_under_witness_set.cache_clear()
    first = verdict_for(COMMUTED)
    first_derived = verdict_for(computed_point)

    observationally_equivalent_under_witness_set.cache_clear()
    second = verdict_for(COMMUTED)
    second_derived = verdict_for(computed_point)

    assert first == second
    assert first_derived == second_derived
    assert first.points_tested == second.points_tested
    assert first_derived.distinguishing_input == second_derived.distinguishing_input
    assert first_derived.witness_provenance == second_derived.witness_provenance


def test_two_separate_processes_agree() -> None:
    """Determinism across interpreters, not just across calls in one."""
    a = run_mutation_gate("--min-score", "0.95")
    b = run_mutation_gate("--min-score", "0.95")
    assert a.returncode == b.returncode == 0
    assert a.stdout == b.stdout, "the same seed produced two different reports"
