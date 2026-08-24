"""The verifier boundary: how a domain proves something about a learner.

WHY THIS IS AN INTERFACE AND NOT A FUNCTION
-------------------------------------------
Different subjects are checkable in completely different ways, and to completely
different degrees. Python runs. Lean proves. Arithmetic can be recomputed. A
historical interpretation can be compared against sources but not settled by
one. Personal advice has no correct answer at all.

A single `check()` that pretends those are the same thing would have to report
the same kind of confidence for all of them, and that is the lie the
`Verifiability` states exist to prevent. So each domain supplies its own
verifier, and the core engine never learns what subject it is teaching -- it
only learns how far the answer it just got can be trusted.

WHAT A VERIFIER MUST NEVER DO
-----------------------------
Return confidence it has not earned. An `UNSUPPORTED` domain returns
uncertainty, not a number that looks like an assessment. `ToolResult` enforces
that at the type level; this interface is where it starts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from learning_os.models.contracts import EvidenceStrength, Verifiability


@dataclass(frozen=True, slots=True)
class Task:
    """Something to hand a learner, and what a correct answer looks like.

    `expected_evidence` is fixed when the task is CREATED, not when it is
    marked. That is invariant 2 in practice: deciding what would count as
    success after seeing the answer is how every intervention ends up looking
    successful.
    """

    task_id: str
    skill_id: str
    prompt: str
    #: Domain-specific check material. For Python this is test source; for a
    #: rubric domain it is the rubric. The engine never reads it -- only the
    #: verifier that produced it does.
    checker: str = ""
    expected_evidence: EvidenceStrength = EvidenceStrength.INDEPENDENT_APPLICATION
    #: True when the context is new to the learner, which is what separates
    #: transfer from repetition. Set by the caller who knows the history.
    is_novel_context: bool = False


@dataclass(frozen=True, slots=True)
class Judgement:
    """What a verifier concluded, and how far it can be trusted.

    `verifiability` travels WITH the result rather than being looked up from
    the domain, because the same verifier can be certain about one answer and
    not another -- code that fails to parse is definitively wrong, while code
    that passes the tests provided is only as right as those tests.
    """

    passed: bool
    performance: float
    verifiability: Verifiability
    detail: str = ""
    #: What this result does NOT establish. Read before a mastery claim is
    #: allowed to rest on it.
    limitations: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not 0.0 <= self.performance <= 1.0:
            raise ValueError(f"performance must be in [0,1], got {self.performance}")
        if self.verifiability is Verifiability.UNSUPPORTED and self.passed:
            raise ValueError(
                "an UNSUPPORTED domain cannot report a pass; it has nothing to "
                "check with, and a pass here would become fabricated confidence "
                "downstream"
            )


@runtime_checkable
class DomainVerifier(Protocol):
    """One subject's ability to check itself.

    Three methods, because the engine needs three different things and
    collapsing them loses information:

      `validate_claim`   -- is this statement true? guards generated content
      `evaluate_response`-- what did this answer demonstrate? produces evidence
      `generate_transfer_task` -- give me a NOVEL problem for this skill

    The third is what makes transfer measurable rather than asserted. A verifier
    that cannot produce a genuinely new problem cannot tell you whether a
    learner understood the principle or memorised the example, and that
    distinction is most of what mastery means.
    """

    domain: str

    def verifiability_of(self, skill_id: str) -> Verifiability:
        """How far a claim about this SKILL can be checked.

        Per skill, not per domain. Within Python, "writes a working base case"
        is settled by execution while "explains why it terminates" is not, and
        a single per-domain answer would let the second borrow the first's
        authority.
        """
        ...

    def validate_claim(self, claim: str, context: str = "") -> Judgement: ...

    def evaluate_response(self, task: Task, response: str) -> Judgement: ...

    def generate_transfer_task(self, skill_id: str, *, seen: tuple[str, ...] = ()) -> Task | None:
        """A problem in a context the learner has not met.

        `seen` is what they have already been given, so the verifier can avoid
        handing back something that only looks new. Returns None when the domain
        has no unseen task left -- which the policy layer must treat as "cannot
        measure transfer right now", never as "transfer failed".
        """
        ...


class UnsupportedVerifier:
    """The honest answer for a domain with no way to check itself.

    THIS CLASS IS A FEATURE.

    The tempting alternative is to let unsupported domains fall through to an
    LLM judging its own output, which produces a number that looks exactly like
    a measurement and is not one. Everything here returns `UNSUPPORTED`, refuses
    to pass, and says what it cannot do -- so a subject with no verifier degrades
    to visible uncertainty rather than invisible confidence.
    """

    domain = "unsupported"

    def verifiability_of(self, skill_id: str) -> Verifiability:
        return Verifiability.UNSUPPORTED

    def validate_claim(self, claim: str, context: str = "") -> Judgement:
        return Judgement(
            passed=False,
            performance=0.0,
            verifiability=Verifiability.UNSUPPORTED,
            detail="no verifier is registered for this domain",
            limitations=("nothing was checked; treat this as unknown, not as false",),
        )

    def evaluate_response(self, task: Task, response: str) -> Judgement:
        return self.validate_claim(response)

    def generate_transfer_task(self, skill_id: str, *, seen: tuple[str, ...] = ()) -> Task | None:
        return None
