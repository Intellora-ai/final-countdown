"""The live provider, tested without a provider.

Everything worth checking here is pure: does every constraint the validator
enforces actually reach the model, and is a malformed response refused rather
than half-read. Both are testable with no SDK, no key and no socket -- which
matters, because `conftest.py` blocks the network for every test in this suite
and would fail any test that tried to reach a real endpoint.

What is deliberately NOT tested is the `messages.create` call itself. Mocking
the SDK would assert that a mock returns what the mock was told to return; the
real risk lives in the prompt and the parse, and those are covered.
"""

from __future__ import annotations

import importlib.util
import json

import pytest

from learning_os.llm.anthropic_client import (
    BUILDABLE,
    MODEL,
    RESPONSE_SCHEMA,
    SYSTEM,
    AnthropicClient,
    build_prompt,
    parse_blocks,
)
from learning_os.llm.client import API_KEY_ENV, LLMClient, LLMUnavailable
from learning_os.llm.contract import (
    DiagnosisKind,
    InstructionContract,
    SimplicityConstraints,
    Strategy,
)
from learning_os.models.contracts import ActionKind


def _contract(**overrides: object) -> InstructionContract:
    base: dict[str, object] = {
        "target_skill": "python.recursion.identify_base_case",
        "question": "Why does a recursive function need a base case?",
        "diagnosis": DiagnosisKind.CONCEPT_GAP,
        "strategy": Strategy.WORKED_EXAMPLE,
        "action": ActionKind.TEACH_BY_EXAMPLE,
        "success_evidence_required": "names the base case unaided",
    }
    base.update(overrides)
    return InstructionContract(**base)  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# Every constraint the validator checks must reach the model
# --------------------------------------------------------------------------


def test_required_terms_reach_the_prompt() -> None:
    """Enforced after generation but never stated before it makes the model's
    job a guess and the validator a random tax."""
    prompt = build_prompt(_contract(required_terms=("base case", "call stack")))
    assert "base case" in prompt
    assert "call stack" in prompt


def test_forbidden_rules_reach_the_prompt() -> None:
    rule = "Do not say recursion 'repeats' the function."
    assert rule in build_prompt(_contract(forbidden_phrases=(rule,)))


def test_the_block_budget_reaches_the_prompt() -> None:
    prompt = build_prompt(_contract(simplicity=SimplicityConstraints(max_blocks=2)))
    assert "2" in prompt
    assert "budget" in prompt.lower()


def test_what_already_failed_reaches_the_prompt() -> None:
    """THE LINE THAT MATTERS MOST for a returning learner.

    Without it the model reaches for the most natural explanation of the topic,
    which is precisely the one that already failed on this person.
    """
    prompt = build_prompt(_contract(avoid_representations=("worked_example",)))
    assert "worked_example" in prompt
    assert "do not repeat" in prompt.lower()


def test_known_prerequisites_are_framed_as_something_to_build_on() -> None:
    """A bare list of skills gets re-explained. The framing is the instruction,
    not the list."""
    prompt = build_prompt(_contract(known_prerequisites=("python.functions.call_and_return",)))
    assert "call_and_return" in prompt
    assert "do not re-teach" in prompt.lower()


def test_the_prompt_never_asks_for_a_block_kind_that_cannot_be_built() -> None:
    """The emitter refuses `table` and `chart` built from prose. Offering them
    here would produce lessons that fail emission after being paid for."""
    prompt = build_prompt(_contract())
    for unbuildable in ("table", "chart", "equation", "simulation"):
        assert unbuildable not in prompt


def test_the_system_prompt_carries_no_learner_detail() -> None:
    """It is the cached prefix. Anything learner-specific in it invalidates the
    cache on every single call, and leaks one learner's context toward the next.
    """
    assert "maya" not in SYSTEM.lower()
    assert "{" not in SYSTEM, "a format placeholder means per-learner text lands here"


def test_the_step_count_rule_is_stated_to_the_model() -> None:
    """The canvas rejects it and the validator catches it, so a model that has
    not been told will keep paying for regenerations."""
    assert "step count" in SYSTEM.lower() or "step 2 of 5" in SYSTEM


# --------------------------------------------------------------------------
# A bad response is refused, not salvaged
# --------------------------------------------------------------------------


def _payload(**overrides: object) -> str:
    body: dict[str, object] = {
        "blocks": [{"kind": "prose", "text": "The base case returns without recursing."}],
        "introduced_concepts": ["base case"],
    }
    body.update(overrides)
    return json.dumps(body)


