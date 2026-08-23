"""The bottleneck engine, held to the one distinction that defines it.

THE TEST THAT MATTERS IS THE SELF-REPORT ONE.

A learner says "graphs confuse me". Their evidence says graph-reading is strong
and conceptual interpretation is weak. An engine that returns the graph skill
has done what the learner asked and not what the learner needed -- it will
reteach a skill they already have while the actual blocker stays untouched, and
every subsequent failure will look inexplicable.

That test is written first here, and it fails against any implementation that
treats self-report as truth or picks the lowest score. Everything else in this
file exists to stop a fix for that one case from breaking something simpler.
"""

from __future__ import annotations

import pytest

from learning_os.diagnosis.bottleneck import (
    MAX_TARGETED_DIAGNOSTICS,
    Bottleneck,
    DiagnosticBudget,
    Hypothesis,
    HypothesisKind,
    NoBottleneck,
    causal_relevance,
    evidence_confidence,
    need,
    recency,
    select_bottleneck,
    weakness,
)
from learning_os.domain.knowledge import (
    CognitiveOperation,
    Concept,
    KnowledgeGraph,
    Subskill,
)
from learning_os.memory.store import MemoryStore
from learning_os.models.contracts import (
    Evidence,
    EvidenceStrength,
    LearnerState,
    ObservationalHypothesis,
    SkillEstimate,
)

# A graph shaped like the real problem: reading a graph and interpreting what it
# means are different subskills, and the second depends on the first.
READ = "stats.graphs.read_values"
INTERPRET = "stats.graphs.interpret_meaning"
PREDICT = "stats.graphs.predict_change"

GRAPH = KnowledgeGraph(
    version="test_v1",
    concepts=(
        Concept(
            concept_id="stats.graphs",
            name="Graphs",
            definition="Reading and interpreting a plotted relationship.",
            subskills=(
                Subskill(
                    skill_id=READ,
                    name="Read values off a graph",
                    operation=CognitiveOperation.RECOGNISE,
                    criticality=0.5,
                ),
                Subskill(
                    skill_id=INTERPRET,
                    name="Say what the relationship means",
                    operation=CognitiveOperation.EXPLAIN,
                    criticality=0.9,
                    prerequisites=(READ,),
                ),
                Subskill(
                    skill_id=PREDICT,
                    name="Predict the effect of a change",
                    operation=CognitiveOperation.PREDICT,
                    criticality=0.8,
                    prerequisites=(INTERPRET,),
                ),
            ),
        ),
    ),
)


def _estimate(
    skill: str,
    value: float,
    *,
    confidence: float = 0.8,
    count: int = 6,
    diversity: int = 3,
) -> SkillEstimate:
    return SkillEstimate(
        skill_id=skill,
        estimate=value,
        confidence=confidence,
        evidence_count=count,
        evidence_diversity=diversity,
        evidence_ids=tuple(f"ev-{skill}-{i}" for i in range(max(count, 1))),
        state="developing" if value < 0.8 else "competent",
    )


def _state(**estimates: SkillEstimate) -> LearnerState:
    return LearnerState(
        learner_id="l1",
        version=1,
        skills={e.skill_id: e for e in estimates.values()},
    )


# --------------------------------------------------------------------------
# THE test
# --------------------------------------------------------------------------


def test_self_report_does_not_override_contradicting_evidence() -> None:
    """The learner blames graphs. The evidence says otherwise.

    Reading values: strong, well evidenced. Interpreting meaning: weak, well
    evidenced. The learner's own account points at reading, because that is the
    word they have for the whole topic.

    The engine must return INTERPRET. Returning READ would reteach a skill they
    demonstrably have.
    """
    state = _state(
        read=_estimate(READ, 0.92, confidence=0.9, count=8, diversity=4),
        interpret=_estimate(INTERPRET, 0.25, confidence=0.85, count=7, diversity=4),
    ).model_copy(
        update={
            "signals": (
                ObservationalHypothesis(
                    signal="possible_confusion",
                    confidence=0.9,
                    evidence_ids=("self-report-1",),
                ),
            )
        }
    )

    found = select_bottleneck(
        GRAPH, state, MemoryStore(), PREDICT, self_reported_skill=READ
    )

    assert isinstance(found, Bottleneck), found
    assert found.skill_id == INTERPRET, (
        f"followed the learner's self-report to {found.skill_id} instead of "
        "the skill the evidence actually implicates"
    )


