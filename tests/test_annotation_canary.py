"""ADVERSARIAL TESTS for scripts/annotation_canary.py.

WHY A CANARY, AND WHAT IT ALREADY PROVED WRONG.

Every gate in this repository checks the repository against its own claims.
`ci_findings.reconcile` was built on a rule about a system nobody here controls:

    GitHub resolves `file=` against the annotated commit and DISCARDS what it
    cannot find, without reporting the loss.

That rule was inferred from a `node_modules` path not appearing on a run, never
tested, and nothing here could have tested it -- no code in `.github/`,
`scripts/` or `frontend/scripts/` read GitHub's annotations API at all.

So the canary was built to let GitHub falsify it, and on its first run it did:

    run 32696164034, job "canary verify"
    kind: "unresolvable-annotation-was-kept"
    GitHub kept an annotation on 'scripts/__annotation_canary_no_such_file__.py'

The API returned the probe, with a `blob_href` pointing at a file that is not
in the tree. **GitHub does not discard.** The rule was false.

WHAT THAT CHANGED HERE, AND WHY THE CANARY HAD TO BE REWRITTEN TOO.

Written against the false rule, the canary reported a problem on every single
run: permanently red, and a permanently red check is one people learn to scroll
past. That is the same "absence looks like health" failure this repository keeps
closing, arrived at from the opposite side -- a signal so constant it carries no
information.

So the canary is now anchored on the OBSERVED contract rather than the assumed
one. GitHub keeps both annotations, so keeping both is PASS. It fails when that
changes in either direction, because either direction is news:

  the control vanishes   annotations are not landing at all, and every
                         location-based finding on the run is suspect
  the probe vanishes     GitHub started discarding unresolvable paths, which
                         would make the original rule TRUE and means
                         `ci_findings.reconcile`'s wording must change back

A canary that can only confirm is not a canary; one that always screams is not
one either.
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
    assert all(line.startswith("::warning ") for line in lines), lines


def test_emit_uses_warning_not_error() -> None:
    """A canary must never be able to fail a build on its own content.

    `::error` would put two red annotations on every green run. Whether GitHub
    KEEPS an annotation is orthogonal to its level -- `file=` is resolved the
    same way for both.
    """
    assert all("::warning " in line for line in emit_lines())
    assert not any("::error" in line for line in emit_lines())


def test_emit_names_one_resolvable_and_one_unresolvable_path() -> None:
    lines = emit_lines()
    assert any(f"file={GOOD_PATH}," in line for line in lines)
    assert any(f"file={BAD_PATH}," in line for line in lines)


def test_the_good_path_actually_exists_in_this_repo() -> None:
    """THE EXPERIMENT IS ONLY MEANINGFUL IF ITS CONTROL IS REAL.

    If GOOD_PATH is ever deleted or renamed, the control stops being a control
    and the canary reports a false outage on every run. This test is what stops
    a rename from turning the prover into a liar.
    """
    assert (REPO / GOOD_PATH).is_file(), (
        f"{GOOD_PATH} no longer exists; pick another tracked file for the canary"
    )


def test_the_bad_path_actually_does_not_exist() -> None:
    assert not (REPO / BAD_PATH).exists(), (
        f"{BAD_PATH} now exists, so it no longer probes an unresolvable path"
    )


# --- the verifying half, anchored on what GitHub was observed to do ----------


def test_both_present_is_the_observed_contract_and_passes() -> None:
    """WHAT GITHUB ACTUALLY DOES, as of run 32696164034: it keeps both.

    This is the case that used to fail. Recording it as PASS is the whole
    correction: the canary now tracks GitHub's real behaviour instead of the
    behaviour this repository assumed.
    """
    v = verify([ann(GOOD_PATH), ann(BAD_PATH)])
    assert v.ok, v.problems
    assert v.problems == []


def test_probe_discarded_means_github_changed_under_us() -> None:
    """IF THIS EVER FIRES, `ci_findings.reconcile` NEEDS ITS WORDING BACK.

    A probe that stops landing means GitHub began discarding unresolvable
    paths -- which would make the original rule true. That is a finding about
    the platform, not about the pull request under it, and the whole reason to
    keep paying for this check after it has been green for months.
    """
    v = verify([ann(GOOD_PATH)])
    assert not v.ok
    assert any(p.kind == "unresolvable-annotation-now-discarded" for p in v.problems)
    assert any("reconcile" in p.detail for p in v.problems)


def test_missing_control_is_a_failure_not_a_pass() -> None:
    """Zero annotations must never read as a healthy run.

    An empty list would satisfy any "the probe is absent" phrasing vacuously.
    Treating that as success is the vacuous-pass shape this repository keeps
    finding, and it would hide a total annotation outage behind a green check.
    """
    v = verify([])
    assert not v.ok
    assert any(p.kind == "no-annotation-landed-at-all" for p in v.problems)


def test_an_empty_run_reports_the_outage_not_a_platform_change() -> None:
    """Both symptoms are present when nothing lands; only one is the cause.

    Reporting "GitHub started discarding" on a run where the control is missing
    too would send a reader after a platform change when the real answer is that
    no annotation landed at all. The outage is the finding; the probe's absence
    is a consequence of it.
    """
    kinds = {p.kind for p in verify([]).problems}
    assert "no-annotation-landed-at-all" in kinds
    assert "unresolvable-annotation-now-discarded" not in kinds


def test_unrelated_annotations_do_not_disturb_the_verdict() -> None:
    """Real runs carry other annotations; the canary judges only its own two.

    GitHub's own Node-deprecation warning landed on `.github` line 2 in the same
    payload that produced this correction, so this is measured, not imagined.
    """
    noise = [
        ann(".github", 2),
        ann("frontend/src/canvas/layout/layout.ts", 42),
        ann(GOOD_PATH),
        ann(BAD_PATH),
    ]
    assert verify(noise).ok


def test_verdict_is_serialisable() -> None:
    import json

    json.loads(json.dumps(verify([]).as_dict()))
    assert isinstance(verify([ann(GOOD_PATH), ann(BAD_PATH)]), Verdict)
