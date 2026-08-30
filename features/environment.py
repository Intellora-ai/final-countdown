"""The app under test is the real container, not an import.

WHY A CONTAINER AND NOT A PYTHON IMPORT OF ANYTHING
    These scenarios are about a student's day, and a student meets this product
    over HTTP from a browser. Importing a module and calling a function would
    test the function -- which the unit tests already do -- and would skip every
    seam where the failures actually live: the routing, the serialisation, the
    file the ledger is written to, the fallback that makes a shared link work.

    So `behave` starts the shipped image and talks to it the way a browser does.
    If the image cannot serve a student, these scenarios fail, which is the
    point.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

IMAGE = os.environ.get("CANVAS_IMAGE", "learning-canvas:test")
COMPOSE = ["docker", "compose", "-f", "docker-compose.canvas.yml"]

#: Written at the end of a real run. A receipt, not the evidence -- see after_all.
PROOF = ".real-infra-proof"

# The ports `docker-compose.canvas.yml` publishes for the two replicas.
PORT = 8921
SECOND_PORT = 8922


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=False)


def _healthy(base: str, seconds: int = 90) -> bool:
    """Wait on the app's own health route, never on a fixed sleep.

    A sleep is a guess about a machine's speed, and it is wrong on both sides:
    too short on a loaded runner, wasted seconds on a fast one.
    """
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=2) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.2)
    return False


def _image_exists() -> bool:
    return _run("docker", "image", "inspect", IMAGE).returncode == 0


def _ensure_image(context) -> None:
    """Build the image if it is not here, rather than letting compose guess.

    WHAT A USER SAW BEFORE THIS EXISTED, and it named the wrong thing entirely:

        Image learning-canvas:test Error pull access denied for
        learning-canvas, repository does not exist or may require
        'docker login'

    Compose cannot tell "you have not built this yet" from "this is a private
    image on a registry", so it reports the second. Somebody cloning this
    repository and running the scenarios is told to log in to Docker Hub, which
    is not the problem and cannot fix it.

    Building it here means the scenarios run for anyone with a checkout and a
    Docker daemon, which is what a test for real people has to mean.
    """
    if _image_exists():
        return
    print(f"[behave] {IMAGE} is not built yet — building it now (this takes a minute).")
    built = _run("docker", "build", "-t", IMAGE, ".")
    if built.returncode != 0:
        tail = (built.stderr or built.stdout).strip().splitlines()[-15:]
        raise RuntimeError(
            f"could not build {IMAGE} from the repository root.\n"
            + "\n".join(tail)
        )
    if not _image_exists():
        raise RuntimeError(f"docker build reported success but {IMAGE} still does not exist")


def before_all(context) -> None:
    """Bring up the shape a cloud deployment actually has.

    TWO REPLICAS AND ONE DATABASE, FOR EVERY SCENARIO -- not only the one that
    is about replicas. A suite that runs against a single process proves the
    product works in a configuration nobody will deploy, and the failures that
    matter (state that is per-process, a day frozen twice, progress erased by
    whichever copy saved last) are exactly the ones a single process cannot
    show. Both replicas are started here; scenarios simply use them.
    """
    context.base = f"http://127.0.0.1:{PORT}"
    context.second = f"http://127.0.0.1:{SECOND_PORT}"

    _ensure_image(context)
    _run(*COMPOSE, "down", "-v")
    started = _run(*COMPOSE, "up", "-d")
    if started.returncode != 0:
        raise RuntimeError(f"could not start the stack: {started.stderr.strip()}")

    for name, base in (("canvas-a", context.base), ("canvas-b", context.second)):
        if not _healthy(base):
            logs = _run(*COMPOSE, "logs", name).stdout
            raise RuntimeError(f"{name} never became healthy. Logs:\n{logs}")


def after_all(context) -> None:
    """Leave behind what only a real run can produce, then tear the stack down.

    WHY THIS FILE IS A RECORD AND NOT THE PROOF.
        A suite of mocks can pass every scenario and never touch a container.
        So the Stop gate needs evidence, and evidence written by the thing
        being judged is not evidence: this file lives in the repository, and
        anything in the repository can be rewritten by whoever is being gated.
        The gate therefore asks the live database the same question itself.
        This file is the receipt; PostgreSQL is the witness.

    `-v` on teardown, so the next run starts from an empty database rather than
    from whatever the last one left behind. Skipped when the gate has asked to
    keep the stack alive -- it cannot question a database that has been deleted.
    """
    rows = _run(
        *COMPOSE, "exec", "-T", "postgres",
        "psql", "-U", "almanac", "-d", "almanac", "-tAc",
        "SELECT count(*) FROM almanac_done",
    )
    containers = _run(*COMPOSE, "ps", "-q")
    with open(PROOF, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "rows_in_postgres": rows.stdout.strip(),
                "containers": containers.stdout.split(),
            },
            handle,
            indent=2,
        )
        handle.write("\n")

    if os.environ.get("ALMANAC_KEEP_STACK") != "1":
        _run(*COMPOSE, "down", "-v")


def before_scenario(context, scenario) -> None:
    """Each scenario starts from a student who has done nothing yet.

    Identities are made unique per scenario rather than the ledger being wiped:
    wiping a file out from under a running container is what produced a whole
    run of false 500s once already, and a fresh name is both cheaper and closer
    to what a new student actually is.
    """
    context.suffix = scenario.name.lower().replace(" ", "-")[:40]
    context.students = {}
    context.day = {}
    context.responses = []


def start_replica(context) -> str:
    """The second replica is already running; this just names it.

    It is started in `before_all` with the first, because a replica brought up
    mid-scenario would be a different deployment from the one every other
    scenario ran against.
    """
    if not _healthy(context.second, seconds=10):
        raise RuntimeError("the second replica is not answering")
    return context.second


def read_done(context, student: str) -> set[str]:
    """What the SHARED store holds, read straight from PostgreSQL.

    Ground truth on purpose. Asking an endpoint would be asking ONE replica out
    of its own memory, which is the very thing these scenarios exist to doubt.
    """
    result = _run(
        *COMPOSE, "exec", "-T", "postgres",
        "psql", "-U", "almanac", "-d", "almanac", "-tAc",
        f"SELECT concept_id FROM almanac_done WHERE student_id = '{student}'",
    )
    if result.returncode != 0:
        raise RuntimeError(f"could not read the ledger: {result.stderr.strip()}")
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def post(context, path: str, payload: dict, base: str | None = None) -> tuple[int, dict]:
    request = urllib.request.Request(
        (base or context.base) + path,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return error.code, {"raw": raw.decode("utf-8", "replace")}


def get(context, path: str) -> tuple[int, str, str]:
    request = urllib.request.Request(context.base + path, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return (
                response.status,
                response.headers.get("content-type", ""),
                response.read().decode("utf-8", "replace"),
            )
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("content-type", ""), error.read().decode("utf-8", "replace")
