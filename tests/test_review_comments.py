"""ADVERSARIAL TESTS for scripts/review_comments.py.

WHAT THIS IS FOR.

`ai-review` posts inline review comments, and the repository's ruleset sets
`required_review_thread_resolution: true`, so every one of them must be resolved
by a human before the pull request can merge. That makes the comments a gate
rather than a suggestion.

It also makes them a bottleneck. Reading them means opening the pull request,
scrolling the Files-changed tab, and remembering which threads are still open --
which is exactly the manual step this repository keeps removing everywhere else.
`scripts/ci_findings.py` turned a RUN into rows; this turns a REVIEW into rows,
so an agent can read every open comment, fix it, and push, without a human
transcribing anything.

WHAT IT REFUSES TO DO.

Report a resolved thread as outstanding. A loop driven off this data would
re-fix things that are already settled and never terminate, so `isResolved` is
load-bearing and tested in both directions.

NO SUBPROCESS, for the same reason as `ci_findings.py`: `security_gate.py` keeps
a bandit allowlist keyed by (rule, path), and a subprocess import here would
need an entry in a file this lane does not own. The workflow runs `gh api`; this
module reads the JSON.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from review_comments import (
    Comment,
    main,
    open_comments,
    parse_threads,
    to_jsonl,
)


def thread(
    *,
    resolved: bool = False,
    outdated: bool = False,
    path: str = "scripts/x.py",
    line: int | None = 12,
    body: str = "this swallows the error",
    author: str = "claude",
) -> dict[str, Any]:
    return {
        "id": f"T_{path}_{line}",
        "isResolved": resolved,
        "isOutdated": outdated,
        "comments": {
            "nodes": [
                {
                    "path": path,
                    "line": line,
                    "body": body,
                    "author": {"login": author},
                }
            ]
        },
    }


def payload(*threads: Any) -> dict[str, Any]:
    # `Any`, not `dict`, because a malformed node is a REAL input this
    # parser must survive — test_a_malformed_thread_does_not_hide_the
    # _threads_after_it passes a bare string on purpose. No assertion
    # changes; only the helper's declared contract widens to the truth.
    return {
        "data": {
            "repository": {"pullRequest": {"reviewThreads": {"nodes": list(threads)}}}
        }
    }


# --- parsing -----------------------------------------------------------------


def test_a_thread_becomes_one_row_with_file_and_line() -> None:
    """A row without a location is a comment nobody can act on."""
    got = parse_threads(payload(thread()))
    assert len(got) == 1
    c = got[0]
    assert c.path == "scripts/x.py"
    assert c.line == 12
    assert "swallows the error" in c.body
    assert c.author == "claude"
    assert c.resolved is False


def test_the_first_comment_in_a_thread_is_the_finding() -> None:
    """Replies are conversation. The opening comment is the claim to fix."""
    t = thread(body="the finding")
    t["comments"]["nodes"].append(
        {
            "path": "scripts/x.py",
            "line": 12,
            "body": "a reply",
            "author": {"login": "human"},
        }
    )
    got = parse_threads(payload(t))
    assert len(got) == 1, "a thread is one finding, not one row per reply"
    assert got[0].body == "the finding"


def test_a_thread_with_no_comments_is_skipped_not_crashed() -> None:
    """The API can return an empty thread. A parser that dies here reports none."""
    empty = thread()
    empty["comments"]["nodes"] = []
    assert parse_threads(payload(empty, thread())) != []


def test_an_empty_payload_yields_no_rows() -> None:
    assert parse_threads({"data": {}}) == []
    assert parse_threads({}) == []


# --- the filter that decides what a fix-loop sees ----------------------------


def test_resolved_threads_are_excluded_from_open_work() -> None:
    """THE TERMINATION CONDITION. Without it a fix-loop never finishes.

    A resolved thread is settled. Feeding it back to an agent means re-fixing
    something already agreed, forever, and the loop has no reason to stop.
    """
    got = open_comments(
        parse_threads(payload(thread(resolved=True), thread(resolved=False, line=44)))
    )
    assert len(got) == 1
    assert got[0].line == 44


def test_outdated_threads_are_excluded() -> None:
    """An outdated thread points at code the branch has already replaced.

    Acting on it edits a line that no longer exists, which is worse than
    ignoring it: the fix lands somewhere arbitrary.
    """
    got = open_comments(parse_threads(payload(thread(outdated=True))))
    assert got == []


def test_everything_open_is_kept() -> None:
    got = open_comments(
        parse_threads(payload(thread(line=1), thread(line=2), thread(line=3)))
    )
    assert [c.line for c in got] == [1, 2, 3]


def test_open_comments_on_an_empty_list_is_empty_not_an_error() -> None:
    assert open_comments([]) == []


# --- machine-readable output -------------------------------------------------


def test_to_jsonl_is_one_object_per_line_and_parses() -> None:
    rows = parse_threads(payload(thread(line=1), thread(line=2)))
    text = to_jsonl(rows)
    lines = [x for x in text.splitlines() if x.strip()]
    assert len(lines) == 2
    for line in lines:
        json.loads(line)


def test_a_row_carries_everything_needed_to_act_without_the_pull_request() -> None:
    """The point of the file: an agent reads THIS and needs nothing else."""
    d = parse_threads(payload(thread()))[0].as_dict()
    for key in ("path", "line", "body", "author", "resolved", "thread_id"):
        assert key in d, f"a fixer cannot act without {key}"


def test_the_module_shells_out_to_nothing() -> None:
    """`security_gate.py`'s bandit allowlist is keyed by (rule, path).

    A subprocess import here would need an entry in a file this lane does not
    own, so fetching stays the caller's job and this module reads JSON.
    """
    src = (REPO / "scripts" / "review_comments.py").read_text(encoding="utf-8")
    assert "import subprocess" not in src
    assert "subprocess.run" not in src


def test_comment_is_serialisable() -> None:
    c = Comment(
        thread_id="T1",
        path="a.py",
        line=1,
        body="b",
        author="claude",
        resolved=False,
        outdated=False,
    )
    json.loads(json.dumps(c.as_dict()))


# --- HARD CASES: what a real review comment actually looks like --------------
#
# Every test above used a one-line body. Real `ai-review` comments are prose
# with code fences, quotes, backslashes and arrows in them. The rows are a
# JSONL file -- one object per LINE -- so a body containing a newline is the
# single input most able to destroy the format, and with it every row after it.


REAL_BODY = """The error path here swallows the failure.

