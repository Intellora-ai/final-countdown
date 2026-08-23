#!/usr/bin/env python3
"""PR READY — is this pull request actually green, measured against the declared required set.

WHY THIS EXISTS
---------------
On 2026-08-23 two merges went in on a false green, three hours apart, by the same
mechanism: `gh pr checks` was read as the answer to "is it safe to merge".

It is not that answer, and the gap is not obvious. `gh pr checks` reports the
check-runs that EXIST on the head SHA. It cannot report a required context that
produced no check-run at all -- a workflow that was skipped by a path filter, or
cancelled before it registered, simply is not in the list. So a PR can print
`0 failing, 0 pending` while a required context has never run. Absence reads as
success.

That is what happened. `cancel-in-progress: true` plus two sessions merging into
one branch killed three consecutive runs of a 15-minute job, and each time the
PR went back to looking settled within seconds.

`scripts/local_gates.py` answers "run what CI runs, here, before pushing".
This answers the other half: "did the seventeen required contexts actually
conclude successfully on the commit that is about to merge".

THE RULE IT ENFORCES
--------------------
A required context is green only if a check-run for it exists on THIS head SHA
and concluded `success`. Everything else blocks, and each blocking state is
reported as itself rather than collapsed into "not green":

    MISSING     no check-run at all -- the case `gh pr checks` cannot show
    CANCELLED   terminal and useless; a superseded run proves nothing
    FAILED      concluded, negatively
    RUNNING     not terminal yet; an answer that does not exist yet

MISSING and CANCELLED are the two that look like success from a distance, so
they are named first in the output.

WHY IT READS ci/gates.toml
--------------------------
The seventeen contexts are declared there, and `scripts/check_ruleset.py` already
proves that manifest equals GitHub's live required set. Reading the same file
means this tool cannot drift from the ruleset without check_ruleset failing
first. Hard-coding the list here would create a third copy of a fact that already
has two, which is the defect this repository has spent the day removing.

USAGE
-----
    python3 scripts/pr_ready.py 47
    python3 scripts/pr_ready.py 47 --repo owner/name
    python3 scripts/pr_ready.py --sha <40-hex>

Exit 0 only when every required context is PASS. Any other state exits 1, so it
can be used as a gate rather than as a report somebody reads and interprets.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_DEFAULT = "Intellora-ai/final-countdown"
MANIFEST = Path(__file__).resolve().parents[1] / "ci" / "gates.toml"

#: `required_checks = [ "a", "b", ... ]` in ci/gates.toml.
#:
#: Parsed rather than imported because the manifest is TOML and Python 3.10 has
#: no tomllib. A regex over a known-shape literal is honest here and fails loudly
#: if the shape changes -- see `_required`, which refuses an implausible result
#: rather than proceeding with a short list.
_ARRAY = re.compile(r"required_checks\s*=\s*\[(.*?)\]", re.S)
_ITEM = re.compile(r'"([^"]+)"')

#: Terminal states that are NOT success. Separated from "still running" because
#: the caller's next move differs: wait, versus do something.
_DEAD = {"cancelled", "failure", "timed_out", "action_required", "stale", "skipped"}


def _run(argv: list[str]) -> str:
    exe = shutil.which(argv[0])
    if exe is None:
        raise SystemExit(f"{argv[0]} is not on PATH; this tool needs the GitHub CLI")
    proc = subprocess.run([exe, *argv[1:]], capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise SystemExit(f"{' '.join(argv)} failed: {proc.stderr.strip()[:400]}")
    return proc.stdout


def _required() -> list[str]:
    """The declared required contexts, or a loud failure.

    A short or empty list would make every PR look green, which is the exact
    failure this tool exists to prevent -- so an implausible parse is treated as
    a bug in the parser rather than as a repository with few gates.
    """
    match = _ARRAY.search(MANIFEST.read_text(encoding="utf-8"))
    if match is None:
        raise SystemExit(f"no required_checks array found in {MANIFEST}")
    names = _ITEM.findall(match.group(1))
    if len(names) < 5:
        raise SystemExit(
            f"parsed only {len(names)} required contexts from {MANIFEST}; the "
            f"manifest's shape has changed and this parser is now reading a "
            f"fraction of it. A partial required-set that passes is worse than none."
        )
    return names


def _head_sha(repo: str, pr: int) -> str:
    return json.loads(_run(["gh", "pr", "view", str(pr), "--repo", repo, "--json", "headRefOid"]))[
        "headRefOid"
    ]


def _check_runs(repo: str, sha: str) -> dict[str, str]:
    """context -> state, for every check-run on this SHA.

    `--paginate` because a repository with seventeen required contexts plus
    advisory jobs exceeds one page, and a truncated page would drop contexts into
    MISSING -- which blocks, so the failure mode is safe, but it would report the
    wrong reason.
    """
    raw = _run(
        [
            "gh",
            "api",
            "--paginate",
            f"repos/{repo}/commits/{sha}/check-runs?per_page=100",
            "-q",
            ".check_runs[] | \"\\(.name)|\\(.status)|\\(.conclusion // \"-\")\"",
        ]
    )
    out: dict[str, str] = {}
    for line in raw.splitlines():
        parts = line.split("|")
        if len(parts) != 3:
            continue
        name, status, conclusion = parts
        state = conclusion if status == "completed" else status
        # Keep the best state seen for a name. A re-run that succeeded after a
        # cancelled attempt is green, and reporting the cancelled one would block
        # a PR that is genuinely ready.
        if out.get(name) != "success":
            out[name] = state
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pr", nargs="?", type=int, help="pull request number")
    ap.add_argument("--repo", default=REPO_DEFAULT)
    ap.add_argument("--sha", help="check a commit directly instead of a PR")
    args = ap.parse_args()

    if not args.sha and args.pr is None:
        ap.error("give a PR number or --sha")

    sha = args.sha or _head_sha(args.repo, args.pr)
    required = _required()
    seen = _check_runs(args.repo, sha)

    buckets: dict[str, list[str]] = {"MISSING": [], "CANCELLED": [], "FAILED": [], "RUNNING": [], "PASS": []}
    for context in required:
        state = seen.get(context)
        if state is None:
            buckets["MISSING"].append(context)
        elif state == "success":
            buckets["PASS"].append(context)
        elif state == "cancelled":
            buckets["CANCELLED"].append(context)
        elif state in _DEAD:
            buckets["FAILED"].append(f"{context} ({state})")
        else:
            buckets["RUNNING"].append(f"{context} ({state})")

    target = f"PR #{args.pr}" if args.pr else "commit"
    print(f"{target} @ {sha[:7]} — {len(buckets['PASS'])}/{len(required)} required contexts green")

    # MISSING and CANCELLED first: they are the two that look like success from a
    # distance, and burying them under a longer list is how they got missed.
    for label in ("MISSING", "CANCELLED", "FAILED", "RUNNING"):
        for name in buckets[label]:
            print(f"  {label:<9} {name}")

    if buckets["MISSING"]:
        print(
            "\n  MISSING means no check-run exists for that context on this SHA. "
            "`gh pr checks` cannot show this — absence reads as success there."
        )
    if buckets["CANCELLED"]:
        print(
            "\n  CANCELLED is terminal and proves nothing. A superseded run is not "
            "a run that passed."
        )

    blocked = sum(len(buckets[k]) for k in ("MISSING", "CANCELLED", "FAILED", "RUNNING"))
    print("\nREADY" if blocked == 0 else f"\nNOT READY — {blocked} context(s) not green")
    return 0 if blocked == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
