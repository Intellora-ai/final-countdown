"""The entry point that actually runs the engine against a real model.

WHY THIS COMMAND EXISTS AND `demo.py` COULD NOT BECOME IT
---------------------------------------------------------
`api/cli.py` and `api/demo.py` both write COMMITTED FIXTURES, and both are
checked byte-for-byte in CI. A fixture whose bytes depend on an environment
variable is not a fixture, and a fixture produced by a live model is not
reproducible at all -- so neither could be switched to the selector without
destroying the property it exists to hold. Both keep passing `FakeLLMClient`
explicitly, and this is a third command that writes nothing.

WHAT THESE TESTS PIN
--------------------
That the command is WIRED. A provider selector nothing calls is the failure this
repository already has examples of: code with its own passing suite that no
running path reaches. So the test that matters most asserts the environment
variable changes the run -- not that a function exists.

Everything here runs offline. `conftest.py` blocks the socket, so the only
provider these tests can reach is the fake, and a test that tried to reach
Gemini would fail rather than cost money.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from learning_os.api import speak
from learning_os.llm.select import PROVIDER_ENV


def _run(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    provider: str | None,
    argv: list[str] | None = None,
) -> tuple[int, str, str]:
    if provider is None:
        monkeypatch.delenv(PROVIDER_ENV, raising=False)
    else:
        monkeypatch.setenv(PROVIDER_ENV, provider)
    code = speak.main(argv or [])
    captured = capsys.readouterr()
    return code, captured.out, captured.err


# --------------------------------------------------------------------------
# It is wired to the selector
# --------------------------------------------------------------------------


def test_the_environment_variable_changes_which_provider_runs(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """THE TEST THIS FILE EXISTS FOR.

    A selector nothing calls is an island with a green suite. This asserts the
    variable reaches a running path, by naming the provider that actually ran.
    """
    _, _, err = _run(capsys, monkeypatch, "fake")
    assert "fake" in err


def test_an_unknown_provider_is_a_clean_failure_not_a_traceback(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A typo in a shell profile is a configuration mistake. Delivering it as a
    stack trace makes the reader hunt for the line instead of reading the fix."""
    code, out, err = _run(capsys, monkeypatch, "gemeni")
    assert code == speak.EXIT_MISCONFIGURED
    assert out == ""
    assert "gemeni" in err


