#!/usr/bin/env python3
"""TRUSTED COMPUTING BASE GATE — a change here has to be deliberate.

THE PROBLEM CODEOWNERS DOES NOT SOLVE HERE.

`.github/CODEOWNERS` names the paths that decide what "verified" means. It
enforces nothing unless the ruleset sets `require_code_owner_review: true`,
and turning that on makes this repository unmergeable: GitHub does not let an
author approve their own pull request, and this repository has one person. The
choice as posed is between advisory protection and a deadlock.

So this takes the third option. Review is not the only mechanism that can make
a change deliberate — a required status check can too, and unlike a review the
owner can satisfy it themselves without it becoming a rubber stamp.

WHAT IT REQUIRES

A pull request touching any trusted path must carry an explicit acknowledgement
in a commit message on the branch:

    TCB: <reason>

Not a checkbox in a PR description, which is editable after the checks pass.
A commit trailer is part of the object the checks ran against — amending it
changes the SHA and re-runs everything.

WHAT THAT BUYS, AND WHAT IT DOES NOT

It cannot stop a determined owner from writing the trailer, and it is not meant
to. It removes the ACCIDENTAL case: an unrelated refactor that quietly widens
an exception, a dependency bump that drags in a new verifier, a workflow edit
made while fixing something else. Those merge today with one click and no
record. After this they cannot merge without someone naming the trusted change
and why — and that sentence lands in the permanent history next to the diff.

Anyone auditing later can list every TCB change with `git log --grep '^TCB:'`.
That is the property CODEOWNERS was reached for, obtained without the deadlock.

    python3 scripts/tcb_gate.py                 # compare against origin/main
    python3 scripts/tcb_gate.py --base <ref>
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys

# The paths that decide what counts as verified. Deliberately the same set as
# .github/CODEOWNERS: two lists that are supposed to agree are two lists that
# drift, so a test asserts they still match.
TRUSTED_PREFIXES = (
    ".github/",
    "scripts/",
    "ci/",
    "specs/",
    "proofs/",
    "semantics/",
    "requirements.txt",
    "requirements.lock",
    "requirements-preflight.lock",
)

TRAILER = "TCB:"


def git(*args: str) -> tuple[int, str]:
    """Run git with an absolute path. Returns (exit code, stdout)."""
    exe = shutil.which("git")
    if exe is None:
        raise SystemExit("git is not on PATH")
    out = subprocess.run([exe, *args], capture_output=True, text=True,
                         timeout=60)
    return out.returncode, out.stdout


def merge_base(base: str) -> str | None:
    code, out = git("merge-base", "HEAD", base)
    return out.strip() if code == 0 and out.strip() else None


def changed_files(since: str) -> list[str]:
    code, out = git("diff", "--name-only", f"{since}...HEAD")
    if code != 0:
        return []
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def touches_tcb(paths: list[str]) -> list[str]:
    return sorted(p for p in paths
                  if any(p == t or p.startswith(t) for t in TRUSTED_PREFIXES))


def acknowledgements(since: str) -> list[str]:
    """Every `TCB:` line in commit messages on this branch."""
    code, out = git("log", "--format=%B", f"{since}..HEAD")
    if code != 0:
        return []
    return [ln.strip() for ln in out.splitlines()
            if ln.strip().startswith(TRAILER) and len(ln.strip()) > len(TRAILER) + 4]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="origin/main",
                    help="branch this change will merge into")
    ns = ap.parse_args()

    base = merge_base(ns.base)
    if base is None:
        # Cannot tell what changed. That is not permission to proceed: on a
        # PR the base is always reachable, so this means the checkout is
        # shallow or the ref is wrong, and either way the gate did not run.
        print(f"CANNOT COMPARE: no merge base with {ns.base!r}. "
              "A shallow clone needs fetch-depth: 0.", file=sys.stderr)
        return 2

    files = changed_files(base)
    trusted = touches_tcb(files)

    print(f"[TCB GATE]\nbase={ns.base} ({base[:12]})")
    print(f"files changed: {len(files)}   trusted-path files: {len(trusted)}")

    if not trusted:
        print("\nno trusted path touched — nothing to acknowledge")
        return 0

    for path in trusted:
        print(f"  TCB  {path}")

    acks = acknowledgements(base)
    if acks:
        print(f"\nacknowledged in {len(acks)} commit message(s):")
        for a in acks:
            print(f"  {a}")
        return 0

    print(f"""
FAIL — this change edits the trusted computing base and no commit says why.

{len(trusted)} trusted-path file(s) changed. These decide what "verified"
means: the gates, the manifest, the workflows, the formal corpus and the
dependency surface. Weakening any of them makes every other check green for
the wrong reason, which is a silent failure rather than a loud one.

Add a line to a commit message on this branch:

    {TRAILER} <what changed in the trusted base, and why>

    git commit --amend        # to the commit that did it
    git commit --allow-empty -m "{TRAILER} <reason>"    # or a separate record

A trailer is required rather than a PR-description checkbox because the PR
body can be edited after the checks pass; a commit message cannot be edited
without changing the SHA and re-running them.""", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
