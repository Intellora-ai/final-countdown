"""The exclusion rule, attacked.

A mutant excluded from the denominator raises the spec's score. So the rule that
decides exclusion is a false-green path, and these tests attack it in the only
direction that matters: mutants that a finite sample would WRONGLY call the same
function.

Two claims are deliberately never conflated here:

  * OBSERVATIONAL INDISTINGUISHABILITY ON A SAMPLE — no distinguishing input was
    FOUND, at a stated number of points, at a stated seed. This is what the code
    establishes, and `SampleVerdict.indistinguishable` is exactly this.
  * SEMANTIC EQUIVALENCE — no distinguishing input EXISTS. Undecidable for
    arbitrary Python (Rice's theorem) and unreachable by sampling over an
    infinite integer domain. Nothing here claims it.

`legacy_indistinguishable` below reproduces the sample the code used before this
test file existed. Every adversarial case asserts BOTH that the current check
catches it AND that the old six-point sample did not — the second half is what
makes "widened" a measurement instead of an adjective.
"""

from __future__ import annotations

import itertools
import subprocess
import sys
from pathlib import Path
from typing import Callable, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import mutation_gate  # noqa: E402
from mutate import Mutant  # noqa: E402
from spec_strength import (  # noqa: E402
    BOUNDARY_VALUES,
    DISTINGUISHER_EXAMPLES,
    INDISTINGUISHABLE_ON_SAMPLE,
    SAMPLE_SEED,
    indistinguishable_on_sample,
    load_module,
    observe,
    sample_points,
    sample_values,
    search_for_distinguishing_input,
)

# --------------------------------------------------------------------------
# The sample the exclusion rule used to run on, reproduced verbatim so the
# "would the old code have been fooled?" question has an executable answer.
# --------------------------------------------------------------------------
LEGACY_SAMPLE = (-7, -1, 0, 1, 3, 11)


def legacy_indistinguishable(original_src: str, mutant_src: str,
                             func_name: str, arity: int) -> bool:
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


ORIGINAL = "def f(a: int, b: int) -> int:\n    return a + b\n"
COMMUTED = "def f(a: int, b: int) -> int:\n    return b + a\n"

# Each of these IS a behavioural change. Each agrees with `a + b` everywhere the
# old six-point sample looked. Excluding any of them would raise the spec's
# score for a bug the spec never caught.
ADVERSARIAL: dict[str, str] = {
    # A single magic point, far outside a small sample. The constant is in the
    # mutant's own text, which is why scanning both sources catches it.
    "single_far_point": (
        "def f(a: int, b: int) -> int:\n"
        "    if a == 997:\n"
        "        return 0\n"
        "    return a + b\n"
    ),
    # Wrong only deep in the negatives — beyond the old sample's -7 floor.
    "far_negative_only": (
        "def f(a: int, b: int) -> int:\n"
        "    if a < -100000:\n"
        "        return 0\n"
        "    return a + b\n"
    ),
    # Wrong only above a billion — beyond the old sample's ceiling of 11.
    "far_positive_only": (
        "def f(a: int, b: int) -> int:\n"
        "    if a > 1000000000:\n"
        "        return a\n"
        "    return a + b\n"
    ),
    # Needs BOTH arguments large at once: a per-argument range check that never
    # pairs large values would still miss this.
    "both_arguments_large": (
        "def f(a: int, b: int) -> int:\n"
        "    if a > 500 and b > 500:\n"
        "        return 0\n"
        "    return a + b\n"
    ),
    # Same value, different type. `0 == 0.0` is True, so comparing values alone
    # calls these the same function; they are not.
    "returns_a_float": (
        "def f(a: int, b: int) -> float:\n"
        "    return float(a + b)\n"
    ),
    # Raises where the original returns. An exception is an observation.
    "raises_at_a_far_point": (
        "def f(a: int, b: int) -> int:\n"
        "    if a == 1000001:\n"
        "        raise ValueError('boom')\n"
        "    return a + b\n"
    ),
}

