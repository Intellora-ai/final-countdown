#!/usr/bin/env python3
"""ANNOTATION CANARY — let GitHub falsify us.

WHAT THIS IS FOR.

`ci_findings.reconcile` treats an annotation whose `path` is not in the tree as
a message GitHub silently discarded, and `gh-annotate.mjs` was changed so it
stops emitting `node_modules` paths for exactly that reason. Both rest on one
claim about a system neither this repository nor its authors control:

    GitHub resolves `file=` against the annotated commit and DISCARDS what it
    cannot find, without reporting the loss.

That claim was inferred from a `node_modules` path not appearing on a run. It
was never tested. Nothing in `.github/`, `scripts/` or `frontend/scripts/` reads
GitHub's annotations API at all -- the only use of `check-runs` in the workflows
polls job status. So the verification layer here commits the error it exists to
catch: it checks its own decision rather than its own effect.

HOW THE CANARY DIFFERS FROM EVERY OTHER GATE IN THIS REPO.

Every other gate compares this repository against assertions this repository
wrote. This one uses an ORACLE WE DO NOT CONTROL. One job emits two annotations
-- one path that exists at this commit, one that cannot -- and a second job
reads back what GitHub ACCEPTED. Two ways it fails, and both are findings:

  the bad one was KEPT    -> the discard rule is FALSE. `reconcile`'s
                             `annotation-path-not-in-tree` finding is wrong, and
                             the gh-annotate node_modules fix addressed nothing.
  the good one VANISHED   -> annotations are not landing at all, which is a
                             larger outage than the bug this was built for.

A canary that can only confirm is not a canary. This one can end the work that
created it, which is the point.

WHY WARNING AND NOT ERROR. The level does not change how GitHub resolves
`file=`, and `::error` would paint two red annotations on every green run.

NO SUBPROCESS, for the same reason as `ci_findings.py`: `security_gate.py`
keeps a bandit allowlist keyed by (rule, path), and a subprocess import here
would need an entry in a file this lane does not own. The workflow runs
`gh api` and this module reads the JSON.

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
            "This path exists at this commit. If GitHub kept it, annotations land."
        ),
        (
            f"::warning file={BAD_PATH},line=1,"
            "title=annotation canary (probe)::"
            "This path does not exist at this commit. If GitHub kept it, the "
            "discard rule that ci_findings.reconcile depends on is false."
        ),
    ]


def verify(annotations: list[dict[str, Any]]) -> Verdict:
    """Judge what GitHub accepted against what was emitted.

    Both directions are checked and both are reported, because a run can be
    broken in both at once and reporting one would hide the other.
    """
    paths = {str(a.get("path") or "") for a in annotations}
    problems: list[Problem] = []

    if BAD_PATH in paths:
        problems.append(
            Problem(
                kind="unresolvable-annotation-was-kept",
                detail=(
                    f"GitHub kept an annotation on {BAD_PATH!r}, which does not "
                    "exist at this commit. The discard rule is false, so "
                    "ci_findings.reconcile reporting "
                    "'annotation-path-not-in-tree' as a lost message is wrong, "
                    "and the gh-annotate node_modules fix addressed a "
                    "non-problem. Re-derive both before trusting either."
                ),
            )
        )

    if GOOD_PATH not in paths:
        # NOT a pass-by-default. An empty list satisfies "the bad one is absent"
        # vacuously, and treating that as success would hide a total annotation
        # outage behind a green check.
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
            "annotation-canary: PASS — GitHub kept the resolvable annotation and "
            "discarded the unresolvable one, so the rule ci_findings.reconcile "
            "depends on held on this run."
        )
        return 0
    for p in verdict.problems:
        print(f"::error title=annotation canary: {p.kind}::{p.detail}")
    print(f"\nannotation-canary: FAIL — {len(verdict.problems)} problem(s).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
