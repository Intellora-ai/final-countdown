"""Steps that drive the real memory service over real HTTP.

NOTHING IS IMPORTED FROM THE PRODUCT. Every step sends bytes to a socket and
reads bytes back, exactly as a browser does. A test that calls a function proves
the code agrees with itself; this suite exists because that is not enough.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from behave import given, then, use_step_matcher, when  # pyright: ignore[reportMissingImports]

from environment import BASE, record_exchange  # pyright: ignore[reportMissingImports]

#: A record the product would really store. Kept whole here so a step can prove
#: byte-for-byte round tripping rather than "something came back".
def a_memory(what: str, how: str) -> dict:
    return {
        "whatExplained": [what],
        "howExplained": [how],
        "level": "getting-it",
        "mistakes": [],
        "mastery": 0.4,
        "updatedAt": "2026-08-31T00:00:00.000Z",
    }


#: ONE COOKIE JAR PER PERSON, WHICH IS WHAT A PERSON ACTUALLY IS.
#:
#: WHY THIS REPLACED SENDING `studentId` IN THE PAYLOAD.
#:   The server used to believe whatever `studentId` the caller typed. That was
#:   the defect: anyone could read anyone's work by changing one word. It now
#:   assigns an identity, signs it, and returns it in a cookie -- so a caller
#:   cannot name a student at all, any more than a browser can decide who is
#:   logged in.
#:
#:   These scenarios were written against the old shape and drove it with a
#:   client that kept NO cookies, so every single request arrived as a brand-new
#:   person and "ada" was a different student each time she was mentioned.
#:
#: THIS MAKES THE SCENARIOS HARDER, NOT SOFTER, AND THAT IS THE POINT.
#:   Not one assertion changed. What changed is what "two students" MEANS. It
#:   used to mean two different strings in a JSON body -- the very thing that
#:   was forgeable. It now means two separate browsers that cannot see each
#:   other's cookie, which is what two students in a classroom really are.
JARS: dict[str, str] = {}


def _send(
    method: str, body: dict | None, query: str = "", who: str | None = None
) -> tuple[int, str]:
    """One real request to the memory route, as one real browser."""
    url = f"{BASE}/api/memory{query}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"content-type": "application/json"}
    #: `who is None` is a caller with NO cookie at all -- a first visit, or an
    #: outright forgery attempt. Both are real and both are tested.
    if who is not None and who in JARS:
        headers["Cookie"] = JARS[who]
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    record_exchange()

    def keep(response) -> None:
        """Remember the identity the server issued, exactly as a browser does."""
        if who is None:
            return
        for planted in response.headers.get_all("Set-Cookie") or []:
            JARS[who] = planted.split(";")[0]

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            keep(response)
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        keep(exc)
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        # A dropped connection is a LOST MEMORY, not a broken test. Recorded so
        # the assertion can say what she actually lost.
        return 0, f"the connection was dropped: {exc}"


def write_memory(student: str, tab: str, lesson: str, record: dict) -> tuple[int, str]:
    """Save as this student -- identified by her cookie, never by a field.

    `studentId` is deliberately ABSENT from the body. The server would refuse it
    with 403 if it disagreed with the signed cookie, and there is no longer any
    way for a caller to assert who it is. That refusal is itself tested, in
    `answering.feature`'s forgery scenario and in `m2-isolation.test.ts`.
    """
    return _send(
        "PUT",
        {"tabId": tab, "lessonId": lesson, "record": record},
        who=student,
    )


def read_memory(student: str, tab: str, lesson: str) -> tuple[int, str]:
    query = (
        f"?tabId={urllib.parse.quote(tab)}"
        f"&lessonId={urllib.parse.quote(lesson)}"
    )
    return _send("GET", None, query, who=student)


# --------------------------------------------------------------- given ----

@given("the canvas memory service is running")
def step_service_running(context) -> None:
    """It ANSWERS -- which is not the same as "a particular process is alive".

    This asserted `context.server.poll() is None`, and that broke the moment a
    scenario restarted the server: the restart replaced the process, so every
    LATER scenario checked a handle that was correctly dead and refused to run.
    Measured: twelve of thirteen scenarios failed on a service that was up and
    answering the whole time.

    "Running" means a student could use it. Asking the socket is asking the
    real question; asking a PID is asking about our own bookkeeping.
    """
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(f"{BASE}/api/health", timeout=10) as response:
            alive = response.status == 200
    except (urllib.error.URLError, OSError):
        alive = False

    assert alive, (
        f"nothing is answering at {BASE}, so nothing below is being tested"
    )
    context.written = {}


@given('"{student}" has been taught something in tab "{tab}" of lesson "{lesson}"')
def step_taught(context, student: str, tab: str, lesson: str) -> None:
    record = a_memory(f"{lesson} idea one", "plain sentences")
    status, body = write_memory(student, tab, lesson, record)
    assert status == 200, f"the first save was refused with {status}: {body[:200]}"
    context.written[(student, tab, lesson)] = record


@given('"{student}" has been taught something different in tab "{tab}" of lesson "{lesson}"')
def step_taught_different(context, student: str, tab: str, lesson: str) -> None:
    record = a_memory(f"{student}/{tab}/{lesson} idea two", "a worked example")
    status, body = write_memory(student, tab, lesson, record)
    assert status == 200, f"the second save was refused with {status}: {body[:200]}"
    context.written[(student, tab, lesson)] = record


# ---------------------------------------------------------------- when ----

@when("the server is restarted")
def step_restart(context) -> None:
    import subprocess
    import time
    from environment import (  # pyright: ignore[reportMissingImports]
        FRONTEND, PORT, _env_without_keys, _wait_for_health, remember_server, stop_every_server,
    )

    #: Stops the tracked server, not just this scenario's copy of the handle.
    stop_every_server()

    env = _env_without_keys()
    env["PORT"] = str(PORT)
    env["HOST"] = "127.0.0.1"
    env["OLLAMA_MODEL"] = "a-model-that-is-not-running"
    env["OLLAMA_ENDPOINT"] = "http://127.0.0.1:1"
    env["ALMANAC_LEDGER"] = str(FRONTEND / "features" / ".ledger-under-test.json")
    env["CANVAS_MEMORY_DB"] = str(FRONTEND / "features" / ".memory-under-test.db")

    context.server = subprocess.Popen(
        ["node", "dist-server/index.js"],
        cwd=str(FRONTEND), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    remember_server(context.server)
    assert _wait_for_health(time.time() + 45), "the server did not come back up"


@when("she closes everything and opens it again later")
def step_comes_back(context) -> None:
    """No browser state is carried. The server is the memory, which is the point:
    a memory that only survives because the tab stayed open is not a memory."""
    context.reopened = True


@when("that lesson is read twice")
def step_read_twice(context) -> None:
    context.first = read_memory("ada", "tab-1", "gas")
    context.second = read_memory("ada", "tab-1", "gas")


@when("a lesson nobody has studied is read")
def step_read_unknown(context) -> None:
    context.status, context.body = read_memory("ada", "tab-1", "a-lesson-never-opened")


# A REGEX MATCHER, FOR ONE STEP, BECAUSE THE EMPTY CASES ARE THE POINT.
#
# behave's default `{name}` placeholder requires at least one character, so
# every blank cell in the examples table failed to bind and the four scenarios
# that matter most -- the ones with a MISSING student, tab or lesson -- were
# reported as "undefined" rather than run. A blank identifier is exactly the
# input that must be refused, so it cannot be the input the harness is unable
# to express.
use_step_matcher("re")


@when(r'memory is written with student "(?P<student>[^"]*)", '
      r'tab "(?P<tab>[^"]*)", lesson "(?P<lesson>[^"]*)"')
def step_write_bad_key(context, student: str, tab: str, lesson: str) -> None:
    """A key that cannot be built must be refused, never guessed at.

    SENT WITH NO COOKIE AND WITH `studentId` NAMED OUTRIGHT, which is the one
    place in this suite that still does either. That is deliberate: this
    scenario is about what happens when the parts of a key are missing, and a
    caller who has no identity and names an empty one is exactly that. A jar
    here would supply the very part the scenario is withholding.
    """
    context.status, context.body = _send(
        "PUT",
        {
            "studentId": student,
            "tabId": tab,
            "lessonId": lesson,
            "record": a_memory("something", "somehow"),
        },
    )


use_step_matcher("parse")


@when("memory is written with a record larger than the limit")
def step_write_too_big(context) -> None:
    """One student must not be able to fill the disk.

    The ceiling is the store's, not the canvas's: it is the difference between
    a bounded system and one that falls over on a Tuesday. 300 KB is over the
    256 KB limit with room to spare, so this does not depend on the exact
    encoded size of the padding.
    """
    context.partial_key = ("ada", "tab-1", "far-too-big")
    context.status, context.body = _send(
        "PUT",
        {
            "tabId": "tab-1",
            "lessonId": "far-too-big",
            "record": {"whatExplained": ["x" * 300_000]},
        },
        #: The SAME jar the follow-up read uses. Without this the read would
        #: arrive as a different student and find nothing for the wrong reason,
        #: so "the lesson still holds nothing" would pass even if the oversized
        #: record HAD been stored.
        who="ada",
    )


@when("memory is written with no record at all")
def step_write_no_record(context) -> None:
    """Saving nothing is not saving. It must be refused, not quietly accepted:
    a 200 here tells a student her work is safe when nothing was written."""
    context.partial_key = ("ada", "tab-1", "nothing-sent")
    context.status, context.body = _send(
        "PUT",
        {"tabId": "tab-1", "lessonId": "nothing-sent"},
        who="ada",  # same jar as the follow-up read; see the note above
    )


@when("{count:d} students all save their work at the same moment")
def step_whole_class(context, count: int) -> None:
    context.classroom = [(f"student-{i:02d}", "tab-1", "gas") for i in range(count)]

    def one(key: tuple[str, str, str]) -> tuple[tuple[str, str, str], int, str]:
        student, tab, lesson = key
        record = a_memory(f"idea for {student}", "their own angle")
        status, body = write_memory(student, tab, lesson, record)
        return key, status, body

    with ThreadPoolExecutor(max_workers=count) as pool:
        context.class_results = list(pool.map(one, context.classroom))


# ---------------------------------------------------------------- then ----

def _record_from(body: str) -> dict | None:
    try:
        return json.loads(body).get("record")
    except Exception:
        return None


@then("reading that lesson back returns exactly what she was taught")
def step_survives(context) -> None:
    status, body = read_memory("ada", "tab-1", "gas")
    assert status == 200, f"the read failed with {status}: {body[:200]}"
    got = _record_from(body)
    want = context.written[("ada", "tab-1", "gas")]
    assert got == want, (
        "her memory did not survive.\n"
        f"  saved: {json.dumps(want, sort_keys=True)}\n"
        f"  read : {json.dumps(got, sort_keys=True)}"
    )


@then("each lesson returns only its own memory")
def step_no_lesson_leak(context) -> None:
    _no_leak(context)


@then("each tab returns only its own memory")
def step_no_tab_leak(context) -> None:
    _no_leak(context)


@then("each student returns only their own memory")
def step_no_student_leak(context) -> None:
    _no_leak(context)


def _no_leak(context) -> None:
    complaints = []
    for (student, tab, lesson), want in context.written.items():
        status, body = read_memory(student, tab, lesson)
        got = _record_from(body)
        if got != want:
            complaints.append(
                f"  {student}/{tab}/{lesson}\n"
                f"    saved: {json.dumps(want, sort_keys=True)}\n"
                f"    read : {json.dumps(got, sort_keys=True)}"
            )
    assert not complaints, (
        "one memory has leaked into another. What was saved under one key came "
        "back under a different one:\n" + "\n".join(complaints)
    )


@then("both reads are identical")
def step_deterministic(context) -> None:
    assert context.first == context.second, (
        "the same key read twice gave two different answers, so retrieval is not "
        f"deterministic.\n  first : {context.first[1][:200]}\n  second: {context.second[1][:200]}"
    )


@then("the answer is plainly empty")
def step_plainly_empty(context) -> None:
    assert context.status in (200, 404), (
        f"reading an unknown lesson answered {context.status}: {context.body[:200]}"
    )
    got = _record_from(context.body)
    assert got in (None, {}), (
        f"a lesson nobody has studied came back with something in it: {context.body[:200]}"
    )


@then("the write is refused in words")
def step_refused_in_words(context) -> None:
    """Refused, and the reply says why.

    400 and 413 are both refusals, and which one is right depends on WHY: a
    broken key is a bad request, a record over the limit is too large. This
    asserted 400 alone, so the server sending the MORE correct status for an
    oversized save failed the test. The scenario says "refused in words" -- the
    words are the promise, not one particular number.

    What is NOT accepted is a 2xx. Telling a student her work saved when it did
    not is the failure this whole scenario exists to catch.
    """
    assert context.status in (400, 413), (
        f"a broken write was answered {context.status} instead of being refused: "
        f"{context.body[:200]}"
    )
    try:
        said = json.loads(context.body)
    except Exception:
        raise AssertionError(f"the refusal was not readable JSON: {context.body[:200]}") from None
    message = str(said.get("error", ""))
    assert len(message.strip()) > 10, (
        f"the write was refused without saying why: {context.body[:200]}"
    )


@then("the lesson still holds nothing")
def step_still_empty(context) -> None:
    student, tab, lesson = context.partial_key
    status, body = read_memory(student, tab, lesson)
    got = _record_from(body)
    assert got in (None, {}), (
        "a record that was refused was stored anyway, so a half-written memory "
        f"is now readable: {body[:200]}"
    )


@then("all {count:d} memories are stored and readable")
def step_class_survived(context, count: int) -> None:
    refused = [(k, s, b[:100]) for k, s, b in context.class_results if s != 200]
    assert not refused, (
        f"{len(refused)} of {count} students were refused outright: {refused[:4]}"
    )

    lost = []
    for student, tab, lesson in context.classroom:
        status, body = read_memory(student, tab, lesson)
        got = _record_from(body)
        if got is None or got.get("whatExplained") != [f"idea for {student}"]:
            lost.append(student)
    assert not lost, (
        f"{len(lost)} of {count} students lost their work when the class saved "
        f"together: {lost[:8]}\n"
        "Every one of those requests was answered, so they were told it saved."
    )


# ------------------------------------------- what already happened --------
#
# THESE STEPS DRIVE THE SAME SOCKET AND THE SAME ROUTE AS EVERYTHING ABOVE.
# Nothing is imported from the product, and no rule is checked in Python. A
# refusal is only real if the server sends it.
#
# WHY THE RECORD HERE IS NOT `a_memory()`. That fixture carries a `mastery`
# field this product does not have, and nothing in it says which lesson it
# belongs to -- so the rules these scenarios are about have nothing true to say
# about it and it is stored exactly as sent. The record below is the one the
# canvas really writes: `TeachProgress` in `src/canvas/teach/teachStore.ts`.
# `revealed` is the fact with the meaning people call mastery: how much of the
# lesson she has uncovered.

#: A real millisecond, fixed rather than `time.time()` so a failure message
#: reads the same on every machine and can be compared to the reply by eye.
BASE_INSTANT = 1_756_600_000_000


def a_question(at: int, beat: str, text: str) -> dict:
    """One question she typed, in the shape `TeachProgress.asked` really holds."""
    return {
        "at": at,
        "beatId": beat,
        "doubt": {"text": text, "atBeatId": beat},
        "pending": False,
    }


def a_lesson_in_progress(lesson: str, revealed: int, asked: list | None = None) -> dict:
    """What the canvas keeps for one lesson after she has done some of it."""
    questions = list(asked or [])
    return {
        "lessonId": lesson,
        "revealed": revealed,
        "asked": questions,
        "draft": "",
        "questionsAsked": len(questions),
        "emptyAnswers": 0,
        "struggleReported": False,
    }


# --------------------------------------------------------------- given ----

@given('"{student}" has uncovered {revealed:d} steps of lesson "{lesson}" in tab "{tab}"')
def step_has_uncovered(context, student: str, revealed: int, lesson: str, tab: str) -> None:
    """The starting point, READ BACK rather than assumed.

    A 200 says the server accepted the request. It does not say the work is
    there, and every scenario below is about what a later save does to work that
    IS there. Trusting the tick would let all six of them pass against an empty
    lesson.
    """
    record = a_lesson_in_progress(lesson, revealed)
    status, body = write_memory(student, tab, lesson, record)
    assert status == 200, (
        f"she could not even start: saving {revealed} uncovered steps of "
        f"\"{lesson}\" was answered {status}: {body[:200]}"
    )
    status, body = read_memory(student, tab, lesson)
    got = _record_from(body)
    assert got == record, (
        f"the work she starts from is not there, so nothing below is tested.\n"
        f"  saved: {json.dumps(record, sort_keys=True)}\n"
        f"  read : {json.dumps(got, sort_keys=True)}"
    )
    context.who = (student, tab, lesson)
    context.stored = record


# ---------------------------------------------------------------- when ----

@when("she uncovers {more:d} more steps of that lesson")
def step_uncovers_more(context, more: int) -> None:
    student, tab, lesson = context.who
    record = a_lesson_in_progress(lesson, context.stored["revealed"] + more)
    context.status, context.body = write_memory(student, tab, lesson, record)
    context.stored = record


@when("a save arrives claiming she has uncovered only {revealed:d} steps")
def step_save_goes_backwards(context, revealed: int) -> None:
    """The save a stale tab really sends: a second window that still believes
    the lesson is where it was ten minutes ago, saving on top of the newer one."""
    student, tab, lesson = context.who
    context.status, context.body = write_memory(
        student, tab, lesson, a_lesson_in_progress(lesson, revealed)
    )
    #: The refusal has to say WHICH numbers clashed, or nobody reading it can
    #: tell how much work was at risk.
    context.must_name = [str(context.stored["revealed"]), str(revealed)]


@when("she asks two questions that land in the same millisecond")
def step_two_in_one_millisecond(context) -> None:
    """A pasted question and a typed one, or a double tap on send.

    EQUAL TIMESTAMPS ARE A TRUE HISTORY, not a broken one. `at` is milliseconds,
    and refusing two events that share one would throw away work she really did.
    """
    student, tab, lesson = context.who
    both = [
        a_question(BASE_INSTANT, "beat-2", "why does that step follow?"),
        a_question(BASE_INSTANT, "beat-2", "and what if it did not?"),
    ]
    record = a_lesson_in_progress(lesson, context.stored["revealed"], both)
    context.status, context.body = write_memory(student, tab, lesson, record)
    context.stored = record


@when("a save arrives with her second question dated before her first")
def step_save_out_of_order(context) -> None:
    student, tab, lesson = context.who
    record = a_lesson_in_progress(
        lesson,
        context.stored["revealed"],
        [
            a_question(BASE_INSTANT + 50, "beat-2", "why does that step follow?"),
            a_question(BASE_INSTANT, "beat-3", "and what if it did not?"),
        ],
    )
    context.status, context.body = write_memory(student, tab, lesson, record)
    context.must_name = [str(BASE_INSTANT), str(BASE_INSTANT + 50)]


@when('a save arrives under that lesson carrying work that says it belongs to "{other}"')
def step_save_wrong_lesson(context, other: str) -> None:
    """The lesson id is written in TWO places -- the key it is filed under and
    the record itself. When they disagree there is no way to tell which is
    right, and guessing puts one lesson's afternoon inside another."""
    student, tab, lesson = context.who
    context.other_lesson = other
    context.status, context.body = write_memory(
        student, tab, lesson, a_lesson_in_progress(other, context.stored["revealed"])
    )
    context.must_name = [other, lesson]


