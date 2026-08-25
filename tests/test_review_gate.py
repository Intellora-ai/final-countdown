"""The review gate: a review that did not run is not a review that passed.

WHY THIS EXISTS, MEASURED RATHER THAN ASSERTED.

Counted on 2026-08-25 across every comment the reviewer has ever posted to this
repository:

    {"total": 80, "errors": 80}

Eighty out of eighty are `**Claude encountered an error after 0s**`. Not one
real review has ever run here. The CI reviewer authenticates with a
`CLAUDE_CODE_OAUTH_TOKEN` that the API rejects in 69ms for $0 — it never
reaches the model.

The local route needs no such secret, and it is dead for a related reason.
Captured verbatim from `claude -p` on this machine:

    Failed to authenticate: OAuth session expired and could not be refreshed

So the honest starting position is that BOTH review paths are down, and the
thing that must never happen again is the one that already happened for eighty
consecutive pull requests: **the review silently not running while everything
looked fine.**

THE INVARIANT THIS GATE ENFORCES.

Not "Claude approves of your code" — this repository is explicit that a
reviewer's opinion carries no verification weight, and a gate that blocked on
an AI's judgement would be exactly the wrong shape. The invariant is narrower
and it is the one that failed:

    a review RAN, and a human SAW what it said.

`review_ran=False` therefore blocks, and no acknowledgement can unblock it.
That last rule is what stops the override from becoming a way to skip review
altogether, which would rebuild the eighty-failure hole with extra steps.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from review_gate import decide  # noqa: E402


class TestReviewMustActuallyRun:
    """The failure mode that already cost this repository eighty reviews."""

    def test_a_review_that_could_not_run_blocks_the_push(self) -> None:
        d = decide(review_ran=False, important=0, ack=None)

        assert d.blocked is True
        # The reason is read by a human at the moment they are blocked, so it
        # must name the actual problem rather than say "failed".
        assert "did not run" in d.reason.lower()

    def test_an_acknowledgement_cannot_excuse_a_review_that_never_RAN(self) -> None:
        """The rule that keeps the override from becoming a bypass.

        Without this, `REVIEW_ACK=whatever` would skip the reviewer entirely
        and the gate would enforce nothing at all -- the eighty-failure hole
        rebuilt with an extra environment variable.
        """
        d = decide(review_ran=False, important=3, ack="I am in a hurry")

        assert d.blocked is True
        assert "did not run" in d.reason.lower()


class TestFindingsMustBeSeen:
    def test_a_clean_review_lets_the_push_through(self) -> None:
        d = decide(review_ran=True, important=0, ack=None)

        assert d.blocked is False

    def test_important_findings_block_until_they_are_answered(self) -> None:
        d = decide(review_ran=True, important=2, ack=None)

        assert d.blocked is True
        assert "2" in d.reason

    def test_an_explicit_written_reason_unblocks_and_is_quoted_back(self) -> None:
        """Enforced does not mean immovable.

        A false positive must not strand the author. It must cost a sentence,
        and that sentence is recorded rather than discarded, so the override is
        reviewable later instead of invisible.
        """
        d = decide(review_ran=True, important=2, ack="both are false positives, see PR #131")

        assert d.blocked is False
        assert "both are false positives" in d.reason


class TestTheOverrideIsNotAFormality:
    @pytest.mark.parametrize("empty", ["", "   ", "\t\n"])
    def test_a_blank_acknowledgement_is_not_an_acknowledgement(self, empty: str) -> None:
        """`REVIEW_ACK=` must not count.

        An empty string is what an author types to make a gate shut up without
        reading anything, and it is indistinguishable from a shell variable
        that failed to expand.
        """
        d = decide(review_ran=True, important=1, ack=empty)

        assert d.blocked is True

    def test_the_count_is_reported_exactly_not_rounded_to_some(self) -> None:
        d = decide(review_ran=True, important=7, ack=None)

        assert "7" in d.reason


from review_gate import classify  # noqa: E402


class TestTellingARealRunFromADeadOne:
    """The eighty-failure hole, in the shape it actually arrived in."""

    @pytest.mark.parametrize(
        "output",
        [
            # Verbatim from `claude -p` on this machine, 2026-08-25.
            "Failed to authenticate: OAuth session expired and could not be refreshed",
            # Verbatim from all 80 of the CI reviewer's PR comments.
            "**Claude encountered an error after 0s** -- [View job](https://github.com/...)",
            "Login expired - Please run /login",
            "Your credit balance is too low to access the Claude API",
        ],
    )
    def test_an_authentication_failure_is_not_a_clean_review(self, output: str) -> None:
        ran, _ = classify(output, exit_code=0)

        # Exit code 0 with an auth failure in the body is exactly how this
        # failed silently for eighty pull requests: the job "succeeded".
        assert ran is False

    def test_empty_output_is_not_a_clean_review(self) -> None:
        ran, _ = classify("   \n  ", exit_code=0)

        assert ran is False

    def test_a_nonzero_exit_is_not_a_clean_review(self) -> None:
        ran, _ = classify("some findings here", exit_code=2)

        assert ran is False


class TestCountingWhatTheReviewerSaid:
    def test_an_explicit_all_clear_counts_as_zero(self) -> None:
        ran, important = classify("Review complete. No issues found.", exit_code=0)

        assert (ran, important) == (True, 0)

    def test_red_markers_are_counted(self) -> None:
        output = (
            "\N{LARGE RED CIRCLE} Important: token refresh races with logout\n"
            "\N{LARGE RED CIRCLE} Important: query is not scoped to the tenant\n"
            "\N{LARGE YELLOW CIRCLE} Nit: rename this\n"
        )
        ran, important = classify(output, exit_code=0)

        assert (ran, important) == (True, 2)

    def test_an_unrecognised_verdict_is_UNKNOWN_never_assumed_clean(self) -> None:
        """The rule that survives a format change.

        If the reviewer's output shape changes, a counter that finds no markers
        would report "clean" and wave the push through -- the same silent pass
        this module exists to stop. Unknown must stay unknown so a human reads
        it.
        """
        output = "I looked at the diff and have some thoughts about the caching layer."
        ran, important = classify(output, exit_code=0)

        assert ran is True
        assert important is None

    def test_an_unknown_verdict_blocks_until_answered(self) -> None:
        """Unknown is handled like a finding, not like silence."""
        ran, important = classify("thoughts, but no recognisable verdict", exit_code=0)
        d = decide(review_ran=ran, important=important or 1, ack=None)

        assert d.blocked is True


from review_gate import gate  # noqa: E402


def _fake_reviewer(tmp_path: Path, stdout: str, exit_code: int = 0) -> list[str]:
    """A stand-in reviewer, so the gate's own logic is what is under test."""
    script = tmp_path / "fake_reviewer.sh"
    script.write_text(f"#!/usr/bin/env bash\ncat <<'OUT'\n{stdout}\nOUT\nexit {exit_code}\n")
    script.chmod(0o755)
    return [str(script)]


