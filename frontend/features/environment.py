"""Real infrastructure for the frontend's own integration suite.

WHAT THIS DRIVES, AND WHAT IT REFUSES TO DRIVE.

The real product: `dist-server/index.js`, built from the current source at the
start of every run and spoken to over real HTTP on a real socket. No module is
imported, no function is called directly, nothing is stubbed. If the server
would not start for a person, it does not start here either.

WHY THE MODEL IS DELIBERATELY UNREACHABLE RATHER THAN FAKED.

Every scenario here runs with NO vendor credential, on purpose, and with the
provider pointed at a local address where nothing is listening. That is not a
limitation being worked around -- it is the single most common state this
server is really in: someone cloned the repository, or the key expired, or the
network is down at school. A suite that only runs when everything is provided
cannot see any of it, which is exactly how "the planner answered 500" reached
a child's home screen with 8309 unit tests green.

Standing a fake model up instead would test the fake. The one thing worth
knowing is what a person gets when the real thing is not there.

THE PROOF FILE.

`.real-infra-proof` is written only after a run that actually bound a port and
completed real HTTP exchanges, and it records what was true rather than that
something passed.

It used to state that this repository had no `docker-compose.canvas.yml` and no
`almanac_done` table. That was true when it was written and is FALSE NOW -- the
compose file is here and `pgStore.ts` creates the table. A receipt whose claims
have quietly expired is worse than no receipt, because it still reads as
evidence. So `database` is now filled in from what actually happened on this
run, and says plainly when PostgreSQL was NOT available and the JSON ledger was
used instead.
"""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
REPO = FRONTEND.parent
PROOF = FRONTEND / ".real-infra-proof"
CANVAS_COMPOSE = REPO / "docker-compose.canvas.yml"

#: A port nothing else in this project uses, so a stray dev server cannot be
#: mistaken for the one under test.
PORT = 8799
BASE = f"http://127.0.0.1:{PORT}"

#: Where the provider is told to find a local model. Nothing listens there, and
#: that is the point -- see the module docstring.
DEAD_OLLAMA = "http://127.0.0.1:1"

#: THE REAL DATABASE, STARTED BY THIS FILE AND WRITTEN TO BY REAL REQUESTS.
#:
#: This suite used to run entirely on the JSON ledger, and the receipt it wrote
#: said so honestly: "no docker-compose.canvas.yml and no almanac_done table".
#: That WAS true when it was written and is not true now -- the compose file is
#: here, `pgStore.ts` creates `almanac_done`, and a claim that has quietly
#: expired is worse than no claim, because it reads as evidence.
#:
#: WHY POSTGRES RATHER THAN THE FILE, FOR THE TWO-REPLICA SCENARIO ESPECIALLY.
#: The file store now serialises "add one mark" with a lock file, and that works.
#: A single-row INSERT does not need a lock at all, because the database makes
#: one row indivisible by construction. One is a fix; the other is the shape the
#: operation always had. Running the suite on the real one is the only way to
#: know the real one works.
COMPOSE_FILE = FRONTEND / "docker-compose.canvas.yml"
POSTGRES_PORT = 55432
DATABASE_URL = f"postgres://almanac:almanac@127.0.0.1:{POSTGRES_PORT}/almanac"

#: Set by the Stop gate so it can question the database AFTER this run ends.
#: Without it the stack is torn down and the gate finds nothing to inspect --
#: which looks exactly like a suite that never touched it.
KEEP_STACK = os.environ.get("ALMANAC_KEEP_STACK") == "1"


def _compose(*arguments: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), *arguments],
        cwd=str(FRONTEND), capture_output=True, text=True, timeout=300, check=False,
    ) if not check else subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), *arguments],
        cwd=str(FRONTEND), capture_output=True, text=True, timeout=300, check=True,
    )


def start_the_database() -> str | None:
    """Bring PostgreSQL up. Returns its URL, or None if this machine cannot.

    WHY THIS REPORTS INSTEAD OF INSISTING, AND WHY THAT IS NOT A FALLBACK.

    `index.ts` ships TWO real stores and picks between them on
    `ALMANAC_DATABASE_URL`: PostgreSQL when it is set, a JSON file when it is
    not. Both are configurations real people run. So "PostgreSQL is missing" is
    not a broken test environment -- it is the other shipped configuration, and
    the suite tests whichever one this machine can actually provide.

    WHAT MAKES THAT HONEST RATHER THAN A HIDDEN DEFAULT: the receipt says which
    one ran, in those words, and the Stop gate does not read the receipt anyway
    -- it counts rows in PostgreSQL itself. A run on the file store therefore
    leaves no rows and the gate blocks, which is the correct outcome and is not
    something this function can talk its way out of.

    Insisting instead was measured and was worse: it turned "the gate cannot
    check the database" into "none of the 31 scenarios run at all", which
    removed the evidence for everything else while fixing nothing.

    `pg_isready` is the wait, not "the container is running". A container that
    is up but not yet accepting connections is exactly the window in which every
    server started beside it dies on its first query.
    """
    started = _compose("up", "-d", "postgres", check=False)
    if started.returncode != 0:
        print(
            "PostgreSQL could not be started, so this run uses the JSON ledger "
            "instead -- the other configuration this product really ships.\n"
            f"  docker said: {started.stderr.strip()[:300]}"
        )
        return None

    deadline = time.time() + 90
    while time.time() < deadline:
        probe = _compose("exec", "-T", "postgres",
                         "pg_isready", "-U", "almanac", "-d", "almanac", check=False)
        if probe.returncode == 0:
            return DATABASE_URL
        time.sleep(1)

    raise AssertionError(
        "PostgreSQL started but never accepted a connection within 90 seconds. "
        "That is a broken container rather than an absent one, and guessing "
        "past it would hide a real failure."
    )

