"""Properties that must hold for EVERY input, not for the four we thought of.

WHY THIS FILE EXISTS
====================
Measured 2026-09-01: of 74 Python test files in this repository, 2 used
`@given`. Everything else asserted that a specific input produces a specific
output.

That ratio is the mechanical cause of the hardcoding this repository keeps
finding in itself, and it is worth being precise about why, because the usual
explanation -- that whoever wrote the code was careless -- is wrong and leads to
useless fixes like adding another rule to CLAUDE.md.

An example-based test says:

    answer('{"text": "why does recursion need a base case?"}')  ->  a lesson

The CHEAPEST code that passes it is:

    if question == "why does recursion need a base case?": return LESSON

A lookup table. The test cannot tell that apart from a real implementation,
because the test only ever asks about inputs the implementer could read in
advance. So the hardcoded version is not a lapse -- it is the correct answer to
the question the test actually asked. Writing "be general" in a style guide does
not change what the test rewards, which is why fifteen laws in CLAUDE.md and a
25,000-word-per-turn hook did not stop it.

A property test asks a different question:

    for ANY text at all, `answer` returns a document and never raises

The inputs are generated fresh at run time, so no implementation can have seen
them. A lookup table cannot pass. Generality stops being a rule somebody is
asked to follow and becomes the only thing that works.

WHAT IS ASSERTED HERE, AND WHY EACH ONE IS UNIVERSAL
====================================================
Every property below is taken from a promise the code already makes in its own
docstrings -- `answer` says "Never raises", `_read` says a traceback must never
reach the learner -- and none of them was tested as a promise about ALL inputs.

These hold for every provider, so they run on the deterministic fake and need no
credential. That is not the offline trap this repository fell into elsewhere:
the claim being checked is "the engine cannot be made to crash or leak", which
is provider-independent by construction. Whether the TEACHING is real is a
different claim, and it is checked in `features/` against a real model.
"""

from __future__ import annotations

import json
import re
from typing import Any

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from learning_os.api.ask import MAX_QUESTION, answer
from learning_os.domain.python_recursion import GRAPH

#: Enough examples to find the shapes a hand-written case never contains --
#: lone surrogates, control characters, nested quotes -- without turning the
#: suite into something people switch off. Deadline disabled because the fake
#: still walks the whole engine and a slow first example is not a failure.
PROPERTY_SETTINGS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)

#: What a stack trace looks like. None of it may ever reach a learner.
#:
#: Taken from `features/steps/tutor_steps.py`, which asserts the same thing for
#: a handful of chosen questions. The difference is the quantifier: there, for
#: four questions somebody thought of; here, for any text hypothesis can build.
TRACEBACK_TELLS = (
    "Traceback (most recent call last)",
    'File "',
    "  at ",
    # THE NAMES OF THINGS INSIDE THE PROGRAM.
    #
    # Found by running this suite against a real defect rather than reasoned
    # about: a question the endpoint accepted but the contract rejected came
    # back to the learner as `engine_error` carrying the literal text
    # "ValidationError: 1 validation error for InstructionContract". No
    # traceback, no path, so every tell above missed it -- and it is worse than
    # either, because it is the shape of a document the learner is supposed to
    # read. A leak does not need a stack to be a leak.
    "ValidationError",
    "validation error for",
    "pydantic",
    "InstructionContract",
    "Traceback",
)

#: An absolute path in an answer tells a stranger the layout of the machine, and
#: is the other half of what a leaked traceback gives away.
#: `\\` in a raw string is ONE literal backslash, which is what `C:\Users` has.
#: It was `\\\\` -- two -- so the Windows alternative could never match and P3
#: was only ever checking the Unix shapes.
PATH_TELL = re.compile(r"(/Users/|/home/|[A-Za-z]:\\)")


# --------------------------------------------------------------------------
# THE VACUITY FIX.
#
# P4, P5 and P6 below all guard on `if isinstance(lesson, dict)`. Fed
# `st.text()`, every generated question failed `map_to_skill` and came back
# `unmappable` -- so the guard was never true, the interesting half of each
# property never executed, and three tests passed by never running. Measured,
# not assumed: `answer` was called for 24 real questions and the branch was
# reached 24 times, and for arbitrary text it was reached zero times.
#
# Questions are derived from the graph's own subskill names rather than
# hard-coded here. A subskill renamed in the domain renames the question that
# reaches it, so this cannot rot into a list of strings that no longer map.
# --------------------------------------------------------------------------
ASKABLE: tuple[str, ...] = tuple(
    sub.name
    for concept in GRAPH.concepts
    for sub in concept.subskills
)

