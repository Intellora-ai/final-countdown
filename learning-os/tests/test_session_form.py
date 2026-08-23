"""One conversation, remembered — and the limits of what that fixes.

`compose` knew how to obey the signals and had no way to learn them. `Session`
harvests them off real replies and has no opinion about shape. Neither is useful
alone, and the join between them is what makes a long conversation different
from forty independent ones.
"""

from __future__ import annotations

from learning_os.form.labels import Label
from learning_os.form.session import FORGOTTEN, HALF_LIFE, Session

ANSWER = "A function is a rule: one input, exactly one output."
SUPPORT = [f"Support {i}: about twenty words of genuine content so the budget has "
           f"something real to bite on when deciding what survives." for i in range(12)]


def _session() -> Session:
    return Session()


# --------------------------------------------------------------------------
# The loop actually closes
# --------------------------------------------------------------------------


def test_a_complaint_shapes_the_next_reply() -> None:
    """THE JOIN. Before this the complaint existed only in the transcript and
    never reached the writer."""
    s = _session()
    first = s.reply("explain what a function is", ANSWER, SUPPORT)
    s.hear("tl;dr")
    second = s.reply("explain what a graph is", ANSWER, SUPPORT)

    assert second.budget is not None and first.budget is not None
    assert second.budget < first.budget
    assert second.words < first.words


def test_the_signals_are_derived_never_supplied() -> None:
    """`asked_for_less` was a number a caller passed, so it was whatever the
    caller believed rather than what the person said."""
    s = _session()
    s.reply("explain what a function is", ANSWER, SUPPORT)
    assert s.asked_for_less == 0
    s.hear("just say it")
    assert s.asked_for_less >= 1


def test_saying_they_did_not_understand_reverses_the_compression() -> None:
    """AGAINST THE INSTINCT, AND MEASURED.

    Shortening after a stated confusion failed 29.3% against 18.4% for not
    shortening. "Too long" means too much for the question; this means too
    little landed.
    """
    s = _session()
    s.reply("explain what a function is", ANSWER, SUPPORT)
    s.hear("shorter")
    tight = s.reply("explain a graph", ANSWER, SUPPORT)
    s.hear("i did not understand")
    opened = s.reply("explain a graph again", ANSWER, SUPPORT)

    assert tight.budget is not None
    assert opened.budget is None, "confusion must suppress the budget"
    assert opened.words > tight.words


def test_confusion_outranks_an_earlier_request_for_brevity() -> None:
    """A person who asked for short and then said they did not follow it has
    given the more recent and more specific signal."""
    s = _session()
    s.reply("q1", ANSWER, SUPPORT)
    for _ in range(3):
        s.hear("shorter")
        s.reply("q", ANSWER, SUPPORT)
    s.hear("i dont get it")
    assert s.asked_for_less >= 1, "the brevity requests are still on the record"
    assert s.reply("q", ANSWER, SUPPORT).budget is None


def test_confusion_does_not_persist_beyond_the_next_turn() -> None:
    """Carrying it forward turns a correction into a permanent setting."""
    s = _session()
    s.reply("q1", ANSWER, SUPPORT)
    s.hear("i did not understand")
    assert s.reply("q2", ANSWER, SUPPORT).budget is None
    s.hear("ok")
    assert s.reply("q3", ANSWER, SUPPORT).budget is not None


# --------------------------------------------------------------------------
# Decay, so an old instruction is escapable
# --------------------------------------------------------------------------


def test_an_old_complaint_fades() -> None:
    """Without decay one early "shorter" pins every later reply to half budget,
    and the person has to fight their own past instruction."""
    s = _session()
    s.reply("q0", ANSWER, SUPPORT)
    s.hear("shorter")
    immediately = s.asked_for_less

    for i in range(int(HALF_LIFE) * 3):
        s.reply(f"q{i}", ANSWER, SUPPORT)
        s.hear("thanks")
    assert s.asked_for_less < immediately


def test_a_recent_complaint_outweighs_an_old_one() -> None:
    s = _session()
    s.reply("q0", ANSWER, SUPPORT)
    s.hear("shorter")
    for i in range(12):
        s.reply(f"q{i}", ANSWER, SUPPORT)
        s.hear("thanks")
    faded = s.asked_for_less
    s.hear("shorter")
    assert s.asked_for_less > faded


def test_decay_has_no_cliff() -> None:
    """A fixed window makes a complaint nine turns ago count zero while one
    eight turns ago counts fully — an artefact nobody can justify."""
    assert 0.0 < FORGOTTEN < 1.0
    assert HALF_LIFE > 1.0


# --------------------------------------------------------------------------
# What it measures, and what it cannot
# --------------------------------------------------------------------------


def test_an_unanswered_reply_is_not_counted_as_a_success() -> None:
    """A turn whose outcome is unknown is genuinely different from one that went
    fine. Collapsing them scores every unanswered reply as a win."""
    s = _session()
    s.reply("q", ANSWER, SUPPORT)
    assert s.turns[-1].label is None
    assert s.failure_rate == 0.0
    assert s.loss == 0.0


def test_the_session_reports_what_it_has_cost() -> None:
    s = _session()
    s.reply("q1", ANSWER, SUPPORT)
    s.hear("tl;dr")
    s.reply("q2", ANSWER, SUPPORT)
    s.hear("i did not understand")
    assert s.loss > 0
    assert s.failure_rate == 1.0


def test_acting_on_a_reply_lowers_the_cost() -> None:
    """Otherwise the loss can only be reduced by silence."""
    s = _session()
    s.reply("q1", ANSWER, SUPPORT)
    s.hear("merge it")
    assert s.turns[-1].label is Label.ACT
    assert s.loss < 0


def test_it_does_not_claim_to_detect_a_false_statement() -> None:
    """STATED AS A TEST because the request that produced this module asked for
    long sessions "without hallucinations", and half of that is out of reach.

    Every label here measures whether a reply LANDED. A confident wrong answer
    the reader accepts scores ACCEPT — correct for this instrument, wrong by any
    standard that matters. Detecting a false claim needs a domain verifier,
    which is what `verifiers/` is for.
    """
    s = _session()
    s.reply("what is 2 + 2", "It is 5.", [])
    s.hear("ok")
    assert s.turns[-1].label is Label.ACCEPT
    assert s.failure_rate == 0.0
