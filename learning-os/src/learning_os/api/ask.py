"""The engine's doubt resolver, reachable from outside Python.

WHAT THIS CONNECTS, AND WHY IT WAS NOT CONNECTED
------------------------------------------------
`session/doubt.py` is the catch for a question the canvas cannot answer. Its own
docstring says so plainly: the canvas answers only from material the author
wrote, "that refusal is correct and it is a dead end... Nothing catches them.
This module is the catch."

It has been correct and completely unreachable since it was written. Nothing in
`api/` imported it, so its only caller was ever its own test suite, and the
canvas -- being TypeScript -- could not have called it even if something had. A
catch nothing calls is not a catch.

WHY A SUBPROCESS AND NOT A SERVER
---------------------------------
This repository contains no HTTP server anywhere; that was measured, not
assumed. Adding one means a framework, a port, a process to supervise and a
deployment story, all to move one JSON document between two languages already on
the same machine. Standard input and standard output move it for nothing.
`frontend/vite-plugin-engine.ts` spawns this, writes the doubt, reads the
answer, and the whole bridge dies with the dev server.

The cost is honest and worth stating: one process per question, and no memory
between them. Neither matters at one learner asking one question, and both are
the first things a real server would fix.

WHY A REFUSAL EXITS ZERO
------------------------
`UNMAPPABLE` is a first-class outcome. The engine declining to guess at a doubt
it cannot map is the correct answer, not a failure -- and a bridge that reported
it as a non-zero exit would teach the caller to treat "I would rather not guess"
as a bug worth removing. Every outcome here is a JSON document and an exit code
of zero. The exit code carries one thing only: whether the BRIDGE worked.

WHAT IT NEVER DOES
------------------
Writes a file. `api/cli.py` and `api/demo.py` lay down committed fixtures, and a
request handler that wrote to those paths would overwrite them with the output
of whatever somebody typed into a text box.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from typing import Any

from learning_os.api.emit import emit
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import LLMUnavailable
from learning_os.llm.contract import MAX_LESSON_QUESTION
from learning_os.llm.select import (
    client_from_env,
    configured_provider,
    missing_credential,
    missing_sdk,
)
from learning_os.memory.store import MemoryStore
from learning_os.runtime.loop import TurnStatus
from learning_os.session.doubt import Doubt, DoubtOutcome, resolve

__all__ = ["MAX_QUESTION", "answer", "diagnose", "installed_modules", "main"]


def installed_modules() -> frozenset[str] | None:
    """Which optional SDKs are importable, or `None` to look them up for real.

    A seam, and a deliberately dull one. The pre-flight below has to be
    assertable for the SDK-ABSENT case on a machine where the SDK is present,
    and the alternative -- tearing modules out of `sys.modules` inside a test --
    breaks every other test that happens to run after it in the same process.
    """
    return None


def _preflight(provider: str) -> dict[str, Any] | None:
    """What is missing before the provider can be called, or None.

    THE FAILURE THIS EXISTS FOR. Without it a misconfigured live provider comes
    back as a bare `unavailable`, which is the same string a genuine outage
    produces. The reader then checks their network while the actual fix is one
    `export` or one `pip install`. `api/speak.py` already solved this; this
    entry point is catching up.

    CREDENTIAL FIRST, THEN SDK, AND THE ORDER IS THE POINT. On a fresh checkout
    both are absent, and naming the SDK first has somebody install a package
    they still cannot use.

    Returns NAMES, never values. `select.py` holds that line and this must not
    undo it.
    """
    absent_key = missing_credential(provider)
    if absent_key is not None:
        return {
            "outcome": "no_credential",
            "refusal": (
                f"{absent_key} is not set, so provider {provider!r} cannot be called. "
                f"Export it, or unset LEARNING_OS_LLM_PROVIDER to run offline on the "
                f"deterministic fake."
            ),
        }

    absent_sdk = missing_sdk(provider, installed_modules())
    if absent_sdk is not None:
        return {
            "outcome": "no_sdk",
            "refusal": (
                f"{absent_sdk} is not importable, so provider {provider!r} cannot be "
                f"called. It is an optional dependency on purpose -- CI installs only "
                f"the base lock, so the suite cannot reach a provider. Install it with: "
                f"learning-os/.venv/bin/pip install --require-hashes -r "
                f"learning-os/requirements-live.lock"
            ),
        }

    return None


def diagnose() -> dict[str, Any]:
    """Whether the configured provider could actually be called, and what to fix.

    One command instead of reading three files. Reports the credential as a
    BOOLEAN and never as a value -- `select.py` returns names rather than
    secrets and this is the place that would most easily undo that, because a
    diagnostic is exactly the thing somebody pastes into a chat window.
    """
    try:
        provider = configured_provider()
    except LLMUnavailable as failure:
        return {
            "provider": None,
            "ready": False,
            "credential_present": False,
            "sdk_importable": False,
            "fix": str(failure),
        }

    absent_key = missing_credential(provider)
    absent_sdk = missing_sdk(provider, installed_modules())

    fixes: list[str] = []
    if absent_key is not None:
        fixes.append(f"export {absent_key}=... (from Google AI Studio; never commit it)")
    if absent_sdk is not None:
        fixes.append(
            "learning-os/.venv/bin/pip install --require-hashes -r "
            "learning-os/requirements-live.lock"
        )

    return {
        "provider": provider,
        "ready": not fixes,
        "credential_present": absent_key is None,
        "sdk_importable": absent_sdk is None,
        "fix": "  &&  ".join(fixes) if fixes else "nothing to do",
    }

#: An unbounded field on an endpoint is an unbounded prompt, and the engine is
#: charged per token even when whoever sent it is not.
MAX_QUESTION = MAX_LESSON_QUESTION

#: The same cap the canvas puts on a block id. Carried through untouched
#: otherwise: it is the canvas's value and this layer must not interpret it.
MAX_RESUME_AT = 64


def _fail(outcome: str, refusal: str, resume_at: str = "") -> dict[str, Any]:
    return {"outcome": outcome, "resume_at": resume_at, "refusal": refusal}


def _read(raw: str) -> tuple[Doubt | None, dict[str, Any] | None]:
    """Parse the request, or produce the document to return instead.

    A tuple rather than an exception, because the caller is a middleware reading
    stdout: a Python traceback there becomes a 500 with a stack trace in it, and
    the learner sees a blank panel with no reason in it.
    """
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        return None, _fail("bad_request", f"the request was not JSON: {error}")

    if not isinstance(payload, dict):
        return None, _fail("bad_request", "the request was not an object")

    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return None, _fail("bad_request", "the request carried no question")

    resume_at = payload.get("resume_at")
    skill = payload.get("lesson_skill")

    return (
        Doubt(
            text=text.strip()[:MAX_QUESTION],
            resume_at=resume_at[:MAX_RESUME_AT] if isinstance(resume_at, str) else "",
            lesson_skill=skill if isinstance(skill, str) else "",
        ),
        None,
    )


def _explain(outcome: DoubtOutcome) -> str:
    """A sentence for a learner, per outcome.

    `session/doubt.py` supplies its own wording for UNMAPPABLE and nothing for
    the rest, because the rest are not about the learner at all. Saying
    "generation failed" to somebody who just asked a question is a status
    message, not an answer.
    """
    if outcome is DoubtOutcome.UNAVAILABLE:
        return (
            "I could not reach the part of me that writes explanations. "
            "That is a problem on this end, not with your question."
        )
    if outcome is DoubtOutcome.GENERATION_FAILED:
        return (
            "I could not put together an explanation of that which I was willing "
            "to show you."
        )
    return "That is not something I can answer from here."


def answer(raw: str) -> dict[str, Any]:
    """One doubt in, one answer document out. Never raises.

    Separated from `main` so the whole path is testable without stdin, stdout or
    a process, and so the middleware's contract is a pure function of its
    request.
    """
    doubt, error = _read(raw)
    if doubt is None:
        return error if error is not None else _fail("bad_request", "unreadable request")

    try:
        provider = configured_provider()
        client = client_from_env()
    except LLMUnavailable as failure:
        return _fail("misconfigured", str(failure), doubt.resume_at)

    missing = _preflight(provider)
    if missing is not None:
        return {**missing, "resume_at": doubt.resume_at, "provider": provider}

    try:
        resolution = resolve(
            GRAPH,
            # A fresh store per request. Persisting across processes would mean
            # burning mechanisms for a learner this bridge cannot identify, and
            # the next real learner would inherit it.
            MemoryStore(),
            client,
            doubt,
            now=lambda: datetime.now(UTC),
        )
    except Exception as failure:
        # Returned, not swallowed. The engine raising is a real defect and the
        # caller has to see it -- but it must arrive as a document, because an
        # exception here reaches the middleware as unparseable stdout and the
        # learner gets a blank panel with no reason in it.
        return _fail(
            "engine_error",
            f"{type(failure).__name__}: {failure}",
            doubt.resume_at,
        )

    base: dict[str, Any] = {
        "outcome": resolution.outcome.value,
        "resume_at": resolution.resume_at,
        "provider": provider,
    }

    if resolution.outcome is not DoubtOutcome.ANSWERED:
        base["refusal"] = resolution.refusal or _explain(resolution.outcome)
        return base

    turn = resolution.turn
    if turn is None or turn.content is None or turn.status is not TurnStatus.TAUGHT:
        # Structurally unreachable: ANSWERED is set only when the turn taught.
        # Stated anyway, because the alternative is an AttributeError crossing a
        # process boundary as stdout nothing can parse.
        base["outcome"] = "engine_error"
        base["refusal"] = "the engine reported an answer with nothing in it"
        return base

    # The same emitter as the committed fixtures, so what crosses the bridge is a
    # payload the canvas already knows how to validate and render.
    base["lesson"] = emit(turn.contract, turn.content).as_payload()
    return base


def main(argv: list[str] | None = None) -> int:
    """Read one request from stdin, write one document to stdout.

    Returns 0 for every OUTCOME, including a refusal: the exit code says whether
    the BRIDGE worked, and a refusal is an outcome rather than a failure. The one
    exception is `--doctor`, which is a check rather than a request, so a script
    or a Makefile can gate on it instead of parsing prose.
    """
    args = sys.argv[1:] if argv is None else argv

    if "--doctor" in args:
        report = diagnose()
        sys.stdout.write(json.dumps(report, indent=2))
        return 0 if report["ready"] else 1

    sys.stdout.write(json.dumps(answer(sys.stdin.read())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
