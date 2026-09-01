"""Steps that drive the REAL tutor. No mocks, no stubs, no patching.

Every step below starts an actual process, writes actual bytes to its stdin,
and reads what a student would actually get back. If the tutor breaks, these
fail. That is the entire reason this suite exists beside the unit tests: a
test that calls a function directly proves the code agrees with itself, and
real life does not depend on this code agreeing with itself.
"""

from __future__ import annotations

import json
import os
import sys
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from behave import given, then, when  # pyright: ignore[reportMissingImports]

REPO = Path(__file__).resolve().parents[2]
LEARNING_OS = REPO / "learning-os"
#
# THE INTERPRETER, RESOLVED FOR THE MACHINE THIS IS RUNNING ON.
#
# `.venv/bin/python` was hardcoded, and the suite HAD NEVER EXECUTED ON A
# RUNNER: GitHub installs the hash-locked dependencies into the job's own
# Python, builds no repo-local venv, and `real-tutor` died in before_all with
# "the interpreter this suite drives is missing" -- 15 scenarios, 60 steps,
# all UNTESTED, on every run since the job existed. A suite that only runs on
# a laptop with one particular directory layout is a suite about that laptop.
#
# Order: an explicit override wins (CI can point anywhere), the repo venv wins
# on a developer machine (it is the interpreter with the product installed),
# and the interpreter running behave is the honest fallback -- on CI it is
# exactly the one the workflow just installed the dependencies into.
PYTHON = Path(os.environ.get("LEARNING_OS_PYTHON") or "") if os.environ.get(
    "LEARNING_OS_PYTHON"
) else (
    REPO / ".venv" / "bin" / "python"
    if (REPO / ".venv" / "bin" / "python").is_file()
    else Path(sys.executable)
)

#: Things a stack trace says. A student must never see any of them.
TRACEBACK_TELLS = ("Traceback (most recent call last)", 'File "', "  at ")


def _ask(question: str | None, *, learner: str, raw: str | None = None,
         drop_keys: bool = True,
         extra_env: dict[str, str] | None = None) -> tuple[int, str, str]:
    payload = raw if raw is not None else json.dumps(
        {"text": question, "learner_id": learner, "session_id": f"session-{learner}"}
    )
    env = dict(os.environ)
    env["PYTHONPATH"] = str(LEARNING_OS / "src")
    if drop_keys:
        for key in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY",
                    "GOOGLE_API_KEY", "OPENAI_API_KEY"):
            env.pop(key, None)
    if extra_env:
        env.update(extra_env)

    result = subprocess.run(
        [str(PYTHON), "-m", "learning_os.api.ask"],
        input=payload, cwd=str(LEARNING_OS), env=env,
        capture_output=True, text=True, timeout=120, check=False,
    )
    return result.returncode, result.stdout, result.stderr


