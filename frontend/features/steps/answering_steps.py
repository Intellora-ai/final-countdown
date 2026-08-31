"""Steps that drive the real server over real HTTP.

NOTHING IS IMPORTED FROM THE PRODUCT. Every step below sends bytes to a socket
and reads bytes back, exactly as a browser does. That is the whole point: a
test that calls a function proves the code agrees with itself, and this suite
exists because 8309 of those were green while a child's home screen said "the
planner answered 500".
"""

from __future__ import annotations

import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from behave import given, then, when  # pyright: ignore[reportMissingImports]

from environment import (  # pyright: ignore[reportMissingImports]
    BASE, COMPOSE_FILE, FRONTEND, TRACEBACK_TELLS,
    _env_without_keys, record_exchange,
)


def marks_for(context, student_id: str) -> list[str]:
    """What the store really holds -- asked of whichever store actually ran."""
    if getattr(context, "database_url", None) is None:
        #: The JSON ledger. Read straight off disk rather than through the
        #: product, for the same reason the psql path exists: the question is
        #: whether the marks REACHED the store, so the store is what is asked.
        stored = json.loads(context.shared_ledger.read_text(encoding="utf-8"))
        return stored.get("done", {}).get(student_id, [])
    return _marks_in_postgres(student_id)


def _marks_in_postgres(student_id: str) -> list[str]:
    """Ask PostgreSQL itself what it is holding.

    NOT read back through the product, and not from a file this suite could
    have written. The whole question is whether the marks reached the real
    store, so the real store is what gets asked -- through `psql`, which
    needs no Python database driver and cannot be satisfied by anything this
    repository could edit.
    """
    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "-T", "postgres",
         "psql", "-U", "almanac", "-d", "almanac", "-tAc",
         "SELECT concept_id FROM almanac_done WHERE student_id = '" + student_id + "'"],
        cwd=str(FRONTEND), capture_output=True, text=True, timeout=60, check=False,
    )
    assert result.returncode == 0, (
        f"could not read almanac_done from the real database: {result.stderr[:400]}"
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]

#: Substrings that are machine output, never something a person is owed.
MACHINE_TELLS = ("[object Object]", "undefined is not", "ECONNREFUSED", "ERR_")


def _post(path: str, body: str, context) -> tuple[int, str]:
    """Send a real request. Returns the status and the raw body."""
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=body.encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    record_exchange()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        # A 4xx or 5xx is an ANSWER, not a crash. Reading its body is the whole
        # question: what does the person actually get told?
        return exc.code, exc.read().decode("utf-8", "replace")


def _readable(text: str) -> str:
    """The words a person would actually see, whatever shape they arrived in."""
    try:
        document = json.loads(text)
    except json.JSONDecodeError:
        return text
    return json.dumps(document)


# ---------------------------------------------------------------- given ----

@given("the server is running with no key and no model behind it")
def step_server_running(context) -> None:
    assert context.server.poll() is None, (
        "the server under test has exited, so nothing below is being tested"
    )


@given("a machine with no key and no model named")
def step_bare_machine(context) -> None:
    context.bare_env = _env_without_keys()
    for key in ("OLLAMA_MODEL", "OLLAMA_ENDPOINT"):
        context.bare_env.pop(key, None)


# ----------------------------------------------------------------- when ----

@when('a student asks "{question}"')
def step_asks(context, question: str) -> None:
    context.status, context.body = _post(
        "/api/ask", json.dumps({"question": question}), context
    )


@when("she asks the same thing again")
def step_asks_again(context) -> None:
    context.first = (context.status, context.body)
    context.status, context.body = _post(
        "/api/ask", json.dumps({"question": "what is pressure?"}), context
    )
    context.second = (context.status, context.body)


