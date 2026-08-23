"""The Python verifier, against code that actually runs.

These tests execute real subprocesses. That is the point: the reason Python was
chosen as the first domain is that a claim about it can be settled by running
it, and a verifier tested only against mocks would prove nothing about that.

The socket guard in conftest still applies -- `subprocess` is not a network
call, so the offline property is untouched.
"""

from __future__ import annotations

import pytest

from learning_os.models.contracts import Verifiability
from learning_os.verifiers.base import Judgement, Task, UnsupportedVerifier
from learning_os.verifiers.python_verifier import PythonVerifier, run_python

VERIFIER = PythonVerifier(timeout_s=5.0)

GOOD_FACTORIAL = """
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
"""

NO_BASE_CASE = """
def factorial(n):
    return n * factorial(n - 1)
"""


def _task(checker: str, skill: str = "python.recursion.write_recursive_function") -> Task:
    return Task(task_id="t", skill_id=skill, prompt="write it", checker=checker)


# --------------------------------------------------------------------------
# Execution
# --------------------------------------------------------------------------


def test_working_code_passes_every_check() -> None:
    checker = "print('CHECK PASS' if factorial(5) == 120 else 'CHECK FAIL')"
    j = VERIFIER.evaluate_response(_task(checker), GOOD_FACTORIAL)
    assert j.passed is True
    assert j.performance == 1.0
    assert j.verifiability is Verifiability.VERIFIABLE


def test_a_missing_base_case_is_identified_as_such() -> None:
    """The single most diagnostic outcome in this concept.

    "Your code is wrong" and "your code never stops" call for different next
    moves, so the verifier must not collapse them into one failure.
    """
    checker = "print('CHECK PASS' if factorial(5) == 120 else 'CHECK FAIL')"
    j = VERIFIER.evaluate_response(_task(checker), NO_BASE_CASE)
    assert j.passed is False
    assert "base case" in j.detail.lower()
    assert j.verifiability is Verifiability.VERIFIABLE


def test_partial_credit_is_reported_as_a_fraction() -> None:
    """All-or-nothing would erase the difference between nearly right and
    unrelated -- which is what decides whether the next move is a nudge or a
    different approach entirely."""
    checker = (
        "print('CHECK PASS' if factorial(1) == 1 else 'CHECK FAIL')\n"
        "print('CHECK PASS' if factorial(5) == 120 else 'CHECK FAIL')\n"
        "print('CHECK FAIL')\n"
    )
    j = VERIFIER.evaluate_response(_task(checker), GOOD_FACTORIAL)
    assert j.passed is False
    assert j.performance == pytest.approx(2 / 3)


def test_a_syntax_error_is_definitive_not_uncertain() -> None:
    """The code cannot run. There is nothing ambiguous about that, so it
    reports VERIFIABLE with zero rather than an uncertainty."""
    j = VERIFIER.evaluate_response(_task(""), "def broken(:\n  pass")
    assert j.passed is False
    assert j.verifiability is Verifiability.VERIFIABLE
    assert "SyntaxError" in j.detail
    assert any("never executed" in lim for lim in j.limitations)


def test_an_infinite_loop_is_a_result_not_a_hang() -> None:
    """Non-termination is the bug this concept is about, so the verifier has to
    survive it and report it rather than blocking the engine."""
    fast = PythonVerifier(timeout_s=1.0)
    j = fast.evaluate_response(_task(""), "while True:\n    pass")
    assert j.passed is False
    assert "did not finish" in j.detail


def test_a_crash_does_not_take_the_engine_down() -> None:
    result = run_python("raise SystemExit(3)")
    assert result.returncode == 3
    assert result.timed_out is False


def test_learner_code_cannot_import_the_engine() -> None:
    """`-I` isolated mode. Without it the learner's code sits on a path that
    can reach the engine's own modules, and an exercise could rewrite the thing
    marking it."""
    result = run_python("import learning_os")
    assert result.returncode != 0
    assert "ModuleNotFoundError" in result.stderr


def test_nothing_from_the_response_reaches_a_shell() -> None:
    """argv is a list and there is no shell, so this stays a string literal
    instead of becoming a command."""
    result = run_python("x = '; echo owned'\nprint('safe')")
    assert "owned" not in result.stdout
    assert "safe" in result.stdout


# --------------------------------------------------------------------------
# Honesty about what was proven
# --------------------------------------------------------------------------


def test_a_pass_states_what_it_does_not_cover() -> None:
    """A passing test proves the cases it covers and nothing else. The
    limitation travels with the result so a mastery claim cannot quietly rest
    on more than was checked."""
    checker = "print('CHECK PASS' if factorial(5) == 120 else 'CHECK FAIL')"
    j = VERIFIER.evaluate_response(_task(checker), GOOD_FACTORIAL)
    assert j.limitations, "a judgement with no stated limitation overclaims"


def test_an_explanation_skill_is_not_judged_by_execution() -> None:
    """Verifiability is per skill. Explaining why a function terminates cannot
    be settled by running anything, and marking it VERIFIABLE would let it
    borrow the authority execution earns."""
    j = VERIFIER.evaluate_response(
        _task("", skill="python.recursion.explain_termination"),
        "because the base case stops it",
    )
    assert j.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED
    assert j.passed is False


