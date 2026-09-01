#!/usr/bin/env python3
"""Refuse a diff that removes protection rather than fixing a defect.

WHY THIS EXISTS, AND WHY A PROMPT IS NOT ENOUGH.

The fixer job in `gate.yml` has write access: it reads a red check, changes
code, and pushes. That is useful and it is also the one shape that can undo
every other gate in this repository, because an agent optimising for "the check
went green" has two moves and the second one always works:

    repair the defect        -- hard, sometimes impossible in one pass
    delete what noticed it   -- trivial, and indistinguishable in a status list

Its instructions say not to. Instructions are a request; the diff is the fact.
So the diff is what gets read.

WHAT THIS IS NOT. It is not a linter and it does not judge quality. It answers
one question -- did this change reduce the repository's ability to notice a
defect -- and it answers it from the diff alone, so it works the same whether a
person or a model produced the change.

FAILS CLOSED, DELIBERATELY, AND THAT IS THE OPPOSITE OF THE LOCAL HOOKS.
`no-symptom-patch.py` fails OPEN because a PreToolUse hook that jams shut
cannot be escaped from inside the editor. This runs in CI, where a wrong
refusal costs one push and a wrong pass costs a silently weakened gate. The
asymmetry points the other way, so unparseable input is refused, not waved
through.
"""

from __future__ import annotations

import re
import sys

# --------------------------------------------------------------------------
# The shapes. Each is a way of making a failure stop being reported.
# --------------------------------------------------------------------------

# Silencing a checker. Every one of these tells a tool to look away, and each
# is here because it switches off a gate this repository actually runs:
# `istanbul ignore` drops a line from coverage instead of testing it, `Stryker
# disable` hides a surviving mutant, `nosemgrep` and `gitleaks:allow` do it for
# security findings.
SUPPRESSIONS = re.compile(
    r"@ts-ignore|@ts-nocheck|eslint-disable|#\s*noqa|#\s*type:\s*ignore"
    r"|istanbul\s+ignore|Stryker\s+disable|#\s*nosemgrep|gitleaks:allow"
    r"|#\s*pragma:\s*no\s*cover|@SuppressWarnings",
    re.IGNORECASE,
)

# Declaring a test and then not running it.
SKIP_MARKERS = re.compile(
    r"\b(?:it|test|describe|context)\.(?:skip|todo|failing)\s*\("
    r"|\bx(?:it|test|describe)\s*\("
    r"|@pytest\.mark\.(?:skip|xfail)"
    r"|\bunittest\.skip\b"
    r"|\.skip\s*\(\s*['\"]",
)

# Turning a CI step into a suggestion.
WORKFLOW_ESCAPES = re.compile(
    r"continue-on-error:\s*true"
    r"|\|\|\s*true\b"
    r"|\|\|\s*echo\b"
    r"|--exit-zero\b"
    r"|set\s+\+e\b",
)

# An assertion is only evidence if it names an expected VALUE. `toBeDefined`
# passes for the wrong value, so it is not counted here and swapping a real
# assertion for one is therefore a loss, which is the intent.
ASSERTION = re.compile(
    r"\bexpect\s*\(|\bassert\s|\bassert\(|\bassertEqual\b|\bassertRaises\b"
    r"|\.should\b|\bshould\.|\brequire\.\w+\(",
)

# THE INTENT ABOVE WAS DOCUMENTED AND NOT IMPLEMENTED, MEASURED 2026-09-01.
#
# `ASSERTION` matches `expect(` and stops there, so it counted a hollow
# assertion exactly like a real one. That left the cheapest weakening of all
# invisible to a count: leave the `expect(` where it is, swap the matcher for
# one that cannot fail on a wrong value, and `lost > gained` never fires.
# Measured before this existed:
#
#     expect(a).toBe(1)  ->  expect(a).toBeDefined()      exit 0, allowed
#
# These are the matchers that assert a value EXISTS rather than saying what it
# is. Each is subtracted from the count on its line, so a real assertion traded
# for one of them reads as the loss it is.
#
# DELIBERATELY SHORT. Every entry passes for an unbounded set of wrong values.
# `toEqual({ n: 1 })` and `toBeGreaterThan(3)` are NOT here and must not be:
# they name a value, they are ordinary rewrites, and `test_allows_an_assertion_
# being_rewritten_one_for_one` exists to keep them allowed. A guard that
# refuses honest rewrites is switched off within a day, which is the failure
# mode the whole module docstring is about.
NAMES_NO_VALUE = re.compile(
    r"\.(?:toBeDefined|toBeTruthy|toBeFalsy|toBeUndefined|toBeNull|toExist)\s*\(\s*\)"
    r"|\.(?:to\.exist|to\.be\.ok)\b"
    r"|\bassert\s+[A-Za-z_][\w.\[\]']*\s+is\s+not\s+None\s*$"
    r"|\bassert\s+[A-Za-z_][\w.\[\]']*\s*$"
    r"|\bassertIsNotNone\b",
)


