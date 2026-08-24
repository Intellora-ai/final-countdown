"""Memory, held to the one thing it exists to prevent.

The failure is a tutor producing a superficially different version of an
explanation that already failed. Every test here is a way that failure could
sneak through: the same mechanism in new words, the same example redressed, the
same text. If any of these passes, the engine will reword forever while
appearing to adapt.
"""

from __future__ import annotations

from learning_os.memory.store import (
    SAME_EXPLANATION,
    Attempt,
    MemoryStore,
    Outcome,
    similarity,
)
from learning_os.models.contracts import ActionKind

SKILL = "python.recursion.identify_base_case"
OTHER = "python.recursion.trace_calls"


def _attempt(
    outcome: Outcome = Outcome.FAILURE,
    *,
    skill: str = SKILL,
    action: ActionKind = ActionKind.TEACH_BY_EXAMPLE,
    representation: str = "worked_example",
    mechanism: str = "show_a_correct_example",
    example_signature: str = "",
) -> Attempt:
    return Attempt(
        skill_id=skill,
        action=action,
        representation=representation,
        outcome=outcome,
        mechanism=mechanism,
        example_signature=example_signature,
    )


# --------------------------------------------------------------------------
# The repeat check -- three ways a repeat can hide
# --------------------------------------------------------------------------


def test_the_same_mechanism_in_new_words_is_a_repeat() -> None:
    """The headline case. Rewording is not a new strategy."""
    m = MemoryStore()
    m.record_attempt(_attempt(mechanism="show_a_correct_example"))
    assert m.is_repeat(SKILL, mechanism="show_a_correct_example") is True


def test_the_same_example_inside_a_new_approach_is_a_repeat() -> None:
    """Mechanism alone would miss this: a genuinely different teaching move
    that reuses the one example the learner has already failed on."""
    m = MemoryStore()
    m.record_attempt(
        _attempt(mechanism="show_a_correct_example", example_signature="factorial_of_5")
    )
    assert (
        m.is_repeat(SKILL, mechanism="repair_a_broken_one", example_signature="factorial_of_5")
        is True
    )


def test_the_same_text_reworded_is_a_repeat() -> None:
    """Text similarity catches the rewrite that changes both the recorded
    mechanism label and the example name but says the same thing."""
    m = MemoryStore()
    m.record_attempt(
        _attempt(
            mechanism="mech_a",
            example_signature="the base case stops the recursion before it calls itself again",
        )
    )
    assert (
        m.is_repeat(
            SKILL,
            mechanism="mech_b",
            text="the base case stops recursion before the function calls itself again",
        )
        is True
    )


def test_a_genuinely_different_approach_is_not_a_repeat() -> None:
    """The negative control, and the one that matters most.

    Without it, "detects repeats" could be satisfied by a check that calls
    everything a repeat -- which would block the engine from ever teaching.
    """
    m = MemoryStore()
    m.record_attempt(_attempt(mechanism="show_a_correct_example", example_signature="factorial"))
    assert (
        m.is_repeat(SKILL, mechanism="trace_the_call_stack", example_signature="countdown")
        is False
    )


def test_repeating_something_that_worked_is_allowed() -> None:
    """Retrieval practice IS repetition, on purpose. Treating success as a
    repeat would forbid the one approach known to work for this learner."""
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.SUCCESS, mechanism="show_a_correct_example"))
    assert m.is_repeat(SKILL, mechanism="show_a_correct_example") is False


def test_a_partial_result_still_blocks_a_plain_repeat() -> None:
    """Partial means it moved the learner and not far enough. Repeating it
    unchanged is the thing to avoid; varying it is the point."""
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.PARTIAL, mechanism="show_a_correct_example"))
    assert m.is_repeat(SKILL, mechanism="show_a_correct_example") is True


def test_memory_is_scoped_to_the_skill() -> None:
    """A failure on one subskill must not block the same move on another.

    Recursion's subskills come apart in practice -- tracing and writing are
    different skills -- so a mechanism that failed for one may be right for the
    next.
    """
    m = MemoryStore()
    m.record_attempt(_attempt(skill=OTHER, mechanism="show_a_correct_example"))
    assert m.is_repeat(SKILL, mechanism="show_a_correct_example") is False


# --------------------------------------------------------------------------
# The similarity measure itself
# --------------------------------------------------------------------------


def test_identical_text_scores_one() -> None:
    assert similarity("the base case stops it", "the base case stops it") == 1.0


def test_unrelated_text_scores_low() -> None:
    assert similarity("the base case stops the recursion", "pandas reads a csv file") < 0.2