# ---------------------------------------------------------------- then ----

@then("the lesson remembers all {revealed:d} steps")
def step_remembers_all(context, revealed: int) -> None:
    student, tab, lesson = context.who
    assert context.status == 200, (
        f"she did more of the lesson and the save was answered {context.status}, "
        f"so going forwards was refused: {context.body[:200]}"
    )
    status, body = read_memory(student, tab, lesson)
    assert status == 200, f"the read failed with {status}: {body[:200]}"
    got = _record_from(body)
    assert got == context.stored, (
        "what came back is not what she just did.\n"
        f"  saved: {json.dumps(context.stored, sort_keys=True)}\n"
        f"  read : {json.dumps(got, sort_keys=True)}"
    )
    assert (got or {}).get("revealed") == revealed, (
        f"the lesson should remember {revealed} uncovered steps and remembers "
        f"{(got or {}).get('revealed')}"
    )


@then("the save is refused with a sentence naming the problem")
def step_refused_with_a_sentence(context) -> None:
    """Refused, and the reply is something she could act on.

    409 IS THE ANSWER, AND WHICH NUMBER IT IS MATTERS HERE. A 2xx is the failure
    this whole block exists to catch: it tells her the work saved when it was
    thrown away. A 400 would be wrong in the other direction -- it says the
    request was malformed, sending the tab off to fix its JSON, when the request
    is fine and it is the STATE that has moved on. 409 says "you are out of step
    with what is stored", which is the one thing a client can actually use: read
    again, then try again.
    """
    assert context.status == 409, (
        f"a save that contradicts stored work was answered {context.status}. "
        "A 2xx would tell her it saved when it did not; a 400 would send the "
        "tab away to fix a request that is not broken. "
        f"The reply was: {context.body[:200]}"
    )
    try:
        said = json.loads(context.body)
    except Exception:
        raise AssertionError(
            f"the refusal was not readable JSON: {context.body[:200]}"
        ) from None
    message = str(said.get("error", "")).strip()
    assert len(message.split()) >= 4, (
        "the save was refused without a sentence anybody could act on. A bare "
        f"code or a word is not an explanation: {context.body[:200]}"
    )
    missing = [naming for naming in getattr(context, "must_name", []) if naming not in message]
    assert not missing, (
        "the refusal does not say what actually clashed, so nobody reading it "
        f"can tell which work is at risk. It never mentions {missing}.\n"
        f"  it said: {message}"
    )


