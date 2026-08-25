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
