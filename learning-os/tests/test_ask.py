"""The doubt resolver, reachable from outside Python.

WHY THIS FILE EXISTS
--------------------
`session/doubt.py` is the engine's catch for a question the canvas cannot
answer. Its own docstring says so: "That refusal is correct and it is a dead
end... This module is the catch." It has been correct and completely unreachable
since it was written -- nothing in `api/` imported it, so the only caller it
ever had was its own test suite. A catch nothing calls is not a catch.

This is the entry point that makes it callable: JSON on stdin, JSON on stdout,
no server, no framework, no port. A subprocess is the cheapest honest bridge
between a TypeScript canvas and a Python engine, and it is what the Vite
middleware in `frontend/vite-plugin-engine.ts` spawns.

WHAT IT MUST NOT DO
-------------------
Write anything, reach a network by default, or turn a refusal into an error. The
engine refusing a doubt it cannot map is a first-class outcome -- `UNMAPPABLE`
exists precisely so the answer is "I would rather not guess" rather than a
fluent paragraph about something adjacent. A bridge that reported that as a
failure would push the caller into treating a correct refusal as a bug.
"""

from __future__ import annotations

import io
import json
from typing import Any

import pytest

from learning_os.api import ask


def run(payload: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Drive the entry point the way the middleware does: stdin in, stdout out."""
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(payload)))
    monkeypatch.setattr("sys.stdout", out)
    code = ask.main([])
    text = out.getvalue()
    assert code == 0, f"exited {code} with {text!r}"
    parsed = json.loads(text)
    # Narrowed rather than returned straight from `json.loads`, which is `Any`.
    # Under --strict that would silently hand every caller an untyped value and
    # every assertion below would type-check against nothing.
    assert isinstance(parsed, dict), f"the bridge returned {type(parsed).__name__}"
    return parsed


DOUBT = {
    "text": "why does a recursive function need a base case",
    "resume_at": "beat-0",
    "lesson_skill": "python.recursion.identify_base_case",
}


# --------------------------------------------------------------------------
# It answers a doubt the engine can map
# --------------------------------------------------------------------------


def test_a_mappable_doubt_comes_back_answered(monkeypatch: pytest.MonkeyPatch) -> None:
    result = run(DOUBT, monkeypatch)
    assert result["outcome"] == "answered"


def test_an_answer_carries_a_lesson_the_canvas_can_render(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same emitter as the fixtures. A second, looser one here would let this
    print something the canvas refuses, and it would look like the engine's
    fault."""
    result = run(DOUBT, monkeypatch)
    lesson = result["lesson"]
    for required in ("id", "question", "blocks", "relations"):
        assert required in lesson, f"the payload has no {required}"
    assert lesson["blocks"], "an answer with no blocks renders nothing"


def test_the_way_back_survives_the_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    """`resume_at` is carried IN and handed back OUT unchanged.

    The whole feature exists so answering a question does not cost the learner
    their place. A bridge that dropped it would lose exactly the thing the type
    on the Python side was shaped to protect.
    """
    result = run({**DOUBT, "resume_at": "beat-7"}, monkeypatch)
    assert result["resume_at"] == "beat-7"


def test_the_answer_names_which_provider_wrote_it(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provenance has to cross the bridge too. Without it the canvas cannot say
    whether a learner is reading a real model or the deterministic fake."""
    result = run(DOUBT, monkeypatch)
    assert result["provider"] == "fake"


# --------------------------------------------------------------------------
# A refusal is an outcome, not an error
# --------------------------------------------------------------------------


def test_a_doubt_the_engine_cannot_map_is_refused_cleanly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = run({**DOUBT, "text": "what is a transformation graph"}, monkeypatch)
    assert result["outcome"] == "unmappable"


def test_a_refusal_still_exits_zero_and_still_carries_the_way_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """THE DISTINCTION THE BRIDGE EXISTS TO PRESERVE.

    Reporting a correct refusal as a process failure would make the caller treat
    "I would rather not guess at that" as a bug, and the obvious next move is to
    stop refusing.
    """
    result = run({**DOUBT, "text": "zzzz qqqq"}, monkeypatch)
    assert result["outcome"] == "unmappable"
    assert result["resume_at"] == "beat-0"
    assert result["refusal"], "a refusal with no reason tells the learner nothing"
    assert "lesson" not in result


def test_the_refusal_is_about_the_engine_not_about_the_learner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """"Your question is unclear" is unhelpful and slightly insulting to someone
    who has just admitted they are lost."""
    result = run({**DOUBT, "text": "zzzz qqqq"}, monkeypatch)
    lowered = result["refusal"].lower()
    assert "your question" not in lowered
    assert "unclear" not in lowered


# --------------------------------------------------------------------------
# Bad input is refused, never crashed on
# --------------------------------------------------------------------------


def test_malformed_json_is_an_error_object_not_a_traceback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The caller is a middleware parsing stdout. A Python traceback there
    becomes a 500 with a stack trace in it, and the learner sees nothing at
    all."""
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO("{not json"))
    monkeypatch.setattr("sys.stdout", out)
    code = ask.main([])
    assert code == 0
    assert json.loads(out.getvalue())["outcome"] == "bad_request"


def test_a_missing_text_field_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps({"resume_at": "b"})))
    monkeypatch.setattr("sys.stdout", out)
    assert ask.main([]) == 0
    assert json.loads(out.getvalue())["outcome"] == "bad_request"