def test_verifiability_differs_between_skills_of_one_domain() -> None:
    assert (
        VERIFIER.verifiability_of("python.recursion.write_recursive_function")
        is Verifiability.VERIFIABLE
    )
    assert (
        VERIFIER.verifiability_of("python.recursion.explain_termination")
        is Verifiability.HUMAN_REVIEW_REQUIRED
    )


def test_a_claim_that_is_not_code_is_refused_rather_than_guessed() -> None:
    j = VERIFIER.validate_claim("recursion is elegant and good")
    assert j.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED
    assert j.passed is False


def test_a_claim_that_is_code_is_settled_by_running_it() -> None:
    assert VERIFIER.validate_claim("2 + 2 == 4").passed is True
    assert VERIFIER.validate_claim("2 + 2 == 5").passed is False


# --------------------------------------------------------------------------
# Transfer
# --------------------------------------------------------------------------


def test_a_transfer_task_is_offered_and_is_novel() -> None:
    task = VERIFIER.generate_transfer_task("python.recursion.apply_to_nested_structure")
    assert task is not None
    assert task.is_novel_context is True
    assert task.expected_evidence.name.startswith("INDEPENDENT")


def test_a_seen_task_is_not_offered_again() -> None:
    """A task the learner has already met measures recall, not transfer."""
    first = VERIFIER.generate_transfer_task("python.recursion.apply_to_nested_structure")
    assert first is not None
    again = VERIFIER.generate_transfer_task(
        "python.recursion.apply_to_nested_structure", seen=(first.task_id,)
    )
    assert again is None


def test_a_correct_transfer_answer_passes_its_checks() -> None:
    """End to end: generated task, learner answer, real execution."""
    task = VERIFIER.generate_transfer_task("python.recursion.apply_to_nested_structure")
    assert task is not None
    answer = """
def count_items(x):
    if not isinstance(x, list):
        return 1
    return sum(count_items(i) for i in x)
"""
    j = VERIFIER.evaluate_response(task, answer)
    assert j.passed is True, j.detail


def test_a_wrong_transfer_answer_fails_its_checks() -> None:
    """The negative control. Without it, "the transfer task passes" could be
    satisfied by checks that pass for anything."""
    task = VERIFIER.generate_transfer_task("python.recursion.apply_to_nested_structure")
    assert task is not None
    j = VERIFIER.evaluate_response(task, "def count_items(x):\n    return 99\n")
    assert j.passed is False


# --------------------------------------------------------------------------
# The unsupported case
# --------------------------------------------------------------------------


def test_an_unsupported_domain_returns_uncertainty_not_a_verdict() -> None:
    """The tempting alternative is an LLM judging its own output, which
    produces a number that looks like a measurement and is not one."""
    u = UnsupportedVerifier()
    j = u.validate_claim("this essay is persuasive")
    assert j.verifiability is Verifiability.UNSUPPORTED
    assert j.passed is False
    assert j.performance == 0.0
    assert any("unknown, not as false" in lim for lim in j.limitations)


def test_an_unsupported_domain_offers_no_transfer_task() -> None:
    assert UnsupportedVerifier().generate_transfer_task("anything.at.all") is None


def test_an_unsupported_judgement_cannot_claim_a_pass() -> None:
    """Enforced in the type, so no verifier can construct the contradiction."""
    with pytest.raises(ValueError, match="cannot report a pass"):
        Judgement(passed=True, performance=1.0, verifiability=Verifiability.UNSUPPORTED)


def test_performance_outside_zero_to_one_is_refused() -> None:
    with pytest.raises(ValueError, match=r"\[0,1\]"):
        Judgement(passed=True, performance=1.5, verifiability=Verifiability.VERIFIABLE)


def test_both_verifiers_satisfy_the_protocol() -> None:
    """The whole point of the boundary: the engine never learns which subject
    it is teaching, only how far the answer can be trusted."""
    from learning_os.verifiers.base import DomainVerifier

    assert isinstance(VERIFIER, DomainVerifier)
    assert isinstance(UnsupportedVerifier(), DomainVerifier)


def test_an_unevaluatable_claim_is_not_reported_as_false() -> None:
    """The distinction the NameError bug exposed.

    "recursion is elegant and good" is valid Python -- an `is` comparison
    chained with `and` -- so it compiles and then dies on NameError. Before the
    fix the verifier reported VERIFIABLE + passed=False, which asserts "I
    checked this sentence and it is false" about something it never evaluated.
    """
    j = VERIFIER.validate_claim("recursion is elegant and good")
    assert j.verifiability is Verifiability.HUMAN_REVIEW_REQUIRED
    assert "could not be evaluated" in j.detail
    assert any("NOT 'false'" in lim for lim in j.limitations)


def test_a_claim_that_is_genuinely_false_still_says_so() -> None:
    """The other side. Without this, the fix could have been "call everything
    unsettled", which would make the verifier useless."""
    j = VERIFIER.validate_claim("2 + 2 == 5")
    assert j.verifiability is Verifiability.VERIFIABLE
    assert j.passed is False
    assert "is false" in j.detail
