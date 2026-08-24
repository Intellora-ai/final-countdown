#!/usr/bin/env python3
"""
PreToolUse gate on Edit|Write. Two refusals, one rule behind both.

THE RULE THIS SERVES (the user's words, kept verbatim so it cannot drift):

    DEFINE REQUIREMENTS + WHAT MUST BE TRUE TO GET DESIRED OUTCOME THEN BUILD
    AROUND THAT, DO NOT MAKE TESTS WEAK, EASY. BUILD TESTS THAT FULFILL DESIRED
    OUTCOME, ONLY THEN WRITE CODE. CODE WRITTEN SHOULD BE CHANGED AND BETTER
    BUT TESTS ONLY CHANGE IF MUTANTS SHOW A REAL EVIDENCE ERROR

WHY TWO CHECKS AND NOT ONE
--------------------------
The two halves of that rule hold each other up. "Code should be changed and
better" is only safe advice while the tests underneath it are not allowed to
soften; the moment a test can be relaxed to accommodate a rewrite, "better"
stops meaning anything measurable. So:

  CHECK A --- production code that hides a failure instead of fixing it.
  CHECK B --- a test edited in the direction of proving less.

WHAT THIS GATE CANNOT DO, STATED PLAINLY
----------------------------------------
It cannot read intent. It cannot tell a root-cause fix from a lucky one, and it
cannot verify that a test weakening really was justified by a surviving mutant.
It reads text. What it CAN do is make the cover-up shapes expensive and loud,
which is most of the distance, because hiding a bug has a small and stable
vocabulary while fixing one does not.

FALSE POSITIVES ARE THE REAL FAILURE MODE
-----------------------------------------
A gate that fires on innocent edits gets uninstalled, and an uninstalled gate
enforces nothing at all. So CHECK A is scoped to source files and skips prose
and test fixtures, CHECK B is scoped to test files, and both are deliberately
narrow. Widening them without adding a passing false-positive test first is how
this ends up switched off.

FAILS OPEN, ALWAYS
------------------
Every path is wrapped and returns 0 on any unexpected failure. A PreToolUse hook
that jams shut cannot be escaped from inside the tool --- recovering means
opening settings.json in a different editor. A gate that bites the user is worse
than one that misses a violation. Same reasoning as enforce_skills.py.
"""

from __future__ import annotations

import json
import re
from typing import cast
import sys

ALLOW = 0
BLOCK = 2

# Extensions CHECK A inspects. Prose is excluded on purpose: a document that
# says "never write eslint-disable" is not an eslint-disable, and a gate that
# cannot tell those apart makes its own rulebook uneditable.
CODE_SUFFIXES = (
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".java",
    ".rb", ".c", ".h", ".cc", ".cpp", ".cs", ".swift", ".kt", ".kts", ".sh",
    ".bash", ".zsh", ".php", ".scala", ".m", ".mm",
)

# Paths are normalised to a LEADING slash before matching, so a directory
# marker written as "/tests/" also catches a repo-relative "tests/foo.ts". A
# marker list without that normalisation misses every path that starts with the
# directory, which in practice is most of them --- this was a real hole: it let
# `tests/e2e/login.ts` be softened freely while `src/a.test.ts` was guarded.
TEST_MARKERS = (
    ".test.", ".spec.", ".cy.", ".e2e.", "_test.", "_spec.", "/test_", "/spec_",
    "/tests/", "/test/", "/spec/", "/specs/", "/e2e/", "/cypress/", "/__tests__/",
    "/playwright/", "/integration/",
)

# Browser suites hide softening better than unit suites do. A unit test that
# stops proving things usually looks wrong on the page; an end-to-end test that
# stops proving things looks IDENTICAL to a passing one --- it just waits
# longer, checks that a box exists instead of what it says, or quietly stops
# running. Everything below exists because probing found the gate allowing it.

# An arbitrary sleep is the classic flaky-test cover-up: the race is untouched,
# the test just loses more slowly, and it comes back on a busier CI machine.
# `waitForSelector` / `waitFor` on a real CONDITION is the correct fix and must
# stay allowed, so this matches the sleep spellings only.
SLEEP = re.compile(
    r"waitForTimeout\s*\(|\btime\.sleep\s*\(|\bThread\.sleep\s*\(|"
    r"\bsleep\s*\(\s*\d|await\s+new\s+Promise\s*\([^)]*setTimeout"
)

# A timeout large enough to outrun a race rather than configure a slow step.
# Small timeouts are ordinary setup and are left alone; the threshold is what
# keeps this from firing on routine config.
TIMEOUT_MS = re.compile(r"timeout\s*[:=]\s*(\d{4,})")

