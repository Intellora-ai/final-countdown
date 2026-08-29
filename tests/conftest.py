"""Make coverage follow the child processes this suite spends its time in.

WHY THIS FILE EXISTS.

34 test files here run the code they are testing with `subprocess.run`. That is
deliberate --- a gate is a program, and the honest way to test a program is to
run it and read what it printed. The cost is that coverage.py measures the
process it was started in and nothing else, so every one of those files was
reporting zero.

Measured before this file existed:

    scripts/registry_gate.py     294    294    136      0      0%   83-671

294 statements, all reported unexecuted, while `tests/test_registries.py` ran
that exact file and asserted on its output.

WHY HERE AND NOT IN THE WORKFLOW.

`COVERAGE_PROCESS_START` could be exported in `verify.yml` instead. It is set
here so that a local run and a CI run measure the SAME thing. A variable that
lives only in the workflow makes the number a developer sees quietly different
from the number that gates the merge, and the first time those disagree
somebody trusts the wrong one.

HOW IT WORKS.

`coverage` ships a `.pth` file that runs at interpreter startup and calls
`coverage.process_startup()` when `COVERAGE_PROCESS_START` names a config file.
Each child then writes its own data file, which requires `parallel = true` ---
declared in `tests/coverage-subprocess.cfg` rather than in `pyproject.toml`,
because putting it in `pyproject.toml` was measured as changing nothing.
`pytest-cov` combines the files at the end.

Both halves are required, and this was measured rather than assumed:

    parallel + concurrency, no env var          ->  0 lines measured
    COVERAGE_PROCESS_START, no `parallel`       ->  0 lines measured
    `parallel = true` + COVERAGE_PROCESS_START  ->  7 lines measured

`concurrency = multiprocessing` was dropped from the final configuration
because removing it changed nothing. A setting that does nothing is a setting
the next person has to reason about for no reason.

`pytest-cov` 7.1.0 does not set the variable itself. That was checked by
printing it from inside a run under `--cov`, where it came back `None`.
"""

from __future__ import annotations

import json
import pathlib
import os

from collections.abc import Generator

import hypothesis
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]

# NOT pyproject.toml, and that was measured rather than assumed. pyproject sets
# `source = ["src"]`, so a child started with it measured `src/` and ignored
# the `scripts/` module it had been launched to run --- 0 lines counted. The
# child needs a config that declares NO source, so it measures whatever it
# executes and the PARENT's `--cov=` decides what the report shows. With that
# file: 270 lines counted.
COVERAGE_CONFIG = Path(__file__).resolve().parent / "coverage-subprocess.cfg"

# OPT-IN, AND THAT IS A CORRECTION RATHER THAN A PREFERENCE.
#
# The first version armed this whenever `--cov` was passed. Measured against
# the exact command the `coverage` gate runs --- `pytest -n auto --dist
# loadfile --cov=src --cov-branch --cov-fail-under=95 -m "not axle"` --- that
# took a gate reporting ~100% of `src/` down to 10.56%, because the combined
# child data pulled files into a report scoped to `src` and `--cov=src` did not
# filter them back out.
#
# A required check is not a place to discover a subtlety. So the existing gate
# keeps its exact behaviour, byte for byte, and subprocess coverage is
# something a NEW measurement opts into by name. Nothing that runs today
# changes; the capability is additive.
ENABLE = "FINAL_COUNTDOWN_SUBPROCESS_COVERAGE"


def pytest_configure(config: pytest.Config) -> None:
    """Arm subprocess coverage when a caller has asked for it by name.

    Two guards, both load-bearing:

    `ENABLE` keeps every existing command --- the `coverage` gate, the fast
    local loop, `make sandbox-fast` --- measuring exactly what it measured
    before this file existed.

    `--cov` keeps the cost off runs that are not measuring anything. Without
    it, every subprocess in an ordinary test run would start a coverage
    session and write a data file for a report nobody asked for.
    """
    if not os.environ.get(ENABLE):
        return

    # `cov_source` is set by pytest-cov when --cov was passed. Asking the
    # plugin rather than re-parsing argv keeps this correct if the flag is
    # supplied through addopts or a config file instead of the command line.
    if not getattr(config.option, "cov_source", None):
        return

    os.environ["COVERAGE_PROCESS_START"] = str(COVERAGE_CONFIG)