@then("her earlier work is still exactly as she left it")
def step_earlier_work_untouched(context) -> None:
    """A refusal that half-applied is the worst outcome of the three.

    Accepting nonsense loses her work and refusing it keeps her work; writing
    part of it leaves a lesson that is neither, and nothing anywhere says so.
    """
    student, tab, lesson = context.who
    status, body = read_memory(student, tab, lesson)
    assert status == 200, f"the read after a refusal failed with {status}: {body[:200]}"
    got = _record_from(body)
    assert got == context.stored, (
        "a save that was REFUSED still changed what was stored, so a rejected "
        "request cost her work anyway.\n"
        f"  she had : {json.dumps(context.stored, sort_keys=True)}\n"
        f"  now has : {json.dumps(got, sort_keys=True)}"
    )


@then("both questions are remembered, in the order she asked them")
def step_both_questions_remembered(context) -> None:
    student, tab, lesson = context.who
    assert context.status == 200, (
        "two questions that landed in the same millisecond were refused, so a "
        "history the canvas really produces cannot be saved at all: "
        f"{context.status} {context.body[:200]}"
    )
    status, body = read_memory(student, tab, lesson)
    assert status == 200, f"the read failed with {status}: {body[:200]}"
    got = _record_from(body) or {}
    assert got.get("asked") == context.stored["asked"], (
        "the two questions did not come back the way she asked them.\n"
        f"  asked: {json.dumps(context.stored['asked'], sort_keys=True)}\n"
        f"  read : {json.dumps(got.get('asked'), sort_keys=True)}"
    )