def _document(context) -> dict:
    try:
        return json.loads(context.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(
            f"the tutor did not answer with a document a program can read: {exc}\n"
            f"it printed: {context.stdout[:400]!r}"
        ) from None


# ---------------------------------------------------------------- given ----

@given('a student called "{name}"')
def step_a_student(context, name: str) -> None:
    context.learner = name
    context.answers = []


@given("there is no API key configured")
def step_no_api_key(context) -> None:
    # Already the default in `_ask`; stated here because the scenario is about
    # this condition and a reader must see it is real, not assumed.
    context.drop_keys = True


def _an_engine_serving(context, results: list[dict[str, str]]) -> None:
    """A real search engine on a loopback socket, for the life of one scenario.

    As real as the tutor can tell: the child process reaches it through
    `urllib` over an actual socket, exactly as it would reach Brave or a
    SearxNG. The scenario owns the server and behave's cleanup closes it.

    A HARD FAILURE WHEN THE SOCKET CANNOT BIND, never a skip -- the same rule
    `tests/db/conftest.py` states: the absence of an environment must not
    masquerade as a passing suite. Sandboxed dev shells forbid binding; the CI
    runner that this suite exists for does not.
    """
    body = json.dumps({"results": results}).encode("utf-8")

    class Engine(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 -- the stdlib names this method
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args) -> None:
            """Silence: request lines on stderr read as tracebacks to a step."""

    try:
        server = HTTPServer(("127.0.0.1", 0), Engine)
    except PermissionError as denied:
        raise RuntimeError(
            "this environment forbids binding a loopback socket, so there is "
            "no engine for this scenario; run where sockets are permitted "
            "(the CI runner is)"
        ) from denied
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    context.add_cleanup(server.shutdown)
    # The literal spelling of `learning_os.websearch.ENDPOINT_ENV`, which the
    # child process reads. A literal, because this steps file runs OUTSIDE the
    # engine's package path and an import here would be a second installation
    # requirement for the suite.
    #
    # THE DETERMINISTIC FAKE, PINNED ON PURPOSE. CI exports
    # `LEARNING_OS_LLM_PROVIDER: groq` for this suite, and a grounded scenario
    # riding the real model fails on any day the daily token budget is spent --
    # a red required check about a vendor's clock, not about this code. What
    # these scenarios prove is the RETRIEVAL path: a real process reaching a
    # real engine over a real socket, sources entering the contract, the
    # citation rules deciding. The fake is the reference implementation of the
    # model boundary and honours sourced contracts deterministically; "a real
    # model answered" stays proven by the scenarios that exist to prove it.
    context.search_env = {
        "LEARNING_OS_SEARCH_ENDPOINT":
            f"http://127.0.0.1:{server.server_port}/search?q={{query}}&n={{limit}}",
        "LEARNING_OS_LLM_PROVIDER": "fake",
    }


@given("a search engine that knows about baking")
def step_engine_with_baking(context) -> None:
    _an_engine_serving(context, [{
        "url": "https://cooking.example/cake",
        "title": "Baking a chocolate cake",
        "snippet": ("Cream the butter and sugar, add eggs, fold in flour and "
                    "cocoa, bake at 180C for thirty minutes."),
    }])


@given("a search engine that knows nothing")
def step_engine_with_nothing(context) -> None:
    _an_engine_serving(context, [])


@given("a class of {count:d} students")
def step_a_class(context, count: int) -> None:
    questions = [
        "why does recursion need a base case?",
        "what is a call stack?",
        "what is a recursive case?",
        "what is stack depth?",
    ]
    context.classroom = {
        f"student-{i:02d}": questions[i % len(questions)] for i in range(count)
    }


# ----------------------------------------------------------------- when ----

@when('she asks "{question}"')
def step_she_asks(context, question: str) -> None:
    context.question = question
    context.returncode, context.stdout, context.stderr = _ask(
        question, learner=getattr(context, "learner", "ada"),
        extra_env=getattr(context, "search_env", None),
    )
    context.answers.append(context.stdout)


@when("she asks the same thing again")
def step_asks_again(context) -> None:
    code, out, err = _ask(context.question, learner=context.learner)
    context.returncode, context.stdout, context.stderr = code, out, err
    context.answers.append(out)


@when('she sends the raw request "{raw}"')
def step_raw_request(context, raw: str) -> None:
    context.returncode, context.stdout, context.stderr = _ask(
        None, learner=getattr(context, "learner", "ada"), raw=raw
    )


@when("she sends nothing at all")
def step_sends_nothing(context) -> None:
    # Its own step because behave's `{raw}` placeholder cannot match an empty
    # string, and an empty box is the most ordinary thing a person does.
    context.returncode, context.stdout, context.stderr = _ask(
        None, learner=getattr(context, "learner", "ada"), raw=""
    )


@when("she sends only whitespace")
def step_sends_whitespace(context) -> None:
    context.returncode, context.stdout, context.stderr = _ask(
        None, learner=getattr(context, "learner", "ada"), raw="   \n  "
    )


@when("they all ask at the same moment")
def step_all_at_once(context) -> None:
    def one(item: tuple[str, str]) -> tuple[str, str, int, str, str]:
        learner, question = item
        code, out, err = _ask(question, learner=learner)
        return learner, question, code, out, err

    with ThreadPoolExecutor(max_workers=8) as pool:
        context.classroom_results = list(pool.map(one, context.classroom.items()))


# ----------------------------------------------------------------- then ----

@then("she gets a lesson she can read")
@then("she still gets a lesson she can read")
def step_gets_a_lesson(context) -> None:
    assert context.returncode == 0, (
        f"the tutor exited {context.returncode}: {context.stderr[:400]}"
    )
    document = _document(context)
    assert document["outcome"] == "answered", document
    lesson = document["lesson"]
    assert lesson["blocks"], "a lesson with no content is not a lesson"
    for block in lesson["blocks"]:
        assert block.get("kind"), "a block the canvas cannot draw is a blank screen"


@then("the lesson is about the thing she asked")
def step_lesson_is_about_it(context) -> None:
    lesson = _document(context)["lesson"]
    assert lesson["question"] == context.question, (
        f"she asked {context.question!r} and was answered {lesson['question']!r}"
    )


@then("the tutor says it does not cover that")
def step_says_it_does_not_know(context) -> None:
    document = _document(context)
    assert document["outcome"] != "answered", (
        f"the tutor invented a lesson for {context.question!r}"
    )
    assert document.get("refusal", "").strip(), "a refusal with no reason teaches nothing"


@then("the lesson names where the answer came from")
def step_names_its_source(context) -> None:
    """A grounded answer a learner cannot check is a guess wearing a citation.

    Two assertions on purpose: `sources` is the machine-readable claim, and the
    URL inside the lesson text is what the learner actually sees. Either alone
    can lie -- a sources list nothing displays, or a URL the document does not
    stand behind.
    """
    document = _document(context)
    sources = document.get("sources")
    assert sources, "an answer from the web arrived with no sources listed"
    lesson_text = json.dumps(document.get("lesson", {}))
    assert any(url in lesson_text for url in sources), (
        f"none of {sources} appears in the lesson a learner reads"
    )


@then("no lesson is invented")
def step_no_lesson_invented(context) -> None:
    document = _document(context)
    assert not document.get("lesson"), (
        "a refusal carrying a lesson is the invention, wearing a refusal"
    )


@then("she is never shown the inside of the program")
def step_no_traceback(context) -> None:
    combined = context.stdout + context.stderr
    for tell in TRACEBACK_TELLS:
        assert tell not in combined, (
            f"a student was shown {tell!r}\n"
            f"stdout: {context.stdout[:300]!r}\nstderr: {context.stderr[:300]!r}"
        )


@then("the tutor answers with a document a program can read")
def step_answers_with_a_document(context) -> None:
    assert context.returncode == 0, (
        f"the tutor crashed with exit {context.returncode}: {context.stderr[:400]}"
    )
    document = _document(context)
    assert isinstance(document.get("outcome"), str) and document["outcome"]


@then("both answers are usable")
def step_both_usable(context) -> None:
    assert len(context.answers) == 2
    for raw in context.answers:
        document = json.loads(raw)
        assert document["outcome"] == "answered", document
        assert document["lesson"]["blocks"], "an answer came back empty"


@then("every student gets their own answer")
def step_every_student_answered(context) -> None:
    assert len(context.classroom_results) == len(context.classroom)
    for learner, _question, code, out, err in context.classroom_results:
        assert code == 0, f"{learner} got exit {code}: {err[:200]}"
        assert json.loads(out)["outcome"] in {"answered", "unmappable"}


@then("nobody gets another student's lesson")
def step_no_crossed_wires(context) -> None:
    for learner, question, _code, out, _err in context.classroom_results:
        document = json.loads(out)
        if document["outcome"] == "answered":
            assert document["lesson"]["question"] == question, (
                f"{learner} asked {question!r} and was answered "
                f"{document['lesson']['question']!r} -- one child got another's lesson"
            )


@then("the answer says which provider produced it")
def step_provider_is_named(context) -> None:
    document = _document(context)
    assert document.get("provider"), "the answer does not say what produced it"
    assert document["provider"] == "fake", (
        "with no key configured the offline provider must answer, and say so"
    )
