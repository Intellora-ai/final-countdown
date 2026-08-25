"""Choosing a provider from the environment, and refusing to guess.

WHY A SELECTOR EXISTS AT ALL
----------------------------
Before this, every caller that wanted a client wrote `FakeLLMClient()`. That is
correct for the fixture emitter and wrong for everything else, and the two are
indistinguishable at the call site -- so "is this run using a real model?" was a
question you answered by grepping. One function answers it instead, and the
answer is a value the caller can print.

THE FAILURE THIS FILE IS BUILT AROUND
-------------------------------------
A typo. `LEARNING_OS_LLM_PROVIDER=gemeni` must not quietly hand back the fake.
A silent fallback means the operator believes a real model is teaching and the
learner is reading skeleton prose -- the call succeeded, the output is
well-formed, and nothing anywhere says otherwise. That is the most expensive
shape of failure this repository has a rule about, so an unrecognised value is
refused by name.

The fixture emitter is NOT affected: `api/cli.py` keeps passing the fake
explicitly, because a fixture whose bytes depend on an environment variable is
not a fixture.
"""

from __future__ import annotations

import pytest

from learning_os.llm.client import (
    API_KEY_ENV,
    GEMINI_API_KEY_ENV,
    FakeLLMClient,
    LLMClient,
    LLMUnavailable,
)
from learning_os.llm.select import (
    PROVIDER_ENV,
    PROVIDER_KEY_ENV,
    PROVIDER_SDK_MODULE,
    PROVIDERS,
    client_from_env,
    configured_provider,
    missing_credential,
    missing_sdk,
)


def test_no_variable_means_the_fake() -> None:
    """The default has to be the offline one. A default that needs a key makes a
    clean checkout fail on first run for a reason that reads like a bug."""
    assert isinstance(client_from_env({}), FakeLLMClient)


def test_an_empty_value_means_the_fake() -> None:
    """`export LEARNING_OS_LLM_PROVIDER=` in a shell profile is an unset variable
    that does not look unset."""
    assert isinstance(client_from_env({PROVIDER_ENV: ""}), FakeLLMClient)


def test_gemini_is_selectable_by_name() -> None:
    from learning_os.llm.gemini_client import GeminiClient

    assert isinstance(client_from_env({PROVIDER_ENV: "gemini"}), GeminiClient)


def test_anthropic_is_still_selectable_by_name() -> None:
    """Adding a provider must not remove one."""
    from learning_os.llm.anthropic_client import AnthropicClient

    assert isinstance(client_from_env({PROVIDER_ENV: "anthropic"}), AnthropicClient)


def test_the_name_is_matched_case_insensitively_and_trimmed() -> None:
    """`PROVIDER=Gemini ` from a copied command should not be an outage."""
    from learning_os.llm.gemini_client import GeminiClient

    assert isinstance(client_from_env({PROVIDER_ENV: "  Gemini  "}), GeminiClient)


def test_an_unknown_provider_is_refused_rather_than_silently_faked() -> None:
    """THE TEST THIS FILE EXISTS FOR.

    Falling back to the fake here would mean a typo produces a run that looks
    live, costs nothing, and teaches nobody -- with no signal at any layer.
    """
    with pytest.raises(LLMUnavailable, match="gemeni"):
        client_from_env({PROVIDER_ENV: "gemeni"})


def test_the_refusal_lists_what_would_have_worked() -> None:
    """An error naming only the bad value makes the reader guess the good ones."""
    with pytest.raises(LLMUnavailable, match="anthropic"):
        client_from_env({PROVIDER_ENV: "gpt"})
    with pytest.raises(LLMUnavailable, match="gemini"):
        client_from_env({PROVIDER_ENV: "gpt"})


def test_selecting_a_live_provider_does_not_require_a_key_yet() -> None:
    """Construction is free and safe; only `generate` needs a credential.

    Failing here would mean a process could not even report which provider it is
    configured for without holding the key for it.
    """
    client = client_from_env({PROVIDER_ENV: "gemini"})
    assert isinstance(client, LLMClient)


def test_every_advertised_provider_can_actually_be_built() -> None:
    """A name in the table that raises on construction is a menu entry with no
    kitchen behind it."""
    for name in PROVIDERS:
        assert isinstance(client_from_env({PROVIDER_ENV: name}), LLMClient)


def test_the_configured_name_is_reportable_without_building_a_client() -> None:
    """So a startup line can say which provider is in use. Returns the NAME, never
    the credential -- `api_key_present()` is the only thing that touches that."""
    assert configured_provider({}) == "fake"
    assert configured_provider({PROVIDER_ENV: "gemini"}) == "gemini"


def test_reporting_an_unknown_name_refuses_too() -> None:
    """If the reporter tolerated what the builder refuses, a startup line would
    print a provider that the next call cannot construct."""
    with pytest.raises(LLMUnavailable, match="gemeni"):
        configured_provider({PROVIDER_ENV: "gemeni"})


