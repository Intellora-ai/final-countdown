"""The Python verifier: run the learner's code and read what happened.

WHAT SANDBOXING HERE DOES AND DOES NOT MEAN
-------------------------------------------
Be exact about this, because a comment claiming "sandboxed" invites people to
trust it with things it cannot hold.

What IS enforced:
  - a separate process, so a crash or an infinite loop cannot take the engine
    down with it
  - a wall-clock timeout, killed on expiry, so non-termination is a RESULT
    rather than a hang -- which matters here because non-termination is the
    exact bug this concept is about
  - a fresh temporary directory per run, removed afterwards
  - `-I -S`, which together strip the script directory, PYTHONPATH, user site,
    AND the interpreter's regular site-packages
  - no shell: argv is a list, so nothing in the learner's text is interpreted
    as a command

WHY BOTH FLAGS, AND WHY `-I` ALONE WAS A FALSE GREEN
----------------------------------------------------
This said `-I` for a while and claimed it stopped learner code importing the
engine. That was wrong. `-I` implies `-E` and `-s` -- no PYTHONPATH, no *user*
site -- and does not imply `-S`. Regular site-packages stays on the path:

    $ python -I  -c "import sys; print(sys.path[-1])"
    .../.venv/lib/python3.14/site-packages      <-- still there
    $ python -I -S -c "import sys; print(sys.path[-1])"
    .../lib-dynload                             <-- gone

So wherever the engine is pip-installed -- which is every real deployment --
`import learning_os` from learner code succeeded.

The test meant to catch this passed, and that is the more important half of the
story. It passed only because the suite was run with `PYTHONPATH=src` and no
editable install, and `-I` genuinely does strip PYTHONPATH. **The configuration
where the test was green was the one where the escape was impossible; the escape
was live everywhere else.** A security property that holds under one install
layout is not a property, it is a coincidence. The test now plants a module where
a real install puts it instead of trusting the ambient environment, so it fails
in the environment where the escape exists.

What is NOT enforced, and what that means:
  - filesystem access outside the temp directory
  - network access
  - resource limits beyond time (memory, file descriptors, subprocesses)
  - deliberate `sys.path` manipulation. `-S` closes the ACCIDENTAL import; code
    that writes to `sys.path` on purpose can still reach anything on disk, and
    no flag closes that.

So this is safe against a MISTAKE and not against an ATTACK. It is the right
level for a learner working through recursion exercises. It is NOT sufficient
for untrusted input from the open internet, and anything moving in that
direction needs a real container or seccomp, not another flag here.

One consequence of `-S` to know before extending this: it disables `site`
wholesale, so the child cannot import third-party packages at all. Correct for
V1. If a later verifier must hand learner code a curated allowlist -- `pytest`,
say -- the shape is an explicit `env` plus a constructed `sys.path`, NOT another
flag. Flags are a blunt instrument that has already been misread once here.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from learning_os.domain.knowledge import KnowledgeGraph
from learning_os.models.contracts import EvidenceStrength, Verifiability
from learning_os.verifiers.base import Judgement, Task

#: Long enough for any V1 exercise, short enough that a missing base case is
#: answered in seconds. Runaway recursion normally hits Python's own limit long
#: before this; the timeout is for the loop that does not.
DEFAULT_TIMEOUT_S = 5.0

# THERE WAS A SECOND LIST OF NON-EXECUTABLE SKILLS HERE, AND IT WAS THE BUG.
#
# `_NOT_EXECUTABLE` named the skills this verifier would not run, while
# `Subskill.verifiability` in the knowledge graph named the same fact. Two
# sources of truth for one fact, and they had already diverged: the graph marked
# three subskills HUMAN_REVIEW_REQUIRED and this set listed one, so the verifier
# was quietly more permissive than the declaration for the other two.
#
# The fix is deleting the list, not extending it. An extended list drifts again
# the next time a subskill is added; deriving from the graph cannot drift,
# because there is nothing left to disagree with.


@dataclass(frozen=True, slots=True)
class RunResult:
    """What one execution did."""

    returncode: int
    stdout: str
    stderr: str
    timed_out: bool

    @property
    def recursion_error(self) -> bool:
        """The signature of a missing or unreachable base case.

        Worth naming rather than leaving as a generic failure: it is the single
        most diagnostic outcome in this whole concept, and the difference
        between "your code is wrong" and "your code never stops" is most of the
        teaching value.
        """
        return "RecursionError" in self.stderr


def run_python(source: str, *, timeout_s: float = DEFAULT_TIMEOUT_S) -> RunResult:
    """Execute source in a separate, isolated, time-limited process."""
    with tempfile.TemporaryDirectory(prefix="learning-os-") as tmp:
        path = Path(tmp) / "submission.py"
        path.write_text(source, encoding="utf-8")
        try:
            proc = subprocess.run(
                # -S as well as -I. See the module docstring: -I does not imply
                # -S, so without it the venv's site-packages stays on sys.path
                # and an installed engine is importable from learner code.
                [sys.executable, "-I", "-S", str(path)],
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=tmp,
                check=False,
            )
        except subprocess.TimeoutExpired as expired:
            return RunResult(
                returncode=-1,
                stdout=_text(expired.stdout),
                stderr=_text(expired.stderr),
                timed_out=True,
            )
        return RunResult(
            returncode=proc.returncode,
            stdout=proc.stdout,
            stderr=proc.stderr,
            timed_out=False,
        )


def _text(raw: str | bytes | None) -> str:
    if raw is None:
        return ""
    return raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw


class PythonVerifier:
    """Checks Python by running it.

    Implements `DomainVerifier`. Deliberately not registered anywhere -- the
    runtime is handed a verifier, so swapping in a Lean one later changes a
    construction argument and nothing else.
    """

    domain = "python"

    def __init__(self, graph: KnowledgeGraph, *, timeout_s: float = DEFAULT_TIMEOUT_S) -> None:
        #: The graph is REQUIRED, not optional with a default.
        #:
        #: A verifier constructed without one would need a private opinion about
        #: which skills it can check, and a private opinion is precisely the
        #: thing that drifted from the graph and produced the bug recorded above.
        #: Making it a construction argument means the disagreement cannot be
        #: reintroduced by forgetting something.
        self.graph = graph
        self.timeout_s = timeout_s

    def verifiability_of(self, skill_id: str) -> Verifiability:
        """Read the graph. Do not decide.

        The knowledge model is the single place that says how far a claim about
        a subskill can be machine-checked, and this verifier's job is to honour
        that, not to hold a second view of it.

        An unknown skill is HUMAN_REVIEW_REQUIRED rather than VERIFIABLE. The
        two failure modes are not symmetric: under-claiming produces a visible
        "somebody needs to look at this", over-claiming produces a fabricated
        pass that reads exactly like a real one.
        """
        sub = self.graph.subskill(skill_id)
        if sub is None:
            return Verifiability.HUMAN_REVIEW_REQUIRED
        return sub.verifiability

    def validate_claim(self, claim: str, context: str = "") -> Judgement:
        """Check a claim by executing it as an assertion.

        Only usable for claims that can be written as code. Anything else gets
        `HUMAN_REVIEW_REQUIRED` rather than an opinion -- this verifier's whole
        authority comes from execution, and a claim it cannot execute is a claim
        it has nothing to say about.
        """
        source = f"{context}\nassert ({claim})\n" if context else f"assert ({claim})\n"
        try:
            compile(source, "<claim>", "exec")
        except SyntaxError:
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.HUMAN_REVIEW_REQUIRED,
                detail="the claim is not executable Python, so this verifier cannot settle it",
                limitations=("only claims expressible as an assertion can be checked here",),
            )
        result = run_python(source, timeout_s=self.timeout_s)

        if result.returncode == 0 and not result.timed_out:
            return Judgement(
                passed=True,
                performance=1.0,
                verifiability=Verifiability.VERIFIABLE,
                detail="assertion held",
                limitations=("proves the assertion for the values used, not in general",),
            )

        # PARSING IS NOT THE SAME AS BEING CHECKABLE, AND THIS IS WHERE IT BIT.
        #
        # The syntax gate above rejects things that are not Python. It does not
        # reject ENGLISH that happens to be Python: "recursion is elegant and
        # good" compiles cleanly as an `is` comparison chained with `and`. It
        # then runs and dies with NameError.
        #
        # Reporting that as VERIFIABLE + passed=False says "I checked this
        # sentence and it is false", which is precisely the fabricated
        # confidence the whole verifiability model exists to stop. The claim was
        # not evaluated at all; the names in it do not exist.
        #
        # So the two outcomes are separated by what actually happened:
        #   AssertionError  -> it WAS evaluated, and it came out false
        #   anything else   -> it was not evaluated, and this verifier has
        #                      nothing to say about it
        if "AssertionError" in result.stderr:
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.VERIFIABLE,
                detail="the assertion was evaluated and is false",
                limitations=("disproves the claim for the values used, not in general",),
            )

        if result.timed_out:
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.HUMAN_REVIEW_REQUIRED,
                detail=f"the claim did not finish evaluating within {self.timeout_s:g}s",
                limitations=("a timeout settles nothing about whether the claim is true",),
            )

        return Judgement(
            passed=False,
            performance=0.0,
            verifiability=Verifiability.HUMAN_REVIEW_REQUIRED,
            detail=(
                "the claim could not be evaluated: "
                + (result.stderr.strip().splitlines() or ["unknown error"])[-1][:200]
            ),
            limitations=(
                "this is 'not settled', NOT 'false' -- the names in the claim "
                "could not be resolved, so nothing was checked",
            ),
        )

    def evaluate_response(self, task: Task, response: str) -> Judgement:
        """Run the learner's code against the task's checks.

        `performance` is the FRACTION of checks that passed, not a boolean.
        All-or-nothing would erase the difference between an answer that is
        nearly right and one that is unrelated, and that difference is what
        decides whether the next move is a nudge or a different approach.
        """
        if self.verifiability_of(task.skill_id) is not Verifiability.VERIFIABLE:
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.HUMAN_REVIEW_REQUIRED,
                detail="this skill is demonstrated in prose; execution cannot judge it",
                limitations=("needs a rubric or a human, not an interpreter",),
            )

        source = f"{response}\n\n{task.checker}\n" if task.checker else response
        try:
            compile(source, "<submission>", "exec")
        except SyntaxError as exc:
            # A syntax error is DEFINITIVE, which is why it reports VERIFIABLE
            # with a zero rather than an uncertainty. The code cannot run; there
            # is nothing ambiguous about that.
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.VERIFIABLE,
                detail=f"{type(exc).__name__}: {exc.msg} on line {exc.lineno}",
                limitations=("the code was never executed; only parsing was attempted",),
            )

        result = run_python(source, timeout_s=self.timeout_s)

        if result.timed_out:
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.VERIFIABLE,
                detail=f"did not finish within {self.timeout_s:g}s",
                limitations=("a timeout proves it did not finish, not why",),
            )

        if result.recursion_error:
            return Judgement(
                passed=False,
                performance=0.0,
                verifiability=Verifiability.VERIFIABLE,
                detail="RecursionError: the base case is missing or never reached",
                limitations=("identifies non-termination, not which branch is wrong",),
            )

        passed_n, total_n = _count_checks(result.stdout)
        if total_n == 0:
            ran = result.returncode == 0
            return Judgement(
                passed=ran,
                performance=1.0 if ran else 0.0,
                verifiability=Verifiability.VERIFIABLE,
                detail=result.stderr.strip()[:400] or "ran without error",
                limitations=("the task carried no checks; this only proves it ran",),
            )

        return Judgement(
            passed=passed_n == total_n,
            performance=passed_n / total_n,
            verifiability=Verifiability.VERIFIABLE,
            detail=f"{passed_n} of {total_n} checks passed",
            limitations=(
                "proves the cases the task checked, and says nothing about the others",
            ),
        )

    def generate_transfer_task(
        self, skill_id: str, *, seen: tuple[str, ...] = ()
    ) -> Task | None:
        """A recursion problem in a context the learner has not been given.

        Transfer means the same principle in an unfamiliar shape. Counting
        nested lists and summing digits share nothing on the surface with
        factorial, which is the point -- a learner who can do one because they
        memorised the other has not transferred anything.

        Returns None when everything has been seen. The policy layer must read
        that as "cannot measure transfer now", never as a failure: no task
        means no evidence, and no evidence is not bad evidence.
        """
        for task in _TRANSFER_TASKS:
            if task.skill_id == skill_id and task.task_id not in seen:
                return task
        return None


def _count_checks(stdout: str) -> tuple[int, int]:
    """Read `CHECK PASS` / `CHECK FAIL` lines out of the run's output.

    A printed protocol rather than a return value, because the learner's code
    runs in another process and its exit status only distinguishes "crashed"
    from "did not". Counting lines gives partial credit, which a returncode
    cannot express.
    """
    passed = sum(1 for line in stdout.splitlines() if line.strip() == "CHECK PASS")
    failed = sum(1 for line in stdout.splitlines() if line.strip() == "CHECK FAIL")
    return passed, passed + failed


def _check(expression: str, description: str) -> str:
    """One check line for a task's checker source."""
    return (
        f"try:\n"
        f"    print('CHECK PASS' if ({expression}) else 'CHECK FAIL')\n"
        f"except Exception:\n"
        f"    print('CHECK FAIL')  # {description}\n"
    )