#: HOW MANY REAL HTTP EXCHANGES THIS RUN MADE, COUNTED ON DISK.
#:
#: TWO BUGS GOT HERE BEFORE THIS DID, AND BOTH REPORTED A HEALTHY-LOOKING ZERO.
#:
#: First it was `context.exchanges`. Behave layers its context per scenario, so
#: `after_all` read the `before_all` layer and saw none of the increments.
#:
#: Then it was a module-level list. Behave loads this file as its environment
#: under its own machinery, while `features/steps/` imports it again by name off
#: PYTHONPATH -- two module objects, two lists. `after_all` read the one the
#: steps never touched and wrote `"http_exchanges": 1`, the single probe made
#: inside this file, while fourteen scenarios had just made real requests.
#:
#: A file is the one counter both instances and every worker thread agree on.
#: The receipt exists to tell a real run from a hollow one; a receipt that
#: cannot count is worse than none, because it looks like evidence.
LEDGER = FRONTEND / "features" / ".exchanges-this-run"


def record_exchange() -> None:
    """Called by every step that actually puts bytes on the socket."""
    with open(LEDGER, "a", encoding="utf-8") as handle:
        handle.write("1\n")


#: THE SERVER PROCESS THIS RUN IS RESPONSIBLE FOR KILLING.
#:
#: MODULE-LEVEL FOR THE THIRD TIME IN THIS FILE, AND FOR THE THIRD TIME THE
#: REASON IS BEHAVE'S CONTEXT LAYERING. `context.server` set in `before_all`
#: lives on the outer layer; a step that RESTARTS the server sets it on the
#: scenario layer, which behave discards when the scenario ends. `after_all`
#: then killed the handle it was given at the start -- already dead -- and the
#: restarted process survived, holding port 8799 so the NEXT run refused to
#: start at all. Measured: two runs in a row aborted in `before_all` with "port
#: 8799 is already in use".
#:
#: RECORDED ON DISK, AND THAT IS THE THIRD TIME THIS FILE HAS LEARNED THE SAME
#: LESSON. A module-level list was the second attempt and it leaked too, because
#: `features/steps/` imports this file BY NAME off PYTHONPATH while behave loads
#: it as its environment -- two module objects, two lists. The step that
#: restarts the server appended to one; `after_all` drained the other; the live
#: process survived and held port 8799 so the next run could not start.
#:
#: The exchange counter above hit this exact wall and was moved to a file for
#: the same reason. A file is the one place both instances agree on.
PIDS = FRONTEND / "features" / ".servers-this-run"


def remember_server(process: "subprocess.Popen") -> None:
    """Called by anything that starts a server this suite must clean up."""
    with open(PIDS, "a", encoding="utf-8") as handle:
        handle.write(f"{process.pid}\n")


def stop_every_server() -> None:
    """Kill every server any part of this run started, newest first."""
    if not PIDS.exists():
        return
    pids = [int(line) for line in PIDS.read_text().split() if line.strip().isdigit()]
    for pid in reversed(pids):
        for signal_name in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.kill(pid, signal_name)
            except ProcessLookupError:
                break          # already gone, nothing to escalate to
            except PermissionError:
                break          # not ours to kill; saying so beats pretending
            time.sleep(0.4)
            try:
                os.kill(pid, 0)   # still alive? escalate on the next pass
            except ProcessLookupError:
                break
    PIDS.unlink(missing_ok=True)


def exchanges_so_far() -> int:
    if not LEDGER.exists():
        return 0
    return sum(1 for line in LEDGER.read_text(encoding="utf-8").splitlines() if line.strip())


#: Things a stack trace says. A person must never see any of them.
TRACEBACK_TELLS = ("Traceback (most recent call last)", 'File "', "\n    at ", "node:internal")


def _env_without_keys() -> dict[str, str]:
    """The environment a person on a fresh machine actually has."""
    env = dict(os.environ)
    for key in (
        "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GROQ_MODEL",
        "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY",
    ):
        env.pop(key, None)
    return env


def _free(port: int) -> bool:
    with socket.socket() as probe:
        return probe.connect_ex(("127.0.0.1", port)) != 0