```python
except Exception:
    pass  # "silently" drops it
```

`run()` returns None -> the caller reads it as success.
Suggest: re-raise, or return a typed Result. See C:\\path\\thing.
Severity: high -- this is the shape #69 warned about. 🚨"""


def test_a_multiline_body_does_not_break_the_one_object_per_line_format() -> None:
    """THE FORMAT-DESTROYING INPUT. A real comment has newlines and code fences.

    JSONL means one object per LINE. If a body's newlines reach the output, one
    comment becomes many lines, every one of them invalid JSON, and a reader
    loses not just that row but the whole file after it.
    """
    rows = parse_threads(payload(thread(body=REAL_BODY), thread(line=99, body="short")))
    text = to_jsonl(rows)

    lines = [x for x in text.splitlines() if x.strip()]
    assert len(lines) == 2, (
        f"a multiline body produced {len(lines)} lines instead of 2 — the JSONL "
        "format is broken and every row after it is unreadable"
    )
    for line in lines:
        json.loads(line)


def test_the_body_survives_the_round_trip_exactly() -> None:
    """A fixer acts on the TEXT. Losing a character changes the instruction.

    Code fences, backslashes, quotes and the arrow all have to come back byte
    for byte, or the agent reading the row is acting on a different comment
    from the one the reviewer wrote.
    """
    rows = parse_threads(payload(thread(body=REAL_BODY)))
    back = json.loads(to_jsonl(rows).splitlines()[0])
    assert back["body"] == REAL_BODY, "the body changed on the way through"
    assert "```python" in back["body"], "the code fence was lost"
    assert "\\path\\thing" in back["body"], "backslashes were mangled"
    assert "🚨" in back["body"], "non-ascii was lost"


def test_a_file_level_comment_with_no_line_is_still_actionable() -> None:
    """GitHub returns line=null for a comment on the file, not a line.

    Dropping those loses whole-file findings, which are usually the structural
    ones. The row must survive with the path intact and the line honestly null.
    """
    rows = open_comments(parse_threads(payload(thread(line=None))))
    assert len(rows) == 1, "a file-level comment was dropped"
    assert rows[0].path == "scripts/x.py"
    assert rows[0].line is None
    assert json.loads(to_jsonl(rows).splitlines()[0])["line"] is None