#: A question the engine can actually answer.
MAPPABLE = st.sampled_from(ASKABLE).flatmap(
    lambda name: st.sampled_from((name, f"{name}?", f"How do I {name[0].lower()}{name[1:]}?"))
)

#: Over `MAX_QUESTION` characters, still mappable, and NOT periodic.
#:
#: THE PADDING IS THE POINT, AND THE FIRST VERSION OF IT WAS WRONG. Padding by
#: repeating the question made a periodic string, and the front `[:200]` of a
#: periodic string can equal its back `[-200:]`. A mutant that truncated from
#: the wrong end therefore passed: the test could not tell the two apart
#: because its own input could not.
#:
#: `_words` keeps only tokens longer than two characters, so a two-character
#: filler is invisible to `map_to_skill` -- the match score is identical with
#: any amount of it. That buys length without dilution, and puts the real
#: question at the FRONT only, where a wrong-end cut loses it entirely.
OVERSIZED_MAPPABLE = st.sampled_from(ASKABLE).map(
    lambda name: name + " " + "xy " * MAX_QUESTION
)


def _strings(document: Any) -> list[str]:
    """Every string anywhere in the document, however deeply nested.

    Checking only the top level would let a leak ride out inside a lesson block,
    which is exactly where generated prose lives.
    """
    if isinstance(document, str):
        return [document]
    if isinstance(document, dict):
        return [s for value in document.values() for s in _strings(value)]
    if isinstance(document, list):
        return [s for item in document for s in _strings(item)]
    return []


# --------------------------------------------------------------------------
# P1  It never raises. For anything. That is what the docstring promises.
# --------------------------------------------------------------------------
@PROPERTY_SETTINGS
@given(st.text())
def test_never_raises_on_any_text(raw: str) -> None:
    """`answer` is documented "Never raises". Held to it for arbitrary input.

    This covers what no example list contains: lone surrogates, NUL bytes,
    unbalanced braces, strings that are valid JSON of the wrong type. A crash
    here is a blank panel for a learner and a 500 with a stack trace for whoever
    is running the canvas.
    """
    document = answer(raw)
    assert isinstance(document, dict), f"answer returned {type(document).__name__}"


# --------------------------------------------------------------------------
# P2  Whatever comes back is a document a program can read.
# --------------------------------------------------------------------------
@PROPERTY_SETTINGS
@given(st.text())
def test_always_a_serialisable_document_naming_its_outcome(raw: str) -> None:
    """The bridge is stdout. A document that will not serialise is a blank panel.

    `main` does `json.dumps(answer(...))`, so a value json cannot encode turns
    into an exception AFTER the engine believed it had succeeded -- the failure
    lands in the transport, where the reason is gone.
    """
    document = answer(raw)
    json.dumps(document)  # must not raise
    outcome = document.get("outcome")
    assert isinstance(outcome, str) and outcome, (
        f"a document with no outcome cannot be acted on by any caller: {document!r}"
    )


# --------------------------------------------------------------------------
# P3  It never shows a learner the inside of the program.
# --------------------------------------------------------------------------
@PROPERTY_SETTINGS
@given(st.text())
def test_never_leaks_internals(raw: str) -> None:
    """No traceback, no machine path, for ANY input.

    `features/` asserts this for four hand-picked questions. The interesting
    inputs for a leak are precisely the ones nobody picks -- the malformed ones
    that reach an error path -- so the quantifier is the whole value here.
    """
    document = answer(raw)
    for text in _strings(document):
        for tell in TRACEBACK_TELLS:
            assert tell not in text, (
                f"a learner was shown {tell!r} for input {raw!r}\nin: {text[:200]!r}"
            )
        leak = PATH_TELL.search(text)
        assert leak is None, (
            f"an answer carried a filesystem path ({leak.group(0)!r}) for input "
            f"{raw!r}\nin: {text[:200]!r}"
        )


# --------------------------------------------------------------------------
# P4  Answered or refused. Never both, never neither.
# --------------------------------------------------------------------------
@PROPERTY_SETTINGS
@given(st.one_of(MAPPABLE, st.text(min_size=1).filter(lambda s: s.strip())))
def test_answered_xor_refused(question: str) -> None:
    """A refusal carrying a lesson is an invention wearing a refusal.

    The wording is `features/tutor.feature`'s own. It asserts it for one
    question; this asserts it for every question, which is what the sentence
    actually claims.
    """
    document = answer(json.dumps({"text": question, "learner_id": "prop"}))

    if document.get("outcome") == "answered":
        assert document.get("lesson"), "an answered outcome with no lesson in it"
        assert not document.get("refusal"), (
            f"answered AND refused at once: {document.get('refusal')!r}"
        )
    else:
        assert str(document.get("refusal", "")).strip(), (
            f"outcome {document.get('outcome')!r} with no reason given -- a "
            f"refusal that teaches nothing"
        )
        assert not document.get("lesson"), (
            "a refusal carrying a lesson is the invention, wearing a refusal"
        )


