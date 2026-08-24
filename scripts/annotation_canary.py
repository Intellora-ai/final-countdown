#!/usr/bin/env python3
"""ANNOTATION CANARY — the one check here whose oracle is not this repository.

WHAT IT WAS BUILT FOR, AND WHAT IT IMMEDIATELY DISPROVED.

`ci_findings.reconcile` and the `gh-annotate.mjs` node_modules fix were both
built on a claim about a system nobody here controls:

    GitHub resolves `file=` against the annotated commit and DISCARDS what it
    cannot find, without reporting the loss.

That was inferred from a `node_modules` path not appearing on a run, never
tested, and untestable by anything then in the repository -- no code in
`.github/`, `scripts/` or `frontend/scripts/` read GitHub's annotations API.

This canary made GitHub the judge, and on its first run GitHub said no:

    run 32696164034, job "canary verify"
    GitHub kept an annotation on 'scripts/__annotation_canary_no_such_file__.py'

The rule is FALSE. The API retains unresolvable annotations.

WHAT SURVIVED THE CORRECTION. The damage is real even though the discard is not,
and that was measured rather than argued -- at the same SHA:

    contents/scripts/__annotation_canary_no_such_file__.py  -> 404 Not Found
    contents/scripts/annotation_canary.py                   -> 200, 8097 bytes

The annotation is reachable in the API and unreachable everywhere a human looks:
its `blob_href` 404s, and GitHub renders annotations inline only on files that
are in the diff. So `reconcile` still refuses such an annotation; it just no
longer claims the platform ate it.

HOW THIS CHECK IS ANCHORED NOW. Written against the false rule, it failed on
every run -- permanently red, which is a check people learn to scroll past and
the same "absence looks like health" failure this repository keeps closing,
reached from the opposite side. The baseline is therefore what GitHub was
OBSERVED to do, and it fires when that moves in EITHER direction:

    control missing   annotations are not landing at all
    probe missing     GitHub began discarding, the old rule became true, and
                      `ci_findings.reconcile` must be re-derived

A canary that can only confirm is not a canary. One that always screams is not
one either.

`::warning`, not `::error`: the level does not change how GitHub resolves
`file=`, and errors would paint two red annotations on every green run.

NO SUBPROCESS, for the same reason as `ci_findings.py`: `security_gate.py`'s
bandit allowlist is keyed by (rule, path) and lives in another lane's file. The
workflow runs `gh api`; this module reads the JSON.

USAGE

  # job 1 -- emit, and never fail on its own content
  python3 scripts/annotation_canary.py emit

  # job 2, after job 1's check-run has completed
  gh api repos/$REPO/check-runs/$CHECK_ID/annotations > ann.json
  python3 scripts/annotation_canary.py verify --annotations ann.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

#: A tracked file that exists at every commit this runs on. The control.
#: `tests/test_annotation_canary.py::test_the_good_path_actually_exists_in_this_repo`
#: fails the build if a rename ever makes this unresolvable -- without that, a
#: rename would make BOTH annotations vanish and the canary would report a total
#: outage on every run, burying the signal it exists to raise.
GOOD_PATH = "scripts/annotation_canary.py"

#: A path that cannot resolve. Deliberately inside a directory that exists so
#: the test is "GitHub could not find this FILE", not "this whole tree is
#: unknown to the checkout".
BAD_PATH = "scripts/__annotation_canary_no_such_file__.py"


@dataclass(frozen=True)
class Problem:
    kind: str
    detail: str

    def as_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "detail": self.detail}


@dataclass(frozen=True)
class Verdict:
    ok: bool
    # No default: a Verdict is always built from a judged list, and a default
    # empty one would let a construction site forget the problems and read as
    # a pass -- the vacuous-success shape this whole canary exists to refuse.
    problems: list[Problem]

    def as_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "problems": [p.as_dict() for p in self.problems]}


def emit_lines() -> list[str]:
    """The two workflow commands, as strings, so they can be asserted on.

    Returned rather than printed because a function that only writes to stdout
    cannot be tested for what it wrote without capturing streams, and the shape
    of these two lines is the entire experiment.
    """
    return [
        (
            f"::warning file={GOOD_PATH},line=1,"
            "title=annotation canary (control)::"
            "This path exists at this commit. If GitHub stops keeping it, annotations are not landing at all."
        ),
        (
            f"::warning file={BAD_PATH},line=1,"
            "title=annotation canary (probe)::"
            "This path does not exist at this commit. GitHub was observed to KEEP "
            "this on run 32696164034; if it stops, the platform changed and "
            "ci_findings.reconcile needs re-deriving."
        ),
    ]


def verify(annotations: list[dict[str, Any]]) -> Verdict:
    """Judge what GitHub accepted against the contract it was OBSERVED to keep.

    THIS FUNCTION USED TO ENCODE A RULE THAT TURNED OUT TO BE FALSE.

    It was written to fail when the probe LANDED, because `ci_findings.reconcile`
    assumed GitHub discards annotations whose `file=` does not resolve. On the
    canary's first run (32696164034) GitHub kept the probe, so that assertion
    fired on correct, ordinary behaviour -- every run, forever.

    A permanently-red check is not a strict check. It is one people learn to
    scroll past, which is the same "absence looks like health" failure this
    repository keeps closing, reached from the opposite side: a signal so
    constant it carries no information.

    So the baseline is now what GitHub actually does -- keep both -- and the
    check fires when that MOVES, in either direction:

      control missing   annotations are not landing at all. Every
                        location-based finding on this run is suspect.
      probe missing     GitHub began discarding unresolvable paths. That would
                        make the original rule true and means the wording in
                        `ci_findings.reconcile` has to change back.

    The two are reported exclusively, not together. When nothing lands at all
    the probe is absent as a CONSEQUENCE of the outage, and reporting a platform
    change alongside it would send a reader after the wrong cause.
    """
    paths = {str(a.get("path") or "") for a in annotations}
    problems: list[Problem] = []

    if GOOD_PATH not in paths:
        # NOT a pass-by-default. An empty list would satisfy any "the probe is
        # absent" phrasing vacuously, and treating that as success would hide a
        # total annotation outage behind a green check.
        problems.append(
            Problem(
                kind="no-annotation-landed-at-all",
                detail=(
                    f"GitHub did not keep the control annotation on {GOOD_PATH!r}, "
                    "which does exist at this commit. Either annotations are not "
                    "landing on this run at all, or the check-run queried was the "
                    "wrong one. Every location-based finding on this run is "
                    "suspect until this is explained."
                ),
            )
        )
    elif BAD_PATH not in paths:
        problems.append(
            Problem(
                kind="unresolvable-annotation-now-discarded",
                detail=(
                    f"GitHub did NOT keep the probe on {BAD_PATH!r}, but it did on "
                    "run 32696164034. The platform's behaviour has changed: it now "
                    "discards annotations whose path does not resolve. That makes "
                    "the original discard rule true, so ci_findings.reconcile's "
                    "'annotation-path-not-in-tree' finding should go back to "
                    "describing a lost message rather than an unreachable one. "
                    "Re-derive it before trusting either wording."
                ),
            )
        )

    return Verdict(ok=not problems, problems=problems)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Let GitHub falsify the discard rule.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("emit", help="print the two canary annotations")
    ve = sub.add_parser("verify", help="judge what GitHub accepted")
    ve.add_argument("--annotations", type=Path, required=True)
    args = ap.parse_args(argv)

    if args.cmd == "emit":
        for line in emit_lines():
            print(line)
        # Never non-zero: this job's only purpose is to put two annotations on a
        # check-run, and failing here would make a green build red on content
        # that proves nothing by itself.
        return 0

    raw: Any = json.loads(args.annotations.read_text(encoding="utf-8"))
    annotations: list[dict[str, Any]] = (
        cast("list[dict[str, Any]]", raw) if isinstance(raw, list) else []
    )
    verdict = verify(annotations)
    print(json.dumps(verdict.as_dict(), indent=2))
    if verdict.ok:
        print(
            "annotation-canary: PASS — GitHub kept both annotations, which is the "
            "behaviour observed on run 32696164034. It does not discard "
            "unresolvable paths; ci_findings.reconcile is worded accordingly."
        )
        return 0
    for p in verdict.problems:
        print(f"::error title=annotation canary: {p.kind}::{p.detail}")
    print(f"\nannotation-canary: FAIL — {len(verdict.problems)} problem(s).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