_TRANSFER_TASKS: tuple[Task, ...] = (
    Task(
        task_id="count_nested",
        skill_id="python.recursion.apply_to_nested_structure",
        prompt=(
            "Write `count_items(x)` returning how many non-list values are inside x, "
            "at any depth. count_items([1, [2, [3, 4]], 5]) is 5."
        ),
        checker=(
            _check("count_items([]) == 0", "empty")
            + _check("count_items([1, 2, 3]) == 3", "flat")
            + _check("count_items([1, [2, [3, 4]], 5]) == 5", "nested")
            + _check("count_items([[[[1]]]]) == 1", "deep")
        ),
        expected_evidence=EvidenceStrength.INDEPENDENT_NOVEL_TRANSFER,
        is_novel_context=True,
    ),
    Task(
        task_id="sum_digits",
        skill_id="python.recursion.write_recursive_function",
        prompt="Write `sum_digits(n)` returning the sum of the digits of a non-negative int.",
        checker=(
            _check("sum_digits(0) == 0", "zero")
            + _check("sum_digits(7) == 7", "single")
            + _check("sum_digits(123) == 6", "multi")
            + _check("sum_digits(999) == 27", "carry-free")
        ),
        expected_evidence=EvidenceStrength.INDEPENDENT_APPLICATION,
        is_novel_context=True,
    ),
)