def test_order_is_preserved_so_two_runs_agree() -> None:
    """A loop diffs its work between passes. Reordered rows read as new work."""
    rows = parse_threads(payload(thread(line=3), thread(line=1), thread(line=2)))
    assert [c.line for c in rows] == [3, 1, 2], "input order was not preserved"


def test_a_malformed_thread_does_not_hide_the_threads_after_it() -> None:
    """One bad node must not cost the rest of the review.

    This is the failure this repository keeps closing: a parser that dies on
    input reports nothing, and nothing reads as clean.
    """
    broken = {"id": "T_broken", "isResolved": False}  # no comments key at all
    rows = parse_threads(payload(broken, thread(line=7), "not-a-dict", thread(line=8)))
    assert [c.line for c in rows] == [7, 8], (
        "a malformed thread swallowed the valid ones after it"
    )


def test_a_thread_missing_author_or_path_still_produces_a_row() -> None:
    """Partial data is still a finding. Silence about it is not acceptable."""
    bare = {
        "id": "T_bare",
        "isResolved": False,
        "isOutdated": False,
        "comments": {"nodes": [{"body": "something is wrong"}]},
    }
    rows = parse_threads(payload(bare))
    assert len(rows) == 1
    assert rows[0].body == "something is wrong"
    assert rows[0].line is None


# --- A FAILED FETCH MUST NOT LOOK LIKE A CLEAN REVIEW ------------------------
#
# Everything above tests the PARSER, whose leniency is deliberate: one malformed
# thread must never cost the threads after it. That leniency is correct inside a
# node list and catastrophic at the envelope, because these two payloads
# currently produce identical output and an identical exit code:
#
#     {"errors": [...], "data": {"repository": null}}      the fetch FAILED
#     {"data": {... "reviewThreads": {"nodes": []}}}       the review is CLEAN
#
#     $ review_comments.py open --threads err.json   ->  "# 0 thread(s)", exit 0
#     $ review_comments.py open --threads empty.json ->  "# 0 thread(s)", exit 0
#
# Measured, not assumed. A workflow reading that cannot tell "the reviewer had
# nothing to say" from "we never reached GitHub" -- and it would report the
# second as the first, on a green check, forever. That is the shape this
# repository keeps closing: absence read as health.
#
# GraphQL makes it likely rather than theoretical. A bad PR number, a missing
# `pull-requests: read` scope, and a schema change all return HTTP 200 with an
# `errors` array, so `gh api` exits 0 and `set -e` never fires. The envelope is
# the only place that failure is visible.


def error_payload(*messages: str, data: Any = None) -> dict[str, Any]:
    """What GitHub GraphQL actually returns on failure: HTTP 200 + `errors`."""
    return {"data": data, "errors": [{"message": m} for m in messages]}


def good_payload(*threads: Any) -> dict[str, Any]:
    return payload(*threads)


def run(tmp_path: Path, doc: Any, cmd: str = "open") -> int:
    p = tmp_path / "threads.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    return main([cmd, "--threads", str(p)])


def test_a_genuinely_empty_review_still_exits_clean(tmp_path: Path) -> None:
    """THE CONTROL FOR THIS WHOLE GROUP. Without it, "reject everything" passes.

    A reviewer with nothing to say is the SUCCESS case and the most common one.
    If it cannot be told apart from a failure in the other direction, the fix for
    the silent-failure bug is just a different silent failure: a permanently red
    check that people learn to scroll past.
    """
    assert run(tmp_path, good_payload()) == 0


def test_a_graphql_error_payload_is_not_reported_as_zero_open_comments(
    tmp_path: Path,
) -> None:
    """THE BUG. A failed fetch must never exit 0 with an empty result.

    This is the realistic failure: a wrong PR number or a missing
    `pull-requests: read` scope returns HTTP 200 with an `errors` array, so
    `gh api` succeeds, `set -e` does not fire, and the only thing standing
    between that and "no review comments found" is this check.
    """
    rc = run(tmp_path, error_payload("Could not resolve to a Repository"))
    assert rc != 0, (
        "a GraphQL error payload exited 0 with zero rows — indistinguishable "
        "from a clean review, which is how a broken fix-loop reports success"
    )


