"""ADVERSARIAL TESTS for the wiring that carries a review out of the web UI.

WHAT THE WIRING IS FOR.

`ai-review` posts inline comments, and this repository's ruleset sets
`required_review_thread_resolution: true`, so each one must be resolved before
the pull request can merge. The comments are a gate. Acting on them, though,
still meant a human opening the pull request, scrolling Files-changed, and
remembering which threads were still open.

`scripts/review_comments.py` turned a review into rows. This is the half that
RUNS it: a job that fetches the review threads after the reviewer has spoken and
prints the open ones, so the findings reach a fixer without anybody transcribing
them.

WHY THESE ASSERTIONS AND NOT OTHERS.

Each one below is a way the job can keep existing, keep passing, and stop
working -- the failure shape this repository keeps closing:

    `all` instead of `open`   resolved threads come back as work forever and a
                              fix-loop reading them never terminates
    no `always()`             a skipped or failed reviewer skips the job too, so
                              threads still open from an earlier run go unread
    `continue-on-error`       a broken extractor reports nothing on a green check
    no `pipefail`             `gh api ... > threads.json` writes an empty file on
                              failure, `tee`/redirect returns 0, and the job is
                              green having read no review at all
    `github.event.*` in run   attacker-controlled text expanded into a shell;
                              CodeQL's `actions` pack, already run here, flags it

`test_the_wiring_is_actually_present` is the negative control for this file. A
`.get()` chain over a workflow that has been renamed returns empty structures,
and every assertion below would then pass while testing nothing at all.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
WORKFLOW = REPO / ".github" / "workflows" / "ai-review.yml"

#: The job that turns the posted review into rows.
JOB = "review-rows"


def workflow() -> dict[str, Any]:
    raw: Any = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(raw, dict), f"{WORKFLOW} did not parse as a mapping"
    return cast("dict[str, Any]", raw)


def jobs() -> dict[str, Any]:
    raw: Any = workflow().get("jobs")
    assert isinstance(raw, dict), "the workflow declares no jobs"
    return cast("dict[str, Any]", raw)


def job() -> dict[str, Any]:
    found: Any = jobs().get(JOB)
    assert isinstance(found, dict), (
        f"no '{JOB}' job in {WORKFLOW.name}; every assertion in this file would "
        "otherwise pass against an empty dict"
    )
    return cast("dict[str, Any]", found)


def steps() -> list[dict[str, Any]]:
    raw: Any = job().get("steps")
    assert isinstance(raw, list), f"'{JOB}' has no steps"
    return [
        cast("dict[str, Any]", s) for s in cast("list[Any]", raw) if isinstance(s, dict)
    ]


def runs() -> str:
    """Every shell body in the job, concatenated."""
    return "\n".join(str(s.get("run", "")) for s in steps())


# --- the negative control for this file --------------------------------------


def test_the_wiring_is_actually_present() -> None:
    """IF THIS FAILS, NOTHING ELSE IN THIS FILE MEANS ANYTHING.

    Every other test reads the job through `.get()` chains. Against a renamed or
    deleted job those return empty structures and "no continue-on-error" is
    trivially true of a job that does not exist.
    """
    assert JOB in jobs(), f"'{JOB}' is gone from {WORKFLOW.name}"
    assert steps(), f"'{JOB}' has no steps, so it does nothing"
    assert "scripts/review_comments.py" in runs(), (
        "the job no longer runs the extractor, so no review reaches anyone"
    )


# --- termination -------------------------------------------------------------


def test_the_job_reads_open_threads_not_all_of_them() -> None:
    """THE TERMINATION CONDITION, AND THE ONLY ONE-WORD BUG HERE.

    `all` emits resolved and outdated threads alongside the live ones. A loop
    driven off that re-fixes settled findings forever and has no reason to stop;
    worse, an outdated thread points at code the branch has already replaced, so
    acting on it edits a line that no longer means what the comment described.
    """
    body = runs()
    assert re.search(r"review_comments\.py\s+open\b", body), (
        "the job does not call `review_comments.py open`; with `all` it would "
        "hand a fixer threads that are already resolved, and the loop would "
        f"never terminate.\n{body}"
    )


# --- the job must not be able to vanish or soft-fail -------------------------


def test_the_job_runs_even_when_the_reviewer_did_not() -> None:
    """A skipped reviewer must not skip the read.

    `ai-review` is a no-op without its secret and can fail outright. In both
    cases threads left open by EARLIER runs are still unresolved work, and the
    default `needs:` behaviour would silently skip this job and report nothing.
    """
    condition = str(job().get("if", ""))
    assert "always()" in condition, (
        "the job does not run when `ai-review` is skipped or failed, so open "
        f"threads from earlier runs go unread. if: {condition!r}"
    )


def test_the_job_cannot_soft_fail() -> None:
    """`continue-on-error` here would make a broken extractor invisible.

    The job would go green having read nothing, which is the same "absence looks
    like health" failure the envelope check inside `review_comments.py` exists
    to prevent -- reintroduced one level up, in YAML.
    """
    assert job().get("continue-on-error") in (None, False), job().get(
        "continue-on-error"
    )
    for step in steps():
        assert step.get("continue-on-error") in (None, False), (
            f"step {step.get('name')!r} may fail silently"
        )


def test_a_failed_fetch_cannot_look_like_an_empty_review() -> None:
    """`set -o pipefail` and `set -e`, or a dead `gh api` writes an empty file.

    `gh api ... > threads.json` under GitHub's default shell reports the
    REDIRECT's status, not the API call's. Without `-e -o pipefail` a failed
    fetch leaves a zero-byte file, the step exits 0, and the only remaining
    guard is the envelope check in the Python. Defence in depth is the point:
    the shell should not be able to produce that file in the first place.
    """
    fetch = [s for s in steps() if "gh api" in str(s.get("run", ""))]
    assert fetch, "no step fetches the review threads"
    for step in fetch:
        body = str(step.get("run", ""))
        assert re.search(r"set -[a-z]*e[a-z]*o pipefail|set -o pipefail", body), (
            f"the fetch step {step.get('name')!r} does not set pipefail, so a "
            f"failed `gh api` writes an empty file and exits 0.\n{body}"
        )


# --- injection ---------------------------------------------------------------


def test_no_event_payload_reaches_a_shell() -> None:
    """Attacker-controlled text expanded into `run:` is command injection.

    A pull request title, body or branch name is written by whoever opened the
    pull request. The repository's rule is that such values reach a shell only
    through `env:`, where they arrive as data rather than as script. CodeQL's
    `actions` pack, which this repository already runs, flags the direct form.
    """
    body = runs()
    found = re.findall(r"\$\{\{\s*(github\.event\.[\w.]+|github\.head_ref)", body)
    assert not found, (
        f"event payload interpolated directly into a shell: {sorted(set(found))}. "
        "Pass it through `env:` instead."
    )


def test_the_job_asks_for_no_more_permission_than_it_needs() -> None:
    """It reads a review. It must not be able to change one.

    The workflow grants `pull-requests: write` and `id-token: write` for the
    reviewer. A read-only job inheriting write on the review it is reading is
    authority nobody needs, and the cheapest moment to scope it down is the one
    where the job is written.
    """
    perms: Any = job().get("permissions")
    assert isinstance(perms, dict), (
        "the job inherits the workflow's write permissions instead of scoping "
        "itself down to what reading a review needs"
    )
    scoped = cast("dict[str, Any]", perms)
    assert scoped.get("pull-requests") == "read", scoped
    assert "id-token" not in scoped, (
        f"a job that only reads a review requested an identity token: {scoped}"
    )


# --- what the SUMMARY says, which is the part a human actually reads ---------
#
# The envelope check inside `review_comments.py` stops a failed fetch exiting 0
# with zero rows. It does nothing about what the summary step then WRITES, and
# the summary is the only part of this job most people will ever look at.
#
# These tests execute the step's real shell body rather than matching strings in
# it, because the defect they were written for is a property of how `tee`
# behaves, not of how the YAML reads.


#: The step that renders the verdict. Selected by NAME rather than by "writes to
#: GITHUB_STEP_SUMMARY", because the fetch step legitimately writes there too
#: (the truncation warning) and matching on that picked up both.
REPORT_STEP = "Report the open comments"


def report_step() -> dict[str, Any]:
    found = [s for s in steps() if str(s.get("name", "")) == REPORT_STEP]
    assert len(found) == 1, (
        f"expected exactly one step named {REPORT_STEP!r}, found {len(found)}; "
        "the tests below execute its shell body and prove nothing without it"
    )
    return found[0]


def run_report(tmp_path: Path, *, rows: str | None, outcome: str) -> str:
    """Execute the summary step's actual shell body and return what it wrote.

    `rows=None` means the file was never created. `rows=""` is the case that
    matters: `tee` creates and truncates its output file BEFORE the command
    feeding it has produced anything, so a failed extractor leaves an EMPTY
    rows.jsonl behind, not a missing one.
    """
    body = str(report_step().get("run", ""))
    assert "${{" not in body, (
        "the summary body interpolates a GitHub expression directly into the "
        "shell, so it cannot be executed or tested in isolation — pass the "
        f"value through `env:` instead.\n{body}"
    )
    if rows is not None:
        (tmp_path / "rows.jsonl").write_text(rows, encoding="utf-8")
    summary = tmp_path / "summary.md"
    summary.touch()

    env = dict(os.environ)
    env["GITHUB_STEP_SUMMARY"] = str(summary)
    # `outcome=""` means the variable is NOT set at all, which is what an
    # unresolved `steps.<id>.outcome` expression actually produces.
    env.pop("EXTRACT_OUTCOME", None)
    if outcome:
        env["EXTRACT_OUTCOME"] = outcome
    subprocess.run(
        [shutil.which("bash") or "/bin/bash", "-c", body],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        # `check=False` deliberately: the assertions are about what the step
        # WROTE, not whether it exited 0. Raising here would hide the summary
        # text, which is the entire thing under test.
        check=False,
    )
    return summary.read_text(encoding="utf-8")


def test_a_failed_extract_is_never_summarised_as_nothing_to_fix(
    tmp_path: Path,
) -> None:
    """THE DEFECT. `tee` creates the file before the producer succeeds.

        python3 review_comments.py open ... | tee rows.jsonl

    `tee` truncates `rows.jsonl` immediately. When the extractor then exits
    non-zero having printed nothing, the file EXISTS and is EMPTY -- so a check
    of the form "the file is there, therefore the run was fine" reports a failed
    fetch as a clean review.

    The job does go red, which is not the point: the summary is what a human
    reads, and it would be telling them every thread is resolved at the exact
    moment nobody knows whether any thread was read. That is the same lie
    `envelope()` exists to prevent, one layer up, aimed at a person instead of a
    program.

    File existence is not evidence the producer succeeded. The step's OUTCOME is.
    """
    text = run_report(tmp_path, rows="", outcome="failure")
    assert "resolved" not in text.lower(), (
        "the summary told the reader every thread is resolved after the "
        f"extractor FAILED.\n---\n{text}\n---"
    )
    assert "could not" in text.lower() or "failed" in text.lower(), (
        f"the summary does not say the review could not be read.\n---\n{text}\n---"
    )


def test_a_genuinely_empty_review_is_still_summarised_as_empty(
    tmp_path: Path,
) -> None:
    """THE CONTROL. Without it, "always report failure" passes the test above.

    A reviewer with nothing to say is the ordinary case and must read as such.
    Turning every run into a warning is the other way to make the summary
    worthless.
    """
    text = run_report(tmp_path, rows="", outcome="success")
    assert "resolved" in text.lower(), (
        f"a clean review was not reported as clean.\n---\n{text}\n---"
    )
    assert "could not" not in text.lower(), (
        f"a clean review was reported as a failure.\n---\n{text}\n---"
    )


def test_open_comments_are_printed_verbatim_for_a_fixer_to_act_on(
    tmp_path: Path,
) -> None:
    """The rows are the product. A summary that drops them is a link to a log."""
    row = '{"path":"scripts/x.py","line":12,"body":"this swallows the error"}'
    text = run_report(tmp_path, rows=row + "\n", outcome="success")
    assert row in text, f"the rows never reached the summary.\n---\n{text}\n---"
    assert "resolved" not in text.lower(), (
        "a review WITH open comments was summarised as resolved"
    )


def test_a_missing_rows_file_is_a_failure_not_an_empty_review(
    tmp_path: Path,
) -> None:
    """The step can also die before `tee` runs at all -- same verdict required."""
    text = run_report(tmp_path, rows=None, outcome="failure")
    assert "resolved" not in text.lower(), (
        f"a missing rows file was summarised as a clean review.\n---\n{text}\n---"
    )


def test_an_unresolved_outcome_defaults_to_failure_not_success(
    tmp_path: Path,
) -> None:
    """FOUND BY A SURVIVING MUTANT. The fail-safe default is load-bearing.

    Flipping `${EXTRACT_OUTCOME:-failure}` to `:-success` broke nothing any test
    could see, because every test set the variable by hand. An expression that
    does not resolve produces an EMPTY value, and defaulting that to success
    puts the summary straight back into reporting a failed fetch as a clean
    review — the whole defect, restored by one word.

    Unknown must mean failure. A summary that cannot tell must say so.
    """
    text = run_report(tmp_path, rows="", outcome="")
    assert "resolved" not in text.lower(), (
        "an UNSET outcome was treated as success and summarised as a clean "
        f"review.\n---\n{text}\n---"
    )


def test_the_outcome_env_names_a_step_id_that_actually_exists() -> None:
    """FOUND BY A SURVIVING MUTANT, and the worse of the two.

    Deleting `id: extract` leaves `steps.extract.outcome` unresolvable. With the
    fail-safe default above, the summary then says "could not be read" on EVERY
    run, forever — including clean ones. A signal that never changes carries no
    information, and a permanently alarming check is one people stop reading,
    which is how the real failure gets through.

    The tests that execute the shell body cannot catch this: they set the
    variable themselves, so they prove the SCRIPT is right while saying nothing
    about whether the workflow WIRES it. This is the reverse-direction check —
    the same shape as a gate condition naming a step that no longer exists.
    """
    env = report_step().get("env")
    assert isinstance(env, dict), "the report step passes no env"
    expr = str(cast("dict[str, Any]", env).get("EXTRACT_OUTCOME", ""))
    match = re.search(r"steps\.([\w-]+)\.outcome", expr)
    assert match, f"EXTRACT_OUTCOME does not read a step outcome: {expr!r}"

    referenced = match.group(1)
    ids = {str(s.get("id")) for s in steps() if s.get("id")}
    assert referenced in ids, (
        f"the summary reads `steps.{referenced}.outcome`, but no step in "
        f"'{JOB}' has that id (ids present: {sorted(ids) or 'none'}). The "
        "expression resolves to empty on every run, so the summary reports a "
        "failed fetch forever — including on clean reviews."
    )


@pytest.mark.parametrize("name", ["threads.json"])
def test_the_fetched_payload_is_handed_to_the_checker(name: str) -> None:
    """The fetch and the read must name the same file.

    Two steps that each work while naming different files is a job that reports
    on a payload nobody fetched -- and, since a missing file is an error rather
    than an empty review, the failure would at least be loud. Asserting it here
    keeps it loud at the point of edit instead.
    """
    body = runs()
    assert body.count(name) >= 2, (
        f"{name} is not both written and read; the fetch and the check may be "
        f"pointing at different files.\n{body}"
    )