def test_a_reworded_sentence_clears_the_threshold() -> None:
    """The case the threshold is calibrated for."""
    score = similarity(
        "a recursive function needs a base case or it never stops",
        "a recursive function will never stop without a base case",
    )
    assert score >= SAME_EXPLANATION, f"reworded repeat scored only {score:.2f}"


def test_two_different_explanations_of_one_topic_stay_below_the_threshold() -> None:
    """The other side of the calibration, and the reason the bar is not lower.

    Any two explanations of recursion share 'recursive', 'call', 'base', 'case'.
    If that alone crossed the bar, the engine could never teach the concept a
    second way.
    """
    score = similarity(
        "a recursive call creates a new frame with its own local variables",
        "check the base case first so the function has somewhere to stop",
    )
    assert score < SAME_EXPLANATION, f"distinct explanations collided at {score:.2f}"


def test_similarity_ignores_filler() -> None:
    """Noise words would otherwise inflate every comparison toward the
    threshold, which is how a calibrated bar quietly stops discriminating."""
    assert similarity("the base case", "a base case, really") >= 0.9


def test_similarity_is_symmetric() -> None:
    a, b = "the base case stops recursion", "recursion stops at the base case"
    assert similarity(a, b) == similarity(b, a)


def test_empty_text_is_not_similar_to_anything() -> None:
    assert similarity("", "the base case") == 0.0


# --------------------------------------------------------------------------
# Retrieval -- scoped, ordered, and bounded
# --------------------------------------------------------------------------


def test_a_strategy_that_failed_and_never_worked_is_marked_failed() -> None:
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.FAILURE, action=ActionKind.TEACH_BY_EXAMPLE))
    assert ActionKind.TEACH_BY_EXAMPLE in m.failed_strategies(SKILL)


def test_a_strategy_that_failed_once_but_usually_works_is_not_banned() -> None:
    """Banning on a single bad outcome throws away the approach that mostly
    works for this learner."""
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.FAILURE, action=ActionKind.TEACH_BY_EXAMPLE))
    m.record_attempt(_attempt(Outcome.SUCCESS, action=ActionKind.TEACH_BY_EXAMPLE))
    assert ActionKind.TEACH_BY_EXAMPLE not in m.failed_strategies(SKILL)


def test_a_partial_counts_as_traction_not_failure() -> None:
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.FAILURE, action=ActionKind.TRANSFER_CHALLENGE))
    m.record_attempt(_attempt(Outcome.PARTIAL, action=ActionKind.TRANSFER_CHALLENGE))
    assert ActionKind.TRANSFER_CHALLENGE not in m.failed_strategies(SKILL)


def test_successful_representations_are_recoverable() -> None:
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.SUCCESS, representation="call_stack_diagram"))
    m.record_attempt(_attempt(Outcome.FAILURE, representation="prose"))
    assert m.succeeded_with(SKILL) == frozenset({"call_stack_diagram"})


def test_retrieval_puts_failures_first() -> None:
    """A failure is the most decision-changing thing in the log: it removes an
    option. Ordering by recency would bury it under routine successes."""
    m = MemoryStore()
    m.record_attempt(_attempt(Outcome.SUCCESS, mechanism="s1"))
    m.record_attempt(_attempt(Outcome.SUCCESS, mechanism="s2"))
    m.record_attempt(_attempt(Outcome.FAILURE, mechanism="f1"))
    assert m.relevant(SKILL)[0].outcome is Outcome.FAILURE


def test_retrieval_is_bounded() -> None:
    """A decision context that grows without bound gets truncated by something
    that did not choose what to drop. Choosing here means the least relevant
    goes, not whatever happened to be last."""
    m = MemoryStore()
    for i in range(30):
        m.record_attempt(_attempt(Outcome.SUCCESS, mechanism=f"m{i}"))
    assert len(m.relevant(SKILL, limit=8)) == 8


def test_retrieval_does_not_leak_across_skills() -> None:
    m = MemoryStore()
    m.record_attempt(_attempt(skill=OTHER))
    assert m.relevant(SKILL) == ()


def test_an_empty_memory_answers_everything_safely() -> None:
    """The first interaction with a new learner hits every one of these, and a
    KeyError there would take down the whole first decision."""
    m = MemoryStore()
    assert m.attempts_on(SKILL) == ()
    assert m.failed_strategies(SKILL) == frozenset()
    assert m.succeeded_with(SKILL) == frozenset()
    assert m.representations_tried(SKILL) == frozenset()
    assert m.attempt_count(SKILL) == 0
    assert m.relevant(SKILL) == ()
    assert m.is_repeat(SKILL, mechanism="anything") is False