# Same exception class, different message. The old rule abandoned the comparison
# on any exception, so this was never compared at all; comparing the class alone
# would still call it the same function.
RAISER = (
    "def f(a: int, b: int) -> int:\n"
    "    raise ValueError(f'bad {a}')\n"
)
RAISER_MUTATED_MESSAGE = (
    "def f(a: int, b: int) -> int:\n"
    "    raise ValueError(f'bad {a + 1}')\n"
)


def test_a_changed_error_message_is_a_difference() -> None:
    verdict = indistinguishable_on_sample(RAISER, RAISER_MUTATED_MESSAGE, "f", 2)
    assert not verdict.indistinguishable
    assert verdict.distinguishing_input is not None


def test_the_same_raise_is_not_a_difference() -> None:
    verdict = indistinguishable_on_sample(RAISER, RAISER, "f", 2)
    assert verdict.indistinguishable


@pytest.mark.parametrize("name", sorted(ADVERSARIAL))
def test_adversarial_mutant_is_not_classified_indistinguishable(name: str) -> None:
    """A real behavioural change must never leave the denominator."""
    verdict = indistinguishable_on_sample(ORIGINAL, ADVERSARIAL[name], "f", 2)
    assert not verdict.indistinguishable, (
        f"{name} was excluded from the denominator — a spec that never caught "
        f"this bug would score higher for it")
    assert verdict.distinguishing_input is not None, (
        "a rejected mutant must name the input that rejected it")
    point = verdict.distinguishing_input
    assert observe(
        cast("Callable[..., object]", getattr(load_module(ORIGINAL), "f")), point
    ) != observe(
        cast("Callable[..., object]", getattr(load_module(ADVERSARIAL[name]), "f")),
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
        f"demonstrates that the sample needed widening")


def test_a_genuinely_equivalent_mutant_is_excluded() -> None:
    """`a + b` -> `b + a`. Nothing can distinguish it, so nothing should try."""
    verdict = indistinguishable_on_sample(ORIGINAL, COMMUTED, "f", 2)
    assert verdict.indistinguishable
    assert verdict.distinguishing_input is None
    assert verdict.note == INDISTINGUISHABLE_ON_SAMPLE
    assert verdict.points_tested > 0, "an exclusion with no points tested is a guess"
    assert verdict.hypothesis_examples == DISTINGUISHER_EXAMPLES
    assert verdict.seed == SAMPLE_SEED


def test_the_verdict_does_not_claim_equivalence() -> None:
    """The word is the bug. The type carries the smaller claim in its name."""
    verdict = indistinguishable_on_sample(ORIGINAL, COMMUTED, "f", 2)
    assert not hasattr(verdict, "equivalent")
    assert INDISTINGUISHABLE_ON_SAMPLE == "INDISTINGUISHABLE_ON_SAMPLE"


# --------------------------------------------------------------------------
# The three legs of the search, each measured on its own.
# --------------------------------------------------------------------------
def test_boundaries_and_literal_bands_are_in_the_pool() -> None:
    pool = sample_values(ORIGINAL, ADVERSARIAL["single_far_point"])
    for boundary in BOUNDARY_VALUES:
        assert boundary in pool, f"boundary {boundary} missing from the sample"
    for near in (996, 997, 998):
        assert near in pool, "the band around a literal in the mutant is missing"


def test_random_leg_reaches_outside_the_grid_and_is_seed_stable() -> None:
    pool = (0, 1, -1)
    first = sample_points(pool, 2)
    second = sample_points(pool, 2)
    assert first == second, "same seed produced a different sample"
    grid = set(itertools.product(pool, repeat=2))
    assert set(first) - grid, "the random leg contributed nothing beyond the grid"


def test_hypothesis_finds_what_the_grid_cannot() -> None:
    """The last line of defence, exercised where the other two legs are blind."""

    def f(a: int) -> int:
        return a

    def g(a: int) -> int:
        return 0 if a >= 4 else a

    pool = (0, 1, -1)
    assert all(observe(f, p) == observe(g, p)
               for p in itertools.product(pool, repeat=1)), (
        "this grid must be blind to the difference, or the test proves nothing")

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