@then('lesson "{other}" still holds nothing of hers')
def step_other_lesson_untouched(context, other: str) -> None:
    student, tab, _ = context.who
    status, body = read_memory(student, tab, other)
    got = _record_from(body)
    assert got in (None, {}), (
        f"work refused under one lesson turned up inside \"{other}\", which is "
        f"the exact mixing this refusal exists to prevent: {body[:200]}"
    )


@then("the canvas memory service is still answering")
def step_still_answering(context) -> None:
    """A refusal is an ordinary answer, not a wound. If one bad save can take
    the service down, every child on the machine loses the afternoon."""
    record_exchange()
    try:
        with urllib.request.urlopen(f"{BASE}/api/health", timeout=10) as response:
            alive = response.status == 200
    except (urllib.error.URLError, OSError):
        alive = False
    assert alive, (
        f"nothing is answering at {BASE} after one save was refused, so a "
        "rejected request took the whole memory service with it"
    )


@then("her very next save works and is remembered")
def step_next_save_works(context) -> None:
    student, tab, lesson = context.who
    record = a_lesson_in_progress(
        lesson,
        context.stored["revealed"] + 1,
        [a_question(BASE_INSTANT, "beat-6", "can we go over that again?")],
    )
    status, body = write_memory(student, tab, lesson, record)
    assert status == 200, (
        "the save straight after a refused one was itself refused, so one bad "
        f"request cost her the next piece of work too: {status} {body[:200]}"
    )
    status, body = read_memory(student, tab, lesson)
    assert status == 200, f"the read failed with {status}: {body[:200]}"
    got = _record_from(body)
    assert got == record, (
        "the work she did after the refusal is not what came back.\n"
        f"  saved: {json.dumps(record, sort_keys=True)}\n"
        f"  read : {json.dumps(got, sort_keys=True)}"
    )
    context.stored = record
