"""Behave environment: prove the suite drove the real product, and say what it did not.

THE RECEIPT THIS WRITES IS A CLAIM, SO IT ONLY CLAIMS WHAT HAPPENED.

`.real-infra-proof` exists so a gate can tell a real run from a mock-only one.
The temptation is to write it unconditionally and let the gate see a green
file; that would make the receipt worth nothing, and it is the exact shape this
repository refuses everywhere else -- a check that cannot fail.

So the receipt is written only when scenarios actually ran, it records how many
REAL operating-system processes the suite started, and it states plainly which
infrastructure was NOT exercised. A reader can then see the boundary instead of
inferring coverage that was never there.

WHAT IS REAL IN THIS SUITE
    Real processes. Every scenario starts `python -m learning_os.api.ask` as a
    separate process, writes real bytes to its stdin, and reads real stdout.
    Nothing is patched, stubbed or monkeypatched.

WHAT IS NOT EXERCISED, STATED RATHER THAN IMPLIED
    No database. This repository contains no `docker-compose.canvas.yml` and no
    `almanac_done` table -- verified by searching the tree, not assumed -- so
    there is no PostgreSQL for this suite to write a row to. A receipt that
    implied otherwise would be the false evidence the provenance gate refuses.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROOF = REPO / ".real-infra-proof"

#: The infrastructure the Stop gate looks for, and whether this tree has it.
#: Recorded as data so the receipt states the boundary instead of hiding it.
CANVAS_COMPOSE = REPO / "docker-compose.canvas.yml"

#: MODULE LEVEL, NOT ON `context`, AND THAT IS NOT A STYLE CHOICE.
#:
#: behave scopes context attributes by layer. An attribute first written inside
#: `before_scenario` lives at SCENARIO level and is popped when that scenario
#: ends, so `context.scenarios_run += 1` reads the outer value and writes a
#: shadow that is then thrown away. Measured: after fifteen passing scenarios
#: the counter still read 0 in `after_all`, so no receipt was written at all
#: and the run looked, to the gate, exactly like a suite that never ran.
_TALLY = {"scenarios": 0, "processes": 0, "real_answers": 0, "started_at": ""}

#: The providers whose answers count as "a real model answered". `fake` is the
#: deterministic offline client and is excluded BY NAME, not by default: a new
#: real vendor added to `PROVIDERS` should start counting without anyone
#: remembering this file, and a new kind of fake must be added here before its
#: answers can masquerade as evidence.
_OFFLINE_PROVIDERS = frozenset({"fake"})


def _real_answers_in(raw_documents) -> int:
    """How many of these engine replies are answers a real model produced.

    Counted from the reply itself -- every reply carries `provider` (the
    engine's own `configured_provider()`) and `outcome`. Only a document that
    both NAMES a live provider and actually ANSWERED counts; a refusal under a
    live provider proves the provider was configured, not that a model taught
    anything, and the preflight status document has no outcome at all. This is
    deliberately a lower bound: the receipt's job is to prove "at least one
    real answer happened", never to flatter the count.
    """
    import json as _json

    counted = 0
    for raw in raw_documents:
        try:
            document = _json.loads(raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(document, dict):
            continue
        provider = document.get("provider")
        if not isinstance(provider, str) or provider in _OFFLINE_PROVIDERS:
            continue
        if document.get("outcome") == "answered":
            counted += 1
    return counted


def before_all(context) -> None:
    _TALLY["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _TALLY["scenarios"] = 0
    _TALLY["processes"] = 0
    _TALLY["real_answers"] = 0

    from steps.tutor_steps import PYTHON as python

    tutor = REPO / "learning-os" / "src" / "learning_os" / "api" / "ask.py"
    # Fail loudly and early rather than letting every scenario fail with the
    # same confusing error twenty times over.
    assert python.is_file(), f"the interpreter this suite drives is missing: {python}"
    assert tutor.is_file(), f"the product this suite drives is missing: {tutor}"


def before_scenario(context, scenario) -> None:
    _TALLY["scenarios"] += 1


def after_scenario(context, scenario) -> None:
    # Every step helper starts at least one process; the classroom scenario
    # starts one per student. Counted from what actually ran.
    classroom = getattr(context, "classroom_results", None)
    if classroom:
        _TALLY["processes"] += len(classroom)
        # Each classroom row is (learner, question, code, stdout, stderr).
        _TALLY["real_answers"] += _real_answers_in(row[3] for row in classroom)
        return
    answers = getattr(context, "answers", None)
    if answers:
        _TALLY["processes"] += len(answers)
        _TALLY["real_answers"] += _real_answers_in(answers)
        return
    if getattr(context, "stdout", None) is not None:
        _TALLY["processes"] += 1
        _TALLY["real_answers"] += _real_answers_in([context.stdout])


def after_all(context) -> None:
    if not _TALLY["scenarios"]:
        # Nothing ran, so there is nothing to attest. Leaving the previous
        # receipt in place would let an empty run inherit an earlier run's
        # proof, which is the staleness trap `property_gate.py` documents.
        PROOF.unlink(missing_ok=True)
        return

    PROOF.write_text(
        json.dumps(
            {
                "started_at": _TALLY["started_at"],
                "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "scenarios_run": _TALLY["scenarios"],
                "real_os_processes_started": _TALLY["processes"],
                # The field the receipt gate reads. Counted from each reply's
                # own `provider` and `outcome`, so a run answered entirely by
                # the offline fake records 0 here and the gate stays failable.
                "real_model_answers": _TALLY["real_answers"],
                "what_was_real": (
                    "Every scenario started a separate operating-system process "
                    "running the shipped entry point and drove it over stdin and "
                    "stdout. No step patched, stubbed or mocked the code under test."
                ),
                "what_was_not_exercised": (
                    "No database. This repository contains no "
                    "docker-compose.canvas.yml and no almanac_done table, so there "
                    "is no PostgreSQL for this suite to write to. This receipt "
                    "does not claim one."
                ),
                "canvas_compose_present": CANVAS_COMPOSE.is_file(),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