class TestTheGateEndToEnd:
    def test_a_clean_review_allows_the_push(self, tmp_path: Path) -> None:
        d, _ = gate(cmd=_fake_reviewer(tmp_path, "No issues found."), ack=None, skip=None)

        assert d.blocked is False

    def test_a_dead_reviewer_blocks_and_names_the_cure(self, tmp_path: Path) -> None:
        """Today's real state: the login is expired, so nothing can review.

        The block must not merely say "failed". It has to name the one command
        that fixes it, because a gate that blocks without telling you how to
        proceed is a gate that gets deleted.
        """
        dead = _fake_reviewer(tmp_path, "Failed to authenticate: OAuth session expired")
        d, _ = gate(cmd=dead, ack=None, skip=None)

        assert d.blocked is True
        assert "/login" in d.reason

    def test_an_acknowledgement_still_cannot_excuse_a_dead_reviewer(self, tmp_path: Path) -> None:
        dead = _fake_reviewer(tmp_path, "Failed to authenticate: OAuth session expired")
        d, _ = gate(cmd=dead, ack="I read it, honest", skip=None)

        assert d.blocked is True

    def test_an_explicit_recorded_skip_is_the_only_way_past_a_dead_reviewer(
        self, tmp_path: Path
    ) -> None:
        """The bootstrap escape, and why it is not the hole coming back.

        The sin that cost eighty reviews was SILENCE -- a reviewer that did not
        run while everything looked green. A skip that must be typed, carries a
        written reason, prints loudly and lands in evidence is the opposite of
        silence. The escape exists so that people do not reach for
        `--no-verify`, which would skip the sandbox checks as well and is
        strictly worse.
        """
        dead = _fake_reviewer(tmp_path, "Failed to authenticate: OAuth session expired")
        d, record = gate(cmd=dead, ack=None, skip="login expired, issue #93")

        assert d.blocked is False
        assert "login expired, issue #93" in d.reason
        assert record["skipped"] is True
        assert record["reason"] == "login expired, issue #93"

    @pytest.mark.parametrize("blank", ["", "   "])
    def test_a_blank_skip_is_not_a_skip(self, tmp_path: Path, blank: str) -> None:
        dead = _fake_reviewer(tmp_path, "Failed to authenticate: OAuth session expired")
        d, _ = gate(cmd=dead, ack=None, skip=blank)

        assert d.blocked is True

    def test_findings_block_and_the_output_is_kept_for_reading(self, tmp_path: Path) -> None:
        out = "\N{LARGE RED CIRCLE} Important: unscoped query at db.py:41"
        d, record = gate(cmd=_fake_reviewer(tmp_path, out), ack=None, skip=None)

        assert d.blocked is True
        # "Needs to be read" means the text survives the run, not just a count.
        assert "unscoped query at db.py:41" in record["output"]

    def test_a_review_with_an_unreadable_verdict_blocks_rather_than_passing(
        self, tmp_path: Path
    ) -> None:
        """THIS TEST EXISTS BECAUSE A MUTANT SURVIVED WITHOUT IT.

        Mutation run 2026-08-25, mutant M14 "treat an unknown verdict as clean"
        SURVIVED the end-to-end suite. The unknown path was covered through
        `classify` and `decide` separately, but never through `gate`, so the
        one line that converts unknown into a blocking count was unguarded.

        That line is the whole point. If the reviewer's output format changes,
        the marker count goes to zero, and a gate that read zero as "clean"
        would wave every push through while reporting success -- which is
        exactly the shape of the eighty consecutive silent failures this module
        was written to end. Unknown must cost a human read.
        """
        vague = _fake_reviewer(tmp_path, "I had a look at the diff and have some thoughts.")
        d, record = gate(cmd=vague, ack=None, skip=None)

        assert record["ran"] is True
        assert record["important"] is None
        assert d.blocked is True

    def test_an_unreadable_verdict_can_still_be_answered(self, tmp_path: Path) -> None:
        """Blocking on unknown must not be a dead end, or it gets deleted."""
        vague = _fake_reviewer(tmp_path, "I had a look at the diff and have some thoughts.")
        d, _ = gate(cmd=vague, ack="read it, nothing actionable", skip=None)

        assert d.blocked is False