# Sixty seconds, not thirty. Thirty thousand milliseconds is PLAYWRIGHT'S OWN
# DEFAULT, so a threshold of 30000 calls every healthy project a band-aid — the
# crying-wolf failure that gets a gate uninstalled within a day. This was not
# theorised: the gate refused a brand-new test file over the literal string
# `timeout: 30000` sitting inside a fixture. The bar has to sit clearly above
# what a careful project writes on purpose.
TIMEOUT_COVERUP_MS = 60000

# The enforcement machinery does not police itself.
#
# A gate's own test file must contain, as DATA, every pattern the gate refuses —
# that is what makes it a test. Scanning raw text cannot tell a fixture from
# real code, so applying the gate here is circular and produces a hard deadlock:
# the tests proving the gate works cannot be written while the gate is on. That
# is not a hypothetical either; it happened twice in a row while extending this
# file, and the second one could not be worked around by tuning a threshold.
#
# Scoped deliberately to this directory. These are hooks, not product code —
# they are guarded by their own suites and by mutation runs, not by each other.
def in_hooks_dir(path: str) -> bool:
    return "/.claude/hooks/" in "/" + path.replace("\\", "/").lstrip("/")

# ---------------------------------------------------------------- CHECK A ----
# The vocabulary of "I made the symptom go away". Each entry is (pattern, why).
# The `why` text is quoted back to the caller: a refusal that does not name what
# it saw teaches nothing and gets worked around by guessing.
SYMPTOM = (
    (r"catch\s*\([^)]*\)\s*\{\s*\}",
     "an empty catch block — the error is caught and thrown away"),
    (r"catch\s*\{\s*\}",
     "an empty catch block — the error is caught and thrown away"),
    (r"catch\s*\([^)]*\)\s*\{\s*console\.(log|warn|error|debug)\s*\([^)]*\)\s*;?\s*\}",
     "a catch block that only logs — logging is not handling"),
    (r"except[^:\n]*:\s*(?:#[^\n]*\n\s*)?pass\b",
     "`except: pass` — the exception is silently swallowed"),
    (r"#\s*type:\s*ignore",
     "a `# type: ignore` — the type error is hidden, not resolved"),
    (r"eslint-disable",
     "an `eslint-disable` — the lint rule is switched off rather than satisfied"),
    (r"@ts-(ignore|nocheck)",
     "a `@ts-ignore` — the type error is hidden, not resolved"),
)

# ---------------------------------------------------------------- CHECK B ----
ASSERTION = re.compile(
    r"\bassert\w*\s*[\(\s]|\bexpect\s*\(|\bEXPECT_\w+\s*\(|\.should\b|\brequire\s*\("
)

# Markers that switch a test off entirely. Present in `new` but not `old` means
# this edit is the thing that disabled it.
SKIP_MARKER = re.compile(
    r"@pytest\.mark\.(skip|xfail)|@unittest\.skip|\.skip\s*\(|\bxit\s*\(|\bxdescribe\s*\(|"
    r"\.todo\s*\(|@Ignore\b|\bt\.Skip\s*\(|"
    # Playwright/Jest/Mocha spellings that switch a test off without the word
    # "skip" appearing anywhere. `.only` is the quietest of the three: the run
    # goes green having executed ONE test, and the report looks like a pass.
    r"\.fixme\s*\(|\.fail\s*\(|\.only\s*\(|\.slow\s*\("
)

# "Proves an exact thing" vs "proves something exists". Swapping down is a test
# being softened even when the assertion COUNT is unchanged, which is exactly
# the mutation a count-only gate would miss.
STRONG = re.compile(
    r"\.toBe\s*\(|\.toEqual\s*\(|\.toStrictEqual\s*\(|\.toHaveBeenCalledWith\s*\(|"
    r"assertEqual\s*\(|==\s|\.toMatchObject\s*\(|"
    # Browser assertions that pin down WHAT the page said, not merely that
    # something rendered.
    r"\.toHaveText\s*\(|\.toContainText\s*\(|\.toHaveValue\s*\(|\.toHaveURL\s*\(|"
    r"\.toHaveCount\s*\(|\.toHaveAttribute\s*\(|\.toHaveTitle\s*\("
)
WEAK = re.compile(
    r"\.toBeDefined\s*\(|\.toBeTruthy\s*\(|\.toBeFalsy\s*\(|\.toBeNull\s*\(|"
    r"\.toBeUndefined\s*\(|\.toBeGreaterThan\s*\(|assertIsNotNone\s*\(|"
    r"assertIsNone\s*\(|assertTrue\s*\(|is\s+not\s+None\b|is\s+None\b|"
    r"\.any\s*\(|expect\.anything\s*\(|"
    # Browser assertions that prove a box exists. Perfectly good ADDED to an
    # exact check; a downgrade when they REPLACE one. The gate only fires on the
    # swap --- strong count down AND weak count up --- so adding one is free.
    r"\.toBeVisible\s*\(|\.toBeAttached\s*\(|\.toBeEnabled\s*\(|\.toBeHidden\s*\("
)