@when("a student asks a question of {count:d} characters")
def step_asks_long(context, count: int) -> None:
    context.status, context.body = _post(
        "/api/ask", json.dumps({"question": "why " * (count // 4)}), context
    )


@when('the raw request "{body}" arrives at "{path}"')
def step_raw(context, body: str, path: str) -> None:
    context.status, context.body = _post(path, body, context)


@when("{count:d} students all ask at the same moment")
def step_all_at_once(context, count: int) -> None:
    questions = [f"what is topic number {i}?" for i in range(count)]

    def one(question: str) -> tuple[str, int, str]:
        status, body = _post("/api/ask", json.dumps({"question": question}), context)
        return question, status, body

    with ThreadPoolExecutor(max_workers=count) as pool:
        context.everyone = list(pool.map(one, questions))


@when("anyone checks whether the server is up")
def step_health(context) -> None:
    record_exchange()
    with urllib.request.urlopen(f"{BASE}/api/health", timeout=15) as response:
        context.status = response.status
        context.body = response.read().decode("utf-8", "replace")


@when("the server is started")
def step_start_bare(context) -> None:
    env = dict(context.bare_env)
    env["PORT"] = "8798"
    result = subprocess.run(
        ["node", "dist-server/index.js"],
        cwd=str(FRONTEND), env=env,
        capture_output=True, text=True, timeout=60, check=False,
    )
    context.startup = f"{result.stdout}\n{result.stderr}"


# ----------------------------------------------------------------- then ----

@then("she gets an answer she can read")
def step_gets_an_answer(context) -> None:
    words = _readable(context.body)
    assert len(words.strip()) > 20, (
        f"the server replied with {len(words.strip())} characters, which is not "
        f"an answer a person can read: {words[:300]!r}"
    )


@then("the answer explains itself in words")
def step_explains_itself(context) -> None:
    words = _readable(context.body).lower()
    #: A real explanation says what happened or what to do about it.
    tells = ("could not", "cannot", "not configured", "unable", "unavailable",
             "try", "set ", "reach", "again", "missing", "required", "no ")
    assert any(tell in words for tell in tells), (
        "the reply names no cause and no next step, so a person is left with "
        f"nothing to act on: {words[:300]!r}"
    )


@then("the answer contains no bare status code")
def step_no_bare_status(context) -> None:
    words = _readable(context.body)
    import re
    hit = re.search(r"\b(answered|error|failed|status)\s+\d{3}\b", words, re.I)
    assert hit is None, (
        f"a person is shown a raw status code: {hit.group(0)!r} in {words[:300]!r}"
    )


@then("the server answers with a document a program can read")
def step_answers_a_document(context) -> None:
    try:
        json.loads(context.body)
    except json.JSONDecodeError as exc:
        raise AssertionError(
            f"the server did not answer with JSON, so nothing downstream can "
            f"read it: {exc}. It sent: {context.body[:300]!r}"
        ) from None


@then("she is never shown the inside of the program")
def step_no_internals(context) -> None:
    text = getattr(context, "startup", None) or getattr(context, "body", "")
    for tell in TRACEBACK_TELLS + MACHINE_TELLS:
        assert tell not in text, (
            f"a person is shown the inside of the program -- {tell!r} appears "
            f"in what she reads: {text[:400]!r}"
        )


@then("no credential appears anywhere in the answer")
def step_no_credential(context) -> None:
    #: Prefixes every major vendor uses. Checked as SHAPES, so this never needs
    #: a real key to be meaningful and never holds one.
    for shape in ("sk-ant-", "gsk_", "sk-proj-", "AIza", "Bearer "):
        assert shape not in context.body, (
            f"something shaped like a credential ({shape!r}) is in a reply that "
            f"goes to a browser"
        )


@then("every student gets their own answer")
def step_everyone_answered(context) -> None:
    for question, status, body in context.everyone:
        assert body.strip(), f"{question!r} got an empty reply"
        assert status in (200, 400, 500, 502, 503), (
            f"{question!r} got an unexpected status {status}"
        )


@then("nobody gets another student's answer")
def step_no_crossed_wires(context) -> None:
    for question, _status, body in context.everyone:
        number = question.split("number ")[1].rstrip("?")
        others = [
            q.split("number ")[1].rstrip("?")
            for q, _s, _b in context.everyone
            if q != question
        ]
        for other in others:
            #: A reply may echo its OWN question. It may never echo another's.
            if f"topic number {other}?" in body and f"topic number {number}?" not in body:
                raise AssertionError(
                    f"the answer to {question!r} carries another student's "
                    f"question (number {other}). Two learners' work is crossing."
                )


@then("both answers are usable")
def step_both_usable(context) -> None:
    for label, (status, body) in (("first", context.first), ("second", context.second)):
        assert body.strip(), f"the {label} answer was empty"
        assert status in (200, 400, 500, 502, 503), (
            f"the {label} answer had an unexpected status {status}"
        )


@then("it says it is up")
def step_says_up(context) -> None:
    assert context.status == 200, f"health answered {context.status}, not 200"


@then("it says exactly how to configure a model")
def step_says_how(context) -> None:
    assert "no model is configured" in context.startup, (
        f"the server did not say why it would not start: {context.startup[:400]!r}"
    )


@then("it names every way that is supported")
def step_names_every_way(context) -> None:
    #: Read from the product, not written here twice. A new provider that the
    #: startup message forgets to mention fails this without anyone editing it.
    provider = (FRONTEND / "server" / "provider.ts").read_text(encoding="utf-8")
    import re
    supported = set(re.findall(r"value\(env, '([A-Z0-9_]+)'\)", provider))
    #: Only the ones that CHOOSE a provider. Tuning variables are not ways in.
    choosers = {name for name in supported if name.endswith(("_API_KEY", "_MODEL"))}
    assert choosers, "no provider variables found in provider.ts"

    missing = sorted(name for name in choosers if name not in context.startup)
    assert not missing, (
        f"the server accepts {sorted(choosers)} but its startup message never "
        f"mentions {missing}. Someone on a fresh machine cannot discover them."
    )


@when("she asks to carry on from what she has already been taught")
def step_carry_on(context) -> None:
    context.status, context.body = _post("/api/ask", json.dumps({
        "question": "why does increasing temperature increase pressure in a gas?",
        "askedInside": "why does increasing temperature increase pressure in a gas?",
        "taught": (
            "Particle model — a gas is many small particles moving quickly.\n"
            "What actually happens — heat makes them move faster."
        ),
        "justSaid": "i think i get it but why does faster mean more pressure",
    }), context)


@when("she asks to carry on having been taught nothing yet")
def step_carry_on_empty(context) -> None:
    context.status, context.body = _post("/api/ask", json.dumps({
        "question": "explain function graphs",
        "taught": "",
        "justSaid": "",
    }), context)


@then("the server accepts a lesson-in-progress")
def step_accepts_progress(context) -> None:
    """It got past validation and tried, rather than refusing the shape.

    400 would mean the route does not understand a lesson-in-progress at all.
    502 is the honest answer here: the request was understood and the model
    could not be reached, which is true -- this suite runs with no key.
    """
    assert context.status != 400, (
        f"the server REFUSED a lesson-in-progress as a bad request: "
        f"{context.body[:200]}. It cannot teach in parts if it will not accept "
        f"what has already been taught."
    )
    assert context.status in (200, 502, 503), (
        f"unexpected status {context.status}: {context.body[:200]}"
    )


# ------------------------------------------------- two servers, one store ----
#
# THE INCIDENT `run-real-tests.sh` NAMES IN ONE LINE:
#   "390 were green while two replicas lost 28 of 60 students' marks."
#
# This is that, reproduced through the real product over real HTTP. It cannot
# be seen with one server, which is precisely why every unit test missed it:
# the defect only exists when two processes share a store, and `LedgerStore` is
# load-everything / save-everything, so the second save overwrites the first.

SECOND_PORT = 8796


@given("two servers are running against the same shared store")
def step_two_servers(context) -> None:
    import time

    shared = FRONTEND / "features" / ".shared-ledger-under-test.json"
    if shared.exists():
        shared.unlink()
    context.shared_ledger = shared

    env = _env_without_keys()
    env["HOST"] = "127.0.0.1"
    env["OLLAMA_MODEL"] = "a-model-that-is-not-running"
    env["OLLAMA_ENDPOINT"] = "http://127.0.0.1:1"
    env["ALMANAC_LEDGER"] = str(shared)
    #: THE REAL SHARED STORE, WHEN THIS MACHINE HAS ONE.
    #:
    #: Two replicas sharing a JSON file is the shape that lost marks; two
    #: replicas sharing a database with a single-row INSERT is the shape that
    #: cannot. Both are configurations this product ships, and the scenario is
    #: worth running against whichever one is really here -- the file store now
    #: serialises the same operation with a lock, so the guarantee is the same
    #: even though the mechanism is not.
    if getattr(context, "database_url", None) is not None:
        env["ALMANAC_DATABASE_URL"] = context.database_url

    #: BOTH REPLICAS SHARE ONE IDENTITY SECRET, BECAUSE A REAL PAIR MUST.
    #:
    #: Left unset, each replica generates its OWN secret file, and then neither
    #: can verify a cookie the other issued -- a student would be a different
    #: person depending on which replica the load balancer picked, and would
    #: appear to lose all her work at random. The server says exactly this on
    #: startup ("safe for ONE machine only") for anyone who leaves it unset.
    #:
    #: Generated per run rather than written here: a secret committed to a
    #: repository is not a secret, and this suite must not teach anyone to
    #: paste a literal one into a deployment.
    import secrets as _secrets
    env["ALMANAC_IDENTITY_SECRET"] = _secrets.token_hex(32)

    #: The FIRST server is the suite's own, pointed at the shared ledger. A
    #: second process is started beside it -- two replicas, one store, exactly
    #: how this runs in production behind a load balancer.
    first = dict(env)
    first["PORT"] = str(SECOND_PORT + 1)
    second = dict(env)
    second["PORT"] = str(SECOND_PORT)

    context.replicas = [
        subprocess.Popen(["node", "dist-server/index.js"], cwd=str(FRONTEND), env=e,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for e in (first, second)
    ]
    context.replica_ports = [SECOND_PORT + 1, SECOND_PORT]

    deadline = time.time() + 45
    for port in context.replica_ports:
        ok = False
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as r:
                    if r.status == 200:
                        ok = True
                        break
            except (urllib.error.URLError, OSError):
                time.sleep(0.25)
        if not ok:
            #: SAY WHAT THE REPLICA ACTUALLY DID. "never came up" names the
            #: symptom and throws the cause away -- the process's own output is
            #: piped and was being discarded, so a boot failure and a slow boot
            #: looked identical and cost 45 seconds to tell apart.
            details = []
            for index, replica in enumerate(context.replicas):
                code = replica.poll()
                details.append(f"    replica {index}: exit={code}")
                if code is not None and replica.stdout is not None:
                    details.append(f"      said: {replica.stdout.read()[:800]!r}")
            raise AssertionError(
                f"replica on port {port} never came up, so nothing below is tested.\n"
                + "\n".join(details)
            )


#: ONE STUDENT IS ONE COOKIE JAR, ACROSS BOTH REPLICAS.
#:
#: `studentId` is no longer sent, and cannot be: the server assigns identity and
#: signs it, so a caller naming a student is refused with 403. Without a jar
#: here every one of the twenty concurrent marks would arrive as a BRAND-NEW
#: student, all twenty would "succeed", and the read-back would find none of
#: them -- a false failure that hides the real question this scenario asks.
#:
#: Sharing one jar across both ports is the whole point: a student's cookie must
#: be honoured by whichever replica the load balancer happens to pick.
DONE_JARS: dict[str, str] = {}


def _mark_done(port: int, student: str, concept: str) -> tuple[int, str]:
    headers = {"content-type": "application/json"}
    if student in DONE_JARS:
        headers["Cookie"] = DONE_JARS[student]
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/done",
        data=json.dumps({"conceptId": concept}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    record_exchange()

    def keep(response) -> None:
        for planted in response.headers.get_all("Set-Cookie") or []:
            DONE_JARS[student] = planted.split(";")[0]

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            keep(response)
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        keep(exc)
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        # A DROPPED CONNECTION IS A LOST MARK, NOT A BROKEN TEST.
        #
        # Under twenty concurrent marks the file-backed server does not merely
        # answer 500 -- it sometimes drops the connection outright. Letting that
        # escape as an exception ENDS the run, so behave reports "error" and the
        # real finding (how many of her marks survived) is never printed.
        # Recorded as a failed exchange so the assertion below can say what she
        # actually lost.
        return 0, f"the connection was dropped: {exc}"


@when("{count:d} concepts are marked done across both servers at the same moment")
def step_mark_concurrently(context, count: int) -> None:
    """Both replicas, together, with no gap for one to see the other's save.

    SEQUENTIAL MARKS CANNOT SHOW THIS. The first server saves, the second then
    loads and sees that save, and both survive. The loss needs an overlap: two
    processes that both READ the ledger before either WRITES it. This fires
    every request at once so the overlap actually happens, which is what a
    classroom on two replicas does without trying.
    """
    context.student = "ada"
    context.concepts = [f"concept-{i:02d}" for i in range(count)]

    #: SHE ALREADY HAS AN IDENTITY BEFORE SHE MARKS ANYTHING, BECAUSE SHE
    #: LOADED THE PAGE FIRST. Twenty threads starting with an empty jar would
    #: each be issued a DIFFERENT student, all twenty would answer 200, and the
    #: read-back would find nothing -- which looks like the data loss this
    #: scenario hunts for but is really the test failing to be one person.
    #: One request first is what a browser does and what makes the burst honest.
    primed, _ = _mark_done(context.replica_ports[0], context.student, "warm-up")
    assert primed == 200, "the priming mark was refused, so the burst below tests nothing"

    #: THE NAME THE LEDGER FILE ACTUALLY USES.
    #:
    #: "ada" is this scenario's word for a person. It is NOT the key the server
    #: writes under, and it never was a key the server could be told -- it now
    #: assigns an identity and signs it, precisely so a caller cannot choose
    #: one. Reading `done["ada"]` therefore looks in a drawer that will always
    #: be empty and reports every mark as lost, which is a false alarm that
    #: hides the real data loss this scenario hunts for.
    #:
    #: The signed cookie is `<id>.<signature>`, so the id is everything before
    #: the last dot. Taken from the cookie the server actually issued rather
    #: than constructed here, because a value this test computed for itself
    #: would prove nothing about where the server put the marks.
    raw = DONE_JARS[context.student].split("=", 1)[1]
    context.ledger_key = urllib.parse.unquote(raw).rsplit(".", 1)[0]

    def one(index_and_concept: tuple[int, str]) -> tuple[str, int, str]:
        index, concept = index_and_concept
        port = context.replica_ports[index % len(context.replica_ports)]
        status, body = _mark_done(port, context.student, concept)
        return concept, status, body

    with ThreadPoolExecutor(max_workers=count) as pool:
        context.marks = list(pool.map(one, list(enumerate(context.concepts))))


@then("every one of those concepts is still marked done")
def step_every_mark_survives(context) -> None:
    refused = [(c, s, b[:120]) for c, s, b in context.marks if s != 200]
    assert not refused, f"some marks were refused outright: {refused}"

    done = marks_for(context, context.ledger_key)

    lost = [c for c in context.concepts if c not in done]
    assert not lost, (
        f"{len(lost)} of {len(context.concepts)} marks were LOST: {lost}\n"
        f"The store kept only {sorted(done)}.\n"
        f"Every one of those requests was answered 200, so a student was told "
        f"her work was saved and it was not. This is the incident the gate "
        f"names in one line -- two replicas, one shared store, and a ledger "
        f"that reads everything then writes everything, so the last save wins "
        f"and every mark made in between is gone."
    )


@then("neither server has overwritten the other")
def step_no_overwrite(context) -> None:
    done = marks_for(context, context.ledger_key)
    assert len(done) >= 2, (
        f"only {len(done)} concept(s) survived two separate marks: {done}. "
        f"One server's write replaced the other's instead of adding to it."
    )

    for replica in context.replicas:
        if replica.poll() is None:
            replica.terminate()
    context.shared_ledger.unlink(missing_ok=True)