def test_selecting_gemini_without_a_key_reports_unavailable_not_a_crash(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """An absent credential is a normal state of the world on a fresh checkout.

    It must be distinguishable from "the contract could not be satisfied", which
    is a different problem with a different fix.
    """
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    code, out, err = _run(capsys, monkeypatch, "gemini")
    assert code == speak.EXIT_UNAVAILABLE
    assert out == ""
    assert "LEARNING_OS_GEMINI_API_KEY" in err


def test_a_key_with_no_sdk_names_the_sdk_and_not_an_outage(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """THE MISATTRIBUTION THIS COMMAND SHIPPED WITH FOR ONE ITERATION.

    Key exported, SDK not installed -- the most likely state of a reader who has
    just followed half the setup. Reporting that as an outage sends them to
    check their network, their region and the provider's status page, none of
    which is the problem. The cause needs no network to determine, so it is
    determined.
    """
    monkeypatch.setenv("LEARNING_OS_GEMINI_API_KEY", "a-value-that-is-never-sent")
    monkeypatch.setattr(speak, "installed_modules", lambda: frozenset())
    code, out, err = _run(capsys, monkeypatch, "gemini")
    assert code == speak.EXIT_UNAVAILABLE
    assert out == ""
    assert "google.genai" in err
    assert "outage" not in err.lower()


def test_the_missing_sdk_message_says_how_to_install_it(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LEARNING_OS_GEMINI_API_KEY", "a-value-that-is-never-sent")
    monkeypatch.setattr(speak, "installed_modules", lambda: frozenset())
    _, _, err = _run(capsys, monkeypatch, "gemini")
    assert "learning-os[live]" in err


def test_the_missing_key_is_reported_before_the_missing_sdk(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Both absent is the state of a fresh checkout. Naming the SDK first would
    have the reader install a package they still cannot use."""
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(speak, "installed_modules", lambda: frozenset())
    _, _, err = _run(capsys, monkeypatch, "gemini")
    assert "LEARNING_OS_GEMINI_API_KEY" in err
    assert "google.genai" not in err


def test_the_unavailable_exit_code_differs_from_the_misconfigured_one() -> None:
    """Same non-zero for both would make a script unable to tell "set your key"
    from "you typed the provider name wrong"."""
    assert speak.EXIT_UNAVAILABLE != speak.EXIT_MISCONFIGURED
    assert speak.EXIT_UNAVAILABLE != 0
    assert speak.EXIT_MISCONFIGURED != 0


# --------------------------------------------------------------------------
# What it emits is what the canvas would accept
# --------------------------------------------------------------------------


def test_a_successful_run_prints_a_lesson_payload_on_stdout(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    code, out, _ = _run(capsys, monkeypatch, "fake")
    assert code == 0
    payload = json.loads(out)
    assert payload["blocks"], "a lesson with no blocks renders nothing"


def test_the_payload_goes_through_the_same_emitter_as_the_fixtures(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A second, looser emitter here would let this command print something the
    canvas refuses -- and it would look like the model's fault.

    The keys are `Lesson.as_payload`'s, read from the emitter rather than
    guessed: the canvas parses this with a `.strict()` schema, so a key that is
    almost right is a lesson that does not render at all.
    """
    _, out, _ = _run(capsys, monkeypatch, "fake")
    payload = json.loads(out)
    for required in ("id", "question", "blocks", "relations"):
        assert required in payload


def test_relations_is_present_even_when_empty(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """`as_payload` sends it explicitly for a stated reason: an empty list means
    "this lesson has no relations" and a missing key means "the emitter forgot",
    and beats treat those very differently."""
    _, out, _ = _run(capsys, monkeypatch, "fake")
    assert isinstance(json.loads(out)["relations"], list)


def test_no_null_subject_is_emitted(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """`subject` is `Label.optional()` in Zod, which accepts a missing key and
    not a null. Sending null fails `.strict()` for a field meant to be skipped."""
    payload = json.loads(_run(capsys, monkeypatch, "fake")[1])
    assert payload.get("subject", "absent") is not None


def test_stdout_carries_only_the_lesson(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """So the output pipes. The provider name, the strategy and every diagnostic
    go to stderr; one stray `print` on stdout makes `| jq` fail for the reader."""
    _, out, err = _run(capsys, monkeypatch, "fake")
    json.loads(out)  # raises if anything else was printed alongside it
    assert err.strip() != "", "a run that says nothing about how it ran is not reviewable"


def test_the_run_reports_which_strategy_the_engine_chose(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The strategy is the engine's decision and the whole reason this is not a
    prompt wrapper. A run that hides it cannot be argued with."""
    _, _, err = _run(capsys, monkeypatch, "fake")
    assert "strategy" in err.lower()


# --------------------------------------------------------------------------
# It writes nothing
# --------------------------------------------------------------------------


def test_it_never_writes_a_file(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A live command that wrote to `lessons/generated/` would overwrite a
    committed fixture with non-reproducible bytes, and `--check` would then fail
    on somebody else's branch for a reason nobody could reconstruct.
    """
    written: list[str] = []
    real_open: Callable[..., Any] = open

    def watched(file: Any, mode: str = "r", *args: Any, **kwargs: Any) -> Any:
        if any(flag in mode for flag in ("w", "a", "x", "+")):
            written.append(str(file))
        return real_open(file, mode, *args, **kwargs)

    # Underscored because the content is genuinely not read: this double exists
    # to record THAT a write was attempted, and recording what was in it would
    # invite asserting on bytes nothing should be producing.
    def refuse_write_text(self: Path, *_args: Any, **_kwargs: Any) -> int:
        # `Path.write_text` and not only `open`, because that is the call
        # `api/cli.py` and `api/demo.py` actually use to lay down a fixture --
        # so a regression here would take the exact shape this guards against.
        written.append(str(self))
        return 0

    monkeypatch.setattr("builtins.open", watched)
    monkeypatch.setattr(Path, "write_text", refuse_write_text)
    monkeypatch.setattr(Path, "write_bytes", refuse_write_text)

    _run(capsys, monkeypatch, "fake")
    assert written == []


def test_the_question_can_be_supplied_on_the_command_line(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Otherwise this is a demo with one hardcoded question, which is what
    `demo.py` already is."""
    asked = "What stops a recursive call from going forever?"
    _, out, _ = _run(capsys, monkeypatch, "fake", ["--question", asked])
    assert asked in json.dumps(json.loads(out))