def test_the_error_text_reaches_stderr_so_the_log_says_why(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A non-zero exit with no reason costs whoever reads the log the diagnosis.

    The message GitHub sent is the entire diagnostic value of the failure; a
    bare exit code sends a reader to guess between auth, scope and schema.
    """
    run(tmp_path, error_payload("Resource not accessible by integration"))
    err = capsys.readouterr().err
    assert "Resource not accessible by integration" in err, (
        f"GitHub's own error text was dropped; stderr was: {err!r}"
    )


def test_an_off_spec_errors_value_still_says_what_it_was(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """FOUND BY A SURVIVING MUTANT. The exit code was right; the message was not.

    GraphQL specifies `errors` as a list, so a bare string is off-spec -- which
    is exactly when a reader most needs to see the value. Dropping it still
    failed the job, so no test noticed, and whoever opened the log got a
    non-zero exit with an empty reason: the same diagnostic loss as dropping the
    message entirely, reachable through a shape nobody anticipated.
    """
    assert run(tmp_path, {"data": None, "errors": "the query is malformed"}) != 0
    assert "the query is malformed" in capsys.readouterr().err, (
        "an unrecognised `errors` shape was reported as a failure with no reason"
    )


def test_partial_data_alongside_errors_is_a_failure_not_a_partial_review(
    tmp_path: Path,
) -> None:
    """THE HARDEST CASE, AND THE MOST DANGEROUS ONE.

    GraphQL can answer with BOTH: some threads resolved, some field errored.
    Emitting the threads that survived would report a fraction of the review as
    if it were all of it, and a fix-loop would then declare the pull request
    clean having never seen the rest. Fewer findings than exist is worse than
    none, because it looks like progress.
    """
    doc = error_payload("Something went wrong while executing your query")
    doc["data"] = good_payload(thread(), thread(line=44))["data"]
    assert run(tmp_path, doc) != 0, (
        "errors alongside data were ignored and a PARTIAL review was emitted "
        "as if it were the whole one"
    )


def test_a_pull_request_that_does_not_resolve_is_a_failure(tmp_path: Path) -> None:
    """`pullRequest: null` with no `errors` key at all — a real GraphQL shape.

    Querying a number that is not a pull request in this repository returns a
    null node rather than an error. Treating that as an empty review means a
    workflow pointed at the wrong number reports every pull request clean.
    """
    doc = {"data": {"repository": {"pullRequest": None}}}
    assert run(tmp_path, doc) != 0


def test_a_repository_that_does_not_resolve_is_a_failure(tmp_path: Path) -> None:
    assert run(tmp_path, {"data": {"repository": None}}) != 0


def test_a_truncated_or_empty_response_is_a_failure(tmp_path: Path) -> None:
    """A zero-byte or half-written file is what a killed `gh api` leaves behind.

    `{}` is the shape on disk when the fetch died mid-write or wrote nothing.
    It must not parse as a review with no comments in it.
    """
    assert run(tmp_path, {}) != 0
    assert run(tmp_path, {"data": {}}) != 0


def test_reviewthreads_that_carries_no_node_list_is_a_failure(tmp_path: Path) -> None:
    """FOUND BY A SURVIVING MUTANT, not by reading the code.

    Deleting the node-list check changed nothing any test could see, because
    every other malformed payload here fails earlier in the walk. The shape it
    left unguarded is the one a QUERY EDIT produces: change `nodes` to
    `totalCount` in the workflow's GraphQL and the response still has a
    `reviewThreads` object, still parses, and yields zero rows.

    `totalCount: 3` below is the point. Three threads exist, the response says
    so, and without this check the answer is "no open comments".
    """
    doc = {
        "data": {"repository": {"pullRequest": {"reviewThreads": {"totalCount": 3}}}}
    }
    assert run(tmp_path, doc) != 0, (
        "a response naming three threads but carrying no node list was reported "
        "as a clean review"
    )


def test_the_envelope_check_applies_to_the_all_subcommand_too(
    tmp_path: Path,
) -> None:
    """`all` reads the same payload; a fetch failure is a failure in both modes.

    Checking only the path a fix-loop happens to call today leaves the other
    subcommand as the way back into the bug.
    """
    assert run(tmp_path, error_payload("boom"), cmd="all") != 0
    assert run(tmp_path, good_payload(), cmd="all") == 0


def test_a_valid_review_with_findings_still_exits_clean(tmp_path: Path) -> None:
    """Open comments are the working state, not an error state.

    A fix-loop reads rows and acts on them; a non-zero exit here would make
    "the reviewer found something" indistinguishable from "the fetch broke",
    which is the original bug pointed the other way.
    """
    assert run(tmp_path, good_payload(thread(), thread(line=44))) == 0
