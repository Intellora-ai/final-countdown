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

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from review_comments import (
    Comment,
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