BANNER = "BLOCKED by the no-symptom-patch gate.\n\n"

# There is deliberately no "check with the human" route in either tail.
#
# A refusal that ends in "ask and let them decide" is not a gate, it is a speed
# bump with a bypass lever bolted on — and the lever gets aimed at the one
# person who asked never to be handed it. It also inverts the rule it claims to
# serve: a test changes on MUTATION EVIDENCE, not on anybody's say-so, the
# owner's included. Evidence is the currency here, not approval. So every exit
# offered below is work, not a conversation.
TAIL_CODE = (
    "\nFix what actually caused the failure. If this shape is genuinely required "
    "here, stop and report it as a finding rather than adding it — and do not "
    "reach for a different spelling of the same shortcut.\n"
)

TAIL_TEST = (
    "\nTwo ways forward, both of them work: run mutation testing and name the "
    "surviving mutant with what it showed, or change the code so the existing "
    "test passes honestly. There is no third route.\n"
)


# A LITERAL COMPARED WITH A LITERAL. The check every other rule here misses.
#
# CHECK B counts assertions and compares strong matchers to weak ones. A
# one-for-one swap defeats both at once: `expect(true).toBe(true)` keeps the
# count identical and `toBe` is the strongest matcher there is. Demonstrated
# against this hook before the rule existed --- a real `rejects.toThrow(...)`
# replaced by `expect(true).toBe(true)` in a `.test.ts` file exited 0.
#
# THE SUBJECT IS WHAT MAKES IT A TAUTOLOGY, not the expected value. Matching on
# `toBe(true)` alone would refuse `expect(isValid(x)).toBe(true)`, which is the
# ordinary way to assert a boolean, and a gate that blocks the normal case gets
# switched off within a week. So the subject must ALSO be a literal.
_LIT = r"true|false|-?\d+(?:\.\d+)?|'[^']*'|\"[^\"]*\"|`[^`]*`"
TAUTOLOGY = re.compile(
    #   expect(<literal>).toBe(<anything>)      JS/TS
    rf"expect\(\s*(?:{_LIT})\s*\)\s*\.\s*(?:not\s*\.\s*)?to(?:Be|Equal|StrictEqual|BeTruthy|BeFalsy)\b"
    #   assert True / assert False / assert 1 == 1        Python
    rf"|assert\s+(?:True|False)\s*(?:$|#|\n)"
    rf"|assert\s+({_LIT})\s*==\s*({_LIT})"
    #   self.assertTrue(True) / assertEqual(1, 1)         unittest
    rf"|assert(?:True|False)\(\s*(?:True|False)\s*\)"
    rf"|assertEqual\(\s*({_LIT})\s*,\s*({_LIT})\s*\)",
    re.MULTILINE,
)


def refuse(message: str, tail: str = TAIL_CODE) -> int:
    sys.stderr.write(BANNER + message + tail)
    return BLOCK


def is_test_file(path: str) -> bool:
    low = "/" + path.replace("\\", "/").lower().lstrip("/")
    return any(marker in low for marker in TEST_MARKERS)


def is_code_file(path: str) -> bool:
    return path.lower().endswith(CODE_SUFFIXES)


def check_symptom(path: str, new: str) -> int:
    """CHECK A. Source files only: test fixtures legitimately contain these
    shapes as DATA, and this file's own test suite is the proof of that."""
    if not is_code_file(path) or is_test_file(path):
        return ALLOW
    for pattern, why in SYMPTOM:
        if re.search(pattern, new):
            return refuse(
                f"This edit to {path} adds {why}.\n\n"
                "That makes the symptom disappear without touching what caused "
                "it, so the bug survives and the next person meets it with the "
                "evidence already deleted.\n"
            )
    return ALLOW


