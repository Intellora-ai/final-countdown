"""Two learners, one knowledge state, two different lessons -- generated, not written.

WHAT THIS EXISTS TO SHOW
------------------------
The claim the whole engine rests on is that instruction is CHOSEN rather than
templated. That claim is cheap to assert and easy to fake: hand-author two
lessons, put them side by side, and nothing has been demonstrated.

So these fixtures are produced by driving the real `teach_once` -- the same
policy, memory, and emitter the runtime uses -- for two learners who differ in
exactly one respect. Their knowledge is IDENTICAL: same skill, same diagnosis,
same confidence, same bottleneck. Only their history differs: learner B has
already been taught this skill by the mechanism the engine prefers, and it
failed. The engine therefore falls to its second choice, and the two lessons
differ in strategy AND in block structure -- prose and prose becomes prose and
a table -- without anybody choosing that.

If the two outputs are the same, the engine is a template and this file proves
it. That is the point of generating them rather than writing them.

WHY THE PROSE IS THIN
---------------------
`FakeLLMClient` is deliberately a poor writer -- see `llm/client.py`. What
varies between these two files is the STRATEGY the policy selected and the
constraints it imposed, which is the engine's decision. The sentences are
skeletons standing in for a model's. Judging the teaching quality from this
output would be judging text no model produced.

DETERMINISM
-----------
`now` is injected and the fake hashes its contract, so the bytes are stable
across machines and runs. `--check` fails when the files on disk disagree with
what the engine produces today: a fixture nothing can regenerate is a fixture
that silently stops describing the system.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from learning_os.api.emit import emit
from learning_os.diagnosis import Bottleneck
from learning_os.domain.python_recursion import GRAPH
from learning_os.llm.client import FakeLLMClient
from learning_os.llm.contract import DiagnosisKind
from learning_os.memory.store import Attempt, MemoryStore, Outcome
from learning_os.models.contracts import ActionKind
from learning_os.policy import choose_strategy
from learning_os.runtime.loop import TurnStatus, teach_once
from learning_os.spec_root import REPO_ROOT

#: Where the canvas reads them from. Under `frontend/` because the CONSUMER is
#: the canvas, matching `api/cli.py`.
OUT_DIR = Path("frontend/src/canvas/lessons/generated")

SKILL = "python.recursion.identify_base_case"
QUESTION = "Why does a recursive function need a base case?"

#: The SAME diagnosis for both learners. Named once so the two runs cannot drift
#: apart in their input -- if they did, a difference in output would prove
#: nothing beyond "different questions get different answers".
DIAGNOSIS = DiagnosisKind.CONCEPT_GAP

#: Fixed, because a fixture whose clock moves cannot show that the OUTPUT moved.
AT = datetime(2026, 1, 1, tzinfo=UTC)


def _now() -> datetime:
    return AT


def _bottleneck() -> Bottleneck:
    """The SAME diagnosis for both learners.

    Constructed once and reused rather than built per learner, so the two runs
    cannot accidentally differ in their input -- which would make the difference
    in output prove nothing.
    """
    return Bottleneck(
        skill_id=SKILL,
        confidence=0.7,
        evidence_sources=("verifier",),
        supporting_evidence=("wrote a recursive call with no terminating branch",),
    )


def _learner_a() -> MemoryStore:
    """No history. The engine is free to choose its first-preference mechanism."""
    return MemoryStore()


def _learner_b() -> MemoryStore:
    """Same knowledge, one prior failure -- of the mechanism the engine prefers.

    WHICH mechanism is burned is asked of the policy rather than hardcoded. An
    earlier version of this demo burned a strategy that was not in the
    preference list for this diagnosis, so exclusion had nothing to do and both
    learners got the same lesson: a demonstration that demonstrated nothing,
    while looking like it worked. Deriving it means the demo stays pointed at
    the real first choice even when the preference order changes.

    Recording an ATTEMPT rather than setting a flag: the policy excludes on
    mechanism by reading memory, so this exercises the real exclusion path
    instead of a switch that exists only for the demo.
    """
    memory = MemoryStore()
    first_choice, _, _ = choose_strategy(DIAGNOSIS, MemoryStore(), SKILL)
    memory.record_attempt(
        Attempt(
            skill_id=SKILL,
            # Six strategies share this action -- which is exactly why exclusion
            # keys on `mechanism` and not on `action`. Recording it the way the
            # runtime does keeps the demo honest about which field carries the
            # identity of what was tried.
            action=ActionKind.TEACH_BY_EXAMPLE,
            representation=first_choice.value,
            outcome=Outcome.FAILURE,
            mechanism=first_choice.value,
        )
    )
    return memory


#: Filename -> the memory that learner arrives with. The names say what differs,
#: because a reader comparing two JSON files should not have to infer why.
LEARNERS = {
    "learner-a-first-attempt": _learner_a,
    "learner-b-preferred-mechanism-failed": _learner_b,
}


def build() -> dict[str, tuple[str, dict[str, Any]]]:
    """Run the real loop for each learner.

    Returns the chosen STRATEGY alongside the payload. The strategy is the
    engine's decision; the payload is what that decision rendered to. Checking
    the two separately matters because they can disagree in either direction --
    a shared strategy with different prose would be the fake being noisy, and
    different strategies with identical prose would be the emitter flattening
    the decision.
    """
    out: dict[str, tuple[str, dict[str, Any]]] = {}
    for name, make_memory in LEARNERS.items():
        turn = teach_once(
            GRAPH,
            make_memory(),
            FakeLLMClient(),
            _bottleneck(),
            DIAGNOSIS,
            question=QUESTION,
            now=_now,
        )
        if turn.status is not TurnStatus.TAUGHT or turn.content is None:
            # Loud rather than a partial write. A demo that silently emits one
            # of two files is worse than one that fails, because the missing
            # half is the half that proves the point.
            raise RuntimeError(f"{name}: engine did not teach ({turn.status.value})")
        strategy = turn.contract.strategy.value
        out[name] = (strategy, emit(turn.contract, turn.content).as_payload())
    return out


def render(payload: dict[str, Any]) -> str:
    """Stable bytes: sorted keys, trailing newline. Matches `api/cli.py`."""
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    """Write the fixtures, or check them.

    `--check` is the CI mode. Regenerating during the check would make the files
    agree with themselves by construction and detect nothing.
    """
    args = sys.argv[1:] if argv is None else argv
    built = build()

    # THE ASSERTION THIS FILE EXISTS FOR. Two learners, one knowledge state,
    # different histories -- if either the decision or the rendered lesson
    # collapses to one, the engine is templating and no amount of prose in a
    # README changes that.
    #
    # NOT compared on `id`: that is derived from the target skill, which is
    # identical here on purpose. A guard that reads it would fire on every run
    # regardless of what the engine did, which is a check that cannot fail for
    # the reason it claims to.
    strategies = {name: s for name, (s, _) in built.items()}
    if len(set(strategies.values())) == 1:
        raise RuntimeError(f"both learners got the same strategy: {strategies}")
    if len({render(p) for _, p in built.values()}) == 1:
        raise RuntimeError("different strategies rendered identical lessons")

    failures = 0
    for name, (_, payload) in built.items():
        target = REPO_ROOT / OUT_DIR / f"{name}.json"
        rendered = render(payload)

        if "--check" in args:
            if not target.exists() or target.read_text(encoding="utf-8") != rendered:
                print(
                    f"{OUT_DIR / name}.json is stale or missing. "
                    f"Regenerate with: python -m learning_os.api.demo",
                    file=sys.stderr,
                )
                failures += 1
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered, encoding="utf-8")
        print(f"wrote {OUT_DIR / name}.json")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
