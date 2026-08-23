"""Changing how it talks, held to what was measured rather than what sounds right.

The failure this whole package exists to escape is a threshold somebody set by
judgement and nobody could ever check. So the tests that matter most here are
not "does the classifier work" -- they are the ones that fail if a future edit
quietly reintroduces an invented number.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from learning_os.form.corpus import Exchange, read_session
from learning_os.form.labels import COST, Label, failure_rate, label_turn, loss
from learning_os.form.request import (
    PROVISIONAL_BUDGET,
    QuestionType,
    classify,
    length_ratio,
    word_count,
)
from learning_os.form.shape import (
    FITTED_BUDGET,
    LEADS_WITH_ANSWER,
    MIN_SEPARATION,
    SEPARATION,
    Move,
    budget_for,
    shape_for,
)

# --------------------------------------------------------------------------
# The labels ARE the loss. Everything else is worthless without them.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("turn", "expected"),
    [
        ("EXPLAIN SIMPLFY", Label.TOO_LONG),
        ("just say it", Label.TOO_LONG),
        ("tl;dr", Label.TOO_LONG),
        ("write a proper long ass msg", Label.TOO_SHORT),
        ("elaborate", Label.TOO_SHORT),
        ("go deeper on that", Label.TOO_SHORT),
        ("MERGE", Label.ACT),
        ("do it", Label.ACT),
        ("thenfine.", Label.ACCEPT),
        ("ok", Label.ACCEPT),
        ("now build the parser", Label.NEUTRAL),
    ],
)
def test_real_turns_get_the_label_they_earned(turn: str, expected: Label) -> None:
    """Every one of these is lifted from this project's own transcripts."""
    assert label_turn(turn) is expected


def test_a_repeated_question_is_a_content_failure() -> None:
    """RE_ASK is the expensive label: the answer did not land and the whole
    exchange is spent again."""
    assert label_turn("plz speed up github", "speed up github") is Label.RE_ASK


def test_a_new_question_is_not_a_repeat() -> None:
    """The negative control. Without it "detects repeats" is satisfied by
    something that calls everything a repeat."""
    assert label_turn("what is a function", "merge the branch") is not Label.RE_ASK


def test_a_length_complaint_beats_a_repeat() -> None:
    """"explain simply" is BOTH a re-ask and a length complaint. The length
    reading is the actionable one -- the content landed well enough to be judged
    too long -- so order in `label_turn` is a design decision, not an accident.
    """
    assert label_turn("explain simplify", "explain simplify") is Label.TOO_LONG


def test_acceptance_is_matched_whole_and_never_as_a_substring() -> None:
    """"ok" inside "okay but that broke everything" is not an acceptance, and
    scoring it as one turns a complaint into a success."""
    assert label_turn("ok") is Label.ACCEPT
    assert label_turn("ok but that broke everything") is not Label.ACCEPT


def test_a_content_failure_costs_more_than_a_form_failure() -> None:
    """A form miss wastes part of a turn. A content miss wastes the exchange and
    the user pays for the question twice."""
    assert COST[Label.RE_ASK] > COST[Label.TOO_LONG]
    assert COST[Label.RE_ASK] > COST[Label.TOO_SHORT]


def test_acting_on_a_response_is_the_only_negative_cost() -> None:
    """A loss that can only be reduced by avoiding complaint is minimised by
    saying nothing at all."""
    assert COST[Label.ACT] < 0
    assert all(COST[x] >= 0 for x in Label if x is not Label.ACT)


def test_silence_is_scored_as_neither() -> None:
    """Forcing NEUTRAL into success or failure makes the metric report the
    conversation's chattiness instead of its quality."""
    assert COST[Label.NEUTRAL] == 0
    assert COST[Label.ACCEPT] == 0
    assert failure_rate([Label.NEUTRAL] * 10) == 0.0


def test_the_loss_can_go_negative() -> None:
    """Otherwise there is no way to be BETTER than inoffensive."""
    assert loss([Label.ACT, Label.ACT]) < 0


# --------------------------------------------------------------------------
# The request axis -- the feature the old spec had none of
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("turn", "expected"),
    [
        ("whats the status of the engine", QuestionType.STATUS),
        ("is it merged", QuestionType.STATUS),
        ("how many tests pass", QuestionType.NUMBER),
        ("why is the build failing", QuestionType.DEBUG),
        ("sqlite vs jsonl for this", QuestionType.COMPARE),
        ("how should we structure the parser", QuestionType.DESIGN),
        ("explain what a function is", QuestionType.HOWTO),
    ],
)
def test_the_question_kind_is_read_from_the_request(turn: str, expected: str) -> None:
    assert classify(turn) is expected