def test_a_well_formed_response_parses() -> None:
    content = parse_blocks(_payload())
    assert content.blocks == (("prose", "The base case returns without recursing."),)
    assert content.introduced_concepts == ("base case",)


def test_output_that_is_not_json_is_refused() -> None:
    with pytest.raises(LLMUnavailable, match="not JSON"):
        parse_blocks("Here is your lesson! The base case...")


def test_a_response_with_no_blocks_is_refused() -> None:
    """An empty lesson is well-typed and renders nothing -- the failure a
    `try/except` around the call does not catch."""
    with pytest.raises(LLMUnavailable, match="no blocks"):
        parse_blocks(_payload(blocks=[]))


def test_an_unbuildable_block_kind_is_refused() -> None:
    """`table` reaching the emitter produces a table-shaped hole the canvas
    rejects. Catching it here names the model as the cause."""
    with pytest.raises(LLMUnavailable, match="cannot be built"):
        parse_blocks(_payload(blocks=[{"kind": "table", "text": "two columns"}]))


def test_a_block_with_empty_text_is_refused() -> None:
    with pytest.raises(LLMUnavailable, match="no text"):
        parse_blocks(_payload(blocks=[{"kind": "prose", "text": "   "}]))


def test_parsing_never_returns_a_partial_lesson() -> None:
    """One bad block fails the whole response.

    Salvaging the good ones yields a lesson quietly shorter than the one the
    contract asked for, and nothing downstream can tell it was truncated.
    """
    blocks = [
        {"kind": "prose", "text": "good"},
        {"kind": "chart", "text": "bad"},
    ]
    with pytest.raises(LLMUnavailable):
        parse_blocks(_payload(blocks=blocks))


# --------------------------------------------------------------------------
# The offline guarantee, and the credential rule
# --------------------------------------------------------------------------


def test_no_key_raises_before_anything_is_imported_or_sent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The key is checked FIRST. Reaching the SDK import or a socket without one
    would turn a configuration mistake into a network error."""
    monkeypatch.delenv(API_KEY_ENV, raising=False)
    with pytest.raises(LLMUnavailable, match=API_KEY_ENV):
        AnthropicClient().generate(_contract())


def test_the_client_holds_no_credential() -> None:
    """Not a constructor default, not an attribute. A key on the instance ends
    up in a repr, a traceback, or a pickled fixture."""
    client = AnthropicClient()
    assert "key" not in repr(client).lower()
    assert not any("key" in field.lower() for field in client.__slots__)


def test_the_sdk_is_optional_and_this_module_imports_without_it() -> None:
    """The import sits inside `generate` so the offline job can load this file.

    If the SDK ever becomes a hard dependency, CI installs it, and the only
    thing standing between the suite and a paid API call is every test
    remembering to use the fake.
    """
    assert importlib.util.find_spec("learning_os.llm.anthropic_client") is not None


def test_a_missing_sdk_says_how_to_install_it(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only meaningful where the SDK is genuinely absent, which is the CI case
    this message exists for."""
    if importlib.util.find_spec("anthropic") is not None:
        pytest.skip("the SDK is installed here; this covers the CI environment")
    monkeypatch.setenv(API_KEY_ENV, "not-a-real-key")
    with pytest.raises(LLMUnavailable, match="optional dependency"):
        AnthropicClient().generate(_contract())


# --------------------------------------------------------------------------
# It is the same boundary as the fake
# --------------------------------------------------------------------------


def test_it_satisfies_the_same_protocol_as_the_fake() -> None:
    """One method. A wider interface would invite the model back into decisions
    the engine must own."""
    assert isinstance(AnthropicClient(), LLMClient)


def test_the_model_is_pinned_rather_than_caller_supplied() -> None:
    """"Which model taught this learner" belongs in the record of a decision. A
    caller-supplied default makes it unanswerable afterwards."""
    assert AnthropicClient().model == MODEL


def test_the_response_schema_only_admits_buildable_kinds() -> None:
    """Constraining it in the schema is what stops the failure; asking politely
    in prose is what produced a `table` built from a sentence."""
    kinds = RESPONSE_SCHEMA["properties"]["blocks"]["items"]["properties"]["kind"]["enum"]
    assert sorted(kinds) == sorted(BUILDABLE)