# --------------------------------------------------------------------------
# P5  A huge question cannot become a huge prompt.
# --------------------------------------------------------------------------
@PROPERTY_SETTINGS
@given(st.one_of(OVERSIZED_MAPPABLE, st.text(min_size=MAX_QUESTION + 1, max_size=MAX_QUESTION * 4)))
def test_an_oversized_question_is_capped_not_refused(question: str) -> None:
    """`MAX_QUESTION` exists because the engine is charged per token.

    A cap that is only tested with one long string is a cap tested at one point.
    The property is that NO input, however long, survives past the ceiling --
    and that hitting it is a truncation rather than a crash or a silent 500.
    """
    document = answer(json.dumps({"text": question, "learner_id": "prop"}))
    assert isinstance(document, dict)
    lesson = document.get("lesson")
    if isinstance(lesson, dict) and isinstance(lesson.get("question"), str):
        assert len(lesson["question"]) <= MAX_QUESTION, (
            f"a {len(question)}-character question reached the model as "
            f"{len(lesson['question'])} characters; MAX_QUESTION is {MAX_QUESTION}"
        )
        # A cap that only has to make the text SHORTER is satisfied by any
        # truncation, including one that drops the beginning or cuts to a
        # different length elsewhere. What it must actually produce is the
        # front of what was asked.
        assert lesson["question"] == question.strip()[:MAX_QUESTION].strip(), (
            f"capping changed the question rather than shortening it:\n"
            f"  asked   {question.strip()[:MAX_QUESTION].strip()[-60:]!r}\n"
            f"  became  {lesson['question'][-60:]!r}"
        )


# --------------------------------------------------------------------------
# P6  The answer is to the question that was asked.
# --------------------------------------------------------------------------
@PROPERTY_SETTINGS
@given(
    st.one_of(
        MAPPABLE,
        OVERSIZED_MAPPABLE,
        st.text(min_size=1, max_size=MAX_QUESTION).filter(lambda s: s.strip()),
    )
)
def test_a_lesson_answers_the_question_it_was_given(question: str) -> None:
    """One learner must never receive another's lesson.

    `features/` checks this across twelve concurrent students with four fixed
    questions -- so it can only catch a mix-up between those four. Here the
    question is arbitrary, which catches the case where the engine answers from
    anything other than what it was handed.
    """
    document = answer(json.dumps({"text": question, "learner_id": "prop"}))
    lesson = document.get("lesson")
    if isinstance(lesson, dict) and isinstance(lesson.get("question"), str):
        # `.strip()` on the RIGHT only, and only at the end: slicing at the cap
        # can land on a space, and a lesson title with a trailing space is not
        # a wrong answer. Nothing else about the text may differ.
        assert lesson["question"] == question.strip()[:MAX_QUESTION].strip(), (
            f"asked {question.strip()[:80]!r} and was answered "
            f"{lesson['question'][:80]!r}"
        )


# --------------------------------------------------------------------------
# P7  The guard that stops P4-P6 from ever passing vacuously again.
# --------------------------------------------------------------------------
def test_the_answered_branch_is_reachable() -> None:
    """At least one question must actually produce a lesson.

    THE BUG THIS EXISTS FOR, WHICH WAS REAL AND SHIPPED GREEN. P4, P5 and P6
    each do their real work inside `if isinstance(lesson, dict)`. Fed only
    `st.text()`, not one generated question ever mapped to a subskill, so every
    one of them returned `unmappable`, the guard was never entered, and three
    property tests reported success having asserted nothing at all. The suite
    was green and the branch had never executed.

    A test that CAN only pass is worth less than no test, because it also
    occupies the place where a real one would go. This one cannot pass
    vacuously: it fails if the engine stops being able to answer anything,
    which is the exact condition that made the others hollow.

    It is deliberately not a hypothesis test. The claim is about this
    environment -- can the engine, as configured here, answer at all -- and it
    should cost one call and fail on the first CI run where the answer is no.
    """
    answered = [
        question
        for question in ASKABLE
        if isinstance(
            answer(json.dumps({"text": question, "learner_id": "canary"})).get("lesson"), dict
        )
    ]

    assert answered, (
        "no question derived from the graph's own subskill names produced a "
        "lesson, so every `if lesson:` in this file is dead and the properties "
        "guarded by it are asserting nothing. Either map_to_skill no longer "
        "matches its own vocabulary, or the provider cannot teach here.\n"
        f"tried {len(ASKABLE)} questions: {list(ASKABLE)}"
    )
