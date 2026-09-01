#!/usr/bin/env python3
"""Curated mutants for the grounded-answer path: every claim gets a saboteur.

WHY THIS EXISTS
---------------
The verify workflow mutates the Lean-specced root `src/`; the frontend carries
a 39-mutant catalogue for its own suites. `learning-os` had neither -- its only
mechanical defences were coverage and strict types, and coverage proves lines
RAN, never that an assertion can fail. A vacuous test here would have passed
every gate this repository owns. That was measured, said out loud, and this
file is the closing of it.

CURATED, NOT GENERATED -- the same decision `frontend/scripts/mutation-gate.mjs`
argues at length. Blanket mutation over 2,700 statements produces mostly
broken-not-subtle programs and a wall of noise; every mutant below is one
specific lie the grounded-answer work must be able to catch, written beside the
tests expected to catch it. A mutant that SURVIVES its killers means those
tests are decoration, and this gate goes red.

HOW IT RUNS
-----------
For each mutant: patch the source in place (exact, unique substring -- a miss
is a hard error, because a mutant that no longer applies is a catalogue lying
about the code), run only its killer tests, demand they FAIL, restore the file.
Before any of that, the killers must PASS unmutated -- a kill is attributable
only against a green baseline. Offline by construction: every killer runs on
the deterministic fake, so this obeys the job's no-network, no-key law.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

VALIDATION = "src/learning_os/llm/validation.py"
DOUBT = "src/learning_os/session/doubt.py"
WEBSEARCH = "src/learning_os/websearch.py"
CLIENT = "src/learning_os/llm/client.py"
ASK = "src/learning_os/api/ask.py"
LOOP = "src/learning_os/runtime/loop.py"

GROUNDED = "tests/test_grounded_answer.py"


@dataclass(frozen=True)
class Mutant:
    """One specific lie, and the tests that must refuse it."""

    path: str
    original: str
    mutated: str
    breaks: str
    killers: tuple[str, ...]


MUTANTS: tuple[Mutant, ...] = (
    Mutant(
        VALIDATION,
        "        if url not in allowed:",
        "        if False:",
        "the invention net goes dark: a lesson may cite any URL nobody retrieved",
        (
            f"{GROUNDED}::test_a_lesson_citing_a_url_nobody_retrieved_is_refused_outright",
            f"{GROUNDED}::test_even_an_unsourced_lesson_may_not_cite_the_web",
        ),
    ),
    Mutant(
        VALIDATION,
        "    if contract.sources and not any(url in allowed for url in written):",
        "    if False and not any(url in allowed for url in written):",
        "a grounded lesson may hide its ground: sources demanded, none named, accepted",
        (f"{GROUNDED}::test_a_grounded_lesson_naming_no_source_is_refused",),
    ),
    Mutant(
        VALIDATION,
        '    return [match.rstrip(".,;:!?") for match in _URL.findall(text)]',
        "    return list(_URL.findall(text))",
        "a citation followed by a full stop stops matching its own source",
        (f"{GROUNDED}::test_trailing_punctuation_does_not_break_the_citation_match",),
    ),
    Mutant(
        VALIDATION,
        '_URL = re.compile(r"https?://[^\\s\\"\'<>)\\]]+", re.IGNORECASE)',
        '_URL = re.compile(r"https?://[^\\s\\"\'<>)\\]]+")',
        "an invented citation hides behind a capital scheme",
        (f"{GROUNDED}::test_an_invented_citation_cannot_hide_behind_capitalisation",),
    ),
    Mutant(
        DOUBT,
        "    if not sources:\n        return None",
        "    if False:\n        return None",
        "an empty web answers anyway: a sourceless contract skips the citation rules",
        (f"{GROUNDED}::test_an_empty_web_refuses_in_the_standing_words",),
    ),
    Mutant(
        DOUBT,
        "    if turn.status is TurnStatus.UNAVAILABLE:",
        "    if False:",
        "a model outage is dressed up as the standing refusal instead of said plainly",
        (f"{GROUNDED}::test_a_model_outage_with_sources_says_so_rather_than_deflecting",),
    ),
    Mutant(
        DOUBT,
        "        grounded = _grounded(client, doubt, search, now=now)",
        "        grounded = None",
        "the grounded path is severed: every off-curriculum doubt refuses forever",
        (f"{GROUNDED}::test_sources_turn_the_refusal_into_a_cited_answer",),
    ),
    Mutant(
        WEBSEARCH,
        '        if not hit["snippet"].strip():',
        "        if False:",
        "quoteless hits enter contracts, and the model may cite a page saying anything",
        (f"{GROUNDED}::test_snippetless_hits_ground_nothing",),
    ),
    Mutant(
        WEBSEARCH,
        "    except Exception:\n        return ()",
        "    except Exception:\n        raise",
        "a dead engine crashes the refusal path instead of standing aside",
        (f"{GROUNDED}::test_a_dead_transport_means_no_sources_rather_than_an_exception",),
    ),
    Mutant(
        WEBSEARCH,
        "        if len(out) == MAX_SOURCES:\n            break",
        "        if False:\n            break",
        "contracts grow unbounded source lists, and the prompt becomes a document dump",
        (f"{GROUNDED}::test_no_more_sources_enter_a_contract_than_it_can_carry",),
    ),
    Mutant(
        CLIENT,
        "        if contract.sources:\n            cited = contract.sources[0]",
        "        if False:\n            cited = contract.sources[0]",
        "the fake stops citing, and the offline proof of the whole path is gone",
        (f"{GROUNDED}::test_the_fake_honours_a_sourced_contract",),
    ),
    Mutant(
        ASK,
        "    if turn.contract.sources:",
        "    if True:",
        "every curriculum answer grows a vestigial empty sources key",
        (f"{GROUNDED}::test_a_curriculum_answer_carries_no_sources_field",),
    ),
    Mutant(
        LOOP,
        "        violations = validate(contract, content)",
        "        violations = []",
        "the validator is unplugged: whatever the model writes reaches the learner",
        (
            f"{GROUNDED}::test_a_model_that_cannot_satisfy_the_citation_rules_leaves_the_refusal_standing",
        ),
    ),
)


def _pytest(nodes: tuple[str, ...]) -> int:
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--no-header", "-x", *nodes],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    ).returncode


def main() -> int:
    every_killer = tuple(dict.fromkeys(k for m in MUTANTS for k in m.killers))
    print(f"baseline: {len(every_killer)} killer test(s) must pass unmutated")
    if _pytest(every_killer) != 0:
        print("FAIL: the killers are red before any mutation; nothing below is attributable")
        return 1

    survivors: list[Mutant] = []
    for at, mutant in enumerate(MUTANTS, 1):
        source = ROOT / mutant.path
        text = source.read_text(encoding="utf-8")
        hits = text.count(mutant.original)
        if hits != 1:
            print(
                f"FAIL: mutant {at} matches {hits} site(s) in {mutant.path}; "
                f"the catalogue no longer describes the code"
            )
            return 1
        source.write_text(text.replace(mutant.original, mutant.mutated), encoding="utf-8")
        try:
            killed = _pytest(mutant.killers) != 0
        finally:
            source.write_text(text, encoding="utf-8")
        verdict = "killed" if killed else "SURVIVED"
        print(f"mutant {at:2}/{len(MUTANTS)} {verdict}: {mutant.breaks}")
        if not killed:
            survivors.append(mutant)

    if survivors:
        print(f"FAIL: {len(survivors)} mutant(s) survived; the tests naming them are decoration")
        return 1
    print(f"PASS: {len(MUTANTS)}/{len(MUTANTS)} mutants killed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
