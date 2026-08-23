"""Ten measurements that were built, measured, and deleted.

WHY A TEST FILE AND NOT A DELETED BRANCH
----------------------------------------
Each of these looks obviously worth measuring. Structure, nesting, branching,
prerequisite gap, whether the answer contrasts against a confusable, whether it
is decomposed into sections -- every one is plausible, and every one would be
rebuilt by the next person who thinks about this for an hour.

They were built, run against 1534 real exchanges, and found to change nothing.
Deleting the code without recording the result would leave nothing between the
next author and the same fortnight.

WHAT SURVIVED, AND THE ONLY BAR THAT MATTERED
---------------------------------------------
A measurement earns its place by CHANGING A SENTENCE. Four did:

    question_type            picks the budget and the lead rule   5.4x spread
    word count vs budget     cut or do not cut                    1.94x n=774
    does sentence 1 answer   reorder or do not                    2.21x n=774
    length_signal            this conversation overrides the corpus

Ten did not.
"""

from __future__ import annotations

#: measurement -> (what it was supposed to change, what it measured)
#:
#: The middle column is always "nothing". That is the finding: these describe
#: the SHAPE of a response, and shape does not predict whether the reader
#: complained. Only how long it is for the question asked, and whether the
#: answer arrives first.
REJECTED: dict[str, tuple[str, str]] = {
    # Structural proxies for the spec's DAG features, measured on the response.
    "section_count": ("nothing", "fitted head lift +0.003 over majority"),
    "structure_depth": ("nothing", "fitted head lift +0.003 over majority"),
    "branching": ("nothing", "fitted head lift +0.003 over majority"),
    # The listener axis. Genuinely the spec's biggest hole, and still inert.
    "prereq_gap": ("nothing", "fitted head lift +0.003 over majority"),
    "already_told": ("nothing", "fitted head lift +0.003 over majority"),
    "novel_term_rate": ("nothing", "fitted head lift +0.003 over majority"),
    # Four of the six shape decisions, extracted from 1534 real responses.
    "contrasts": ("nothing", "25.1% vs 26.9% failure -- 1.07x, noise"),
    "step_by_step": ("nothing", "24.8% vs 26.8% failure -- 1.08x, noise"),
    "decomposed": ("nothing", "29.6% vs 23.5% failure -- 0.79x, HARMFUL"),
    "motivation_first": ("nothing", "n=18 of 1534 -- unfittable"),
}

#: The four that changed a sentence, with the effect that earned them.
KEPT: dict[str, str] = {
    "question_type": "5.4x spread in failure rate across kinds",
    "length_vs_budget": "howto 1.94x, compare 1.46x",
    "first_sentence_answers": "howto 2.21x n=774, status 1.72x n=342",
    "length_signal": "closed loop -- what they just said outranks the corpus",
}


def test_the_rejected_set_is_recorded_rather_than_forgotten() -> None:
    """Ten plausible measurements, each disproved on 1534 exchanges."""
    assert len(REJECTED) == 10
    assert all(purpose == "nothing" for purpose, _ in REJECTED.values())


def test_every_rejection_carries_the_number_that_killed_it() -> None:
    """A rejection with no measurement behind it is an opinion, and the next
    author is right to ignore an opinion."""
    for name, (_, evidence) in REJECTED.items():
        assert any(c.isdigit() for c in evidence), f"{name} was dropped without a number"


def test_decomposed_was_actively_harmful_not_merely_useless() -> None:
    """The most counter-intuitive result here, so it gets its own assertion.

    Headings and bullets FAILED MORE than plain prose: 29.6% against 23.5%.
    Structure feels like clarity and measured as the opposite.
    """
    assert "HARMFUL" in REJECTED["decomposed"][1]


def test_nothing_kept_and_rejected_at_once() -> None:
    """If a name appears in both, one of the two records is stale and a reader
    cannot tell which."""
    assert not set(KEPT) & set(REJECTED)


def test_the_survivors_are_outnumbered_by_the_dead() -> None:
    """The point of the exercise. Fourteen measurements built, four survived --
    and the four are all about LENGTH and ORDER, not about content or shape.
    """
    assert len(KEPT) == 4
    assert len(REJECTED) > len(KEPT)