def check_weakening(path: str, old: str, new: str) -> int:
    """CHECK B. Test files only. The rule allows exactly one reason to change a
    test: a mutant survived and proved the test wrong. Everything else is the
    test being lowered to meet the code."""
    if not is_test_file(path):
        return ALLOW

    if SKIP_MARKER.search(new) and not SKIP_MARKER.search(old):
        return refuse(
            f"This edit switches a test OFF in {path}.\n\n"
            "A skipped test is a test that cannot fail, which is not the same "
            "as a test that passes. Per the rule, a test changes only when a "
            "mutant shows a real evidence error — a skip is not that.\n",
            TAIL_TEST,
        )

    if SLEEP.search(new) and not SLEEP.search(old):
        return refuse(
            f"This edit adds an arbitrary sleep to {path}.\n\n"
            "That is the classic flaky-test cover-up: the race is untouched, the "
            "test just loses more slowly, and it comes back on a busier CI "
            "machine. Wait for the CONDITION instead — `waitForSelector`, "
            "`waitFor`, an expect with its own retry — or fix what makes the "
            "timing uncertain.\n",
            TAIL_TEST,
        )

    big_new = {int(v) for v in TIMEOUT_MS.findall(new) if int(v) >= TIMEOUT_COVERUP_MS}
    big_old = {int(v) for v in TIMEOUT_MS.findall(old) if int(v) >= TIMEOUT_COVERUP_MS}
    if big_new - big_old:
        worst = max(big_new - big_old)
        return refuse(
            f"This edit raises a timeout to {worst}ms in {path}.\n\n"
            f"A timeout past {TIMEOUT_COVERUP_MS}ms in a test is usually there to "
            "outrun a race rather than to configure a slow step. The test still "
            "fails, it just takes longer to admit it. Find what is actually slow "
            "or actually racing.\n",
            TAIL_TEST,
        )

    if TAUTOLOGY.search(new) and not TAUTOLOGY.search(old):
        return refuse(
            f"This edit puts an assertion that CANNOT FAIL into {path}.\n\n"
            "A literal compared with a literal --- `expect(true).toBe(true)`, "
            "`assert 1 == 1` --- is not a weaker assertion, it is the absence of "
            "one wearing an assertion's shape. It keeps the assertion count "
            "identical and uses the strongest matcher available, so the counting "
            "rule and the strong-versus-weak rule both wave it through. That is "
            "why it needs its own check.\n\n"
            "Per the rule, a test changes only when a mutant shows a real "
            "evidence error. Name the mutant and what it showed, or change the "
            "code instead. If this is a genuine placeholder for work not yet "
            "written, the honest form is a skip with a reason --- which this "
            "gate also refuses, on purpose.\n",
            TAIL_TEST,
        )

    before, after = len(ASSERTION.findall(old)), len(ASSERTION.findall(new))
    if after < before:
        return refuse(
            f"This edit removes {before - after} assertion(s) from {path} "
            f"({before} -> {after}).\n\n"
            "The test now proves less than it did. Per the rule, a test changes "
            "only when a mutant shows a real evidence error. If a surviving "
            "mutant proved this assertion wrong, say which mutant and what it "
            "showed. Otherwise the code is what should change.\n",
            TAIL_TEST,
        )

    s_before, s_after = len(STRONG.findall(old)), len(STRONG.findall(new))
    w_before, w_after = len(WEAK.findall(old)), len(WEAK.findall(new))
    if s_after < s_before and w_after > w_before:
        return refuse(
            f"This edit swaps an exact check for a vague one in {path}.\n\n"
            "The assertion count is unchanged, so a counting gate would have "
            "waved this through, but `toBe(42)` proves a value and "
            "`toBeDefined()` proves only that something is there. Per the rule, "
            "a test changes only when a mutant shows a real evidence error.\n",
            TAIL_TEST,
        )

    return ALLOW


def main() -> int:
    try:
        raw = sys.stdin.read()
    except Exception:
        return ALLOW
    if not raw.strip():
        return ALLOW
    try:
        parsed: object = json.loads(raw)
    except Exception:                                  # noqa: BLE001
        return ALLOW                                   # malformed input: fail OPEN
    if not isinstance(parsed, dict):
        return ALLOW
    # `json.loads` is `Any`, and this repository type-checks with zero pyright
    # errors under strict settings. Narrowing once here keeps every read below
    # typed instead of scattering casts through the control flow.
    payload = cast("dict[str, object]", parsed)

    if payload.get("tool_name") not in ("Edit", "Write", "MultiEdit"):
        return ALLOW

    raw_input = payload.get("tool_input")
    if not isinstance(raw_input, dict):
        return ALLOW
    tool_input = cast("dict[str, object]", raw_input)

    if in_hooks_dir(str(tool_input.get("file_path", ""))):
        return ALLOW                                   # see in_hooks_dir: no self-policing

    path = tool_input.get("file_path")
    if not isinstance(path, str) or not path:
        return ALLOW

    # Write carries `content`; Edit carries `new_string`. Reading only one of
    # them leaves a hole big enough to drive the whole bypass through.
    new = tool_input.get("new_string")
    if not isinstance(new, str):
        new = tool_input.get("content")
    if not isinstance(new, str):
        return ALLOW
    old = tool_input.get("old_string")
    if not isinstance(old, str):
        old = ""

    verdict = check_symptom(path, new)
    if verdict != ALLOW:
        return verdict
    return check_weakening(path, old, new)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:                                  # never crash a turn shut
        sys.exit(ALLOW)
