"""A fixer with push access is only safe if the cheapest path to green is barred.

An agent told to make a red check pass has two moves available: repair the
defect, or delete whatever noticed it. The second is faster, always works, and
looks identical in a status list. Asking the prompt nicely not to do it is not
a control -- the prompt is not what runs the diff.

So the diff is what gets read. Every case below is a real shape a fixer reaches
for under pressure, and each is paired: the weakening must be REFUSED, and a
near-identical honest change must be ALLOWED. A guard asserted only to refuse
is satisfied by `return False`, which would block every fix including the good
ones and be switched off inside a day.
"""

import subprocess
import sys
from pathlib import Path

import pytest

GATE = Path(__file__).resolve().parents[1] / "scripts" / "no_weakening_gate.py"


def run(diff: str):
    """Exit code and output from the gate, fed a diff on stdin."""
    p = subprocess.run(
        [sys.executable, str(GATE)],
        input=diff,
        capture_output=True,
        text=True,
    )
    return p.returncode, p.stdout + p.stderr


def diff_for(path: str, removed: list[str], added: list[str]) -> str:
    body = "".join(f"-{line}\n" for line in removed) + "".join(f"+{line}\n" for line in added)
    return (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        f"@@ -1,{max(len(removed), 1)} +1,{max(len(added), 1)} @@\n"
        f"{body}"
    )


# --------------------------------------------------------------------------
# SKIPPING A TEST
# --------------------------------------------------------------------------

def test_refuses_a_skip_marker_added_to_a_test():
    code, out = run(diff_for("src/thing.test.ts", ["it('holds', () => {"], ["it.skip('holds', () => {"]))
    assert code == 1, out
    assert "skip" in out.lower()
    assert "src/thing.test.ts" in out


def test_allows_a_skip_marker_being_removed():
    code, out = run(diff_for("src/thing.test.ts", ["it.skip('holds', () => {"], ["it('holds', () => {"]))
    assert code == 0, out


def test_refuses_a_python_skip_marker():
    code, out = run(
        diff_for("tests/test_thing.py", ["def test_holds():"], ["@pytest.mark.skip", "def test_holds():"])
    )
    assert code == 1, out


# --------------------------------------------------------------------------
# DELETING ASSERTIONS
# --------------------------------------------------------------------------

def test_refuses_a_net_loss_of_assertions_in_a_test_file():
    code, out = run(
        diff_for(
            "src/thing.test.ts",
            ["expect(a).toBe(1)", "expect(b).toBe(2)", "expect(c).toBe(3)"],
            ["expect(a).toBe(1)"],
        )
    )
    assert code == 1, out
    assert "assertion" in out.lower()


def test_allows_assertions_being_added():
    code, out = run(
        diff_for(
            "src/thing.test.ts",
            ["expect(a).toBe(1)"],
            ["expect(a).toBe(1)", "expect(b).toBe(2)"],
        )
    )
    assert code == 0, out


def test_allows_an_assertion_being_rewritten_one_for_one():
    code, out = run(
        diff_for("src/thing.test.ts", ["expect(a).toBe(1)"], ["expect(a).toEqual({ n: 1 })"])
    )
    assert code == 0, out


# --------------------------------------------------------------------------
# SILENCING A CHECKER
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "line",
    [
        "// @ts-ignore",
        "// eslint-disable-next-line no-console",
        "x = 1  # noqa",
        "y: int = 2  # type: ignore",
        "/* istanbul ignore next */",
        "// Stryker disable next-line all",
        "grep foo  # nosemgrep",
        "KEY = 'x'  # gitleaks:allow",
    ],
)
def test_refuses_every_suppression_comment(line: str) -> None:
    code, out = run(diff_for("src/thing.ts", [], [line]))
    assert code == 1, f"{line!r} was allowed\n{out}"


def test_allows_a_suppression_comment_being_deleted():
    code, out = run(diff_for("src/thing.ts", ["// @ts-ignore"], []))
    assert code == 0, out


def test_allows_the_word_ignore_in_ordinary_prose():
    code, out = run(diff_for("docs/notes.md", [], ["The parser will ignore trailing commas."]))
    assert code == 0, out


# --------------------------------------------------------------------------
# TURNING A GATE OFF
# --------------------------------------------------------------------------

def test_refuses_continue_on_error_added_to_a_workflow():
    code, out = run(diff_for(".github/workflows/verify.yml", [], ["        continue-on-error: true"]))
    assert code == 1, out


def test_refuses_a_swallowed_exit_code_in_a_workflow():
    code, out = run(diff_for(".github/workflows/verify.yml", [], ["        run: pytest || true"]))
    assert code == 1, out


def test_allows_continue_on_error_being_removed():
    code, out = run(diff_for(".github/workflows/verify.yml", ["        continue-on-error: true"], []))
    assert code == 0, out


# --------------------------------------------------------------------------
# DELETING THE TEST FILE OUTRIGHT
# --------------------------------------------------------------------------

def test_refuses_a_deleted_test_file():
    code, out = run(
        "diff --git a/src/thing.test.ts b/src/thing.test.ts\n"
        "deleted file mode 100644\n"
        "--- a/src/thing.test.ts\n"
        "+++ /dev/null\n"
        "@@ -1,3 +0,0 @@\n"
        "-it('holds', () => {\n"
        "-  expect(a).toBe(1)\n"
        "-})\n"
    )
    assert code == 1, out
    assert "deleted" in out.lower()


def test_allows_a_new_test_file():
    code, out = run(
        "diff --git a/src/new.test.ts b/src/new.test.ts\n"
        "new file mode 100644\n"
        "--- /dev/null\n"
        "+++ b/src/new.test.ts\n"
        "@@ -0,0 +1,3 @@\n"
        "+it('holds', () => {\n"
        "+  expect(a).toBe(1)\n"
        "+})\n"
    )
    assert code == 0, out


# --------------------------------------------------------------------------
# THE GUARD MUST NOT BE VACUOUS
# --------------------------------------------------------------------------

def test_an_empty_diff_passes():
    code, out = run("")
    assert code == 0, out


def test_an_ordinary_source_fix_passes():
    code, out = run(
        diff_for("src/thing.ts", ["return a + b"], ["return a + b + carry"])
    )
    assert code == 0, out