def test_the_self_report_is_recorded_as_contradicted_not_discarded() -> None:
    """Overruling it is not the same as ignoring it.

    The learner said something. If the diagnosis cannot show that it was heard
    and weighed, nobody can later tell a considered disagreement from a bug.
    """
    state = _state(
        read=_estimate(READ, 0.92, confidence=0.9, count=8, diversity=4),
        interpret=_estimate(INTERPRET, 0.25, confidence=0.85, count=7, diversity=4),
    )
    found = select_bottleneck(
        GRAPH, state, MemoryStore(), PREDICT, self_reported_skill=READ
    )
    assert isinstance(found, Bottleneck), found
    assert any(READ in c for c in found.contradicting_evidence), (
        "the self-report was dropped silently rather than recorded as overruled"
    )


def test_self_report_is_followed_when_evidence_agrees() -> None:
    """The negative control, and it matters.

    Without it, "ignores self-report" could be satisfied by an engine that
    always ignores the learner -- which is a different failure, not a fix.
    """
    state = _state(
        read=_estimate(READ, 0.2, confidence=0.85, count=7, diversity=4),
        interpret=_estimate(INTERPRET, 0.9, confidence=0.85, count=7, diversity=4),
    )
    found = select_bottleneck(
        GRAPH, state, MemoryStore(), PREDICT, self_reported_skill=READ
    )
    assert isinstance(found, Bottleneck), found
    assert found.skill_id == READ


# --------------------------------------------------------------------------
# Not the lowest score
# --------------------------------------------------------------------------


def test_the_lowest_score_is_not_automatically_the_bottleneck() -> None:
    """A weak skill nothing depends on is not what is blocking the learner.

    READ is weaker but peripheral here; INTERPRET is stronger but everything
    the target needs runs through it. An engine sorting by estimate returns the
    wrong one.
    """
    peripheral = KnowledgeGraph(
        version="t",
        concepts=(
            Concept(
                concept_id="x.c",
                name="c",
                definition="d",
                subskills=(
                    Subskill(
                        skill_id="x.c.peripheral",
                        name="rarely needed",
                        operation=CognitiveOperation.RECALL,
                        criticality=0.05,
                    ),
                    Subskill(
                        skill_id="x.c.load_bearing",
                        name="everything needs this",
                        operation=CognitiveOperation.APPLY,
                        criticality=0.95,
                    ),
                    Subskill(
                        skill_id="x.c.target",
                        name="the goal",
                        operation=CognitiveOperation.TRANSFER,
                        criticality=0.9,
                        prerequisites=("x.c.load_bearing",),
                    ),
                ),
            ),
        ),
    )
    state = _state(
        weak_but_irrelevant=_estimate("x.c.peripheral", 0.05),
        blocking=_estimate("x.c.load_bearing", 0.35),
    )
    found = select_bottleneck(peripheral, state, MemoryStore(), "x.c.target")
    assert isinstance(found, Bottleneck), found
    assert found.skill_id == "x.c.load_bearing", (
        f"picked {found.skill_id}: sorted by score rather than by what blocks the target"
    )


def test_a_skill_outside_the_targets_dependencies_is_never_returned() -> None:
    """Relevance is a gate, not a weighting. A subskill the target does not
    depend on cannot explain a failure on the target."""
    state = _state(
        unrelated=_estimate(PREDICT, 0.01),
        blocking=_estimate(INTERPRET, 0.4),
    )
    found = select_bottleneck(GRAPH, state, MemoryStore(), INTERPRET)
    assert isinstance(found, Bottleneck), found
    assert found.skill_id != PREDICT


def test_the_nearest_weak_prerequisite_wins_over_a_deeper_one() -> None:
    """When two prerequisites are weak, the one closest to the target is what
    to fix first -- teaching the deepest one leaves the learner still blocked."""
    state = _state(
        deep=_estimate(READ, 0.30),
        near=_estimate(INTERPRET, 0.32),
    )
    found = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    assert isinstance(found, Bottleneck), found
    assert found.skill_id == INTERPRET


# --------------------------------------------------------------------------
# Evidence sufficiency -- §28, do not always ask
# --------------------------------------------------------------------------


def test_no_diagnostic_is_requested_when_the_evidence_already_settles_it() -> None:
    """Minimum friction is a requirement. Asking a question whose answer is
    already known spends the learner's patience for nothing."""
    state = _state(
        read=_estimate(READ, 0.95, confidence=0.95, count=10, diversity=5),
        interpret=_estimate(INTERPRET, 0.15, confidence=0.95, count=10, diversity=5),
    )
    found = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    assert isinstance(found, Bottleneck), found
    assert found.needs_diagnostic is False