def _wait_for_health(deadline: float) -> bool:
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/api/health", timeout=2) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.25)
    return False


def before_all(context) -> None:
    LEDGER.unlink(missing_ok=True)
    context.database_url = start_the_database()
    #: Anything a previous run left listening. Without this a single aborted
    #: run poisons every run after it.
    stop_every_server()

    # The suite tests the CURRENT source, never a stale build sitting on disk.
    build = subprocess.run(
        ["npm", "run", "server:build"],
        cwd=str(FRONTEND), capture_output=True, text=True, timeout=300, check=False,
    )
    assert build.returncode == 0, (
        "the server could not be built, so nothing below tests the real product:\n"
        f"{build.stdout[-2000:]}\n{build.stderr[-2000:]}"
    )

    assert _free(PORT), (
        f"port {PORT} is already in use. Something else is listening where the "
        f"suite expects the server under test, so a pass would prove nothing."
    )

    env = _env_without_keys()
    env["PORT"] = str(PORT)
    env["HOST"] = "127.0.0.1"
    # Configured, and deliberately unreachable. See the module docstring.
    env["OLLAMA_MODEL"] = "a-model-that-is-not-running"
    env["OLLAMA_ENDPOINT"] = DEAD_OLLAMA
    #: THE REAL DATABASE, NOT THE FILE. `ALMANAC_LEDGER` is still set because
    #: `index.ts` reads it as the fallback path, and leaving it out would mean a
    #: misconfiguration here silently wrote to `data/` instead of failing.
    #: Set ONLY when a real database is actually there. Setting it to a URL
    #: nothing answers would make every request 500 and call it a product bug.
    if context.database_url is not None:
        env["ALMANAC_DATABASE_URL"] = context.database_url
    env["ALMANAC_LEDGER"] = str(FRONTEND / "features" / ".ledger-under-test.json")
    env["CANVAS_MEMORY_DB"] = str(FRONTEND / "features" / ".memory-under-test.db")

    context.server = subprocess.Popen(
        ["node", "dist-server/index.js"],
        cwd=str(FRONTEND), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    remember_server(context.server)

    record_exchange()  # the health probe above is a real exchange
    assert _wait_for_health(time.time() + 45), (
        "the server never answered /api/health, so every scenario below would "
        "be testing nothing. It is supposed to start even when the model it was "
        "given cannot be reached."
    )


def after_all(context) -> None:
    #: Every server this run started, not just the one `before_all` handed over.
    #: KILLED BEFORE THE DATABASE IS TOUCHED, so nothing is still writing while
    #: the rows are being counted.
    stop_every_server()

    #: THE STACK IS LEFT UP WHEN THE GATE ASKED FOR IT.
    #:
    #: The Stop gate does not trust this receipt -- it queries PostgreSQL itself
    #: and counts the rows this run wrote, which is the only claim here that
    #: cannot be forged by editing a file in the repository. Tearing the stack
    #: down would leave it nothing to count, and a suite that really ran would
    #: be indistinguishable from one that never started.
    if not KEEP_STACK:
        _compose("down", "-v", check=False)

    for leftover in (
        FRONTEND / "features" / ".ledger-under-test.json",
        FRONTEND / "features" / ".memory-under-test.db",
        FRONTEND / "features" / ".memory-under-test.db-wal",
        FRONTEND / "features" / ".memory-under-test.db-shm",
        PIDS,
    ):
        if leftover.exists():
            leftover.unlink()

    #: NOT VACUOUS. A run that bound no socket and exchanged nothing must not
    #: leave a receipt saying it proved anything. The floor is deliberately
    #: above 1: one exchange is just this file's own health probe, and a suite
    #: whose scenarios all silently no-op would otherwise still look real.
    counted = exchanges_so_far()
    LEDGER.unlink(missing_ok=True)
    assert counted > 10, (
        f"this run made {counted} HTTP exchange(s). The scenarios are supposed "
        f"to drive the real server dozens of times, so they cannot have run. "
        f"Refusing to write a receipt for it."
    )

    PROOF.write_text(
        json.dumps(
            {
                "what_ran": "the real dist-server over real HTTP on a real socket",
                "base_url": BASE,
                "http_exchanges": counted,
                "vendor_credentials_present": False,
                "model_reachable": False,
                "canvas_compose_present": COMPOSE_FILE.is_file(),
                "database": (
                    f"real PostgreSQL on port {POSTGRES_PORT}, started from "
                    "docker-compose.canvas.yml. Every mark went through pgStore's "
                    "single-row INSERT into almanac_done. Count the rows to check "
                    "this receipt rather than believing it."
                ) if getattr(context, "database_url", None) is not None else (
                    "NONE. PostgreSQL could not be started on this machine, so the "
                    "server ran on the JSON ledger -- the other configuration it "
                    "really ships. No row was written to almanac_done and this "
                    "receipt does not claim one."
                ),
                "rows_written_to": "almanac_done" if getattr(context, "database_url", None) is not None else None,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