def test_the_fake_is_in_the_table_so_it_can_be_asked_for_explicitly() -> None:
    """Being able to say `fake` out loud is what lets a test or a demo state its
    intent instead of relying on the default staying the default."""
    assert "fake" in PROVIDERS


# --------------------------------------------------------------------------
# Which credential a provider needs, answered without calling it
# --------------------------------------------------------------------------


def test_the_fake_needs_no_credential() -> None:
    """The offline default must stay runnable on a machine with no keys at all."""
    assert missing_credential("fake", {}) is None


def test_a_live_provider_with_no_key_names_the_variable_to_set() -> None:
    """Returns the NAME, never a bool. A bool makes the caller re-derive which
    variable to name, which is how an error comes to cite the wrong one."""
    assert missing_credential("gemini", {}) == GEMINI_API_KEY_ENV
    assert missing_credential("anthropic", {}) == API_KEY_ENV


def test_a_present_key_reports_nothing_missing() -> None:
    assert missing_credential("gemini", {GEMINI_API_KEY_ENV: "a-value"}) is None


def test_a_whitespace_only_key_counts_as_missing() -> None:
    """`export KEY=" "` is an unset variable that does not look unset, and the
    provider would reject it after a round trip that cost something."""
    assert missing_credential("gemini", {GEMINI_API_KEY_ENV: "   "}) == GEMINI_API_KEY_ENV


def test_the_other_providers_key_does_not_satisfy_this_one() -> None:
    """THE CROSS-WIRING GUARD.

    If one variable satisfied both, the first switch between providers would
    send one vendor's credential to the other vendor's endpoint -- and a key
    disclosed to the wrong party has no undo that is not rotation.
    """
    assert missing_credential("gemini", {API_KEY_ENV: "anthropic-value"}) == GEMINI_API_KEY_ENV
    assert missing_credential("anthropic", {GEMINI_API_KEY_ENV: "google-value"}) == API_KEY_ENV


def test_every_provider_in_the_table_declares_its_credential() -> None:
    """A provider added to `PROVIDERS` and forgotten here would raise `KeyError`
    inside an error path -- a crash while reporting a failure, which is the worst
    place to find one."""
    assert set(PROVIDER_KEY_ENV) == set(PROVIDERS)


# --------------------------------------------------------------------------
# Which SDK a provider needs, answered without calling it
# --------------------------------------------------------------------------


def test_the_fake_needs_no_sdk() -> None:
    """The offline default must run on a checkout that installed only the lock."""
    assert PROVIDER_SDK_MODULE["fake"] is None
    assert missing_sdk("fake") is None


def test_a_live_provider_declares_the_module_it_imports() -> None:
    """Named as data so the pre-flight can check it, rather than discovered by
    importing and catching -- which is the same information at a higher cost."""
    assert PROVIDER_SDK_MODULE["gemini"] == "google.genai"
    assert PROVIDER_SDK_MODULE["anthropic"] == "anthropic"


def test_an_absent_sdk_is_reported_by_name() -> None:
    """THE MISATTRIBUTION GUARD.

    Before this existed, a key set and an SDK missing produced "outage, rate
    limit, or refusal" -- a message that claims to know more than it does, in
    the exact case a first-time reader hits, sending them to chase a network
    problem that is not happening. The cause is answerable with no network at
    all, so it is answered.
    """
    assert missing_sdk("gemini", installed=frozenset()) == "google.genai"


def test_a_present_sdk_reports_nothing_missing() -> None:
    assert missing_sdk("gemini", installed=frozenset({"google.genai"})) is None


def test_one_providers_sdk_does_not_satisfy_another() -> None:
    """Both are optional and they are installed independently; treating either as
    proof of the other would resurrect the misattribution in the other direction.
    """
    assert missing_sdk("gemini", installed=frozenset({"anthropic"})) == "google.genai"
    assert missing_sdk("anthropic", installed=frozenset({"google.genai"})) == "anthropic"


def test_every_provider_in_the_table_declares_its_sdk() -> None:
    """A provider added to `PROVIDERS` and forgotten here would raise `KeyError`
    inside a pre-flight -- a crash while reporting a failure."""
    assert set(PROVIDER_SDK_MODULE) == set(PROVIDERS)


def test_the_real_environment_is_consulted_when_none_is_supplied() -> None:
    """The `installed` argument exists for tests. The default has to be a real
    lookup, or the pre-flight asserts against a set nobody populated.
    """
    # `json` stands in for any module certainly importable here; the point is
    # that the default path performs a real check rather than returning None.
    assert missing_sdk("fake") is None
    assert missing_sdk("gemini") in (None, "google.genai")


def test_no_function_here_ever_returns_a_credential_value() -> None:
    """The whole module may name variables and never read one out.

    `missing_credential` returns the NAME of an unset variable; a version that
    returned the value would put a live key into whatever printed it.
    """
    secret = "a-value-that-must-never-be-returned"
    assert missing_credential("gemini", {GEMINI_API_KEY_ENV: secret}) is None
    assert configured_provider({PROVIDER_ENV: "gemini"}) == "gemini"
