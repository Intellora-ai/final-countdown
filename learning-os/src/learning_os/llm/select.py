"""Which provider this process is using, decided in one place.

WHY THIS FILE EXISTS
--------------------
Before it, every caller that wanted a client wrote `FakeLLMClient()` inline.
That is the right answer for the fixture emitter and the wrong one for anything
meant to teach, and at the call site the two are indistinguishable -- so "is
this run using a real model?" was a question answered by grepping. One function
answers it now, and the answer is a value a caller can print.

WHY AN UNKNOWN NAME IS AN ERROR AND NOT A FALLBACK
--------------------------------------------------
`LEARNING_OS_LLM_PROVIDER=gemeni` must not quietly return the fake. The call
would succeed, the output would be well-formed, the run would cost nothing, and
the operator would believe a real model was teaching while the learner read
skeleton prose. Nothing at any layer would contradict that belief. A silent
fallback is the exact shape of failure this engine has rules about, so an
unrecognised value is refused by name and the refusal lists what would have
worked.

WHY THE ENVIRONMENT IS PASSED IN
--------------------------------
`client_from_env(env)` takes a mapping and defaults to `os.environ`. That keeps
the selection a pure function of its input, so the tests assert the real
decision table instead of mutating process state and hoping nothing else in the
suite is reading it at the same time.

WHAT THIS DOES NOT DO
---------------------
It does not read, validate, or report a credential. Selecting a live provider
succeeds on a machine with no key at all -- construction is free, and only
`generate` needs one. A process must be able to say which provider it is
configured for without holding the secret for it.
"""

from __future__ import annotations

import importlib.util
import os
from collections.abc import Callable, Mapping

from learning_os.llm.client import (
    API_KEY_ENV,
    GEMINI_API_KEY_ENV,
    FakeLLMClient,
    LLMClient,
    LLMUnavailable,
)

__all__ = [
    "DEFAULT_PROVIDER",
    "PROVIDERS",
    "PROVIDER_ENV",
    "PROVIDER_KEY_ENV",
    "PROVIDER_SDK_MODULE",
    "client_from_env",
    "configured_provider",
    "missing_credential",
    "missing_sdk",
]

#: The one spelling of the variable, so a rename is one edit and a typo in a
#: caller is an import error rather than a silently different default.
PROVIDER_ENV = "LEARNING_OS_LLM_PROVIDER"

#: Unset means offline. A default that needs a key makes a clean checkout fail
#: on first run for a reason that reads like a bug rather than a setting.
DEFAULT_PROVIDER = "fake"


def _gemini() -> LLMClient:
    """Imported lazily, so selecting the fake never loads a live adapter."""
    from learning_os.llm.gemini_client import GeminiClient

    return GeminiClient()


def _anthropic() -> LLMClient:
    from learning_os.llm.anthropic_client import AnthropicClient

    return AnthropicClient()


#: The whole decision table. `fake` is named rather than implied so a test or a
#: demo can ASK for it out loud instead of relying on the default staying the
#: default -- an intent that survives someone changing `DEFAULT_PROVIDER`.
PROVIDERS: Mapping[str, Callable[[], LLMClient]] = {
    "fake": FakeLLMClient,
    "gemini": _gemini,
    "anthropic": _anthropic,
}


def configured_provider(env: Mapping[str, str] | None = None) -> str:
    """The provider name this environment selects, normalised.

    Returns the NAME and never the credential, so a startup line can state what
    is in use without a key reaching a log. Refuses an unknown name for the same
    reason `client_from_env` does: a reporter more tolerant than the builder
    would print a provider that the next call cannot construct.
    """
    source = os.environ if env is None else env
    raw = (source.get(PROVIDER_ENV) or "").strip().lower()
    name = raw or DEFAULT_PROVIDER

    if name not in PROVIDERS:
        raise LLMUnavailable(
            f"{PROVIDER_ENV}={raw!r} is not a provider this engine has. "
            f"Choose one of: {', '.join(sorted(PROVIDERS))}. "
            f"Unset it to run offline on the deterministic fake."
        )
    return name


def client_from_env(env: Mapping[str, str] | None = None) -> LLMClient:
    """Build the client this environment selects.

    Construction only. No network, no credential read, no validation of one --
    the adapter does that when it is called, which is when the caller can act on
    the answer.
    """
    return PROVIDERS[configured_provider(env)]()


#: Which variable each provider reads for its credential. `None` means it needs
#: none.
#:
#: WHY THIS TABLE IS HERE AND NOT DISCOVERED BY CALLING THE ADAPTER.
#: The obvious way to find out why a provider was unavailable is to call it and
#: read the error. That is a SECOND REQUEST on a path that just failed -- which,
#: against a provider that is merely rate-limited, is the one thing guaranteed to
#: make it worse. The common cause by a wide margin is an absent key, and that is
#: answerable by reading the environment: no network, no cost, no second attempt.
#:
#: Duplicating the variable names would let this table drift out of agreement
#: with the adapters, so the constants themselves are referenced.
PROVIDER_KEY_ENV: Mapping[str, str | None] = {
    "fake": None,
    "gemini": GEMINI_API_KEY_ENV,
    "anthropic": API_KEY_ENV,
}


def missing_credential(
    provider: str, env: Mapping[str, str] | None = None
) -> str | None:
    """The name of the variable this provider needs and does not have.

    Returns a NAME or `None` -- never a value, and never a bool. A bool would
    make the caller re-derive which variable to name, which is how an error
    message comes to tell somebody to set the wrong one.
    """
    source = os.environ if env is None else env
    needed = PROVIDER_KEY_ENV[provider]
    if needed is None or (source.get(needed) or "").strip():
        return None
    return needed


#: Which SDK each provider imports. `None` means it imports nothing optional.
#:
#: WHY THIS IS DATA AND NOT DISCOVERED BY IMPORTING AND CATCHING.
#: Both live adapters import inside `generate`, so an absent SDK surfaces as
#: `LLMUnavailable` -- and `teach_once` swallows that, by design, because an
#: outage is a normal state of the world. The reason therefore does not survive
#: onto the `Turn`, and a caller left to describe the failure will describe the
#: likeliest one. That produced a real defect: with a key exported and the SDK
#: not installed -- the state of a reader who followed half the setup -- the
#: command reported "an outage, a rate limit, or a refusal" and sent them to
#: check a network that was fine.
#:
#: An import is answerable with no network, so it is answered before the loop
#: runs rather than guessed at after it fails.
PROVIDER_SDK_MODULE: Mapping[str, str | None] = {
    "fake": None,
    "gemini": "google.genai",
    "anthropic": "anthropic",
}


def missing_sdk(provider: str, installed: frozenset[str] | None = None) -> str | None:
    """The import path this provider needs and cannot find.

    `installed` is for tests, which must be able to assert the absent case on a
    machine where the SDK is present. Left out, this performs a real lookup --
    a default that returned `None` unconditionally would make the pre-flight
    assert against a set nobody populated.

    Uses `find_spec` rather than `import`. Importing a vendor SDK merely to ask
    whether it exists runs its module-level code inside a diagnostic, which is
    a side effect nobody asked for on a path that is about to report a failure.
    """
    needed = PROVIDER_SDK_MODULE[provider]
    if needed is None:
        return None
    if installed is not None:
        return None if needed in installed else needed

    try:
        found = importlib.util.find_spec(needed) is not None
    except (ImportError, ValueError):
        # A parent package that is absent, or a namespace package with no
        # loader. Both mean the same thing to the caller: it cannot be imported.
        found = False
    return None if found else needed
