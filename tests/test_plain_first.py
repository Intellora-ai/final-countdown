"""PLAIN-FIRST GATE — the plain idea comes before the name, and it must be usable.

WHY THIS EXISTS
---------------
A lesson that names a thing before the learner has the idea teaches nothing:
the name lands on an empty hook. Two separate failures produce that, and only
one of them is about jargon.

  1. TECHNICAL FIRST   "A fraction is a part of a whole."
                       The term arrives before anything it could attach to.

  2. CLEVER FIRST      "A fraction is not a division sum waiting to happen.
                       It is a count of parts you already made."
                       Every word is ordinary. It still fails, because the
                       learner must DECODE it before they can use it.

The second is the reason a banned-word list is not enough. Those two sentences
were written in a real session on 2026-08-25, by an assistant that had just
finished writing the rule against writing that way, and no word in them is
technical. The fix that only checks vocabulary passes them both.

Every case below is a PAIR — an input that must be refused and an input that
must be accepted. A checker asserted only to refuse is satisfied by
`return [violation]`, exactly as one asserted only to accept is satisfied by
`return []`. Both are vacuous.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.plain_first import Violation, check_heading, check_plain_block, codes_of

# Terms the learner has NOT met yet. Real lessons pass the learner's own list.
UNTAUGHT = ["fraction", "numerator", "denominator", "division", "quotient"]


# --------------------------------------------------------------------------- #
# 1. TECHNICAL TERM IN THE PLAIN BLOCK                                          #
# --------------------------------------------------------------------------- #

def test_technical_term_in_plain_block_is_refused():
    v = check_plain_block("A fraction is a part of a whole.", untaught=UNTAUGHT)
    assert "TECHNICAL_TERM" in codes_of(v)
    assert any("fraction" in x.evidence for x in v), (
        "the refusal must quote the offending word, not merely count it"
    )


def test_plain_block_without_technical_terms_is_accepted():
    v = check_plain_block("You cut a pizza into 4 pieces. You take 3.", untaught=UNTAUGHT)
    assert v == [], f"clean plain block was refused: {v}"


# --------------------------------------------------------------------------- #
# 2. THE CLEVER FAILURE — ordinary words, still undecodable                     #
# --------------------------------------------------------------------------- #

def test_metaphor_used_as_a_definition_is_refused():
    """The exact sentence written in the 2026-08-25 session. No technical words."""
    v = check_plain_block(
        "It is not a division sum waiting to happen.", untaught=[]
    )
    assert "METAPHOR_DEFINITION" in codes_of(v)
    assert any("waiting to" in x.evidence for x in v)


def test_abstract_noun_phrase_is_refused():
    """Also from that session. 'A count of parts' cannot be acted on."""
    v = check_plain_block("It is a count of parts you already made.", untaught=[])
    assert "ABSTRACT_NOUN" in codes_of(v)
    assert any("a count of" in x.evidence.lower() for x in v)


def test_the_plain_rewrite_of_those_sentences_is_accepted():
    """The user's own rewrite. Same meaning, and the learner can act on it."""
    v = check_plain_block(
        "It tells you how many parts you have out of the total parts.", untaught=[]
    )
    assert v == [], f"the plain rewrite was refused: {v}"


def test_nominalisation_is_refused():
    v = check_plain_block("Multiplication is the repetition of addition.", untaught=[])
    assert "ABSTRACT_NOUN" in codes_of(v)


def test_concrete_verb_version_is_accepted():
    v = check_plain_block("You add the same number again and again.", untaught=[])
    assert v == []


# --------------------------------------------------------------------------- #
# 3. LENGTH — a plain idea the learner cannot hold is not plain                 #
# --------------------------------------------------------------------------- #

def test_overlong_plain_block_is_refused():
    long_block = (
        "You cut a pizza into four pieces and then you take three of them "
        "and you look at what is left and you count the pieces you took "
        "and you compare that number with the number of pieces you cut."
    )
    v = check_plain_block(long_block, untaught=[])
    assert "TOO_LONG" in codes_of(v)