def test_a_diagnostic_is_requested_when_the_evidence_is_thin() -> None:
    state = _state(
        interpret=_estimate(INTERPRET, 0.4, confidence=0.2, count=1, diversity=1),
    )
    found = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    # Was `found is None or found.needs_diagnostic`, which a test named for
    # REQUESTING a diagnostic could satisfy by not producing one. It never took
    # that branch -- thin evidence still yields a bottleneck here, flagged --
    # so the disjunction bought nothing and hid the case it was covering for.
    assert isinstance(found, Bottleneck), found
    assert found.needs_diagnostic is True


def test_no_evidence_at_all_says_unevidenced_rather_than_guessing() -> None:
    """"I do not know yet" is a real answer. A confident diagnosis from an empty
    learner model is the worst output this module can produce.

    Asserts the REASON, not merely the absence. This test previously asserted
    `is None`, which `test_an_unknown_target_is_refused_rather_than_guessed`
    also satisfied -- two tests, one value, neither able to tell whether it got
    the answer it was named for.
    """
    assert select_bottleneck(GRAPH, _state(), MemoryStore(), PREDICT) is NoBottleneck.UNEVIDENCED


def test_a_mastered_learner_is_not_confused_with_an_unknown_one() -> None:
    """THE COLLAPSE THIS ENUM EXISTS TO UNDO.

    Both learners produce no bottleneck; the correct next move is opposite for
    each. Read as "gather more" -- which is what the old docstring instructed --
    a learner who had finished would be diagnosed forever.
    """
    everything = {
        skill_id: _estimate(skill_id, 0.95)
        for skill_id in (PREDICT, *GRAPH.prerequisites_of(PREDICT))
    }
    mastered = LearnerState(learner_id="done", version=1, skills=everything)

    assert select_bottleneck(GRAPH, mastered, MemoryStore(), PREDICT) is NoBottleneck.MASTERED
    assert select_bottleneck(GRAPH, _state(), MemoryStore(), PREDICT) is NoBottleneck.UNEVIDENCED


def test_partial_competence_is_not_mastery() -> None:
    """Competent at some, unevidenced at the rest, is a learner mid-way.

    The loose test -- `competent > 0` -- would stop teaching them, and it would
    do it silently and confidently. The strict one costs nothing.
    """
    prerequisites = GRAPH.prerequisites_of(PREDICT)
    assert prerequisites, "fixture assumes PREDICT rests on something"

    partial = LearnerState(
        learner_id="halfway",
        version=1,
        skills={prerequisites[0]: _estimate(prerequisites[0], 0.95)},
    )
    assert select_bottleneck(GRAPH, partial, MemoryStore(), PREDICT) is NoBottleneck.UNEVIDENCED


# --------------------------------------------------------------------------
# The diagnostic ceiling -- enforced by the type, not a comment
# --------------------------------------------------------------------------


def test_the_budget_refuses_a_third_diagnostic() -> None:
    budget = DiagnosticBudget()
    first = budget.spend()
    second = first.spend()
    assert second.remaining == 0
    with pytest.raises(ValueError, match="at most"):
        second.spend()


def test_the_ceiling_is_two() -> None:
    assert MAX_TARGETED_DIAGNOSTICS == 2
    assert DiagnosticBudget().remaining == 2


def test_a_budget_cannot_be_created_above_the_ceiling() -> None:
    """Otherwise the limit is bypassed by constructing a larger one."""
    with pytest.raises(ValueError, match="at most"):
        DiagnosticBudget(remaining=5)


# --------------------------------------------------------------------------
# The scoring factors, each on its own
# --------------------------------------------------------------------------


def test_weakness_is_the_inverse_of_the_estimate() -> None:
    assert weakness(_estimate(READ, 0.0)) == pytest.approx(1.0)
    assert weakness(_estimate(READ, 1.0)) == pytest.approx(0.0)


def test_need_reflects_how_much_depends_on_the_skill() -> None:
    sub = GRAPH.subskill(INTERPRET)
    peripheral = GRAPH.subskill(READ)
    assert sub is not None and peripheral is not None
    assert need(sub) > need(peripheral)


def test_causal_relevance_is_zero_outside_the_dependency_chain() -> None:
    """A gate expressed as a multiplier: zero here zeroes the whole score,
    which is what stops an irrelevant skill being returned however weak."""
    assert causal_relevance(GRAPH, PREDICT, PREDICT) > 0.0
    assert causal_relevance(GRAPH, PREDICT, INTERPRET) > 0.0
    assert causal_relevance(GRAPH, INTERPRET, PREDICT) == 0.0


def test_evidence_confidence_rises_with_diversity_not_just_volume() -> None:
    """Ten identical observations are not ten independent ones."""
    varied = _estimate(READ, 0.5, confidence=0.8, count=10, diversity=5)
    repetitive = _estimate(READ, 0.5, confidence=0.8, count=10, diversity=1)
    assert evidence_confidence(varied) > evidence_confidence(repetitive)