def test_the_same_topic_can_be_two_different_requests() -> None:
    """THE POINT OF THIS AXIS. Same subject, opposite right answers -- which no
    property of the subject can distinguish."""
    assert classify("is the parser done") is not classify("how should we design the parser")


def test_length_is_judged_against_the_kind_of_question() -> None:
    """900 words is excellent for a design question and a failure for "is it
    merged". A raw word count cannot say that; a ratio can."""
    draft = "word " * 300
    assert length_ratio(draft, "is it merged") > length_ratio(draft, "how should we design this")


def test_word_count_is_defined_once() -> None:
    """Two definitions of a word would make every fitted budget wrong by a
    constant factor nobody could locate."""
    assert word_count("one two three") == 3
    assert word_count("") == 0


# --------------------------------------------------------------------------
# The honesty gates -- these are the tests that matter
# --------------------------------------------------------------------------


def test_a_budget_is_refused_where_length_was_measured_not_to_separate() -> None:
    """THE FINDING. For status questions the complained-about responses are 42
    words and the quiet ones 43 -- 0.98x. A budget there would be a rule with no
    effect, which is worse than no rule because it looks like a fix.
    """
    assert SEPARATION[QuestionType.STATUS] < MIN_SEPARATION
    assert budget_for(QuestionType.STATUS) is None


def test_a_budget_is_refused_where_there_were_too_few_samples() -> None:
    """`number` (n=11) and `design` (n=17) are absent rather than estimated. A
    plausible default is indistinguishable from a measured one to a later
    reader, and that confusion is the whole disease."""
    assert QuestionType.NUMBER not in FITTED_BUDGET
    assert QuestionType.DESIGN not in FITTED_BUDGET
    assert budget_for(QuestionType.NUMBER) is None
    assert budget_for(QuestionType.DESIGN) is None


def test_the_budgets_that_survive_are_the_ones_that_separated() -> None:
    assert budget_for(QuestionType.HOWTO) == 280
    assert budget_for(QuestionType.COMPARE) == 340
    assert SEPARATION[QuestionType.HOWTO] >= MIN_SEPARATION


def test_every_fitted_budget_carries_its_separation_score() -> None:
    """A number with no quality attached cannot be re-fitted or distrusted
    later -- it just becomes folklore."""
    assert set(FITTED_BUDGET) == set(SEPARATION)


def test_the_provisional_budgets_are_not_the_fitted_ones() -> None:
    """`PROVISIONAL_BUDGET` is a marked placeholder. If a future edit copies it
    into `FITTED_BUDGET`, invented numbers become measured ones silently."""
    overlap = {k: v for k, v in PROVISIONAL_BUDGET.items() if FITTED_BUDGET.get(k) == v}
    assert not overlap, f"provisional values leaked into the fitted table: {overlap}"


# --------------------------------------------------------------------------
# The shape decision
# --------------------------------------------------------------------------


def test_a_status_question_is_told_to_lead_with_the_answer() -> None:
    """Measured 1.97x: burying the verdict draws 19.7% too-long against 10.0%
    when it leads."""
    assert Move.LEAD_WITH_THE_ANSWER in shape_for("is it merged").moves


def test_a_design_question_is_never_told_to_cut() -> None:
    """No trustworthy budget exists for design, so no cut can be justified.
    Cutting anyway would be acting on a number nobody fitted."""
    long_draft = "word " * 2000
    assert Move.CUT_TO_BUDGET not in shape_for("how should we design this", long_draft).moves


def test_an_overlong_howto_answer_is_told_to_cut() -> None:
    assert Move.CUT_TO_BUDGET in shape_for("explain recursion", "word " * 400).moves


def test_a_short_answer_is_left_alone() -> None:
    """The negative control. "tells you to cut" is satisfied by something that
    always says cut."""
    assert Move.CUT_TO_BUDGET not in shape_for("explain recursion", "short answer").moves


def test_what_they_just_said_outranks_the_corpus() -> None:
    """The closed loop. Someone who has just said "just say it" has given
    evidence about this moment that no corpus median outweighs."""
    shape = shape_for("explain recursion", "short", asked_for_less=2)
    assert Move.THEY_ASKED_FOR_LESS in shape.moves


def test_the_two_length_signals_cannot_both_fire() -> None:
    """They are opposite instructions. Emitting both would leave the caller to
    invent a tie-break, which is where an unvalidatable rule gets added."""
    shape = shape_for("explain recursion", "short", asked_for_less=3, asked_for_more=3)
    assert Move.THEY_ASKED_FOR_LESS not in shape.moves
    assert Move.THEY_ASKED_FOR_MORE not in shape.moves