def evidence_in(line: str) -> int:
    """Assertions on this line that name an expected value.

    An `expect(` whose matcher only proves existence is not evidence, so it is
    counted and then taken back off. The floor at zero matters: a line may
    carry more hollow matchers than `ASSERTION` found openings on it, and a
    negative would let one line pay for another's real assertion.
    """
    return max(0, len(ASSERTION.findall(line)) - len(NAMES_NO_VALUE.findall(line)))

TEST_PATH = re.compile(r"(?:^|/)(?:tests?|__tests__|e2e|spec)/|\.(?:test|spec)\.[jt]sx?$|(?:^|/)test_[^/]+\.py$|_test\.py$")
WORKFLOW_PATH = re.compile(r"^\.github/workflows/.*\.ya?ml$")
# Prose cannot switch a checker off, so a suppression-looking string in a
# markdown file is documentation ABOUT the shape, not the shape itself. Without
# this, this very repository's CLAUDE.md could not be edited.
PROSE_PATH = re.compile(r"\.(?:md|mdx|txt|rst)$")


class Finding:
    __slots__ = ("path", "rule", "detail")

    def __init__(self, path: str, rule: str, detail: str) -> None:
        self.path, self.rule, self.detail = path, rule, detail


def parse(diff: str) -> list[Finding]:
    findings: list[Finding] = []
    path = ""
    deleted_file = False
    added: list[str] = []
    removed: list[str] = []

    def close() -> None:
        """Judge the file just finished, then reset for the next one."""
        if not path:
            return

        if deleted_file and TEST_PATH.search(path):
            findings.append(
                Finding(path, "test-file-deleted", "the whole file is gone, so nothing it checked is checked")
            )

        if not PROSE_PATH.search(path):
            for line in added:
                if SUPPRESSIONS.search(line):
                    findings.append(Finding(path, "checker-silenced", line.strip()[:120]))
                if SKIP_MARKERS.search(line):
                    findings.append(Finding(path, "test-skipped", line.strip()[:120]))

        if WORKFLOW_PATH.search(path):
            for line in added:
                if WORKFLOW_ESCAPES.search(line):
                    findings.append(Finding(path, "gate-made-advisory", line.strip()[:120]))

        if TEST_PATH.search(path) and not deleted_file:
            gained = sum(evidence_in(line) for line in added)
            lost = sum(evidence_in(line) for line in removed)
            if lost > gained:
                findings.append(
                    Finding(path, "assertions-removed", f"{lost} removed, {gained} added -- a net loss of {lost - gained}")
                )

    for raw in diff.splitlines():
        if raw.startswith("diff --git "):
            close()
            path, deleted_file, added, removed = "", False, [], []
            m = re.match(r"diff --git a/(.+?) b/(.+)$", raw)
            if m:
                path = m.group(2)
        elif raw.startswith("deleted file mode"):
            deleted_file = True
        elif raw.startswith("+++ /dev/null"):
            deleted_file = True
        elif raw.startswith(("+++", "---", "@@", "index ", "new file mode", "similarity index", "rename ")):
            continue
        elif raw.startswith("+"):
            added.append(raw[1:])
        elif raw.startswith("-"):
            removed.append(raw[1:])

    close()
    return findings


def main() -> int:
    try:
        diff = sys.stdin.read()
    except Exception as exc:  # pragma: no cover - unreachable in practice
        print(f"no-weakening: could not read the diff ({exc}). Refusing.", file=sys.stderr)
        return 1

    findings = parse(diff)
    if not findings:
        return 0

    print("REFUSED: this change removes protection rather than fixing a defect.\n")
    for f in findings:
        print(f"  {f.path}")
        print(f"    {f.rule}: {f.detail}\n")
    print(
        "Two exits, and both are work: fix the defect the check found, or -- if the\n"
        "check itself is wrong -- say which mutant proves it and change it in a commit\n"
        "of its own, where a human reads it."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