def test_short_plain_block_is_accepted():
    v = check_plain_block("You take 3 out of 4 pieces.", untaught=[])
    assert v == []


# --------------------------------------------------------------------------- #
# 4. THE HEADING — the cause no prompt change can reach                         #
# --------------------------------------------------------------------------- #

def test_heading_naming_the_term_is_refused():
    v = check_heading("Quadratic Equations", untaught=["quadratic", "equation"])
    assert "TECHNICAL_TERM" in codes_of(v)


def test_plain_question_heading_is_accepted():
    v = check_heading(
        "Why does a thrown ball come back down in a curve?",
        untaught=["quadratic", "equation"],
    )
    assert v == []


# --------------------------------------------------------------------------- #
# 5. NON-VACUITY — a checker that refuses nothing looks identical to clean text  #
# --------------------------------------------------------------------------- #

def test_checker_refuses_at_least_one_thing_per_code():
    """Every code must be reachable. A code that can never fire is decoration."""
    reachable = set()
    for text, untaught in [
        ("A fraction is a part of a whole.", UNTAUGHT),
        ("It is not a division sum waiting to happen.", []),
        ("It is a count of parts you already made.", []),
        ("word " * 40, []),
    ]:
        reachable |= set(codes_of(check_plain_block(text, untaught=untaught)))
    assert reachable == {
        "TECHNICAL_TERM",
        "METAPHOR_DEFINITION",
        "ABSTRACT_NOUN",
        "TOO_LONG",
    }, f"unreachable or unexpected codes: {reachable}"


def test_violation_carries_its_evidence():
    v = check_plain_block("A fraction is a part of a whole.", untaught=UNTAUGHT)
    assert isinstance(v[0], Violation)
    assert v[0].evidence, "a violation with no evidence cannot be acted on"
    assert v[0].fix, "a violation with no suggested fix is a complaint"


# --------------------------------------------------------------------------- #
# 6. HOLES FOUND BY MUTATION, NOT BY THINKING                                   #
# --------------------------------------------------------------------------- #
#
# Two mutants survived the first suite. Neither was a bad idea nobody had had —
# both were rules the code already implemented and no test ever exercised, which
# is the only kind of hole that stays invisible while the suite is green.
#
#   M2  `w == t or w.startswith(t)`  ->  `w == t`      SURVIVED
#       Stem matching was never tested. "Quadratic Equations" passes on the
#       exact match of "quadratic" alone, so the plural half did no work and
#       deleting it broke nothing. A heading reading only "Equations" would have
#       walked straight through.
#
#   M6  `len(sentences) > MAX_SENTENCES` -> `> 99`     SURVIVED
#       The long-block test trips the WORD cap, so the SENTENCE cap was never
#       reached. Three short sentences — every one of them plain — were accepted.
#
# These two tests exist because those mutants lived. That is the only licence
# this file recognises for adding to it.


def test_plural_of_an_untaught_term_is_refused():
    """M2's grave. Only the plural appears — no exact match anywhere."""
    v = check_heading("Equations", untaught=["equation"])
    assert "TECHNICAL_TERM" in codes_of(v), (
        "a plural walked through: stem matching is not being exercised"
    )


def test_singular_unrelated_word_is_still_accepted():
    """The pair. Stem matching must not swallow every word that starts alike."""
    v = check_heading("How high can you jump?", untaught=["equation"])
    assert v == [], f"stem matching over-matched: {v}"


def test_three_short_sentences_are_refused():
    """M6's grave. Under the word cap, over the sentence cap, every word plain."""
    text = "You cut it. You take some. You look at the rest."
    assert len(text.split()) < 25, "this case must not trip the word cap"
    v = check_plain_block(text, untaught=[])
    assert "TOO_LONG" in codes_of(v), (
        "three sentences accepted: the sentence cap is doing nothing"
    )


def test_two_short_sentences_are_accepted():
    """The pair. The cap must refuse three and allow two, not refuse everything."""
    v = check_plain_block("You cut it. You take some.", untaught=[])
    assert v == []