def test_a_mutant_missing_the_function_is_not_excluded() -> None:
    """Nothing observed is not the same as no difference observed."""
    verdict = indistinguishable_on_sample(
        ORIGINAL, "def g(x: int) -> int:\n    return x\n", "f", 2)
    assert not verdict.indistinguishable
    assert verdict.points_tested == 0
    assert "missing" in verdict.note


# --------------------------------------------------------------------------
# Zero denominator. Every mutant excluded means nothing was measured.
# --------------------------------------------------------------------------
ADD_SPECS = ["specs/add_spec.lean", "specs/addid_spec.lean",
             "specs/addsucc_spec.lean"]
ADD_COMMUTED = (REPO / "src" / "add.py").read_text(
    encoding="utf-8").replace("return a + b", "return b + a")


def test_all_mutants_excluded_is_a_hard_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    """0/0 is not 100%, and must not be rescued by a permissive threshold.

    Threshold 0.0 is the point of the test. The previous code computed
    `killed/total if total else 0.0` and then `PASS if score >= threshold`,
    so at --min-score 0 an all-excluded run returned PASS having killed nothing.
    """
    monkeypatch.chdir(REPO)
    def only_a_commuted_mutant(_source: str) -> list[Mutant]:
        return [Mutant(name="swap operands", source=ADD_COMMUTED)]

    monkeypatch.setattr(mutation_gate, "generate_mutants", only_a_commuted_mutant)

    result = mutation_gate.score(ADD_SPECS, 0.0)
    assert result["mutants"] == 0
    assert result["indistinguishable_on_sample"] == 1
    assert result["mutation_score"] == 0.0
    assert result["verdict"] == "FAIL", (
        "every mutant excluded, nothing killed, and the gate said PASS")
    assert "zero denominator" in str(result["fail_reason"])


def test_no_mutants_at_all_is_also_a_hard_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(REPO)
    def no_mutants(_source: str) -> list[Mutant]:
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
    assert result["indistinguishable_on_sample"] == 1


# --------------------------------------------------------------------------
# The claim has to be legible in the output, or it is not a claim.
# --------------------------------------------------------------------------
def run_gate(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([PY, "scripts/mutation_gate.py", *ADD_SPECS, *args],
                          cwd=REPO, capture_output=True, text=True, timeout=300)


def test_output_states_the_points_tested_and_the_seed() -> None:
    out = run_gate("--min-score", "0.95")
    assert out.returncode == 0, out.stdout + out.stderr
    assert "indistinguishable on sample: 1 excluded" in out.stdout
    assert f"seed {SAMPLE_SEED}" in out.stdout
    assert f"{DISTINGUISHER_EXAMPLES} hypothesis examples" in out.stdout
    assert "points each" in out.stdout
    assert "NOT proven equivalent" in out.stdout


def test_output_does_not_call_them_equivalent_mutants() -> None:
    out = run_gate("--min-score", "0.95")
    assert "equivalent mutants" not in out.stdout.lower(), (
        "the gate is claiming equivalence it did not establish")


def test_same_seed_same_classification_across_two_runs() -> None:
    """Cached in-process, so the cache is cleared to make the second run real."""
    indistinguishable_on_sample.cache_clear()
    first = indistinguishable_on_sample(ORIGINAL, COMMUTED, "f", 2)
    first_adversarial = indistinguishable_on_sample(
        ORIGINAL, ADVERSARIAL["single_far_point"], "f", 2)

    indistinguishable_on_sample.cache_clear()
    second = indistinguishable_on_sample(ORIGINAL, COMMUTED, "f", 2)
    second_adversarial = indistinguishable_on_sample(
        ORIGINAL, ADVERSARIAL["single_far_point"], "f", 2)

    assert first == second
    assert first_adversarial == second_adversarial
    assert first.points_tested == second.points_tested
    assert first_adversarial.distinguishing_input == second_adversarial.distinguishing_input


def test_two_separate_processes_agree() -> None:
    """Determinism across interpreters, not just across calls in one."""
    a = run_gate("--min-score", "0.95")
    b = run_gate("--min-score", "0.95")
    assert a.returncode == b.returncode == 0
    assert a.stdout == b.stdout, "the same seed produced two different reports"