# ---------------------------------------------------------------------------
# HYPOTHESIS PROFILES — two, and neither can be switched off
# ---------------------------------------------------------------------------
#
# WHY THERE IS NO `property` MARKER, WHICH THE PLAN ASKED FOR.
#
# The plan's P9-T1 and P9-T3 register a `property` marker and label the existing
# property tests with it. That was refused, and the refusal is right: any
# non-structural pytest marker is a deselection handle. `-m "not property"`
# switches every property test off, the suite still reports green, and the
# generated coverage this phase exists to prove silently stops running.
#
# It is also unnecessary. Hypothesis already tags every function it wraps:
#
#     @given(...)
#     def test_x(...): ...
#     test_x.is_hypothesis_test is True
#
# That is a STRUCTURAL fact about the test -- it IS a property test -- rather
# than a label somebody remembered to attach. `scripts/property_gate.py` counts
# them that way, so a new property test is covered the moment it is written and
# a marker cannot be forgotten, misspelled, or used to exclude anything.

#: Which profile to load. Unset means `fast`, deliberately: an absent variable
#: must produce the cheap run, so a developer's local loop and a pull request
#: behave identically without anybody remembering an export.
_PROFILE_VARIABLE = "HYPOTHESIS_PROFILE"

hypothesis.settings.register_profile(
    "fast",
    max_examples=50,
    # No deadline. These properties call into gate scripts and file IO, where a
    # per-example time limit turns a slow CI runner into a failing test -- a
    # flake that says nothing about the property under test.
    deadline=None,
    # Prints a `@reproduce_failure(...)` blob when a property fails. THIS is
    # what "record the seed" means in practice: the failing example is
    # reproducible by pasting one line, rather than by guessing at a seed.
    print_blob=True,
)

hypothesis.settings.register_profile(
    "thorough",
    max_examples=1000,
    deadline=None,
    print_blob=True,
)

hypothesis.settings.load_profile(os.environ.get(_PROFILE_VARIABLE, "fast"))


# ---------------------------------------------------------------------------
# PROPERTY EXECUTION LEDGER — what scripts/property_gate.py reads
# ---------------------------------------------------------------------------
#
# COLLECTED IS NOT EXECUTED, AND THAT DISTINCTION IS THE WHOLE POINT.
#
# A property test that was collected and then errored during setup, or was
# deselected, or whose `@given` was removed leaving an ordinary function, all
# report differently here. Counting collection would call every one of those a
# property test that ran.
#
# So the count is taken from the CALL phase of tests Hypothesis actually wrapped:
# the test executed, and it executed as a property test. Anything less is the
# `Total: 0 tests` failure wearing a different costume.

#: Where the ledger lands. Gitignored, like every other file under reports/.
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
_PROPERTY_LEDGER = pathlib.Path(".property-ledger") / "property-execution-root.json"

#: Node ids of property tests whose call phase completed in this session.
_executed_properties: set[str] = set()


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    """Record property tests that actually RAN.

    The `call` phase only, and only when it passed or failed -- a test whose
    setup errored never reached its `@given` body and did not exercise a single
    generated example.
    """
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

    Done here because `pytest_runtest_logreport` receives a report, not an item,
    and the `is_hypothesis_test` attribute lives on the function. Hypothesis
    sets it on every function it wraps, so this is a structural fact rather than
    a label anybody maintains.
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

    """Write the ledger, whatever the outcome.

    Written even when tests failed: the gate's question is "did property tests
    run", and a suite that ran them and found a bug is a suite where they ran.
    """
    _PROPERTY_LEDGER.parent.mkdir(parents=True, exist_ok=True)
    _PROPERTY_LEDGER.write_text(
        json.dumps(
            {
                "executed": len(_executed_properties),
                "collected": session.testscollected,
                "profile": os.environ.get(_PROFILE_VARIABLE, "fast"),
                "tests": sorted(_executed_properties),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
