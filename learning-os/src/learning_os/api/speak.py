"""Run the engine against whichever provider is configured, and print the lesson.

WHY THIS IS A THIRD COMMAND AND NOT A FLAG ON AN EXISTING ONE
--------------------------------------------------------------
`api/cli.py` and `api/demo.py` both produce COMMITTED FIXTURES that CI compares
byte for byte. Their determinism is the property they exist to hold: `--check`
detects a real change in what the engine emits, and it can only do that while
the bytes depend on nothing but the code. Adding a provider switch to either one
would make a fixture's contents a function of an environment variable, ending
the comparison without removing it -- the worst outcome, because the check would
still be green.

So both keep passing `FakeLLMClient` explicitly, and this command writes nothing
at all. It is the one place a live model is reached, and it reaches it through
the same `teach_once` the runtime uses: same policy, same memory, same
validator, same emitter. A live run that produced a lesson by a different path
would make this command a demonstration of itself.

WHAT "GIVING IT A MOUTH" MEANS HERE, PRECISELY
----------------------------------------------
The engine has already decided everything that matters: which skill, which
diagnosis, which mechanism, which constraints, and what evidence would count as
success. The model supplies sentences inside that decision and is checked
afterwards by `validate`. Swapping the fake for Gemini changes the quality of
the prose and nothing else -- and if it changed anything else, the engine would
have been letting the model decide, which is the thing the design refuses.

STDOUT IS THE LESSON. STDERR IS EVERYTHING ELSE.
Which provider ran, which strategy the policy chose, how many attempts it took:
all diagnostics, all on stderr, so `... | jq` works, and so a run that says
nothing about how it ran is impossible. One stray `print` on stdout breaks both.

WHY THE CREDENTIAL IS CHECKED BEFORE THE LOOP RUNS
--------------------------------------------------
`teach_once` swallows `LLMUnavailable` by design -- an outage is a normal state
of the world and the caller has a real choice about it -- so the REASON does not
survive onto the `Turn`. The obvious way to recover it is to call the provider
again and read the error, which is a second request on a path that just failed;
against a provider that is merely rate-limited that is precisely the wrong move.
The dominant cause is an absent key, and that is answerable by reading the
environment: no network, no cost, no second attempt. So it is answered first,
and a genuine outage falls through to a message that does not pretend to know
more than it does.

NO KEY IS READ, ASKED FOR, OR STORED HERE.
`missing_credential` returns the NAME of an unset variable and never a value.
Issuing the key is the owner's action in the provider's own interface; nothing
in this repository does it.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime

from learning_os.api.emit import emit
from learning_os.diagnosis import Bottleneck
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import LLMUnavailable
from learning_os.llm.contract import DiagnosisKind
from learning_os.llm.select import (
    client_from_env,
    configured_provider,
    missing_credential,
    missing_sdk,
)
from learning_os.memory.store import MemoryStore
from learning_os.runtime.loop import TurnStatus, teach_once

__all__ = [
    "EXIT_EXHAUSTED",
    "EXIT_MISCONFIGURED",
    "EXIT_UNAVAILABLE",
    "EXIT_UNSATISFIABLE",
    "installed_modules",
    "main",
]


def installed_modules() -> frozenset[str] | None:
    """Which optional SDKs are importable, or `None` to look them up for real.

    A seam, and a deliberately dull one. The pre-flight below must be assertable
    for the SDK-ABSENT case on a machine where the SDK is present, and the
    alternative -- tearing modules out of `sys.modules` inside a test -- breaks
    every other test that happens to run after it in the same process.
    """
    return None

#: The provider name is not one this engine has. Fixed by correcting a variable.
EXIT_MISCONFIGURED = 2

#: The provider has no credential, or could not be reached. Fixed by the
#: operator: set a key, or wait out an outage. Distinct from the above because
#: the two fixes have nothing in common, and one number for both leaves a script
#: unable to route either.
EXIT_UNAVAILABLE = 3

#: Generated content broke its contract in ways rewriting cannot fix. Not the
#: operator's problem -- the POLICY has to choose differently.
EXIT_UNSATISFIABLE = 4

#: Every mechanism for this diagnosis has already failed on this learner. This is
#: where a human belongs, and the exit code says so instead of looking like an
#: outage.
EXIT_EXHAUSTED = 5

#: The only knowledge graph this engine ships. Named here rather than taken as an
#: argument: a flag with exactly one legal value advertises a generality that
#: does not exist.
SKILL = "python.recursion.identify_base_case"

DEFAULT_QUESTION = "Why does a recursive function need a base case?"

DIAGNOSIS = DiagnosisKind.CONCEPT_GAP

#: Stated, not measured -- and labelled that way in the bottleneck itself.
#:
#: This command has no learner in front of it. Inventing a confidence figure from
#: nothing and presenting it as evidence would be the fabrication the engine
#: exists to refuse, so `evidence_sources` says where it came from and the
#: supporting evidence says it out loud.
CONFIDENCE = 0.7


def _bottleneck() -> Bottleneck:
    return Bottleneck(
        skill_id=SKILL,
        confidence=CONFIDENCE,
        evidence_sources=("declared",),
        supporting_evidence=("stated by the operator of this command, not measured",),
    )


def _parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m learning_os.api.speak",
        description=(
            "Teach one turn with the configured provider and print the lesson. "
            "Writes nothing. Set LEARNING_OS_LLM_PROVIDER to choose a provider; "
            "unset runs the deterministic fake and needs no key."
        ),
    )
    parser.add_argument(
        "--question",
        default=DEFAULT_QUESTION,
        help="What the learner asked. Reaches the model verbatim.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """One turn, printed. Every failure is a named exit code, never a traceback.

    A configuration mistake delivered as a stack trace makes the reader hunt for
    a line number instead of reading the fix, and this is the command someone
    runs in their first ten minutes with the repository.
    """
    args = _parse(sys.argv[1:] if argv is None else argv)

    try:
        provider = configured_provider()
        client = client_from_env()
    except LLMUnavailable as error:
        print(str(error), file=sys.stderr)
        return EXIT_MISCONFIGURED

    print(f"provider: {provider}", file=sys.stderr)

    # THE PRE-FLIGHT, IN THE ORDER THE READER CAN ACT ON.
    #
    # The credential first: on a fresh checkout both are absent, and naming the
    # SDK first would have somebody install a package they still cannot use.
    absent_key = missing_credential(provider)
    if absent_key is not None:
        print(
            f"{absent_key} is not set, so provider {provider!r} cannot be called. "
            f"Export it, or unset LEARNING_OS_LLM_PROVIDER to run offline on the "
            f"deterministic fake.",
            file=sys.stderr,
        )
        return EXIT_UNAVAILABLE

    absent_sdk = missing_sdk(provider, installed_modules())
    if absent_sdk is not None:
        print(
            f"{absent_sdk} is not importable, so provider {provider!r} cannot be "
            f"called. It is an optional dependency on purpose -- CI installs only "
            f"the hash-locked base set, so the suite cannot reach the network. "
            f"Install with: pip install 'learning-os[live]'",
            file=sys.stderr,
        )
        return EXIT_UNAVAILABLE

    turn = teach_once(
        GRAPH,
        # A fresh store per run. Persisting across invocations would mean a
        # command with no learner attached was burning mechanisms for a person
        # who does not exist, and the next real learner would inherit it.
        MemoryStore(),
        client,
        _bottleneck(),
        DIAGNOSIS,
        question=args.question,
        # The real clock, because this run is not a fixture. `demo.py` injects a
        # fixed one precisely because its output is compared byte for byte.
        now=lambda: datetime.now(UTC),
    )

    print(f"strategy: {turn.contract.strategy.value}", file=sys.stderr)

    if turn.status is TurnStatus.UNAVAILABLE:
        # The credential was present, so this is a real outage or a refusal. The
        # loop does not carry the reason and this does not invent one.
        print(
            f"the provider could not be reached after {turn.attempts} attempt(s). "
            f"The credential is set, so this is an outage, a rate limit, or a "
            f"refusal rather than a configuration problem.",
            file=sys.stderr,
        )
        return EXIT_UNAVAILABLE

    if turn.status is TurnStatus.EXHAUSTED:
        print(
            "every mechanism for this diagnosis has already failed here. "
            "This is where a human belongs.",
            file=sys.stderr,
        )
        return EXIT_EXHAUSTED

    if turn.status is not TurnStatus.TAUGHT or turn.content is None:
        for violation in turn.violations:
            print(f"violation: {violation}", file=sys.stderr)
        print(f"contract not satisfied after {turn.attempts} attempt(s)", file=sys.stderr)
        return EXIT_UNSATISFIABLE

    print(f"attempts: {turn.attempts}", file=sys.stderr)
    # The same emitter as the fixtures, so what prints here is a payload the
    # canvas would accept. A second, looser emitter would let this command print
    # something the canvas refuses, and it would look like the model's fault.
    print(json.dumps(emit(turn.contract, turn.content).as_payload(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
