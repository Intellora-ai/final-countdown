"""The suite runs offline, and this is what makes that true.

WHY THIS IS A FIXTURE AND NOT A CI STEP
---------------------------------------
"The tests do not need a network" is a claim that decays. Someone adds a real
provider adapter, writes one integration test against it, and the suite still
passes locally on a machine with wifi -- the claim is now false and nothing
said so. Enforcing it only in CI catches that a day later, on someone else's
branch, with a confusing error.

Blocking the socket here means the guard is present in every run, including the
first local one that would have introduced the dependency, and the failure names
the actual cause.

This matters more than it looks. The tests asserting the engine refuses to
fabricate confidence are exactly the ones that get skipped when a suite starts
needing a key that has expired -- so the offline property protects the honesty
properties.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
from collections.abc import Generator, Iterator
from typing import Any, NoReturn

import pytest


def _refuse(*_args: object, **_kwargs: object) -> NoReturn:
    raise AssertionError(
        "a test tried to open a network connection. The learning-os suite must "
        "run offline: the LLM is a deterministic fake and every verifier is "
        "local. If you are adding a real provider, put it behind an adapter and "
        "test the adapter with a recorded fixture, not a live call."
    )


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Autouse, so a new test file cannot opt out by forgetting to ask.

    `create_connection` is patched as well as `socket.connect`, because the
    higher-level helper does not always route through the method on the way to
    the syscall, and patching only one of them leaves a hole that looks closed.
    """
    monkeypatch.setattr(socket.socket, "connect", _refuse, raising=True)
    monkeypatch.setattr(socket, "create_connection", _refuse, raising=True)
    yield


# ---------------------------------------------------------------------------
# PROPERTY EXECUTION LEDGER — this suite's contribution
# ---------------------------------------------------------------------------
#
# `scripts/property_gate.py` enforces a floor on how many property tests
# EXECUTE, and it sums one ledger per suite. Without this file the learning-os
# properties -- review scheduling among them -- would be invisible to the gate,
# and deleting every one of them would not move the number.
#
# The mechanism is identical to the root suite's and deliberately not shared:
# importing a helper across two independent pytest roots would couple them for
# thirty lines, and the coupling is the more expensive thing.
#
# COLLECTED IS NOT EXECUTED. The count comes from the CALL phase of tests
# Hypothesis wrapped, so a test that errored in setup never reached a generated
# example and is not counted.

#: `.property-ledger/`, NOT `reports/`.
#:
#: `reports/` is the GATE EVIDENCE directory: scripts/aggregate_gates.py treats
#: every `reports/*.json` as one gate's verdict. Writing here put a file named
#: property-execution-root.json in that set, two jobs both ran the root suite
#: and both uploaded one, and the finalizer refused the run:
#:
#:   [1] property-execution-root  STATUS UNKNOWN
#:       WHY 2 conflicting reports claim this gate
#:
#: This is an INPUT to a gate, not a gate's verdict. It belongs outside the
#: evidence set, and the gate reads it from the same job that wrote it.
#:
#: Written by the CONTROLLER ONLY, and that is the whole correctness argument.
#:
#: Under `pytest -n auto` this hook fires in every xdist worker AND in the
#: controller, because xdist forwards each worker's reports to it. Measured:
#: four workers wrote 3 + 0 + 2 + 2 and the controller wrote all 7, so a gate
#: summing every file read 14 for a suite containing 7. The floor would have
#: been met by double-counting, and removing xdist would have halved the number
#: and failed a healthy build.
#:
#: `PYTEST_XDIST_WORKER` is set in workers and absent in the controller and in a
#: serial run, so skipping when it is present leaves exactly one writer in both
#: modes -- and the controller is the one that sees every test.
_PROPERTY_LEDGER = (
    pathlib.Path(__file__).resolve().parents[2]
    / ".property-ledger"
    / "property-execution-learning-os.json"
)

_executed_properties: set[str] = set()


#: The failure envelopes this session produced, written once at the end.
_envelopes: list[Any] = []


def _say_what_failed(report: pytest.TestReport) -> None:
    """THE FLIGHT RECORDER: one `::error` per failure, carrying its envelope.

    The matcher that turns pytest's own frames into annotations keeps only the
    error's class, and the log that holds the rest is admin-only. Two causes on
    this repository (a socket guard, a vendor quota) each cost a full CI round
    to read. This line carries the fingerprint, the kind, the headline and the
    exact rerun command, so a reader of the run has everything the log had.
    """
    from failure_envelope import envelope, workflow_command

    message = str(report.longreprtext) if hasattr(report, "longreprtext") else str(report.longrepr)
    path, line, _ = report.location
    env = envelope(
        runner="pytest",
        test=report.nodeid,
        file=f"learning-os/{path}".replace("\\", "/"),
        message=message,
        known=_known(),
        commit=os.environ.get("GITHUB_SHA", ""),
    )
    _envelopes.append(env)
    # A LEADING NEWLINE, and it is load-bearing: pytest has just written the
    # progress character ("F") for this test with no line break after it, so
    # without one the command would print as `F::error ...` -- and GitHub
    # only reads a workflow command that starts its own line. Measured.
    print(
        "\n"
        + workflow_command(
            "error",
            env.file,
            (line + 1) if isinstance(line, int) else None,
            env.title(f"pytest: {report.nodeid}"),
            f"{env.headline}\n{env.trailer()}",
        ),
        flush=True,
    )


def _known() -> dict[str, dict[str, str]]:
    from failure_envelope import known_failures

    return known_failures(
        pathlib.Path(__file__).resolve().parents[2] / "frontend" / "scripts" / "known-failures.json"
    )


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    if report.failed and report.when in {"call", "setup"}:
        _say_what_failed(report)
    if report.when != "call":
        return
    if report.outcome not in {"passed", "failed"}:
        return
    if report.__dict__.get("_is_hypothesis_test", False):
        _executed_properties.add(report.nodeid)


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(
    item: pytest.Item,
) -> Generator[None, pytest.TestReport, pytest.TestReport]:
    """Tag the report with whether Hypothesis wrapped this test.

    `is_hypothesis_test` is set by Hypothesis on every function it wraps, so
    this is a structural fact rather than a marker anybody has to remember.
    """
    report = yield
    function = getattr(item, "function", None)
    # Written into `__dict__` rather than as an attribute, for two reasons that
    # both matter. mypy --strict refuses `report._is_hypothesis_test = ...`
    # because `TestReport` declares no such field; and this flag MUST live on
    # the report rather than in a module-level set, because under xdist this
    # hook runs in the worker while the counting hook runs in the controller --
    # a different process. xdist serialises `report.__dict__`, so this is the
    # one place the flag survives the crossing.
    report.__dict__["_is_hypothesis_test"] = bool(
        getattr(function, "is_hypothesis_test", False)
    )
    return report


def pytest_sessionfinish(session: pytest.Session) -> None:
    if os.environ.get("PYTEST_XDIST_WORKER"):
        # A worker. The controller writes the complete ledger; see the
        # note on _PROPERTY_LEDGER for why writing here double-counts.
        return

    from failure_envelope import record

    record(_envelopes, pathlib.Path("test-results"))
    _PROPERTY_LEDGER.parent.mkdir(parents=True, exist_ok=True)
    _PROPERTY_LEDGER.write_text(
        json.dumps(
            {
                "executed": len(_executed_properties),
                "collected": session.testscollected,
                "tests": sorted(_executed_properties),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
