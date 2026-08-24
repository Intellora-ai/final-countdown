"""ADVERSARIAL TESTS for scripts/annotation_canary.py.

WHY A CANARY AND NOT ANOTHER ASSERTION.

Every gate in this repository checks the repository against its own claims.
`gh-annotate.mjs` counts the annotations it EMITTED. `ci_findings.reconcile`
is built on the rule that GitHub DISCARDS an annotation whose `file=` does not
resolve at the commit. That rule was inferred from a `node_modules` path not
appearing on a run. It was never verified against GitHub, and nothing in
`.github/`, `scripts/` or `frontend/scripts/` reads GitHub's annotations API:

    $ grep -rn "check-runs\\|/annotations" .github scripts frontend/scripts
    verify.yml:770  # polling the check-runs API   <- job status only

So the verification layer commits the same error it exists to catch: it checks
its own decision instead of its own effect.

The canary fixes that by making GitHub the oracle. One job deliberately emits
two annotations -- one path that exists at this commit, one that cannot -- and
a second job reads back what GitHub ACCEPTED and compares. The oracle is not
ours, cannot be bent into agreement, and can falsify us:

  * the bad one LANDED   -> GitHub does not discard, `reconcile`'s core rule is
                            false, and the node_modules fix solved nothing
  * the good one VANISHED -> annotations are not landing at all, which is worse
                            than the bug this was built for

Both are failures. A canary that can only confirm is not a canary.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from annotation_canary import (
    BAD_PATH,
    GOOD_PATH,
    Verdict,
    emit_lines,
    verify,
)


def ann(path: str, line: int = 1) -> dict[str, Any]:
    return {
        "path": path,
        "start_line": line,
        "annotation_level": "warning",
        "message": "canary",
    }


# --- the emitting half -------------------------------------------------------


def test_emit_produces_exactly_two_annotations() -> None:
    """One provable claim per line, and no third line to muddy the verdict."""
    lines = emit_lines()
    assert len(lines) == 2
    assert all(l.startswith("::warning ") for l in lines), lines


def test_emit_uses_warning_not_error() -> None:
    """A canary must never be able to fail a build on its own content.

    `::error` would put two red annotations on every green run. The claim being
    tested is whether GitHub KEEPS the annotation, and that is orthogonal to its
    level -- GitHub resolves `file=` the same way for both.
    """
    assert all("::warning " in l for l in emit_lines())
    assert not any("::error" in l for l in emit_lines())


def test_emit_names_one_resolvable_and_one_unresolvable_path() -> None:
    lines = emit_lines()
    assert any(f"file={GOOD_PATH}," in l for l in lines)
    assert any(f"file={BAD_PATH}," in l for l in lines)


def test_the_good_path_actually_exists_in_this_repo() -> None:
    """THE CANARY IS ONLY MEANINGFUL IF ITS CONTROL IS REAL.

    If GOOD_PATH is ever deleted or renamed, both annotations become
    unresolvable, the canary reports "annotations are not landing" on every run,
    and the true signal is buried under a false one. This test is what stops a
    rename from turning the prover into a liar.
    """
    assert (REPO / GOOD_PATH).is_file(), (
        f"{GOOD_PATH} no longer exists; pick another tracked file for the canary"
    )


def test_the_bad_path_actually_does_not_exist() -> None:
    assert not (REPO / BAD_PATH).exists(), (
        f"{BAD_PATH} now exists, so it no longer tests the discard behaviour"
    )


# --- the verifying half ------------------------------------------------------


def test_healthy_run_is_the_good_one_present_and_the_bad_one_absent() -> None:
    """The claim `reconcile` depends on, stated as a passing case."""
    v = verify([ann(GOOD_PATH)])
    assert v.ok, v.problems
    assert v.problems == []


def test_bad_annotation_landing_falsifies_the_discard_rule() -> None:
    """THE FINDING THAT WOULD MATTER MOST, because it invalidates shipped code.

    If GitHub keeps an annotation whose path does not resolve, then
    `ci_findings.reconcile` flagging "annotation-path-not-in-tree" as a lost
    message is wrong, and the gh-annotate node_modules fix addressed a
    non-problem. The canary must say so loudly rather than pass.
    """
    v = verify([ann(GOOD_PATH), ann(BAD_PATH)])
    assert not v.ok
    assert any(p.kind == "unresolvable-annotation-was-kept" for p in v.problems)
    assert any("reconcile" in p.detail for p in v.problems)


def test_missing_good_annotation_is_a_failure_not_a_pass() -> None:
    """Zero annotations must never read as "the bad one was discarded".

    An empty list satisfies "the bad one is absent" trivially. Treating that as
    success is the vacuous-pass shape this repo keeps finding, and it would hide
    a total annotation outage.
    """
    v = verify([])
    assert not v.ok
    assert any(p.kind == "no-annotation-landed-at-all" for p in v.problems)


def test_both_failures_are_reported_together() -> None:
    """A run can be broken in both directions; reporting one hides the other."""
    v = verify([ann(BAD_PATH)])
    assert not v.ok
    kinds = {p.kind for p in v.problems}
    assert "unresolvable-annotation-was-kept" in kinds
    assert "no-annotation-landed-at-all" in kinds


def test_unrelated_annotations_do_not_disturb_the_verdict() -> None:
    """Real runs carry other annotations; the canary judges only its own two."""
    noise = [ann("frontend/src/canvas/layout/layout.ts", 42), ann(GOOD_PATH)]
    assert verify(noise).ok


def test_verdict_is_serialisable() -> None:
    import json

    json.loads(json.dumps(verify([]).as_dict()))
    assert isinstance(verify([ann(GOOD_PATH)]), Verdict)
