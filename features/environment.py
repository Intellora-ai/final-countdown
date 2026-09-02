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


def _say_why_a_real_model_did_not_answer(scenario_name: str, raw_documents) -> None:
    """Put a live provider's non-answer where a CI reader can see it.

    The job log is admin-only on this repository, so a scenario that ran a
    real model and got a refusal back was, until now, evidence nobody could
    read: the receipt counted zero and the reason stayed in a log nobody can
    download. GitHub turns a `::warning` line on stdout into an annotation on
    the run, no workflow change required -- so the reply's own words about why
    it did not answer (its outcome, its refusal sentence, any violations it
    lists) are printed in that form, once per non-answering reply.

    Only LIVE providers are reported. The offline fake refusing an
    off-curriculum question is the product working, not a finding.
    """
    import json as _json

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
            continue
        why = {
            key: document[key]
            for key in ("outcome", "refusal", "cause", "violations", "issues", "error", "reason")
            if key in document
        }
        # THE ENVELOPE, so the reader knows the KIND before the words: a quota
        # is EXTERNAL and a fix in the code is the wrong move; an "unmappable"
        # under a live provider is the product working and is classified CODE
        # only because nothing else claims it -- the outcome word says the rest.
        env = _envelope_of(scenario_name, why)
        # One line, no newlines: a workflow command ends at the first newline.
        message = _json.dumps(why, ensure_ascii=True)[:800].replace("\n", " ")
        print(
            f"::warning title={env.title(f'real-tutor did not answer ({provider})')}::"
            f"{scenario_name}: {message} {env.trailer()}",
            flush=True,
        )


def _envelope_of(scenario_name: str, why: dict[str, object]):  # noqa: ANN202 - behave, untyped
    """The Python envelope module, loaded by path: behave runs from the repo root."""
    import importlib.util as _util
    import sys as _sys

    module = _sys.modules.get("failure_envelope")
    if module is None:
        spec = _util.spec_from_file_location(
            "failure_envelope", REPO / "learning-os" / "tests" / "failure_envelope.py"
        )
        assert spec is not None and spec.loader is not None
        module = _util.module_from_spec(spec)
        # Registered before it runs: its slots dataclasses resolve annotations
        # through sys.modules, and an unregistered module is None there.
        _sys.modules["failure_envelope"] = module
        spec.loader.exec_module(module)
    text = " ".join(str(why.get(k, "")) for k in ("cause", "refusal", "error", "outcome"))
    return module.envelope(
        runner="behave",
        test=scenario_name,
        file="features/tutor.feature",
        message=text,
        known=module.known_failures(REPO / "frontend" / "scripts" / "known-failures.json"),
        commit="",
    )


def after_scenario(context, scenario) -> None:
    # Every step helper starts at least one process; the classroom scenario
    # starts one per student. Counted from what actually ran.
    classroom = getattr(context, "classroom_results", None)
    if classroom:
        _TALLY["processes"] += len(classroom)
        # Each classroom row is (learner, question, code, stdout, stderr).
        replies = [row[3] for row in classroom]
        _TALLY["real_answers"] += _real_answers_in(replies)
        _say_why_a_real_model_did_not_answer(scenario.name, replies)
        return
    answers = getattr(context, "answers", None)
    if answers:
        _TALLY["processes"] += len(answers)
        _TALLY["real_answers"] += _real_answers_in(answers)
        _say_why_a_real_model_did_not_answer(scenario.name, answers)
        return
    if getattr(context, "stdout", None) is not None:
        _TALLY["processes"] += 1
        _TALLY["real_answers"] += _real_answers_in([context.stdout])
        _say_why_a_real_model_did_not_answer(scenario.name, [context.stdout])


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
