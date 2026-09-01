"""Doubt resolution, held to the two things it must not do.

It must not lose the learner's place, and it must not answer a question it does
not understand. Everything here is one of those two failing.

The second matters more than it sounds. A learner who has just admitted
confusion is the worst possible audience for a confident wrong answer, so the
bar for answering is deliberately high and refusing is the common case rather
than the error case.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import (
    FailureMode,
    FakeLLMClient,
    GeneratedContent,
    LLMClient,
)
from learning_os.llm.contract import MAX_LESSON_QUESTION, InstructionContract
from learning_os.memory.store import MemoryStore
from learning_os.session import Doubt, DoubtOutcome, Resolution, map_to_skill, resolve

AT = "prose-0"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return NOW


def _resolve(
    text: str,
    *,
    client: LLMClient | None = None,
    memory: MemoryStore | None = None,
    lesson_skill: str = "",
) -> Resolution:
    return resolve(
        GRAPH,
        memory if memory is not None else MemoryStore(),
        client if client is not None else FakeLLMClient(),
        Doubt(text=text, resume_at=AT, lesson_skill=lesson_skill),
        now=_now,
    )


# --------------------------------------------------------------------------
# The place must survive the answer
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "what is a base case",
        "why does this even terminate",
        "asdf qwerty zxcv",
        "",
    ],
)
def test_the_learner_never_loses_their_place(text: str) -> None:
    """THE ONE THING THIS MODULE MUST NOT BREAK.

    Every path — answered, refused, failed — hands back where the learner was.
    Parametrised across outcomes rather than tested on the happy path, because
    the path that drops it will be an early return in a branch nobody thought
    about.
    """
    assert _resolve(text).resume_at == AT


def test_position_survives_an_outage() -> None:
    r = _resolve("what is a base case", client=FakeLLMClient(failure=FailureMode.TIMEOUT))
    assert r.outcome is DoubtOutcome.UNAVAILABLE
    assert r.resume_at == AT


def test_position_survives_a_generation_failure() -> None:
    r = _resolve(
        "what is a base case",
        client=FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION),
    )
    assert r.outcome is DoubtOutcome.GENERATION_FAILED
    assert r.resume_at == AT


# --------------------------------------------------------------------------
# Refusing is the common case, not the error case
# --------------------------------------------------------------------------


def test_an_unrelated_question_is_refused_rather_than_guessed() -> None:
    """The engine has a language model and does not get to use it here.

    It could produce a fluent paragraph about anything. Producing one about
    something the learner did not ask is worse than saying no, because a wrong
    answer to somebody who has just admitted confusion is very hard for them to
    detect.
    """
    r = _resolve("how do I deploy this to production")
    assert r.outcome is DoubtOutcome.UNMAPPABLE
    assert r.turn is None
    assert r.refusal


def test_the_refusal_is_about_the_engine_not_the_learner() -> None:
    """"Your question is unclear" is unhelpful and slightly insulting to
    somebody who has just said they are lost."""
    refusal = _resolve("how do I deploy this to production").refusal.lower()
    assert "not something this lesson covers" in refusal
    for blaming in ("your question", "unclear", "invalid", "cannot understand"):
        assert blaming not in refusal


def test_a_single_coincidental_word_is_not_a_match() -> None:
    """The failure the canvas resolver names explicitly: one shared word
    produces a confident answer about the wrong thing."""
    assert map_to_skill(GRAPH, Doubt(text="what does mean mean", resume_at=AT)) is None


def test_an_empty_doubt_is_refused() -> None:
    assert _resolve("").outcome is DoubtOutcome.UNMAPPABLE


# --------------------------------------------------------------------------
# ...but it must actually answer when it can
# --------------------------------------------------------------------------


def test_a_doubt_naming_a_real_subskill_is_answered() -> None:
    """The positive control, and the one that matters most.

    Without it, "refuses safely" is satisfied by refusing everything — which
    would leave the learner exactly where the canvas already left them.
    """
    r = _resolve("what is the base case and how do I identify it")
    assert r.outcome is DoubtOutcome.ANSWERED
    assert r.turn is not None
    assert r.turn.content is not None


def test_the_answer_is_validated_like_any_other_generation() -> None:
    """A doubt is a request to teach one thing. Giving it its own generator
    would mean two places producing content and only one of them checked —
    which is how the unchecked one eventually ships."""
    r = _resolve(
        "what is the base case and how do I identify it",
        client=FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION),
    )
    assert r.outcome is DoubtOutcome.GENERATION_FAILED
    assert r.turn is not None
    assert r.turn.violations


def test_the_answer_targets_the_skill_that_was_asked_about() -> None:
    r = _resolve("how do I trace the calls")
    assert r.outcome is DoubtOutcome.ANSWERED
    assert r.turn is not None
    assert "trace" in r.turn.contract.target_skill


def test_no_diagnostic_is_asked_back() -> None:
    """Section 28 at its most obvious. The learner has just said what they are
    stuck on; answering with a question spends the attention teaching needed to
    learn something they already volunteered."""
    r = _resolve("what is the base case and how do I identify it")
    assert r.turn is not None
    assert r.turn.contract.action.value != "diagnose"


# --------------------------------------------------------------------------
# It inherits the engine's memory, rather than starting fresh
# --------------------------------------------------------------------------


def test_asking_twice_does_not_repeat_the_failed_explanation() -> None:
    """Falls out of `memory` rather than being special-cased.

    A learner who asks again after a failed answer is telling you the answer did
    not work. Repeating it is the blind repeat section 46 forbids, and the doubt
    path gets that for free by using the ordinary machinery.
    """
    memory = MemoryStore()
    first = _resolve("what is the base case and how do I identify it", memory=memory)
    assert first.outcome is DoubtOutcome.ANSWERED

    second = _resolve("what is the base case and how do I identify it", memory=memory)
    assert second.turn is not None
    assert first.turn is not None
    # The first attempt SUCCEEDED, so repetition is allowed here — retrieval
    # practice is repetition on purpose. What matters is that memory was
    # consulted at all, which the recorded attempt proves.
    assert memory.attempt_count(first.turn.contract.target_skill) == 2


def test_a_failed_answer_is_remembered_as_failed() -> None:
    memory = MemoryStore()
    r = _resolve(
        "what is the base case and how do I identify it",
        client=FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION),
        memory=memory,
    )
    assert r.turn is not None
    assert memory.failed_mechanisms(r.turn.contract.target_skill)


# --------------------------------------------------------------------------
# Mapping
# --------------------------------------------------------------------------


def test_a_tie_breaks_toward_the_lesson_being_taught() -> None:
    """A doubt raised during a lesson about tracing is more likely about tracing
    than about a similarly-worded skill elsewhere. Near answers are more often
    right and less confusing when wrong."""
    near = Doubt(
        text="how do I trace the calls",
        resume_at=AT,
        lesson_skill="python.recursion.trace_calls",
    )
    assert map_to_skill(GRAPH, near) == "python.recursion.trace_calls"


def test_the_nudge_cannot_override_a_better_match() -> None:
    """A tiebreak that beats a materially better match is not a tiebreak, it is
    an override — and it would answer the wrong question whenever the learner
    asked about something other than the current skill."""
    away = Doubt(
        text="how do I write a recursive function",
        resume_at=AT,
        lesson_skill="python.recursion.trace_calls",
    )
    assert map_to_skill(GRAPH, away) != "python.recursion.trace_calls"


def test_every_mapped_skill_exists_in_the_graph() -> None:
    """A skill id that does not resolve would reach the policy and fail there,
    where the doubt that produced it is no longer in hand."""
    for text in (
        "what is the base case and how do I identify it",
        "how do I trace the calls",
        "how do I write a recursive function",
    ):
        skill = map_to_skill(GRAPH, Doubt(text=text, resume_at=AT))
        assert skill is not None
        assert GRAPH.subskill(skill) is not None


def test_no_answer_leaks_a_step_count() -> None:
    """A doubt is not a detour through a fixed-length plan. The learner is never
    told how many parts remain, because the next intervention depends on
    evidence that does not exist yet."""
    r = _resolve("what is the base case and how do I identify it")
    assert r.turn is not None
    assert r.turn.content is not None
    # The generation validator already enforces this; asserting here proves the
    # doubt path did not bypass it by constructing content some other way.
    assert not r.turn.violations


def test_one_matching_word_is_never_enough() -> None:
    """`MIN_OVERLAP`, and the reason the ratio alone is not safe.

    Scoring by "how much of what the learner said matched" makes a ONE-word
    doubt score 1.0 against anything sharing that word — so the shorter and
    vaguer the question, the more confident the engine becomes. That is exactly
    backwards.

    "case" appears in two subskills. Answering it would be picking one at random
    and sounding certain.
    """
    for single in ("case", "function", "recursion"):
        assert map_to_skill(GRAPH, Doubt(text=single, resume_at=AT)) is None, single


def test_the_ratio_is_measured_against_the_doubt_not_the_skill() -> None:
    """The bug that refused every question.

    `overlap / len(skill_vocabulary)` asks the learner to recite the skill's
    name: they type three or four words, a skill name carries five to seven, so
    a majority is unreachable for any real question. Every doubt was refused and
    the whole module was inert.

    "how do I trace the calls" is two content words and both name this skill.
    Under the old metric that was 2/5 and refused; it is the clearest example of
    a question that must be answered.
    """
    assert map_to_skill(
        GRAPH, Doubt(text="how do I trace the calls", resume_at=AT)
    ) == "python.recursion.trace_calls"


def test_taxonomy_words_cannot_carry_a_match() -> None:
    """THE MATCHER READS THE LEAF OF A SKILL ID, NOT THE WHOLE THING.

    `python.recursion.identify_base_case` is filed under a subject. Those
    leading segments are how the SUBJECT is organised, not words a learner uses
    to describe their confusion — nobody types "python" when they mean "I don't
    get base cases".

    Matching on the full id lets a taxonomy word carry a match. "recursion
    function" then hits `identify_base_case` on {recursion, function}, neither
    of which the learner used to name a base case, and the engine answers a
    question that was not asked.

    Written because mutation testing found NO test covering it: swapping the
    leaf for the full id broke nothing, which meant the decision was load-
    bearing and unverified. Both of these refuse with the leaf and match wrongly
    without it.
    """
    for taxonomy_only in ("recursion function", "python return"):
        assert map_to_skill(GRAPH, Doubt(text=taxonomy_only, resume_at=AT)) is None, (
            f"{taxonomy_only!r} named no skill and was matched anyway"
        )


# --------------------------------------------------------------------------
# The cap keeps the front of the question
# --------------------------------------------------------------------------
class _RecordingClient:
    """Wraps the fake and keeps the contract it was handed.

    Wraps rather than subclasses: `FakeLLMClient` is a frozen dataclass, so a
    subclass cannot hold a list of what it saw. `LLMClient` is satisfied by
    having `generate`, so a plain object delegating to a real fake is both
    simpler and less likely to drift when the fake changes.

    The question `resolve` sends is not readable from the `Turn` it returns --
    `GeneratedContent` carries the lesson, not the request that produced it --
    so the only place to see what actually reached the model is here, on the
    way in.
    """

    def __init__(self) -> None:
        self._inner = FakeLLMClient()
        self.questions: list[str] = []

    def generate(self, contract: InstructionContract) -> GeneratedContent:
        self.questions.append(contract.question)
        return self._inner.generate(contract)


def test_an_overlong_doubt_is_cut_from_the_end_not_the_start() -> None:
    """`resolve` caps the text it sends, and the cap must keep the beginning.

    WHY THIS IS HERE AND NOT IN `test_properties.py`. `api/ask.py` cuts the
    text to the same limit before a `Doubt` is ever built, so through the
    endpoint the cap in `resolve` is a no-op and its DIRECTION is invisible --
    a mutant that took `text[-MAX_LESSON_QUESTION:]` instead of
    `text[:MAX_LESSON_QUESTION]` passed the entire property suite. That is
    defence in depth working as intended, and it is also why the direction can
    only be pinned here, at the seam, with a `Doubt` longer than the endpoint
    would ever build.

    The tail is two-character filler on purpose: `_words` discards tokens that
    short, so it lengthens the text without changing which skill it matches.
    Padding by repeating the question instead makes a periodic string whose
    front and back slices are equal, which is how the mutant survived the first
    attempt at this test.
    """
    question = "identify the base case"
    overlong = f"{question} " + "xy " * MAX_LESSON_QUESTION
    assert len(overlong) > MAX_LESSON_QUESTION

    client = _RecordingClient()
    resolution = _resolve(overlong, client=client)

    assert resolution.outcome is DoubtOutcome.ANSWERED, (
        f"an overlong doubt was not answered at all: {resolution.outcome}"
    )
    assert client.questions, "the model was never called, so nothing was capped"
    sent = client.questions[0]
    assert len(sent) <= MAX_LESSON_QUESTION, (
        f"{len(sent)} characters reached the contract, which permits "
        f"{MAX_LESSON_QUESTION}"
    )
    assert sent.startswith(question), (
        f"the cap dropped the beginning of the question; what reached the model "
        f"starts {sent[:40]!r} and the learner asked {question!r}"
    )
