#!/usr/bin/env python3
"""REVIEW COMMENTS — a pull request review, as rows an agent can act on.

WHY THIS EXISTS.

`ai-review` posts inline review comments, and this repository's ruleset sets
`required_review_thread_resolution: true`. So every comment it leaves must be
resolved by a human before the pull request can merge: the comments are a gate,
not a suggestion.

That also makes them a bottleneck. Acting on them means opening the pull
request, scrolling Files-changed, and keeping track of which threads are still
open. `scripts/ci_findings.py` turned a RUN into rows for exactly this reason;
this turns a REVIEW into rows, so a fixer can read every open comment, change
the code, and push, with nobody transcribing anything by hand.

THE ONE RULE THAT MAKES A FIX-LOOP TERMINATE.

A resolved thread is settled and must never come back as work. Feed one to an
agent and it re-fixes something already agreed, forever. `open_comments()` drops
resolved threads, and drops outdated ones too: an outdated thread points at code
the branch has already replaced, so acting on it edits a line that no longer
exists, which is worse than ignoring it.

WHERE THE DATA COMES FROM. Resolution state is not in the REST comments
endpoint; it lives on GraphQL `reviewThreads`. The caller fetches it:

    gh api graphql -f query='
      { repository(owner:"OWNER", name:"NAME") {
          pullRequest(number: N) {
            reviewThreads(first: 100) {
              nodes {
                id isResolved isOutdated
                comments(first: 1) { nodes { path line body author { login } } }
              } } } } }' > threads.json

    python3 scripts/review_comments.py open --threads threads.json

NO SUBPROCESS, deliberately, for the same reason as `ci_findings.py`:
`scripts/security_gate.py` keeps a bandit allowlist keyed by (rule, path), and a
subprocess import here would need an entry in a file this lane does not own.
`tests/test_review_comments.py::test_the_module_shells_out_to_nothing` keeps it
that way.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast


@dataclass(frozen=True)
class Comment:
    """One review thread, reduced to the thing a fixer has to act on."""

    thread_id: str
    path: str
    line: int | None
    body: str
    author: str
    resolved: bool
    outdated: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "thread_id": self.thread_id,
            "path": self.path,
            "line": self.line,
            "body": self.body,
            "author": self.author,
            "resolved": self.resolved,
            "outdated": self.outdated,
        }


class PayloadError(Exception):
    """The response is not a review GitHub answered, so it has no rows to give."""


def envelope(payload: Any) -> None:
    """Raise unless this response is a review GitHub actually answered.

    WHY THIS IS SEPARATE FROM `parse_threads`, AND WHY BOTH ARE CORRECT.

    Inside the node list, leniency is the right policy: one malformed thread
    must never cost the threads after it, because a parser that dies on input
    reports nothing and nothing reads as clean. At the ENVELOPE the same
    leniency is the bug, because these two are otherwise identical:

        {"errors": [...], "data": {"repository": null}}   the fetch FAILED
        {"data": {... "reviewThreads": {"nodes": []}}}    the review is CLEAN

    Both used to print `# 0 thread(s)` and exit 0. A loop reading that reports
    "no open comments" when the truth is "we never reached GitHub" -- absence
    read as health, on a green check, indefinitely.

    GRAPHQL IS WHY THIS IS LIKELY RATHER THAN THEORETICAL. A wrong pull request
    number, a missing `pull-requests: read` scope and a schema change all return
    HTTP 200 with an `errors` array. `gh api` exits 0, `set -e` never fires, and
    this function is the only place that failure becomes visible.

    `errors` IS CHECKED BEFORE `data` ON PURPOSE. GraphQL may answer with both:
    some threads resolved, one field errored. Emitting the survivors would
    report a fraction of a review as the whole of it, and a fix-loop would call
    the pull request clean having never seen the rest. Fewer findings than exist
    is worse than none, because it looks like progress.
    """
    if not isinstance(payload, dict):
        raise PayloadError(f"response is {type(payload).__name__}, not an object")
    doc = cast("dict[str, Any]", payload)

    raw_errors: Any = doc.get("errors")
    if raw_errors:
        # A non-list `errors` is off-spec but must still be reported rather than
        # dropped: wrapping it keeps the value in the message instead of turning
        # an unrecognised shape into silence.
        items: list[Any] = (
            cast("list[Any]", raw_errors)
            if isinstance(raw_errors, list)
            else [raw_errors]
        )
        said = [
            str(cast("dict[str, Any]", e).get("message", e))
            if isinstance(e, dict)
            else str(e)
            for e in items
        ]
        raise PayloadError("GitHub returned errors: " + "; ".join(said))

    node: Any = doc.get("data")
    for key in ("repository", "pullRequest", "reviewThreads"):
        if not isinstance(node, dict):
            raise PayloadError(
                f"response has no {key}, so no review was read"
                if node is None
                else f"{key} is {type(node).__name__}, not an object"
            )
        node = cast("dict[str, Any]", node).get(key)

    if not isinstance(node, dict):
        raise PayloadError("response has no reviewThreads, so no review was read")
    nodes: Any = cast("dict[str, Any]", node).get("nodes")
    if not isinstance(nodes, list):
        # An EMPTY list is fine and common -- a reviewer with nothing to say is
        # the success case. A MISSING list is a response that never carried one.
        raise PayloadError("reviewThreads has no node list, so no review was read")


def parse_threads(payload: dict[str, Any]) -> list[Comment]:
    """GraphQL reviewThreads payload -> one row per thread.

    ONE ROW PER THREAD, NOT PER COMMENT. A thread is one finding; the replies
    under it are the conversation about that finding. Emitting a row per reply
    would make a long argument look like many separate problems, and a fixer
    would try to "fix" a human saying "agreed, nice catch".

    Missing keys are treated as absent rather than fatal. This payload arrives
    from a network call, and a parser that dies on one malformed thread reports
    NONE of the others -- the failure mode being avoided everywhere else here.
    """
    try:
        nodes = payload["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    except (KeyError, TypeError):
        return []
    if not isinstance(nodes, list):
        return []

    out: list[Comment] = []
    for raw in cast("list[Any]", nodes):
        if not isinstance(raw, dict):
            continue
        node = cast("dict[str, Any]", raw)
        # Every hop out of this payload is `Any` until it is narrowed, and an
        # un-narrowed `Any` silently defeats the type checker for everything
        # downstream of it. Each level is checked and cast explicitly rather
        # than trusted, because this data arrives from a network call and a
        # shape change upstream must surface as a skipped row, never a crash.
        raw_comments: Any = node.get("comments")
        if not isinstance(raw_comments, dict):
            continue
        raw_inner: Any = cast("dict[str, Any]", raw_comments).get("nodes")
        if not isinstance(raw_inner, list) or not raw_inner:
            # A thread with no comments carries no finding. Skipping it must not
            # stop the threads after it from being reported.
            continue
        inner = cast("list[Any]", raw_inner)
        if not isinstance(inner[0], dict):
            continue
        first = cast("dict[str, Any]", inner[0])
        raw_author: Any = first.get("author")
        author = (
            cast("dict[str, Any]", raw_author) if isinstance(raw_author, dict) else {}
        )
        out.append(
            Comment(
                thread_id=str(node.get("id", "")),
                path=str(first.get("path", "")),
                line=first.get("line"),
                body=str(first.get("body", "")),
                author=str(author.get("login", "")),
                resolved=bool(node.get("isResolved", False)),
                outdated=bool(node.get("isOutdated", False)),
            )
        )
    return out


def open_comments(comments: Iterable[Comment]) -> list[Comment]:
    """Only the threads that are still real work.

    Resolved is the termination condition for any loop built on this. Outdated
    is the correctness one: the code it refers to is gone, so a fix would land
    on a line that no longer means what the comment described.
    """
    return [c for c in comments if not c.resolved and not c.outdated]


def to_jsonl(comments: Iterable[Comment]) -> str:
    """One JSON object per line. The interface a fixer reads."""
    return "".join(json.dumps(c.as_dict(), sort_keys=True) + "\n" for c in comments)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="A pull request review, as rows.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, helptext in (
        ("open", "only unresolved, non-outdated threads"),
        ("all", "every thread, with its state"),
    ):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("--threads", type=Path, required=True)

    args = ap.parse_args(argv)
    raw: Any = json.loads(args.threads.read_text(encoding="utf-8"))

    # BEFORE ANY ROWS ARE EMITTED. A response this check rejects has no rows to
    # give, and printing the ones that happened to survive would report a
    # fraction of a review as the whole of it.
    try:
        envelope(raw)
    except PayloadError as exc:
        print(f"# could not read the review: {exc}", file=sys.stderr)
        return 2

    rows = parse_threads(cast("dict[str, Any]", raw) if isinstance(raw, dict) else {})
    if args.cmd == "open":
        rows = open_comments(rows)

    sys.stdout.write(to_jsonl(rows))
    print(f"# {len(rows)} thread(s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