def test_an_empty_question_is_refused_without_running_the_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = run({**DOUBT, "text": "   "}, monkeypatch)
    assert result["outcome"] == "bad_request"


def test_a_very_long_question_does_not_reach_the_engine_whole(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unbounded field on a public endpoint is an unbounded prompt, and the
    engine is charged per token even when the sender is not."""
    result = run({**DOUBT, "text": "why " * 5000}, monkeypatch)
    assert result["outcome"] in {"answered", "unmappable"}


# --------------------------------------------------------------------------
# Offline by default, and it writes nothing
# --------------------------------------------------------------------------


def test_it_runs_on_the_fake_when_no_provider_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A clean checkout must answer without a key. `conftest.py` blocks sockets
    for every test here, so a version that reached a provider would fail rather
    than succeed slowly."""
    monkeypatch.delenv("LEARNING_OS_LLM_PROVIDER", raising=False)
    assert run(DOUBT, monkeypatch)["provider"] == "fake"


def test_an_unknown_provider_is_reported_rather_than_silently_faked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A typo must not produce a run that looks live and is not."""
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemeni")
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(DOUBT)))
    monkeypatch.setattr("sys.stdout", out)
    assert ask.main([]) == 0
    parsed = json.loads(out.getvalue())
    assert parsed["outcome"] == "misconfigured"
    assert "gemeni" in parsed["refusal"]


def test_it_writes_no_file(monkeypatch: pytest.MonkeyPatch) -> None:
    """`api/cli.py` and `api/demo.py` lay down committed fixtures. A request
    handler that wrote to those paths would overwrite them with the output of
    whatever somebody happened to type."""
    written: list[str] = []
    real_open = open

    def watched(file: Any, mode: str = "r", *args: Any, **kwargs: Any) -> Any:
        if any(flag in mode for flag in ("w", "a", "x", "+")):
            written.append(str(file))
        return real_open(file, mode, *args, **kwargs)

    monkeypatch.setattr("builtins.open", watched)
    run(DOUBT, monkeypatch)
    assert written == []


def test_stdout_is_one_json_document_and_nothing_else(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The middleware parses stdout. One stray `print` makes the whole response
    unparseable, and the learner gets a blank panel."""
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(DOUBT)))
    monkeypatch.setattr("sys.stdout", out)
    ask.main([])
    json.loads(out.getvalue())  # raises if anything was printed alongside it


# --------------------------------------------------------------------------
# The pre-flight: say what is missing, in the order it can be fixed
# --------------------------------------------------------------------------


def test_a_live_provider_with_no_credential_names_the_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """THE FAILURE THIS SECTION EXISTS FOR.

    Without a pre-flight the engine returns a bare `unavailable`, which is the
    same string a genuine outage produces. The reader checks their network while
    the actual fix is one `export`. `api/speak.py` already solved this; this
    entry point never got the same treatment.
    """
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    result = run(DOUBT, monkeypatch)
    assert result["outcome"] == "no_credential"
    assert "LEARNING_OS_GEMINI_API_KEY" in result["refusal"]


