"""CODEOWNERS must parse as CODEOWNERS.

WHY THIS FILE EXISTS.

`.github/CODEOWNERS` names the paths that decide what "verified" means, and
until now nothing read it. It could have been empty, or truncated, or valid
YAML, and every gate in this repository would still have gone green -- the file
is consumed by GitHub, and GitHub reports a parse error in a settings page
nobody opens during a pull request.

It was not hypothetical. A comment line lost its leading `#`:

    # requirements.txt / requirements.lock
    requirements-preflight.lock are here because a verifier is only as
    # trustworthy as the tool it shells out to.

The middle line is not prose to GitHub. It is a rule: pattern
`requirements-preflight.lock`, owners `are`, `here`, `because`, `a`,
`verifier`, `is`, `only`, `as`. None of those is a valid owner, so the rule is
an error and the path it names is unowned. CI was entirely green.

That is the failure this repository is built to refuse: a change that turns
nothing red and quietly means less than it did. So the file gets a parser.

WHAT IS AND IS NOT CLAIMED HERE. This checks the file's SYNTAX and its
AGREEMENT with the trusted computing base. It cannot check enforcement -- the
ruleset sets `require_code_owner_review: false`, which makes every rule
advisory, and that is an owner action against the live ruleset, not a fact
about this file. `scripts/tcb_gate.py` is what actually blocks a trusted-path
change today.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
CODEOWNERS = REPO / ".github" / "CODEOWNERS"

sys.path.insert(0, str(REPO / "scripts"))
from tcb_gate import TRUSTED_PREFIXES  # noqa: E402

# GitHub accepts three owner forms and nothing else: @user, @org/team, and an
# email address. Anything else on a rule line is a syntax error on GitHub's
# side, which is precisely the failure that produced this file.
_OWNER = re.compile(r"^(@[A-Za-z0-9][A-Za-z0-9-]*(/[A-Za-z0-9._-]+)?"
                    r"|[^@\s]+@[^@\s]+\.[^@\s]+)$")


def rule_lines(text: str) -> list[tuple[int, str]]:
    """Every line GitHub reads as a rule: not blank, not a comment.

    Numbered from 1 so a failure names the line you open in an editor.
    """
    out = []
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        out.append((number, stripped))
    return out


def owners_are_valid(rule: str) -> tuple[bool, str]:
    """Does this rule line name a pattern and at least one real owner?"""
    fields = rule.split()
    if len(fields) < 2:
        return False, "a pattern with no owner is not a rule"
    bad = [f for f in fields[1:] if not _OWNER.match(f)]
    if bad:
        return False, f"not owner syntax: {' '.join(bad)}"
    return True, "ok"


def test_every_rule_line_is_wellformed() -> None:
    """The check that would have caught the malformed line."""
    broken = []
    for number, rule in rule_lines(CODEOWNERS.read_text(encoding="utf-8")):
        ok, why = owners_are_valid(rule)
        if not ok:
            broken.append(f"  .github/CODEOWNERS:{number}  {why}\n    {rule}")
    assert not broken, (
        "CODEOWNERS lines GitHub cannot parse:\n" + "\n".join(broken))


# A parser that accepts everything proves nothing, so these are the shapes it
# must reject -- the first is the exact line that shipped.
@pytest.mark.parametrize("malformed", [
    "requirements-preflight.lock are here because a verifier is only as",
    "/scripts/",                          # pattern, no owner
    "/scripts/ Intellora-ai",             # owner missing its @
    "/scripts/ @Intellora-ai extra-word",  # one good owner, one not
])
def test_the_shapes_that_must_be_rejected(malformed: str) -> None:
    ok, _ = owners_are_valid(malformed)
    assert not ok, f"parser accepted an invalid rule: {malformed!r}"


@pytest.mark.parametrize("wellformed", [
    "*                       @Intellora-ai",
    "/.github/               @Intellora-ai",
    "requirements.lock       @Intellora-ai",
    "/ci/  @Intellora-ai @some-org/reviewers",
    "/ci/  owner@example.com",
])
def test_the_shapes_that_must_be_accepted(wellformed: str) -> None:
    """And it must not buy strictness by rejecting valid files."""
    ok, why = owners_are_valid(wellformed)
    assert ok, f"parser rejected a valid rule: {wellformed!r} ({why})"


def test_codeowners_covers_the_trusted_computing_base() -> None:
    """The two lists that name the root of trust must not drift apart.

    `scripts/tcb_gate.py` blocks an undeclared change to TRUSTED_PREFIXES;
    CODEOWNERS requests review on the same paths. They are separate mechanisms
    with separate failure modes, but they are supposed to describe the SAME
    set. A path in one and not the other is a hole nobody notices, because each
    mechanism keeps reporting success about the paths it does know.

    This is how `requirements-preflight.lock` came to be discussed in a comment
    and owned by no rule.
    """
    patterns = {rule.split()[0]
                for _, rule in rule_lines(CODEOWNERS.read_text(encoding="utf-8"))}
    # CODEOWNERS directory patterns are written with a leading slash; the TCB
    # prefixes are repository-relative. Compare on the same footing.
    normalised = {p.lstrip("/").rstrip("/") for p in patterns}
    missing = [prefix for prefix in TRUSTED_PREFIXES
               if prefix.rstrip("/") not in normalised]
    assert not missing, (
        "in tcb_gate.TRUSTED_PREFIXES but owned by nothing in CODEOWNERS: "
        + ", ".join(missing))