def test_every_move_comes_with_its_evidence() -> None:
    """A move with no traceable measurement is a hand-set rule wearing
    evidence's clothes."""
    shape = shape_for("is it merged", "word " * 500)
    assert shape.moves
    assert shape.reasons
    assert any(char.isdigit() for reason in shape.reasons for char in reason)


# --------------------------------------------------------------------------
# Reading transcripts -- where a parsing bug looks like a labelling bug
# --------------------------------------------------------------------------


def _write(path: Path, entries: list[dict[str, object]]) -> None:
    import json

    path.write_text("\n".join(json.dumps(e) for e in entries), encoding="utf-8")


def test_injected_text_is_not_counted_as_a_user_turn(tmp_path: Path) -> None:
    """Hook and reminder text is identical every turn and would dominate any
    frequency count -- an unfiltered corpus is a different measurement, not a
    bigger one."""
    path = tmp_path / "s.jsonl"
    _write(path, [
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "an answer"}]}},
        {"type": "user", "message": {"content": "<system-reminder>noise</system-reminder>"}},
        {"type": "user", "message": {"content": "a real question"}},
    ])
    exchanges = read_session(path)
    assert len(exchanges) == 1
    assert exchanges[0].user_text == "a real question"


def test_the_response_paired_with_a_turn_is_the_one_before_it(tmp_path: Path) -> None:
    """An off-by-one here reverses the meaning of every labelled example."""
    path = tmp_path / "s.jsonl"
    _write(path, [
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "FIRST"}]}},
        {"type": "user", "message": {"content": "too long"}},
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "SECOND"}]}},
        {"type": "user", "message": {"content": "ok"}},
    ])
    exchanges = read_session(path)
    assert exchanges[0].response == "FIRST"
    assert exchanges[0].label is Label.TOO_LONG
    assert exchanges[1].response == "SECOND"


def test_a_truncated_final_line_does_not_stop_the_read(tmp_path: Path) -> None:
    """Unlike a learner's journal, a partial transcript is the normal state of a
    session still being written."""
    path = tmp_path / "s.jsonl"
    path.write_text('{"type":"user","message":{"content":"hi"}}\n{"type":"user","mess',
                    encoding="utf-8")
    assert len(read_session(path)) == 1


def test_a_tool_call_with_no_visible_text_is_not_a_response(tmp_path: Path) -> None:
    """Measuring the length of something the user never saw."""
    path = tmp_path / "s.jsonl"
    _write(path, [
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash"}]}},
        {"type": "user", "message": {"content": "what happened"}},
    ])
    assert read_session(path)[0].response == ""


def test_an_exchange_reports_its_response_length() -> None:
    exchange = Exchange(
        session="s", index=1, user_text="q", response="one two three",
        previous_user_text=None, label=Label.NEUTRAL,
    )
    assert exchange.response_words == 3


# --------------------------------------------------------------------------
# The rule that was nearly shipped universally, and the evidence against it
# --------------------------------------------------------------------------


def test_leading_with_the_answer_is_applied_where_it_was_measured_to_help() -> None:
    """howto is the strongest effect in the whole corpus: 2.21x at n=774."""
    assert Move.LEAD_WITH_THE_ANSWER in shape_for("explain recursion").moves
    assert Move.LEAD_WITH_THE_ANSWER in shape_for("is it merged").moves


def test_it_is_never_applied_to_debug_where_it_measured_harmful() -> None:
    """THE REJECTED HYPOTHESIS.

    Leading with a verdict on a debug question measured 0.41x -- 53.7% too-long
    against 22.1%. A verdict word ANSWERS "is it merged" and RESTATES "why is it
    failing"; the same opening does opposite work.

    Shipping the rule universally would have made debug answers 2.4x worse.
    """
    assert Move.LEAD_WITH_THE_ANSWER not in shape_for("why is the build failing").moves
    assert QuestionType.DEBUG not in LEADS_WITH_ANSWER


def test_it_is_not_applied_where_it_measured_no_effect() -> None:
    """compare came out 0.98x. A rule that does nothing still costs the reader
    attention, so no-effect is a reason to omit it rather than a free win."""
    assert Move.LEAD_WITH_THE_ANSWER not in shape_for("sqlite vs jsonl").moves
    assert QuestionType.COMPARE not in LEADS_WITH_ANSWER


def test_every_type_the_rule_fires_for_carries_its_effect_and_sample() -> None:
    """An effect size with no n behind it is folklore. Both travel with the rule
    so a later corpus can re-fit it and see which way it moved."""
    for kind, (effect, n) in LEADS_WITH_ANSWER.items():
        assert effect > 1.0, f"{kind.value} is listed as helping but measured {effect}"
        assert n >= 100, f"{kind.value} was fitted on only {n} samples"
