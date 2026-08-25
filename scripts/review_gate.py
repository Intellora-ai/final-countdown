"""Make the pre-push review impossible to skip silently.

WHAT ALREADY HAPPENED, WHICH IS THE WHOLE REASON THIS EXISTS.

Counted on 2026-08-25 over every comment the CI reviewer has posted to this
repository since it was installed:

    {"total": 80, "errors": 80}

Eighty of eighty read `**Claude encountered an error after 0s**`. Not one real
review has ever run. The job authenticates with `CLAUDE_CODE_OAUTH_TOKEN`, and
the API rejects it in 69ms for $0 -- it never reaches a model. Meanwhile the
`ai-review` check is declared `mandatory = false` in ci/gates.toml, so nothing
blocked and nobody noticed for eighty pull requests.

That is the failure this guards: not a bad review, an ABSENT one that looked
like a working setup.

WHAT IT ENFORCES, AND WHAT IT DELIBERATELY DOES NOT.

It does not block on Claude's judgement. This repository is explicit that a
reviewer's opinion carries no verification weight and must never gate a merge
-- ai-review.yml says so directly. A gate that failed a push because an AI
disliked the code would be the wrong shape and would be switched off within a
week, which is how enforcement actually dies.

The invariant is narrower, and it is exactly the one that failed:

    a review RAN, and a human SAW what it said.

So `review_ran=False` blocks, and NO acknowledgement can lift that. Findings
block until answered, and answering costs one written sentence that is then
recorded rather than discarded.

WHY THE OVERRIDE EXISTS AT ALL.
A gate with no exit is a gate people route around -- here, with `--no-verify`,
which skips the sandbox checks too and is strictly worse. One sentence in
`REVIEW_ACK` is cheap enough to use honestly and expensive enough not to use
reflexively, and it leaves a record. An empty string does not count: that is
what an author types to make a gate stop talking, and it is indistinguishable
from a shell variable that failed to expand.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict


class ReviewRecord(TypedDict):
    """What the run leaves behind, so the findings outlive the terminal."""

    skipped: bool
    reason: str
    output: str
    important: int | None
    ran: bool


@dataclass(frozen=True)
class Decision:
    """Whether the push proceeds, and the sentence explaining why."""

    blocked: bool
    reason: str


def decide(*, review_ran: bool, important: int, ack: str | None) -> Decision:
    """Resolve a review outcome into a push decision.

    Order matters. The `review_ran` check comes FIRST and is unconditional,
    because if an acknowledgement could excuse a review that never ran, then
    `REVIEW_ACK=x` would skip the reviewer entirely and this gate would enforce
    nothing -- the eighty-failure hole rebuilt with one extra variable.
    """
    if not review_ran:
        return Decision(
            blocked=True,
            reason=(
                "the review did not run, so nothing was checked. A review that "
                "did not run is not a review that passed. Fix the reviewer "
                "before pushing; REVIEW_ACK cannot excuse this."
            ),
        )

    if important <= 0:
        return Decision(blocked=False, reason="review ran and raised nothing important.")

    acknowledged = ack is not None and ack.strip() != ""
    if acknowledged:
        assert ack is not None  # narrowed by `acknowledged`
        return Decision(
            blocked=False,
            reason=f"{important} important finding(s), acknowledged: {ack.strip()}",
        )

    return Decision(
        blocked=True,
        reason=(
            f"{important} important finding(s) have not been answered. Fix them, "
            "or record why they are wrong with "
            'REVIEW_ACK="<reason>" and push again.'
        ),
    )


# --------------------------------------------------------------------------
# Reading the reviewer's output
# --------------------------------------------------------------------------

#: Severity markers the reviewer uses for a finding that should block a merge.
IMPORTANT_MARKERS = ("\N{LARGE RED CIRCLE}", "[important]", "severity: important")

#: Phrases that mean the reviewer never reached a model. Captured verbatim from
#: this machine on 2026-08-25 and from the CI job's own comments.
NOT_RUN_MARKERS = (
    "failed to authenticate",
    "oauth session expired",
    "login expired",
    "encountered an error after 0s",
    "credit balance is too low",
    "invalid api key",
)


def classify(output: str, exit_code: int) -> tuple[bool, int | None]:
    """Turn a reviewer run into (did_it_run, important_count_or_unknown).

    The `None` return is the important one. If the reviewer's output format
    ever changes, a naive counter finds zero markers and reports "clean" --
    which is the silent pass this whole module exists to prevent. So a run that
    produced real output but no recognisable verdict is UNKNOWN, and unknown is
    handled like a finding: a human reads it. Never assume clean.
    """
    stripped = output.strip()
    lowered = stripped.lower()

    if exit_code != 0 or not stripped:
        return (False, None)
    if any(marker in lowered for marker in NOT_RUN_MARKERS):
        return (False, None)

    important = sum(lowered.count(marker.lower()) for marker in IMPORTANT_MARKERS)
    if important:
        return (True, important)

    # A short, explicit all-clear is the only thing accepted as "nothing found".
    if "no issues" in lowered or "no findings" in lowered or "nothing important" in lowered:
        return (True, 0)

    # Ran, said something, and this parser did not recognise the verdict.
    return (True, None)


def gate(*, cmd: list[str], ack: str | None, skip: str | None) -> tuple[Decision, ReviewRecord]:
    """Run the reviewer, decide, and hand back the record worth keeping.

    THE SKIP IS LOUD, WHICH IS WHY IT IS NOT THE HOLE COMING BACK.
    The sin that cost this repository eighty reviews was SILENCE: a reviewer
    that never ran while every signal stayed green. A skip that has to be
    typed, carries a written reason, and lands in the record is the opposite of
    that. It exists so nobody reaches for `git push --no-verify`, which would
    skip the sandbox checks as well and is strictly worse.
    """
    import subprocess

    skipped = skip is not None and skip.strip() != ""
    if skipped:
        assert skip is not None
        return (
            Decision(blocked=False, reason=f"review SKIPPED on purpose: {skip.strip()}"),
            ReviewRecord(skipped=True, reason=skip.strip(), output="", important=None, ran=False),
        )

    proc = subprocess.run(cmd, capture_output=True, text=True)
    output = (proc.stdout or "") + (proc.stderr or "")
    ran, important = classify(output, proc.returncode)

    record = ReviewRecord(
        skipped=False, reason="", output=output, important=important, ran=ran
    )

    if not ran:
        return (
            Decision(
                blocked=True,
                reason=(
                    "the review did not run, so nothing was checked. A review "
                    "that did not run is not a review that passed. Most often "
                    "the login has expired: run `claude` then `/login`. To push "
                    'anyway, record why with REVIEW_SKIP="<reason>".'
                ),
            ),
            record,
        )

    # An unrecognised verdict is treated as a finding, never as silence.
    countable = 1 if important is None else important
    return (decide(review_ran=True, important=countable, ack=ack), record)


def main(argv: list[str] | None = None) -> int:
    """Entry point for the pre-push hook.

    Exits 1 to block the push, 0 to allow it. The reviewer's full output is
    always written to evidence, blocked or not: "needs to be read" means the
    text survives the run, not that a count was printed once and lost.
    """
    import argparse
    import json
    import os
    import time
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Block a push unless a review ran and was read.")
    parser.add_argument("--range", default="HEAD", help="what to review, e.g. origin/main...HEAD")
    parser.add_argument("--evidence-root", default=".evidence/review")
    args = parser.parse_args(argv)

    cmd = ["claude", "-p", f"/code-review {args.range}"]
    decision, record = gate(
        cmd=cmd,
        ack=os.environ.get("REVIEW_ACK"),
        skip=os.environ.get("REVIEW_SKIP"),
    )

    run_dir = Path(args.evidence_root) / time.strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "review.txt").write_text(record["output"], encoding="utf-8")
    (run_dir / "decision.json").write_text(
        json.dumps(
            {
                "blocked": decision.blocked,
                "reason": decision.reason,
                "range": args.range,
                **{k: v for k, v in record.items() if k != "output"},
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"review-gate: evidence -> {run_dir}")
    if record["output"]:
        print("---------------- reviewer said ----------------")
        print(record["output"].strip()[:4000])
        print("-----------------------------------------------")

    if decision.blocked:
        print(f"\nPUSH BLOCKED by review-gate: {decision.reason}\n")
        return 1

    print(f"review-gate: {decision.reason}")
    return 0


if __name__ == "__main__":  # pragma: no cover - thin CLI shell
    raise SystemExit(main())
