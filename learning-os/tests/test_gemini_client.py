"""The second live provider, tested without a provider.

WHY THIS FILE EXISTS SEPARATELY FROM `test_anthropic_client.py`
--------------------------------------------------------------
The two clients share `build_prompt` -- it is pure and provider-agnostic, and
duplicating its tests here would assert the same function twice while proving
nothing about Gemini. What is NOT shared is the part this file covers: the
response schema Gemini is actually sent, the credential it reads, and the
refusal it must not report as an outage.

THE SCHEMA IS THE REASON THIS IS NOT A COPY
-------------------------------------------
Gemini's `response_json_schema` accepts a documented SUBSET of JSON Schema.
`minLength` is not in that subset, and Anthropic's schema uses it. Sending the
Anthropic schema unchanged is the failure this file is built around: it is
accepted at the call site, the constraint it expressed quietly stops being
enforced, and the first visible sign is a lesson with an empty block in it. So
the Gemini schema is derived and then asserted to contain only keywords the
provider documents.

Everything here runs with no SDK, no key and no socket -- `conftest.py` blocks
the network for every test in this suite.

NO TEST HERE SKIPS.
A conditional skip on "is the SDK installed" would make the SDK-missing branch
untested on exactly the machines that have the SDK, which are the machines
where someone is about to make it a hard dependency. The import failure is
forced instead, so the branch is exercised in every run on every machine.
"""

from __future__ import annotations

import builtins
import importlib.util
from collections.abc import Sequence
from typing import Any

import pytest

