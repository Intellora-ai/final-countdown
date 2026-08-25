#!/usr/bin/env python3
"""
Tests for the no-symptom-patch PreToolUse gate.

WRITTEN BEFORE THE HOOK, ON PURPOSE.

The user's rule, verbatim: "DEFINE REQUIREMENTS + WHAT MUST BE TRUE TO GET
DESIRED OUTCOME THEN BUILD AROUND THAT, DO NOT MAKE TESTS WEAK, EASY. BUILD
TESTS THAT FULLFILL DESIRED OUTCOME, ONLY THEN WRITE CODE. CODE WRITTEN SHOULD
BE CHANGED AND BETTER BUT TESTS ONLY CHANGE IF MUTANTS SHOW AN REAL EVIDENCE
ERROR"

So: the desired outcome is stated first, the hardest tests that would prove it
are written first, they are watched failing against a hook that does not exist
yet, and only then is the hook written to satisfy them.

WHAT MUST BE TRUE FOR THE GATE TO BE WORTH HAVING
-------------------------------------------------
1. It BLOCKS the shapes a bug-hider actually uses. A gate that only catches a
   textbook `catch {}` and misses `catch (e) {\n}` is theatre.
2. It BLOCKS a test being made weaker --- fewer assertions, a skip marker, or a
   strong matcher swapped for a vague one. This is the half of the rule that
   protects the OTHER half: code may be rewritten freely only because the tests
   holding it are not allowed to soften underneath it.
3. It does NOT fire on innocent edits. A gate that cries wolf gets switched off,
   and then it enforces nothing at all. The false-positive tests below are load
   bearing and must not be deleted to make a future change easier.
4. It FAILS OPEN. Malformed input, a missing key, an unexpected exception: exit
   0 and let the edit through. A PreToolUse gate that jams shut cannot be
   recovered from inside the tool --- you would need a second editor to escape
   it. Same reasoning as enforce_skills.py.

A NOTE ON WHY THE PASS-CASES OUTNUMBER THE BLOCK-CASES
------------------------------------------------------
The failure mode of this gate is not "misses a bad edit". It is "blocks a good
edit, gets uninstalled, misses every bad edit forever". So the tests that assert
exit 0 are the ones guarding the gate's own survival.
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

# The REPO copy is the source of truth and the one CI runs. `~/.claude/hooks/`
# holds the copy that actually executes on this machine; if you change one, copy
# it. A gate that lives only in a home directory does not travel to a fresh
# clone, which is the same shape as a `.git/info/exclude` entry that put a bug
# back in every checkout.
HOOK = Path(__file__).resolve().parents[1] / "scripts" / "no_symptom_patch.py"

BLOCK = 2
ALLOW = 0


def run(payload: object) -> tuple[int, str]:
    """Feed the hook a payload on stdin exactly as Claude Code would."""
    text = payload if isinstance(payload, str) else json.dumps(payload)
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=text,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return proc.returncode, proc.stderr


def edit(path: str, old: str, new: str) -> dict[str, object]:
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": path, "old_string": old, "new_string": new},
    }


def write(path: str, content: str) -> dict[str, object]:
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": "Write",
        "tool_input": {"file_path": path, "content": content},
    }


def assert_blocked(case: unittest.TestCase, code: int, err: str) -> None:
    """Assert a REFUSAL, not merely a non-zero exit.

    Exit code 2 alone is a rotten assertion here: a missing hook file, a syntax
    error, or any uncaught traceback also exits 2, so `assertEqual(code, 2)`
    passes against a hook that does nothing but crash --- which is the exact
    opposite of the behaviour being specified, since a crashing gate should
    FAIL OPEN. Requiring the hook's own refusal banner in stderr is what makes
    these tests able to tell "refused" apart from "exploded".
    """
    case.assertEqual(code, BLOCK, f"expected a refusal, got exit {code}: {err}")
    case.assertIn("BLOCKED", err, "exit 2 without a refusal banner is a crash, not a gate")
    case.assertNotIn("Traceback", err, "the gate crashed instead of refusing")


# ---------------------------------------------------------------- check A ----
# Hiding a bug instead of fixing it. These are the literal syntax of "I made the
# symptom go away". Each is a real shape, not a strawman.


class TestSymptomPatchesAreBlocked(unittest.TestCase):
    def test_empty_catch_block(self) -> None:
        code, err = run(edit("src/a.ts", "risky()", "try { risky() } catch (e) {}"))
        assert_blocked(self, code, err)

    def test_empty_catch_block_spanning_lines(self) -> None:
        """The whitespace variant. A regex that only matches `{}` is theatre."""
        body = "try {\n  risky()\n} catch (e) {\n\n}"
        code, err = run(edit("src/a.ts", "risky()", body))
        assert_blocked(self, code, err)

    def test_catch_that_only_logs(self) -> None:
        """Logging and continuing is swallowing with extra steps."""
        body = "try {\n  risky()\n} catch (e) {\n  console.log(e)\n}"
        code, err = run(edit("src/a.ts", "risky()", body))
        assert_blocked(self, code, err)

    def test_except_pass(self) -> None:
        code, err = run(edit("src/a.py", "risky()", "try:\n    risky()\nexcept:\n    pass"))
        assert_blocked(self, code, err)

    def test_except_named_exception_pass_multiline(self) -> None:
        body = "try:\n    risky()\nexcept ValueError:\n    pass"
        code, err = run(edit("src/a.py", "risky()", body))
        assert_blocked(self, code, err)

    def test_type_ignore(self) -> None:
        code, err = run(edit("src/a.py", "x = f()", "x = f()  # type: ignore"))
        assert_blocked(self, code, err)

    def test_eslint_disable(self) -> None:
        code, err = run(edit("src/a.ts", "const x = 1", "// eslint-disable-next-line\nconst x = 1"))
        assert_blocked(self, code, err)

    def test_blocked_on_write_tool_too(self) -> None:
        """Write takes `content`, not `new_string`. Reading only one key is a
        hole big enough to drive the whole bypass through."""
        code, err = run(write("src/a.py", "try:\n    risky()\nexcept:\n    pass"))
        assert_blocked(self, code, err)

    def test_reason_names_the_pattern(self) -> None:
        """A refusal that does not say WHAT it saw teaches nothing and gets
        worked around by guessing."""
        _, err = run(edit("src/a.py", "x", "x  # type: ignore"))
        self.assertIn("type: ignore", err)


# ---------------------------------------------------------------- check B ----
# The user's rule: tests change ONLY when a mutant proves them wrong. Every
# other direction of travel is a test being softened to let bad code through.


class TestWeakeningATestIsBlocked(unittest.TestCase):
    def test_assertion_count_dropping(self) -> None:
        old = "expect(a).toBe(1)\nexpect(b).toBe(2)\nexpect(c).toBe(3)"
        new = "expect(a).toBe(1)"
        code, err = run(edit("src/a.test.ts", old, new))
        assert_blocked(self, code, err)

    def test_adding_a_skip_marker(self) -> None:
        old = "def test_thing():\n    assert f() == 3"
        new = "@pytest.mark.skip\ndef test_thing():\n    assert f() == 3"
        code, err = run(edit("tests/test_a.py", old, new))
        assert_blocked(self, code, err)

    def test_adding_a_js_skip(self) -> None:
        old = "it('works', () => { expect(f()).toBe(3) })"
        new = "it.skip('works', () => { expect(f()).toBe(3) })"
        code, err = run(edit("src/a.spec.ts", old, new))
        assert_blocked(self, code, err)

    def test_strong_matcher_swapped_for_vague_one(self) -> None:
        """Same assertion COUNT, strictly less proof. Counting alone misses it."""
        old = "expect(total).toBe(42)"
        new = "expect(total).toBeDefined()"
        code, err = run(edit("src/a.test.ts", old, new))
        assert_blocked(self, code, err)

    def test_python_strong_matcher_swapped_for_vague_one(self) -> None:
        old = "assert total == 42"
        new = "assert total is not None"
        code, err = run(edit("tests/test_a.py", old, new))
        assert_blocked(self, code, err)

    def test_refusal_mentions_mutation_evidence(self) -> None:
        """The block message must state the ONE condition under which this edit
        is legitimate, or the rule is unlearnable from the refusal."""
        old = "expect(a).toBe(1)\nexpect(b).toBe(2)"
        _, err = run(edit("src/a.test.ts", old, "expect(a).toBe(1)"))
        self.assertIn("mutant", err.lower())


# ------------------------------------------------------------ false alarms ---
# The gate's survival depends on these. Deleting one to make a future change
# pass is exactly the weakening this whole file exists to forbid.


class TestTautologiesAreNotAssertions(unittest.TestCase):
    # ---------------------------------------------------------------- CHECK B
    # A TAUTOLOGY IS NOT AN ASSERTION.
    #
    # Every check above counts assertions or compares strong forms to weak
    # ones, and a one-for-one swap defeats both: the count is unchanged and
    # `toBe` is as "strong" a matcher as any. Demonstrated against the live
    # hook before this test existed --- a real `rejects.toThrow(...)` replaced
    # by `expect(true).toBe(true)` in a `.test.ts` file exited 0.
    #
    # It is the same defect this repository keeps finding under different
    # names: an assertion that cannot fail. `'act' as IntentKind` silenced a
    # compiler and made a case unfalsifiable; this silences a gate.

    def test_assertion_replaced_by_a_tautology_is_refused(self) -> None:
        old = "await expect(m.generate(req())).rejects.toThrow(/refusing to send an API key/i)"
        code, err = run(edit("src/a.test.ts", old, "expect(true).toBe(true)"))
        self.assertEqual(code, BLOCK, err)
        self.assertIn("cannot fail", err.lower())

    def test_every_tautology_shape_is_refused(self) -> None:
        """Counting one form and missing its neighbours is how the first hole
        got here. The shapes are enumerated rather than sampled."""
        old = "expect(total).toBe(42)"
        for tautology in (
            "expect(true).toBe(true)",
            "expect(true).toBeTruthy()",
            "expect(false).toBe(false)",
            "expect(1).toBe(1)",
            "expect(1).toEqual(1)",
            "assert True",
            "self.assertTrue(True)",
            "assert 1 == 1",
        ):
            with self.subTest(tautology=tautology):
                code, err = run(edit("src/a.test.ts", old, tautology))
                self.assertEqual(code, BLOCK, f"{tautology!r} was allowed\n{err}")


class TestInnocentEditsAreAllowed(unittest.TestCase):
    def test_a_test_that_already_contained_a_tautology_may_still_be_edited(self) -> None:
        """The gate fires on INTRODUCING one, not on its presence. A file that
        already had a placeholder must stay editable, or the rule makes its own
        cleanup impossible."""
        old = "expect(true).toBe(true)"
        code, err = run(edit("src/a.test.ts", old, "expect(total).toBe(42)"))
        self.assertEqual(code, ALLOW, err)

    def test_a_real_assertion_mentioning_true_is_not_a_tautology(self) -> None:
        """The narrowness that keeps this usable. `toBe(true)` on a computed
        value is the ordinary way to assert a boolean and must not be refused,
        or every boolean test in the codebase becomes unwritable."""
        for path, old, real in (
            ("src/a.test.ts", "expect(x).toBe(1)", "expect(isValid(input)).toBe(true)"),
            ("src/a.test.ts", "expect(x).toBe(1)", "expect(result.ok).toBe(true)"),
            # Held at the SAME strength on purpose. `assert x == 1` ->
            # `assertTrue(...)` really is a strong-to-weak swap and the existing
            # rule refuses it correctly; using it here would have tested that
            # rule instead of this one.
            ("tests/test_a.py", "self.assertTrue(compute())", "self.assertTrue(parse(raw))"),
        ):
            with self.subTest(real=real):
                code, err = run(edit(path, old, real))
                self.assertEqual(code, ALLOW, f"{real!r} was refused\n{err}")

    def test_ordinary_source_edit(self) -> None:
        code, err = run(edit("src/a.ts", "const x = 1", "const x = 2"))
        self.assertEqual(code, ALLOW, err)

    def test_catch_that_actually_handles(self) -> None:
        body = "try {\n  risky()\n} catch (e) {\n  throw new AppError(e)\n}"
        code, err = run(edit("src/a.ts", "risky()", body))
        self.assertEqual(code, ALLOW, err)

    def test_adding_assertions_to_a_test(self) -> None:
        old = "expect(a).toBe(1)"
        new = "expect(a).toBe(1)\nexpect(b).toBe(2)\nexpect(c).toBe(3)"
        code, err = run(edit("src/a.test.ts", old, new))
        self.assertEqual(code, ALLOW, err)

    def test_rewriting_a_test_without_softening_it(self) -> None:
        """Tests may be rephrased. They may not be made to prove less."""
        old = "expect(sum(1, 2)).toBe(3)"
        new = "expect(add(1, 2)).toBe(3)"
        code, err = run(edit("src/a.test.ts", old, new))
        self.assertEqual(code, ALLOW, err)

    def test_source_file_losing_assertions_is_not_test_weakening(self) -> None:
        """Check B is scoped to test files. A refactor that removes a defensive
        assert from production code is a different conversation."""
        old = "assert x == 1\nassert y == 2"
        code, err = run(edit("src/a.py", old, "assert x == 1"))
        self.assertEqual(code, ALLOW, err)

    def test_markdown_discussing_the_patterns(self) -> None:
        """Documentation about `eslint-disable` is not an eslint-disable. This
        very repo's CLAUDE.md would be uneditable otherwise."""
        body = "Never add an `eslint-disable`. Report it instead."
        code, err = run(edit("docs/rules.md", "old text", body))
        self.assertEqual(code, ALLOW, err)

    def test_the_hook_does_not_block_its_own_tests(self) -> None:
        """This file is full of the banned strings. If the gate cannot tolerate
        the file that proves it works, it is unmaintainable by construction."""
        code, err = run(edit(str(HOOK.with_name("test_no_symptom_patch.py")),
                             "old", "except:\n    pass"))
        self.assertEqual(code, ALLOW, err)


