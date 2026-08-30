"""Steps for `features/submitted_code.feature`.

These steps do not go through HTTP, because the code path they describe does
not: no route runs learner code today. `run_python` is what would execute a
submission, and `PythonVerifier.evaluate_response` is what would mark it, so
those are what the scenarios call. Routing them through an endpoint that does
not exist would make the feature file a description of an app nobody has.

Real subprocesses run here. That is the point -- a verifier tested against a
mock proves nothing about whether a submission can reach the engine. The socket
guard in `tests/conftest.py` still holds: `subprocess` is not a network call.
"""

from __future__ import annotations

from pytest_bdd import given, parsers, scenarios, then, when

from learning_os.domain.python_recursion import GRAPH
from learning_os.verifiers.base import Judgement, Task
from learning_os.verifiers.python_verifier import PythonVerifier, RunResult, run_python

scenarios("features/submitted_code.feature")

#: 5 seconds, matching `tests/test_verifier.py`. Long enough that a slow runner
#: does not fail a scenario about correctness, short enough that a hung
#: subprocess does not hold the job.
VERIFIER = PythonVerifier(GRAPH, timeout_s=5.0)

#: The exercise the "escape attempt" scenario is answering. A real skill from
#: the shipped graph and a checker that really settles it, so that a submission
#: failing to pass is a fact about the submission.
FACTORIAL = Task(
    task_id="human-factorial",
    skill_id="python.recursion.write_recursive_function",
    prompt="write a factorial",
    checker="print('CHECK PASS' if factorial(5) == 120 else 'CHECK FAIL')",
)


# ---------------------------------------------------------------------------
# Given
# ---------------------------------------------------------------------------


@given("a learner has written some code", target_fixture="submission")
def _a_learner_has_written_some_code(docstring: str) -> str:
    return docstring


@given(
    parsers.parse('a learner submits this as their answer to "{prompt}"'),
    target_fixture="submission",
)
def _a_learner_submits_this_as_their_answer(docstring: str, prompt: str) -> str:
    assert prompt == FACTORIAL.prompt, (
        f"the feature asks for {prompt!r} but this step marks {FACTORIAL.prompt!r}"
    )
    return docstring


# ---------------------------------------------------------------------------
# When
# ---------------------------------------------------------------------------


@when("the system runs it", target_fixture="run")
def _the_system_runs_it(submission: str) -> RunResult:
    return run_python(submission)


@when(
    parsers.parse("the system runs it with a {seconds:d} second limit"),
    target_fixture="run",
)
def _the_system_runs_it_with_a_limit(submission: str, seconds: int) -> RunResult:
    return run_python(submission, timeout_s=float(seconds))


@when("the answer is marked", target_fixture="mark")
def _the_answer_is_marked(submission: str) -> Judgement:
    return VERIFIER.evaluate_response(FACTORIAL, submission)


# ---------------------------------------------------------------------------
# Then
# ---------------------------------------------------------------------------


@then("it fails")
def _it_fails(run: RunResult) -> None:
    assert run.returncode != 0, f"the submission succeeded: {run.stdout!r}"


@then("it succeeds")
def _it_succeeds(run: RunResult) -> None:
    assert run.returncode == 0, run.stderr


@then("the reason is that the module could not be found")
def _the_reason_is_module_not_found(run: RunResult) -> None:
    """The specific refusal, not merely a non-zero exit.

    A submission that crashed for some unrelated reason would satisfy "it
    fails" while the import it attempted had in fact succeeded, so the scenario
    would report a guard that is not there.
    """
    assert "ModuleNotFoundError" in run.stderr, run.stderr


@then(parsers.parse('it printed "{text}"'))
def _it_printed(run: RunResult, text: str) -> None:
    assert text in run.stdout, run.stdout


@then(parsers.parse('it did not print "{text}"'))
def _it_did_not_print(run: RunResult, text: str) -> None:
    assert text not in run.stdout, run.stdout


@then("it is cut off for taking too long")
def _it_is_cut_off(run: RunResult) -> None:
    assert run.timed_out, f"a loop with no exit ran to completion: {run!r}"


@then("it is reported as running away rather than as an ordinary error")
def _it_is_reported_as_running_away(run: RunResult) -> None:
    """"Your code is wrong" and "your code never stops" need different lessons.

    Collapsing them into one failure is what makes a teacher's next move a
    guess, so the distinction is asserted where a learner would feel it.
    """
    assert run.recursion_error, run.stderr


@then("the answer does not pass")
def _the_answer_does_not_pass(mark: Judgement) -> None:
    assert mark.passed is False, mark
    assert mark.performance == 0.0, mark


@then("the mark states what it did not check")
def _the_mark_states_what_it_did_not_check(mark: Judgement) -> None:
    """A judgement with no stated limitation overclaims.

    A pass proves the cases the checker covered and nothing else, so the limit
    travels with the result rather than being inferred by whoever reads it.
    """
    assert mark.limitations, "a mark with no stated limitation overclaims"