from learning_os.llm.anthropic_client import RESPONSE_SCHEMA as ANTHROPIC_SCHEMA
from learning_os.llm.client import GEMINI_API_KEY_ENV, LLMClient, LLMUnavailable
from learning_os.llm.contract import (
    DiagnosisKind,
    InstructionContract,
    Strategy,
)
from learning_os.llm.gemini_client import (
    BUILDABLE,
    MODEL,
    RESPONSE_SCHEMA,
    SDK_MODULE,
    SUPPORTED_SCHEMA_KEYWORDS,
    GeminiClient,
    _content_of,
    _send,
    parse_blocks,
    schema_keywords,
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


def _block_sdk_import(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make `import google.genai` fail, whether or not the SDK is installed.

    Patching `__import__` rather than poking `sys.modules` because a package
    already imported elsewhere in the session stays reachable as an attribute of
    its parent, so the `sys.modules[...] = None` trick is silently a no-op in
    exactly the case it is meant to cover.
    """
    real = builtins.__import__

    def fake(
        name: str,
        globals_: Any = None,
        locals_: Any = None,
        fromlist: Sequence[str] = (),
        level: int = 0,
    ) -> Any:
        if name == SDK_MODULE or name.startswith(f"{SDK_MODULE}."):
            raise ImportError(f"No module named {name!r}")
        if name == "google" and "genai" in tuple(fromlist):
            raise ImportError("No module named 'google.genai'")
        return real(name, globals_, locals_, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake)


# --------------------------------------------------------------------------
# The schema is inside the provider's documented subset
# --------------------------------------------------------------------------


def test_the_schema_uses_only_keywords_gemini_documents() -> None:
    """THE TEST THIS FILE EXISTS FOR.

    An unsupported keyword is not an error at the call site. It is ignored, and
    the constraint it expressed stops being enforced -- which surfaces later as
    a block the emitter cannot build, attributed to the model rather than to us.
    """
    unsupported = schema_keywords(RESPONSE_SCHEMA) - SUPPORTED_SCHEMA_KEYWORDS
    assert unsupported == set(), f"not in Gemini's documented subset: {sorted(unsupported)}"


def test_the_anthropic_schema_would_have_failed_that_check() -> None:
    """Proves the check above is not vacuous.

    If Anthropic's schema also passed, the derivation would be doing nothing and
    this whole file would be ceremony. `minLength` is the concrete difference.
    """
    assert schema_keywords(ANTHROPIC_SCHEMA) - SUPPORTED_SCHEMA_KEYWORDS != set()


def test_the_schema_still_admits_only_buildable_kinds() -> None:
    """Dropping unsupported keywords must not drop the constraint that matters.

    `table` reaching the emitter produces a table-shaped hole the canvas refuses.
    """
    kinds = RESPONSE_SCHEMA["properties"]["blocks"]["items"]["properties"]["kind"]["enum"]
    assert sorted(kinds) == sorted(BUILDABLE)


def test_the_schema_still_requires_both_top_level_fields() -> None:
    assert sorted(RESPONSE_SCHEMA["required"]) == ["blocks", "introduced_concepts"]


def test_the_schema_still_forbids_extra_properties() -> None:
    """`additionalProperties` IS in the supported subset, so losing it here would
    be a choice rather than a limit the provider imposed."""
    assert RESPONSE_SCHEMA["additionalProperties"] is False


def test_at_least_one_block_is_still_required() -> None:
    """`minItems` is supported. An empty array is well-typed and renders nothing."""
    assert RESPONSE_SCHEMA["properties"]["blocks"]["minItems"] == 1


# --------------------------------------------------------------------------
# The credential rule, and the offline guarantee
# --------------------------------------------------------------------------


def test_no_key_raises_before_anything_is_imported_or_sent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The key is checked FIRST. Reaching the SDK import or a socket without one
    turns a configuration mistake into a network error."""
    monkeypatch.delenv(GEMINI_API_KEY_ENV, raising=False)
    with pytest.raises(LLMUnavailable, match=GEMINI_API_KEY_ENV):
        GeminiClient().generate(_contract())


def test_gemini_reads_its_own_variable_not_the_anthropic_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One shared variable would make the two providers mutually exclusive, and
    would send an Anthropic key to Google the first time somebody switched."""
    monkeypatch.setenv("LEARNING_OS_LLM_API_KEY", "a-value-for-the-other-provider")
    monkeypatch.delenv(GEMINI_API_KEY_ENV, raising=False)
    with pytest.raises(LLMUnavailable, match=GEMINI_API_KEY_ENV):
        GeminiClient().generate(_contract())


def test_the_client_holds_no_credential() -> None:
    """Not a constructor default, not an attribute. A key on the instance ends up
    in a repr, a traceback, or a pickled fixture."""
    client = GeminiClient()
    assert "key" not in repr(client).lower()
    assert not any("key" in field.lower() for field in client.__slots__)


def test_this_module_imports_without_the_sdk() -> None:
    """The import sits inside `generate`, so the offline CI job can load the file.

    If the SDK became a hard dependency, CI would install it, and the only thing
    between the suite and a live call would be every test remembering the fake.
    """
    assert importlib.util.find_spec("learning_os.llm.gemini_client") is not None


def test_a_missing_sdk_says_how_to_install_it(monkeypatch: pytest.MonkeyPatch) -> None:
    """Runs on every machine, including one with the SDK installed.

    A learner never sees this message; the person wiring the provider does, and
    it is the difference between a five-second fix and an afternoon.
    """
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "a-value-that-is-never-sent")
    _block_sdk_import(monkeypatch)
    with pytest.raises(LLMUnavailable, match="optional dependency"):
        GeminiClient().generate(_contract())


def test_the_missing_sdk_message_names_the_install_extra(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`pip install learning-os[live]` is the whole remedy. A message that says
    only "not installed" sends the reader to a search engine."""
    monkeypatch.setenv(GEMINI_API_KEY_ENV, "a-value-that-is-never-sent")
    _block_sdk_import(monkeypatch)
    with pytest.raises(LLMUnavailable, match=r"learning-os\[live\]"):
        GeminiClient().generate(_contract())


# --------------------------------------------------------------------------
# It is the same boundary as the fake
# --------------------------------------------------------------------------


def test_it_satisfies_the_same_protocol_as_the_fake() -> None:
    assert isinstance(GeminiClient(), LLMClient)


def test_the_model_is_pinned_rather_than_caller_supplied() -> None:
    """"Which model taught this learner" belongs in the record of a decision."""
    assert GeminiClient().model == MODEL


def test_the_note_names_the_provider_and_the_model() -> None:
    """Provenance has to survive into the record. `gemini:` alone would not
    distinguish two models, and the decision log reads this field."""
    payload = '{"blocks": [{"kind": "prose", "text": "x"}], "introduced_concepts": []}'
    assert parse_blocks(payload).note == f"gemini:{MODEL}"


def test_a_bad_response_is_refused_by_the_shared_rules() -> None:
    """Gemini's parse must be the same parse, not a lenient copy of it.

    A second, gentler parser is how one provider comes to be allowed a
    half-lesson the other is not.
    """
    with pytest.raises(LLMUnavailable, match="cannot be built"):
        parse_blocks('{"blocks": [{"kind": "table", "text": "two columns"}], '
                     '"introduced_concepts": []}')


# --------------------------------------------------------------------------
# The client's lifetime, guarded at the source
# --------------------------------------------------------------------------


def test_the_sdk_client_is_bound_to_a_name_and_not_chained() -> None:
    """THE BUG THIS PREVENTS, AND WHY THE TEST LOOKS LIKE THIS.

    `genai.Client(api_key=key).models.generate_content(...)` makes the client a
    temporary. It is finalised while the request is still in flight and every
    single call fails with:

        Cannot send a request, as the client has been closed.

    Measured: with the reference held, the same call against a deliberately
    invalid key reaches Google and returns `400 API_KEY_INVALID` -- the correct
    answer to a bad key, and proof the request left the machine.

    Asserted against the SOURCE rather than by calling, because the failure only
    appears once a socket is opened, and this suite is offline by construction
    (`conftest.py` blocks `socket.connect`). A structural assertion is a weak
    test in general; here it is the only one that can fail for the right reason,
    and the alternative is no guard at all on a bug that made the provider
    completely non-functional while every offline test passed.

    THE ASSERTION READS THE AST, NOT THE TEXT. The first version searched the
    source for a substring and matched the COMMENT in `gemini_client.py` that
    explains this very bug -- it failed on the prose describing the thing it
    guards against. Parsing the tree looks at what the code does and ignores
    what it says about itself.
    """
    import ast
    import inspect

    from learning_os.llm import gemini_client

    tree = ast.parse(inspect.getsource(gemini_client))

    chained: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        # `<something>.generate_content(...)`
        if not isinstance(func, ast.Attribute) or func.attr != "generate_content":
            continue
        # walk left through the attribute chain: `X.models.generate_content`
        base: ast.expr = func.value
        while isinstance(base, ast.Attribute):
            base = base.value
        # A Call at the root means the client was constructed inline and is a
        # temporary; a Name means it was bound and stays alive for the request.
        if isinstance(base, ast.Call):
            chained.append(ast.dump(base)[:80])

    assert chained == [], (
        "the SDK client is constructed inline in the call chain, so it is "
        f"finalised mid-request: {chained}"
    )


# --------------------------------------------------------------------------
# The failure paths, which nothing reached
# --------------------------------------------------------------------------
#
# MEASURED BEFORE THESE WERE WRITTEN. Replacing the call
# `blocked = _refusal_reason(response)` with `blocked = None` -- deleting the
# entire safety-refusal path -- left `pytest tests/test_gemini_client.py -q`
# reporting 17 passed. The handler and its 25-line helper could be removed and
# the suite would not notice.
#
# `grep -rn "_refusal_reason" src tests` returned exactly two hits: the
# definition and its single call site. Zero tests.
#
# WHY NOTHING REACHED THEM. Every `GeminiClient().generate(...)` in this file
# raises before it gets that far -- at the API-key check, or at the SDK import
# via `_block_sdk_import`. `test_ask.py` and `test_speak.py` only set or unset
# the key and hit the same two branches. So four production branches downstream
# of the SDK call had no test and could not have had one: reaching them required
# both the SDK installed and a controllable response.
#
# `_content_of` and `_send` exist to make that reachable without either. They
# hold the logic `generate()` used to hold inline; `generate()` keeps the parts
# that genuinely need the SDK -- reading the key, importing it, constructing the
# client -- and delegates the rest. `_refusal_reason`'s own docstring already
# said it "must not require the SDK to be installed in order to be imported or
# tested"; that was true of the helper and false of its call site.


class _Feedback:
    def __init__(self, block_reason: object) -> None:
        self.block_reason = block_reason


class _Candidate:
    def __init__(self, finish_reason: object) -> None:
        self.finish_reason = finish_reason


class _Response:
    """The parts of an SDK response these paths actually read."""

    def __init__(
        self,
        text: object = None,
        prompt_feedback: object = None,
        candidates: object = None,
    ) -> None:
        self.text = text
        self.prompt_feedback = prompt_feedback
        self.candidates = candidates


_GOOD = (
    '{"blocks": [{"kind": "prose", "text": "A base case stops it."}], '
    '"introduced_concepts": []}'
)


def test_a_blocked_prompt_is_a_decline_not_an_outage() -> None:
    with pytest.raises(LLMUnavailable, match="declined"):
        _content_of(_Response(prompt_feedback=_Feedback("SAFETY")))


def test_a_candidate_stopped_for_safety_is_also_a_decline() -> None:
    """The two carry different meanings and both must be named as declines.

    `prompt_feedback` is the REQUEST refused; a candidate's `finish_reason` is
    the ANSWER cut off. Collapsing either into "no text" sends the runtime down
    the retry path against a decision that will not change.
    """
    with pytest.raises(LLMUnavailable, match="declined"):
        _content_of(_Response(candidates=[_Candidate("RECITATION")]))


def test_a_decline_outranks_the_empty_text_it_also_produces() -> None:
    """THE ORDERING TEST, and the reason the two checks cannot be swapped.

    A refusal ALWAYS arrives with empty text. Reading the text first would
    report every safety decline as "no text" -- an outage -- and the refusal
    branch would then be unreachable in production, not merely untested.
    """
    blocked = _Response(text="   ", prompt_feedback=_Feedback("SAFETY"))
    with pytest.raises(LLMUnavailable, match="declined"):
        _content_of(blocked)


def test_a_response_carrying_no_text_says_so() -> None:
    with pytest.raises(LLMUnavailable, match="no text"):
        _content_of(_Response(text=None))


def test_whitespace_is_not_text() -> None:
    with pytest.raises(LLMUnavailable, match="no text"):
        _content_of(_Response(text="   \n\t "))


def test_a_usable_response_is_parsed_by_the_shared_parser() -> None:
    """The success path THROUGH the interpretation, not `parse_blocks` alone.

    `parse_blocks` was already tested directly. What was not tested is that a
    response which passes both guards reaches it.
    """
    got = _content_of(_Response(text=_GOOD))
    assert got.blocks == (("prose", "A base case stops it."),)


def test_a_provider_exception_becomes_unavailable_rather_than_escaping() -> None:
    class _Boom:
        class models:
            @staticmethod
            def generate_content(**_kwargs: object) -> object:
                raise RuntimeError("socket closed")

    with pytest.raises(LLMUnavailable, match="could not be reached"):
        _send(_Boom(), MODEL, _contract(), 100)


@pytest.mark.parametrize(
    "error",
    [RuntimeError("x"), ValueError("x"), OSError("x"), KeyError("x"), TimeoutError("x")],
)
def test_every_provider_exception_type_becomes_unavailable(error: Exception) -> None:
    """Deliberately broad, and that breadth is the contract being pinned.

    This layer promises "any provider problem is `LLMUnavailable`". Letting one
    vendor's exception class escape would make the runtime's retry decision
    depend on which vendor happens to be configured.
    """
    class _Boom:
        class models:
            @staticmethod
            def generate_content(**_kwargs: object) -> object:
                raise error

    with pytest.raises(LLMUnavailable):
        _send(_Boom(), MODEL, _contract(), 100)


def test_the_original_error_is_chained_rather_than_swallowed() -> None:
    """A wrapped cause that loses the original is how a stack trace stops
    naming the thing that actually broke."""
    original = RuntimeError("API_KEY_INVALID")

    class _Boom:
        class models:
            @staticmethod
            def generate_content(**_kwargs: object) -> object:
                raise original

    with pytest.raises(LLMUnavailable) as caught:
        _send(_Boom(), MODEL, _contract(), 100)
    assert caught.value.__cause__ is original


def test_the_request_carries_the_model_the_schema_and_the_mime_type() -> None:
    """Both response settings are required TOGETHER. The schema without the
    mime type is ignored, which is the silent version of sending no schema."""
    seen: dict[str, object] = {}

    class _Ok:
        class models:
            @staticmethod
            def generate_content(**kwargs: object) -> object:
                seen.update(kwargs)
                return _Response(text=_GOOD)

    _send(_Ok(), "gemini-test-model", _contract(), 4096)
    assert seen["model"] == "gemini-test-model"
    config = seen["config"]
    assert isinstance(config, dict)
    assert config["response_mime_type"] == "application/json"
    assert config["response_json_schema"] == RESPONSE_SCHEMA
    assert config["max_output_tokens"] == 4096


# --------------------------------------------------------------------------
# WHAT A MALFORMED REPLY IS TOLD APART FROM, AND WHY EACH DISTINCTION EARNS ITS
# OWN SENTENCE
#
# `parse_blocks` raises five different `LLMUnavailable` messages and only the
# `kind` one was ever run. Measured before this block: `gemini_client.py` at 90%
# with lines 213-228 uncovered -- every branch that describes HOW the reply was
# malformed.
#
# The runtime branches on these. "not JSON" is a prompt or a truncation and a
# retry may fix it; "no blocks" is a model that answered with an empty envelope;
# "block N has no text" names the block, which is the only thing that lets
# anybody look at the right one. A single "bad reply" for all five would send
# every reader to the same wrong place.
#
# NOT DELEGATED TO `anthropic_client.parse_blocks`, and the note field is why --
# so the provenance assertion below is part of the same claim.
# --------------------------------------------------------------------------
from learning_os.llm.gemini_client import _refusal_reason, parse_blocks


def test_a_reply_that_is_not_json_says_so_rather_than_reporting_no_blocks() -> None:
    with pytest.raises(LLMUnavailable) as caught:
        parse_blocks("I'd be happy to help! Here is a lesson:")
    assert "not JSON" in str(caught.value)


def test_a_json_envelope_with_no_blocks_is_named_as_that() -> None:
    for empty in ('{"blocks": []}', '{"blocks": "prose"}', '{"lesson": 1}', "[1, 2]"):
        with pytest.raises(LLMUnavailable) as caught:
            parse_blocks(empty)
        assert "no blocks" in str(caught.value), empty


def test_a_block_that_is_not_an_object_names_its_index() -> None:
    with pytest.raises(LLMUnavailable) as caught:
        parse_blocks('{"blocks": [{"kind": "prose", "text": "fine"}, "a bare string"]}')
    assert "block 1 is not an object" in str(caught.value)


def test_a_block_with_blank_text_is_refused_and_named() -> None:
    """Whitespace is not text. A block of spaces renders as a gap on the canvas
    and reads to a learner as a lesson that lost a paragraph."""
    with pytest.raises(LLMUnavailable) as caught:
        parse_blocks('{"blocks": [{"kind": "prose", "text": "   "}]}')
    assert "block 0 has no text" in str(caught.value)

    with pytest.raises(LLMUnavailable) as caught:
        parse_blocks('{"blocks": [{"kind": "prose", "text": 7}]}')
    assert "block 0 has no text" in str(caught.value)


def test_a_good_reply_is_stamped_with_the_provider_that_wrote_it() -> None:
    """Provenance has to name the provider. A shared parser would stamp every
    lesson `anthropic:` regardless of who produced it."""
    content = parse_blocks(
        '{"blocks": [{"kind": "prose", "text": " a base case stops it "}],'
        ' "introduced_concepts": ["base case", "  ", "recursion"]}'
    )
    assert content.blocks == (("prose", "a base case stops it"),)
    assert content.introduced_concepts == ("base case", "recursion")
    assert content.note.startswith("gemini:")


# --------------------------------------------------------------------------
# A SAFETY DECLINE IS NOT AN OUTAGE
#
# Both produce empty text. Collapsing them would report a decline as an outage,
# which the runtime then retries -- forever, against a decision that does not
# change. `_refusal_reason` draws that line and the candidate half of it (line
# 401 and the loop that reaches it) had never been run.
# --------------------------------------------------------------------------
class _ACandidate:
    def __init__(self, finish: object) -> None:
        self.finish_reason = finish


class _AResponse:
    def __init__(self, candidates: list[object]) -> None:
        self.candidates = candidates


class _AFinishReason:
    def __init__(self, name: str) -> None:
        self.name = name


def test_a_candidate_stopped_for_safety_is_reported_as_a_decline() -> None:
    said = _refusal_reason(_AResponse([_ACandidate(_AFinishReason("SAFETY"))]))
    assert said == "candidate stopped (SAFETY)"


def test_a_candidate_that_simply_finished_is_not_a_decline() -> None:
    """STOP is the ordinary ending. Reading it as a refusal would turn every
    successful call into one."""
    assert _refusal_reason(_AResponse([_ACandidate(_AFinishReason("STOP"))])) is None


def test_a_candidate_with_no_finish_reason_is_stepped_over_not_crashed_on() -> None:
    """The SDK omits the field on a streamed partial. `None` there must not stop
    the loop looking at the candidate after it."""
    said = _refusal_reason(
        _AResponse([_ACandidate(None), _ACandidate(_AFinishReason("PROHIBITED_CONTENT"))])
    )
    assert said == "candidate stopped (PROHIBITED_CONTENT)"


def test_a_response_with_no_candidates_at_all_is_not_a_decline() -> None:
    assert _refusal_reason(object()) is None
