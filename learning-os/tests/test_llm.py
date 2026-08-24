"""The model boundary, held to the one thing it exists to guarantee.

The failure this whole layer prevents: content that reads well, breaks its
contract, and ships -- because breaking a contract nobody checks looks exactly
like honouring one. Every test here is a way that could happen.

No test in this file reaches a network, and none reads an API key. That is not
incidental: a suite needing a live model is a suite that gets skipped when a key
expires, and the checks that stop running first are precisely these.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from learning_os.llm import (
    API_KEY_ENV,
    BLOCK_KINDS,
    DiagnosisKind,
    FailureMode,
    FakeLLMClient,
    GeneratedContent,
    InstructionContract,
    LLMClient,
    LLMUnavailable,
    SimplicityConstraints,
    Strategy,
    ViolationKind,
    api_key_present,
    is_repairable,
    is_usable,
    validate,
)
from learning_os.models.contracts import ActionKind

SKILL = "python.recursion.identify_base_case"


def _contract(**over: object) -> InstructionContract:
    base: dict[str, object] = {
        "target_skill": SKILL,
        "question": "Why does a recursive function need a base case?",
        "diagnosis": DiagnosisKind.CONCEPT_GAP,
        "strategy": Strategy.WORKED_EXAMPLE,
        "action": ActionKind.TEACH_BY_EXAMPLE,
        "success_evidence_required": "learner identifies the base case unaided",
    }
    base.update(over)
    return InstructionContract(**base)  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# The contract refuses to be self-contradictory
# --------------------------------------------------------------------------


def test_a_term_cannot_be_both_required_and_forbidden() -> None:
    """An unsatisfiable contract is a POLICY bug and must fail where policy is
    written.

    Left unchecked it surfaces later as a generation that cannot pass validation
    no matter what the model does, and reads as a model failure -- so the
    debugging starts in the wrong place entirely.
    """
    with pytest.raises(ValidationError, match="both required and forbidden"):
        _contract(required_terms=("base case",), forbidden_phrases=("Base Case",))


def test_a_skill_cannot_be_both_known_and_weak() -> None:
    """It would tell the model "build on this" and "this is broken" about one
    thing, and either response would be defensible."""
    with pytest.raises(ValidationError, match="contradicts itself"):
        _contract(known_prerequisites=(SKILL,), weak_subskills=(SKILL,))


def test_the_contract_is_frozen() -> None:
    """A generation step must not be able to relax its own constraints between
    being handed the contract and being checked against it."""
    c = _contract()
    with pytest.raises(ValidationError):
        c.strategy = Strategy.ANALOGY


def test_the_contract_refuses_an_unknown_field() -> None:
    """`extra="forbid"`. The field that would eventually be added is a styling
    one, and Law 3 says that field is a bug rather than a convenience."""
    with pytest.raises(ValidationError):
        _contract(colour="teal")


def test_the_atomicity_budget_defaults_to_one() -> None:
    """Defaults are what actually ship. One new concept, one idea, one example,
    one target -- the rule, not a suggestion."""
    s = SimplicityConstraints()
    assert s.max_new_concepts == 1
    assert s.max_new_ideas == 1
    assert s.max_primary_examples == 1
    assert s.max_cognitive_targets == 1


# --------------------------------------------------------------------------
# The fake: deterministic, offline, and able to fail on purpose
# --------------------------------------------------------------------------


def test_the_fake_satisfies_the_client_protocol() -> None:
    assert isinstance(FakeLLMClient(), LLMClient)


def test_the_same_contract_produces_identical_content() -> None:
    """Determinism is a property, not a shortcut.

    Without it a failing assertion about generated output cannot be told apart
    from sampling noise, and the response is to loosen the assertion until it
    stops failing -- which deletes the check rather than the bug.
    """
    c = _contract()
    assert FakeLLMClient().generate(c) == FakeLLMClient().generate(c)


def test_different_contracts_produce_different_content() -> None:
    """The negative control. A fake returning one constant would satisfy
    "deterministic" while testing nothing downstream."""
    a = FakeLLMClient().generate(_contract(strategy=Strategy.WORKED_EXAMPLE))
    b = FakeLLMClient().generate(_contract(strategy=Strategy.CONTRAST))
    assert a != b


def test_determinism_does_not_depend_on_the_hash_seed() -> None:
    """`hashlib`, not `hash()`.

    The builtin is randomised per process unless PYTHONHASHSEED is pinned, so a
    fake built on it produces different output locally than in CI -- and
    "works on my machine, differs in CI" is the most expensive nondeterminism
    to chase. Asserted through the fingerprint the note carries.
    """
    c = _contract()
    first = FakeLLMClient().generate(c).note
    assert first == FakeLLMClient().generate(c).note
    assert first.startswith("fake:worked_example:")


def test_every_strategy_can_be_generated_for() -> None:
    """A strategy with no skeleton raises KeyError at generation time -- during
    a lesson, for the learner. Cheap to prove here instead."""
    for strategy in Strategy:
        content = FakeLLMClient().generate(_contract(strategy=strategy))
        assert content.blocks, f"{strategy} produced nothing"


def test_every_generated_block_kind_is_one_the_canvas_renders() -> None:
    """The schema is `.strict()`, so one unknown kind refuses the WHOLE lesson,
    not just that block."""
    for strategy in Strategy:
        for kind, _ in FakeLLMClient().generate(_contract(strategy=strategy)).blocks:
            assert kind in BLOCK_KINDS, f"{strategy} emitted unrenderable {kind!r}"


@pytest.mark.parametrize(
    "mode",
    [FailureMode.TIMEOUT, FailureMode.REFUSAL, FailureMode.RATE_LIMIT],
)
def test_unavailability_raises_rather_than_returning_something_usable(
    mode: FailureMode,
) -> None:
    """Unavailable and unusable are different outcomes with different responses.

    Unavailable means retry or fall back to a non-generated intervention.
    Unusable means the contract was not honoured. Collapsing them forces the
    runtime to re-derive which happened from a message string.
    """
    with pytest.raises(LLMUnavailable):
        FakeLLMClient(failure=mode).generate(_contract())


def test_a_malformed_response_is_a_successful_call_with_no_content() -> None:
    """The failure a `try/except` around the call does not catch: the request
    succeeded and the result is unusable."""
    content = FakeLLMClient(failure=FailureMode.MALFORMED).generate(_contract())
    assert content.blocks == ()


def test_no_api_key_is_read_during_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    """The suite must run with no key configured, and must not change behaviour
    when one is."""
    monkeypatch.delenv(API_KEY_ENV, raising=False)
    assert api_key_present() is False
    without = FakeLLMClient().generate(_contract())

    monkeypatch.setenv(API_KEY_ENV, "sk-not-a-real-key")
    assert api_key_present() is True
    assert FakeLLMClient().generate(_contract()) == without


# --------------------------------------------------------------------------
# Validation -- the file that turns the contract from a prompt into a contract
# --------------------------------------------------------------------------


def test_obedient_content_passes() -> None:
    """The positive control, and the one that matters most.

    Without it, "the validator catches violations" could be satisfied by a
    validator that rejects everything -- which would block the engine from ever
    teaching.
    """
    c = _contract(required_terms=("base case", "recursion"))
    violations = validate(c, FakeLLMClient().generate(c))
    assert violations == []
    assert is_usable(violations) is True


def test_a_dropped_technical_term_is_caught() -> None:
    """The tempting move when a learner struggles: swap the technical term for
    something friendlier. The learner then has to unlearn it."""
    c = _contract(required_terms=("base case",))
    v = validate(c, GeneratedContent(blocks=(("prose", "it stops eventually"),)))
    assert [x.kind for x in v] == [ViolationKind.MISSING_REQUIRED_TERM]


def test_a_forbidden_simplification_is_caught_and_is_not_repairable() -> None:
    """Rewording will not fix it: the model reached for this because the
    contract's strategy led it there, so the same contract leads it there
    again. Retrying unchanged is the blind repeat section 46 forbids.
    """
    # `forbidden_tells`, not `forbidden_phrases`. This test passed under the old
    # code only because it used a short marker -- the shape a tell has. The real
    # domain supplies full instruction sentences, which never appear in prose, so
    # the mechanism was verified here on input production never produces.
    c = _contract(forbidden_tells=("recursion is just a loop",))
    v = validate(c, GeneratedContent(blocks=(("prose", "Recursion is just a loop."),)))
    assert v[0].kind is ViolationKind.FORBIDDEN_PHRASE
    assert v[0].repairable is False
    assert is_repairable(v) is False


def test_exceeding_the_concept_budget_is_caught() -> None:
    """Four concepts under a budget of one reads perfectly well and leaves the
    learner holding three things nobody taught them."""
    v = validate(
        _contract(),
        GeneratedContent(
            blocks=(("prose", "a"),),
            introduced_concepts=("a", "b", "c", "d"),
        ),
    )
    assert [x.kind for x in v] == [ViolationKind.TOO_MANY_CONCEPTS]


def test_the_concept_count_is_not_taken_from_the_model() -> None:
    """Self-report is evidence, not truth -- here as much as for a learner.

    Asking the model how many concepts it introduced is asking the thing being
    checked to do the checking. Under-reporting is the case worth catching, so
    this asserts a model claiming one concept while emitting four blocks is
    judged on the count, not the claim.
    """
    content = GeneratedContent(
        blocks=tuple(("prose", f"idea {i}") for i in range(6)),
        introduced_concepts=("just the one",),
    )
    kinds = [v.kind for v in validate(_contract(), content)]
    assert ViolationKind.TOO_MANY_BLOCKS in kinds
    assert ViolationKind.TOO_MANY_CONCEPTS not in kinds


def test_an_unrenderable_block_kind_is_caught_here_not_in_the_browser() -> None:
    """`validateLesson` would refuse it at the canvas edge, where the engine is
    no longer in the stack and the payload is all anyone can see."""
    v = validate(_contract(), GeneratedContent(blocks=(("hologram", "x"),)))
    assert v[0].kind is ViolationKind.UNKNOWN_BLOCK_KIND
    assert v[0].repairable is False


@pytest.mark.parametrize(
    "leak",
    ["This is step 2 of 5.", "Step 3:", "part 4", "2 of 7 done", "3/5 complete"],
)
def test_a_step_count_never_reaches_the_learner(leak: str) -> None:
    """The learner is never told how many steps remain.

    A count is a promise about a decision the engine has not made: the next
    intervention depends on evidence that does not exist yet, so "step 2 of 5"
    commits to a path length nothing can guarantee.
    """
    v = validate(_contract(), GeneratedContent(blocks=(("prose", leak),)))
    assert [x.kind for x in v] == [ViolationKind.STEP_COUNT_LEAKED]


def test_ordinary_numbers_are_not_mistaken_for_a_step_count() -> None:
    """The negative control the pattern most needs. A detector that fires on any
    digit would block most real teaching -- arithmetic, indices, line numbers."""
    ordinary = "factorial(5) is 120, and the base case returns 1 when n is 1."
    assert validate(_contract(), GeneratedContent(blocks=(("prose", ordinary),))) == []


def test_empty_content_reports_only_that() -> None:
    """Every other check would report the vacuous absence of content as its own
    violation, burying the single fact that matters."""
    c = _contract(required_terms=("base case", "recursion"))
    v = validate(c, GeneratedContent(blocks=()))
    assert [x.kind for x in v] == [ViolationKind.EMPTY]
    assert v[0].repairable is False


def test_all_violations_are_reported_not_just_the_first() -> None:
    """The caller's next move depends on the full set. One missing term is a
    rewrite; a missing term AND a blown budget AND a leaked count is a
    generation that went somewhere else entirely."""
    c = _contract(required_terms=("base case",))
    content = GeneratedContent(
        blocks=tuple(("prose", f"step {i} of 9") for i in range(6)),
        introduced_concepts=("a", "b", "c"),
    )
    kinds = {v.kind for v in validate(c, content)}
    assert kinds == {
        ViolationKind.MISSING_REQUIRED_TERM,
        ViolationKind.TOO_MANY_CONCEPTS,
        ViolationKind.TOO_MANY_BLOCKS,
        ViolationKind.STEP_COUNT_LEAKED,
    }


def test_any_violation_blocks_no_matter_how_small() -> None:
    """No severity threshold and no composite score. A score invites shipping
    the 92%, and content missing a technical term is not 92% correct -- it is
    incomplete while looking finished."""
    c = _contract(required_terms=("base case",))
    assert is_usable(validate(c, GeneratedContent(blocks=(("prose", "no term here"),)))) is False


def test_the_deliberate_constraint_violation_is_actually_caught() -> None:
    """The fake's failure mode has to produce output the validator REJECTS.

    If it did not, the repair path would be tested against content that was fine
    all along, and would appear to work while never having run.
    """
    c = _contract(required_terms=("base case",))
    content = FakeLLMClient(failure=FailureMode.CONSTRAINT_VIOLATION).generate(c)
    v = validate(c, content)
    assert is_usable(v) is False
    assert {x.kind for x in v} >= {
        ViolationKind.MISSING_REQUIRED_TERM,
        ViolationKind.TOO_MANY_CONCEPTS,
    }