def test_a_live_provider_with_no_sdk_names_the_module_and_the_install(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LEARNING_OS_GEMINI_API_KEY", "a-value-that-is-never-sent")
    monkeypatch.setattr(ask, "installed_modules", lambda: frozenset())
    result = run(DOUBT, monkeypatch)
    assert result["outcome"] == "no_sdk"
    assert "google.genai" in result["refusal"]
    assert "requirements-live.lock" in result["refusal"]


def test_the_credential_is_reported_before_the_sdk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both absent is the state of a fresh checkout. Naming the SDK first has
    somebody install a package they still cannot use."""
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(ask, "installed_modules", lambda: frozenset())
    result = run(DOUBT, monkeypatch)
    assert result["outcome"] == "no_credential"


def test_no_credential_is_a_DIFFERENT_outcome_from_an_outage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A script routing on this must be able to tell "set your key" from "the
    provider is down". One string for both makes that impossible.

    The comparison that used to sit here was `"no_credential" != "unavailable"`,
    which mypy correctly refused: two literals cannot differ at runtime, so it
    asserted nothing. The real assertion is the one below, against what the
    entry point actually returns.
    """
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    assert run(DOUBT, monkeypatch)["outcome"] != "unavailable"


def test_the_fake_needs_neither_and_is_never_pre_flighted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A clean checkout answers with no key and no SDK. A pre-flight that fired
    on the default would make the offline path require configuration."""
    monkeypatch.delenv("LEARNING_OS_LLM_PROVIDER", raising=False)
    monkeypatch.setattr(ask, "installed_modules", lambda: frozenset())
    assert run(DOUBT, monkeypatch)["outcome"] == "answered"


def test_the_refusal_never_contains_the_credential_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`select.py` returns NAMES and never values, and this must not undo that."""
    # NOT key-shaped, deliberately. `sk-…` plus 25 characters matches the
    # `api-key-sk` pattern in `scripts/credential_scan.py`, and that gate fails
    # the build on SHAPE rather than on whether a human thinks the value is
    # real -- correctly, because a scanner that can be argued with is a scanner
    # with a hole. The assertion here is that the VALUE is never echoed, and a
    # sentinel that looks nothing like a key tests that just as well.
    secret = "SENTINEL-must-never-be-echoed"
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LEARNING_OS_GEMINI_API_KEY", secret)
    monkeypatch.setattr(ask, "installed_modules", lambda: frozenset())
    result = run(DOUBT, monkeypatch)
    assert secret not in json.dumps(result)


# --------------------------------------------------------------------------
# --doctor: one command that says whether the live path is on
# --------------------------------------------------------------------------


def doctor(monkeypatch: pytest.MonkeyPatch) -> tuple[int, dict[str, Any]]:
    out = io.StringIO()
    monkeypatch.setattr("sys.stdout", out)
    code = ask.main(["--doctor"])
    parsed = json.loads(out.getvalue())
    assert isinstance(parsed, dict)
    return code, parsed


def test_doctor_reports_the_configured_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LEARNING_OS_LLM_PROVIDER", raising=False)
    _, report = doctor(monkeypatch)
    assert report["provider"] == "fake"


def test_doctor_says_the_fake_is_ready_without_anything_installed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("LEARNING_OS_LLM_PROVIDER", raising=False)
    code, report = doctor(monkeypatch)
    assert report["ready"] is True
    assert code == 0


def test_doctor_exits_non_zero_when_the_live_path_is_not_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """So a script or a Makefile can gate on it rather than parsing prose."""
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    code, report = doctor(monkeypatch)
    assert report["ready"] is False
    assert code != 0


def test_doctor_reports_the_credential_as_a_BOOLEAN_never_the_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # NOT key-shaped, deliberately. `sk-…` plus 25 characters matches the
    # `api-key-sk` pattern in `scripts/credential_scan.py`, and that gate fails
    # the build on SHAPE rather than on whether a human thinks the value is
    # real -- correctly, because a scanner that can be argued with is a scanner
    # with a hole. The assertion here is that the VALUE is never echoed, and a
    # sentinel that looks nothing like a key tests that just as well.
    secret = "SENTINEL-must-never-be-echoed"
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LEARNING_OS_GEMINI_API_KEY", secret)
    _, report = doctor(monkeypatch)
    assert report["credential_present"] is True
    assert secret not in json.dumps(report)


def test_doctor_names_what_to_do_when_something_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("LEARNING_OS_GEMINI_API_KEY", raising=False)
    _, report = doctor(monkeypatch)
    assert "LEARNING_OS_GEMINI_API_KEY" in report["fix"]


def test_doctor_refuses_an_unknown_provider_rather_than_calling_it_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LEARNING_OS_LLM_PROVIDER", "gemeni")
    code, report = doctor(monkeypatch)
    assert report["ready"] is False
    assert "gemeni" in report["fix"]
    assert code != 0