# ------------------------------------------------------------- fails open ----


class TestBrowserAndE2ETests(unittest.TestCase):
    """Playwright, Cypress, and any other browser suite.

    These deserve their own class because end-to-end tests are where softening
    is most tempting and least visible. A unit test that stops proving things
    usually looks wrong on the page. A browser test that stops proving things
    looks IDENTICAL to one that passes --- it just waits longer, asserts that
    something is on screen rather than what it says, or quietly stops running.

    Every case below was reached by probing the gate and finding it allowed the
    edit. They are recorded here so the hole cannot silently reopen.
    """

    # -- the file must be RECOGNISED as a test before anything else applies --

    def test_playwright_spec_is_a_test_file(self) -> None:
        old = "await expect(a).toHaveText('x')\nawait expect(b).toHaveText('y')"
        code, err = run(edit("e2e/login.spec.ts", old, "await expect(a).toHaveText('x')"))
        assert_blocked(self, code, err)

    def test_tests_directory_without_leading_slash(self) -> None:
        """`tests/e2e/login.ts` --- a marker list holding only "/tests/" misses
        every path that STARTS with the directory, which is most of them."""
        old = "expect(a).toBe(1)\nexpect(b).toBe(2)"
        code, err = run(edit("tests/e2e/login.ts", old, "expect(a).toBe(1)"))
        assert_blocked(self, code, err)

    def test_e2e_directory_is_a_test_directory(self) -> None:
        """This repo's Playwright specs live under `e2e/` and are a required CI
        context. A gate that does not know that guards none of them."""
        old = "expect(a).toBe(1)\nexpect(b).toBe(2)"
        code, err = run(edit("e2e/login.ts", old, "expect(a).toBe(1)"))
        assert_blocked(self, code, err)

    def test_cypress_directory(self) -> None:
        old = "cy.get('#a').should('have.text', 'x')\ncy.get('#b').should('have.text', 'y')"
        code, err = run(edit("cypress/e2e/login.cy.js", old,
                             "cy.get('#a').should('have.text', 'x')"))
        assert_blocked(self, code, err)

    # -- switching a browser test off has more spellings than `.skip` --

    def test_test_fixme(self) -> None:
        code, err = run(edit("e2e/a.spec.ts", "test('x', async () => {})",
                             "test.fixme('x', async () => {})"))
        assert_blocked(self, code, err)

    def test_test_fail(self) -> None:
        """`test.fail()` inverts the test: it now passes BECAUSE it is broken."""
        code, err = run(edit("e2e/a.spec.ts", "test('x', async () => {})",
                             "test.fail('x', async () => {})"))
        assert_blocked(self, code, err)

    def test_test_only_silently_skips_everything_else(self) -> None:
        """`.only` is the quietest of all: the run goes green having executed a
        single test, and the report looks like a pass."""
        code, err = run(edit("e2e/a.spec.ts", "test('x', async () => {})",
                             "test.only('x', async () => {})"))
        assert_blocked(self, code, err)

    # -- weakening without changing the assertion count --

    def test_exact_text_swapped_for_merely_visible(self) -> None:
        """`toHaveText('Welcome back')` proves the page said the right thing.
        `toBeVisible()` proves a box exists. Same count, far less proof."""
        code, err = run(edit("e2e/a.spec.ts",
                             "await expect(el).toHaveText('Welcome back')",
                             "await expect(el).toBeVisible()"))
        assert_blocked(self, code, err)

    # -- the flaky-test cover-up, which is this rule's whole point in e2e --

    def test_arbitrary_sleep_added(self) -> None:
        """The single most common way a browser test stops being honest: it was
        flaky, so someone slept on it. The race is still there; the test just
        loses more slowly."""
        code, err = run(edit("e2e/a.spec.ts", "await page.click('#go')",
                             "await page.waitForTimeout(5000)\nawait page.click('#go')"))
        assert_blocked(self, code, err)

    def test_huge_timeout_added_to_outrun_a_race(self) -> None:
        code, err = run(edit("e2e/a.spec.ts", "test('x', async () => {})",
                             "test('x', async () => {}, { timeout: 120000 })"))
        assert_blocked(self, code, err)

    # -- and the false alarms that keep this usable --

    def test_adding_a_visibility_check_alongside_existing_ones(self) -> None:
        """Adding `toBeVisible` is normal work. Only SWAPPING DOWN is weakening."""
        old = "await expect(el).toHaveText('hi')"
        new = "await expect(el).toHaveText('hi')\nawait expect(el).toBeVisible()"
        code, err = run(edit("e2e/a.spec.ts", old, new))
        self.assertEqual(code, ALLOW, err)

    def test_ordinary_short_timeout_is_not_a_coverup(self) -> None:
        """A few seconds is configuration. Two minutes is a band-aid."""
        code, err = run(edit("e2e/a.spec.ts", "test('x', async () => {})",
                             "test('x', async () => {}, { timeout: 5000 })"))
        self.assertEqual(code, ALLOW, err)

    def test_waiting_for_a_condition_is_the_correct_fix(self) -> None:
        """`waitFor` on a real condition is what should REPLACE a sleep, so the
        gate must never push people away from it."""
        code, err = run(edit("e2e/a.spec.ts", "await page.click('#go')",
                             "await page.waitForSelector('#go')\nawait page.click('#go')"))
        self.assertEqual(code, ALLOW, err)

    def test_playwright_config_is_not_a_test_file(self) -> None:
        """`playwright.config.ts` legitimately sets timeouts. Treating config as
        a test file would block routine setup on day one."""
        code, err = run(edit("playwright.config.ts", "timeout: 30000", "timeout: 60000"))
        self.assertEqual(code, ALLOW, err)