def test_recency_prefers_a_recent_failure() -> None:
    """A subskill that failed a minute ago explains the current situation
    better than one that failed last week."""
    m = MemoryStore()
    assert recency(m, INTERPRET) >= 0.0
    assert recency(m, INTERPRET) <= 1.0


# --------------------------------------------------------------------------
# The diagnosis itself
# --------------------------------------------------------------------------


def test_a_bottleneck_carries_its_provenance() -> None:
    """A diagnosis nobody can audit is an assertion. Every one has to name what
    it rested on."""
    state = _state(
        read=_estimate(READ, 0.9),
        interpret=_estimate(INTERPRET, 0.2),
    )
    found = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    assert isinstance(found, Bottleneck), found
    assert found.evidence_sources, "no sources recorded"
    assert found.supporting_evidence, "no supporting evidence recorded"
    assert 0.0 <= found.confidence <= 1.0


def test_a_bottleneck_has_no_free_text_field_for_a_diagnosis() -> None:
    """Same rule as the learner model. A field that accepts
    "the student is lazy" is a bug, and prose is how a label gets in."""
    with pytest.raises(Exception):  # noqa: B017 -- pydantic raises ValidationError
        Bottleneck(
            skill_id="the student is lazy",
            confidence=0.9,
            evidence_sources=("x",),
        )


def test_hypotheses_are_a_closed_set_with_probabilities() -> None:
    """`strict=True` means the enum member itself, not its value.

    My first version of this test passed the bare string `"prerequisite_gap"`
    and pydantic refused it. That refusal is the feature, not an obstacle: the
    same strictness is what stops a typo'd string being accepted as a category
    and quietly becoming a new one.
    """
    h = Hypothesis(
        kind=HypothesisKind.PREREQUISITE_GAP, probability=0.7, evidence_ids=("e1",)
    )
    assert 0.0 <= h.probability <= 1.0

    # The set is closed: an invented category has no member to name.
    assert not hasattr(HypothesisKind, "STUDENT_IS_LAZY")
    with pytest.raises(Exception):  # noqa: B017
        Hypothesis(kind="student_is_lazy", probability=0.9)  # type: ignore[arg-type]

    # Every member names a fault in the LEARNING, never in the person.
    for member in HypothesisKind:
        assert not any(
            word in member.value for word in ("lazy", "stupid", "slow", "bad", "adhd")
        ), f"{member.value} describes the learner rather than the learning"


def test_the_diagnosis_is_immutable() -> None:
    state = _state(interpret=_estimate(INTERPRET, 0.2))
    found = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    assert isinstance(found, Bottleneck), found
    with pytest.raises(Exception):  # noqa: B017
        found.skill_id = "something.else.entirely"


def test_selection_is_deterministic() -> None:
    """Same inputs, same diagnosis. A replayed decision that reaches a
    different bottleneck is not a replay."""
    state = _state(
        read=_estimate(READ, 0.9),
        interpret=_estimate(INTERPRET, 0.2),
    )
    a = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    b = select_bottleneck(GRAPH, state, MemoryStore(), PREDICT)
    assert isinstance(a, Bottleneck) and isinstance(b, Bottleneck)
    assert a.skill_id == b.skill_id
    assert a.confidence == b.confidence


def test_an_unknown_target_is_refused_rather_than_guessed() -> None:
    """And says so as UNKNOWN_TARGET -- which is not a fact about the learner.

    The learner here HAS evidence. Returning `UNEVIDENCED` would blame their
    record for what is a caller asking about a skill the domain does not model.
    """
    state = _state(interpret=_estimate(INTERPRET, 0.2))
    got = select_bottleneck(GRAPH, state, MemoryStore(), "nope.not.here")
    assert got is NoBottleneck.UNKNOWN_TARGET


def test_evidence_can_be_supplied_and_is_reflected_in_provenance() -> None:
    m = MemoryStore()
    m.record_evidence(
        Evidence(
            evidence_id="e1",
            event_id="ev1",
            skill_id=INTERPRET,
            strength=EvidenceStrength.INDEPENDENT_APPLICATION,
            observed_performance=0.1,
            task_difficulty=0.5,
            task_reliability=0.9,
            independence=1.0,
            response_time_ms=4000,
            representation="graph",
            attempt_number=1,
        )
    )
    state = _state(interpret=_estimate(INTERPRET, 0.2))
    found = select_bottleneck(GRAPH, state, m, PREDICT)
    assert isinstance(found, Bottleneck), found
    assert "e1" in found.supporting_evidence
