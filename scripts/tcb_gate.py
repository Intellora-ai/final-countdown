#!/usr/bin/env python3
"""TRUSTED COMPUTING BASE GATE — a change here has to be deliberate.

A pull request touching a trusted path must carry an explicit TCB: acknowledgement
in a commit message. This is an auditability gate, not an authorization system.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys

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
# Git refs accepted by this gate are deliberately conservative. This prevents
# an untrusted ref from being interpreted as an option or unexpected syntax.
SAFE_REF = re.compile(r"^[A-Za-z0-9._/-]+$")


def validate_ref(ref: str) -> str:
    if not SAFE_REF.fullmatch(ref) or ref.startswith("-") or ".." in ref:
        raise SystemExit("invalid git ref")
    return ref


def git(*args: str) -> tuple[int, str]:
    """Run git without a shell; argv is constructed only from fixed commands and
    a validated ref. No repository data is interpolated into a shell command."""
    exe = shutil.which("git")
    if exe is None:
        raise SystemExit("git is not on PATH")
    # No `# nosec`. scripts/security_gate.py clears B603 for this file by
    # re-deriving the safe pattern from this AST every run; suppressing the
    # finding here would delete it before that check runs, turning a verified
    # exemption into an asserted one.
    out = subprocess.run(
        [exe, *args],
        capture_output=True,
        text=True,
        timeout=60,
        stdin=subprocess.DEVNULL,
        shell=False,
    )
    return out.returncode, out.stdout


def merge_base(base: str) -> str | None:
    base = validate_ref(base)
    code, out = git("merge-base", "HEAD", "--", base)
    return out.strip() if code == 0 and out.strip() else None


def changed_files(since: str) -> list[str]:
    code, out = git("diff", "--name-only", f"{since}...HEAD")
    if code != 0:
        return []
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def touches_tcb(paths: list[str]) -> list[str]:
    return sorted(
        p for p in paths if any(p == t or p.startswith(t) for t in TRUSTED_PREFIXES)
    )


def acknowledgements(since: str) -> list[str]:
    """Every `TCB:` line in commit messages on this branch."""
    code, out = git("log", "--format=%B", f"{since}..HEAD")
    if code != 0:
        return []
    return [
        ln.strip()
        for ln in out.splitlines()
        if ln.strip().startswith(TRAILER) and len(ln.strip()) > len(TRAILER) + 4
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--base", default="origin/main", help="branch this change will merge into"
    )
    ns = ap.parse_args()

    try:
        base_ref = validate_ref(ns.base)
    except SystemExit:
        print("CANNOT COMPARE: invalid base ref", file=sys.stderr)
        return 2

    base = merge_base(base_ref)
    if base is None:
        print(
            "CANNOT COMPARE: no merge base with the configured base ref. "
            "A shallow clone needs fetch-depth: 0.",
            file=sys.stderr,
        )
        return 2

    files = changed_files(base)
    tcb_files = touches_tcb(files)

    print(f"[TCB GATE]\nbase commit={base[:12]}")
    print(f"files changed: {len(files)}   trusted-path files: {len(tcb_files)}")

    if not tcb_files:
        print("\nno trusted path touched — nothing to acknowledge")
        return 0

    for changed_file in tcb_files:
        print(f"  TCB  {changed_file}")

    acks = acknowledgements(base)
    if acks:
        print(f"\nacknowledged in {len(acks)} commit message(s)")
        return 0

    print(
        f"""
FAIL — this change edits the trusted computing base and no commit says why.

{len(tcb_files)} trusted-path file(s) changed. These decide what "verified"
means: the gates, workflows, formal corpus and dependency surface.

Add a line to a commit message on this branch:

    {TRAILER} <what changed in the trusted base, and why>

A trailer is required rather than a PR-description checkbox because the PR
body can be edited after the checks pass; a commit message changes the commit
SHA and therefore causes the checks to run again.""",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