class TestRefusalNeverAsksTheUserForPermission(unittest.TestCase):
    """The user's follow-up instruction, verbatim: "MAKE SURE CLAUDE NEVER ASKS
    ME TO EDIT AND MAKE TESTS BETTER AND ALL".

    A refusal that ends with "ask the user and let them decide" is not a gate,
    it is a speed bump with a bypass lever attached — and the lever is aimed at
    the one person who explicitly asked never to be handed it. Worse, it
    inverts the rule: the whole point is that a test changes on MUTATION
    EVIDENCE, not on anyone's say-so, the user's included. Permission is not
    the currency here. Evidence is.

    So the refusal text must offer exactly two exits, both of which are work:
    produce the surviving mutant, or change the code instead.
    """

    PERMISSION_WORDS = ("let them decide", "let the user decide", "ask the user",
                        "approve", "permission", "if they agree", "unless the user")

    def _refusal_for_weakened_test(self) -> str:
        old = "expect(a).toBe(1)\nexpect(b).toBe(2)"
        _, err = run(edit("src/a.test.ts", old, "expect(a).toBe(1)"))
        return err.lower()

    def _refusal_for_hidden_bug(self) -> str:
        _, err = run(edit("src/a.py", "x = f()", "x = f()  # type: ignore"))
        return err.lower()

    def test_weakening_refusal_offers_no_permission_route(self) -> None:
        err = self._refusal_for_weakened_test()
        for word in self.PERMISSION_WORDS:
            self.assertNotIn(word, err, f"refusal dangles a bypass: {word!r}")

    def test_hidden_bug_refusal_offers_no_permission_route(self) -> None:
        err = self._refusal_for_hidden_bug()
        for word in self.PERMISSION_WORDS:
            self.assertNotIn(word, err, f"refusal dangles a bypass: {word!r}")

    def test_weakening_refusal_names_both_real_exits(self) -> None:
        """Refusing without saying what to do instead just relocates the guess."""
        err = self._refusal_for_weakened_test()
        self.assertIn("mutant", err)
        self.assertIn("code", err)


class TestFailsOpen(unittest.TestCase):
    def test_malformed_json(self) -> None:
        code, err = run("{not json at all")
        self.assertEqual(code, ALLOW, err)

    def test_empty_stdin(self) -> None:
        code, err = run("")
        self.assertEqual(code, ALLOW, err)

    def test_missing_tool_input(self) -> None:
        code, err = run({"hook_event_name": "PreToolUse", "tool_name": "Edit"})
        self.assertEqual(code, ALLOW, err)

    def test_null_fields(self) -> None:
        payload = {"tool_name": "Edit",
                   "tool_input": {"file_path": None, "new_string": None}}
        code, err = run(payload)
        self.assertEqual(code, ALLOW, err)

    def test_unrelated_tool(self) -> None:
        payload = {"tool_name": "Bash", "tool_input": {"command": "rm -rf /"}}
        code, err = run(payload)
        self.assertEqual(code, ALLOW, err)


if __name__ == "__main__":
    unittest.main(verbosity=2)
