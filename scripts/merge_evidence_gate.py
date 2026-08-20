#!/usr/bin/env python3
"""MERGE-EVIDENCE GATE — a number in a pull request body is a claim until a log says otherwise.

WHY THIS EXISTS. Pull request #28 was merged with the sentence "42 AXLE calls before, 13 after".
The real figures were 9 and 3. The measurement that refutes the claim -- `13 passed, 772 deselected
in 14.17s` against `22.27s` -- was sitting in a job log of the same run, and had been for the whole
review. Seventeen required checks were green. Nothing in the system was looking at the arithmetic.

WHAT THIS GATE CHECKS, STATED EXACTLY. The tempting target is "prove the author read the logs", and
it is the wrong one: comprehension is not machine-checkable, and a gate that claims to check it is
itself an unsupported claim. The checkable requirement is narrower:

    For EVERY required job:   API/check evidence proves latest-SHA identity and terminal success.
    For every FAILED job:     its log is fetched and a failure dossier is produced.
    For every MEASURED claim: the cited log or API evidence is fetched, and derived values are
                              recomputed from the rows they name.

It does NOT download or interpret every successful job's complete raw log, and it does not say it
does. That would add API calls and latency to every merge without touching the failure above.

THE PR BODY IS UNTRUSTED INPUT. This repository is public; anyone may open a pull request from a
fork, and this gate parses that body and acts on run IDs and formulas found in it. Every decision
below that looks paranoid is load-bearing: the formula evaluator is a whitelisted AST walk rather
than `eval`, run IDs are checked to belong to this repository before any fetch, and log text is
never interpolated into a command or a path.

WHAT THIS GATE IS NOT. See docs/merge-evidence.md. Briefly: a required status check blocks a merge
only while its own enforcement code is trusted. A pull request able to edit this file, the workflow
that runs it, or the ruleset policy that requires it, and still merge, is not stopped by it.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import time
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol, cast

SCRIPTS = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from gate import Gate  # noqa: E402  (path insert above is deliberate)

#: The only repository this gate speaks about. A run ID lifted from a PR body is
#: attacker-chosen; without this check it could name a run in someone else's
#: repository and this gate would dutifully fetch it and treat it as evidence.
REPOSITORY = "Intellora-ai/final-countdown"

#: Closed vocabulary. An unrecognised unit is refused rather than guessed at,
#: because guessing "m" means minutes and not metres is exactly the kind of
#: silent conversion that produces a wrong number nobody can trace.
UNITS = frozenset({"seconds", "ms", "calls", "tests", "percent", "x", "bytes", "count"})

ROW_TYPES = frozenset({"current", "baseline", "derived"})
SOURCES = frozenset({"log", "api", "formula"})

#: A derived value must land within the tighter of an absolute and a relative
#: bound. Rounding a real 8.0999 to 8.10 is honest; 8.5 is not.
ABS_TOLERANCE = 0.005
REL_TOLERANCE = 0.001

#: Bounds on untrusted input. Refusing is cheap; churning on a crafted body is not.
MAX_BODY_BYTES = 256 * 1024
MAX_ROWS = 64
MAX_FORMULA_CHARS = 200
MAX_FORMULA_DEPTH = 12

#: Fetch budget. Fail closed on exhaustion -- an unreachable API is an unknown
#: evidence state, and an unknown evidence state is never a pass.
FETCH_TIMEOUT_S = 30
FETCH_RETRIES = 1
TOTAL_BUDGET_S = 120

HEADING = re.compile(r"^\s{0,3}#{1,6}\s+Measured\s+Evidence\s*$", re.IGNORECASE | re.MULTILINE)

#: GitHub prefixes every log line with an RFC3339 timestamp and may embed ANSI
#: colour. Both are transport, not content: matching against them would make a
#: claim's provability depend on when it ran.
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?", re.MULTILINE)

NUMBER_IN_TEXT = re.compile(r"-?\d+(?:\.\d+)?")

# --------------------------------------------------------------------------
# Unsupported-claim detection.
#
# REUSED SHAPE, NOT REUSED CODE. ~/.claude/hooks/accountant-dad-commit-bound-metrics.py
# solved this exact problem for progress documents: a number with a unit, next
# to a measurement word, with no provenance nearby. Its docstring carries the
# lesson that matters more than the regex -- "deliberately narrow -- the cost of
# a false positive is that someone disables the whole layer." A gate that blocks
# `2 x 4 + 1 = 9` or `correspondence_gate.py:192-193` gets switched off within a
# week, and then it enforces nothing at all.
#
# Measured before choosing this: the bodies of pull requests #21-#28 carry
# between 10 and 56 numbers each, of which 0 to 20 bear a unit. A rule that
# demanded every number appear in the evidence table would block all eight.
# --------------------------------------------------------------------------
CLAIM_NUMBER = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:%|percent\b|ms\b|s\b|sec\b|secs\b|seconds?\b|x\b|calls?\b|tests?\b)")

CLAIM_METRIC = re.compile(
    r"\b(measured|benchmark(?:ed)?|coverage|mutation|score|duration|elapsed|latency"
    r"|throughput|speedup|faster|slower|reduced?|reduction|saved|improvement"
    r"|runtime|wall[- ]?clock|p50|p95|p99)\b",
    re.IGNORECASE)

#: A threshold is a requirement the project set. It belongs to no run, so
#: `900-second target` and `--min-score 0.95` must never be flagged.
CLAIM_REQUIREMENT = re.compile(
    r"\b(target|threshold|floor|ceiling|budget|cap|minimum|maximum|at least|at most"
    r"|must|should|required|requirement|contract|limit|goal|SLA)\b",
    re.IGNORECASE)

#: Provenance sitting on the line or within the window: a run ID, a SHA, a row
#: reference into the evidence table, or an explicit statement that no
#: measurement is being claimed.
CLAIM_PROVENANCE = re.compile(
    r"\b(?:run\s*\d{6,}|[0-9a-f]{7,40}|R\d+\b|see\s+Measured\s+Evidence"
    r"|UNMEASURED|NOT\s+MEASURED|ESTIMATE|WITHDRAWN)\b",
    re.IGNORECASE)

CLAIM_WINDOW = 2


class EvidenceError(Exception):
    """A refusal with a reason. Every raise site names the state that blocked."""

    def __init__(self, state: str, detail: str, fix: str = "") -> None:
        super().__init__(detail)
        self.state = state
        self.detail = detail
        self.fix = fix


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------
def normalize_log(text: str) -> str:
    """Strip transport, keep content. Raw text stays the record; this is for matching only."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = ANSI.sub("", text)
    text = TIMESTAMP.sub("", text)
    return "\n".join(" ".join(line.split()) for line in text.split("\n"))


def normalize_marker(marker: str) -> str:
    return " ".join(ANSI.sub("", marker.strip().strip("`")).split())


def close_enough(claimed: float, actual: float) -> bool:
    """Within the looser of an absolute and a relative bound."""
    return abs(claimed - actual) <= max(ABS_TOLERANCE, abs(actual) * REL_TOLERANCE)


def value_present_in(marker: str, claimed: float) -> bool:
    """Does the claimed number actually occur in the evidence the row points at?

    THE WHOLE GATE TURNS ON THIS FUNCTION. A row may cite a marker that exists in
    the log while claiming a value the marker contradicts -- that is precisely
    what "42 AXLE calls -> 13" was. Finding the marker is not enough; the number
    has to be in it.
    """
    return any(close_enough(claimed, float(m)) for m in NUMBER_IN_TEXT.findall(marker))


# --------------------------------------------------------------------------
# Formula evaluation
# --------------------------------------------------------------------------
_ALLOWED_CALLS = {"max": max, "min": min, "abs": abs, "round": round}
_ROW_ID = re.compile(r"^R\d{1,3}$")


def safe_eval(formula: str, values: dict[str, float]) -> float:
    """Evaluate a derived row's arithmetic without ever executing the PR body.

    `eval` on attacker-controlled text is remote code execution with extra steps.
    This walks the parsed tree and refuses every node it was not told about, so
    `__import__("os").system(...)` fails at the `Attribute` node rather than at
    a blocklist that forgot a spelling.
    """
    if len(formula) > MAX_FORMULA_CHARS:
        raise EvidenceError("MALFORMED", f"formula longer than {MAX_FORMULA_CHARS} characters")
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as exc:
        raise EvidenceError("MALFORMED", f"formula is not an expression: {exc}") from exc

    def walk(node: ast.AST, depth: int) -> float:
        if depth > MAX_FORMULA_DEPTH:
            raise EvidenceError("MALFORMED", "formula nested deeper than allowed")
        if isinstance(node, ast.Expression):
            return walk(node.body, depth + 1)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise EvidenceError("MALFORMED", f"non-numeric constant {node.value!r}")
            return float(node.value)
        if isinstance(node, ast.Name):
            if not _ROW_ID.match(node.id):
                raise EvidenceError("MALFORMED", f"formula names {node.id!r}, not a row ID")
            if node.id not in values:
                raise EvidenceError("UNKNOWN", f"formula references undeclared row {node.id}")
            return values[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            operand = walk(node.operand, depth + 1)
            return -operand if isinstance(node.op, ast.USub) else operand
        if isinstance(node, ast.BinOp):
            left, right = walk(node.left, depth + 1), walk(node.right, depth + 1)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                if right == 0:
                    raise EvidenceError("MALFORMED", "formula divides by zero")
                return left / right
            raise EvidenceError("MALFORMED", f"operator {type(node.op).__name__} not permitted")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_CALLS:
                raise EvidenceError("MALFORMED", "only max, min, abs and round may be called")
            if node.keywords:
                raise EvidenceError("MALFORMED", "keyword arguments are not permitted")
            args = [walk(a, depth + 1) for a in node.args]
            if not args:
                raise EvidenceError("MALFORMED", f"{node.func.id}() needs arguments")
            return float(_ALLOWED_CALLS[node.func.id](*args))
        raise EvidenceError("MALFORMED", f"{type(node).__name__} is not permitted in a formula")

    return walk(tree, 0)


# --------------------------------------------------------------------------
# The evidence table
# --------------------------------------------------------------------------
@dataclass
class Row:
    row_id: str
    row_type: str
    metric: str
    value: float
    unit: str
    sha: str
    run_id: str
    source: str
    evidence: str
    line_no: int


def _cells(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return []
    return [c.strip() for c in stripped.strip("|").split("|")]


def parse_table(body: str) -> list[Row]:
    """Read the `## Measured Evidence` section. Absent section means no rows, not an error."""
    match = HEADING.search(body)
    if match is None:
        return []

    lines = body[match.end():].split("\n")
    rows: list[Row] = []
    base = body[:match.end()].count("\n") + 1
    seen_header = False

    for offset, line in enumerate(lines):
        cells = _cells(line)
        if not cells:
            if rows or seen_header:
                break          # table ended
            if line.strip().startswith("#"):
                break          # next section before any table
            continue
        if all(set(c) <= {"-", ":", " "} for c in cells if c):
            continue           # the |---|---| separator
        if not seen_header:
            seen_header = True
            continue           # the header row

        line_no = base + offset
        if len(cells) != 9:
            raise EvidenceError(
                "MALFORMED",
                f"line {line_no}: evidence row has {len(cells)} columns, expected 9",
                "Columns are: ID | Type | Metric | Value | Unit | SHA | Run | Source | Evidence")
        rows.append(_row_from(cells, line_no))
        if len(rows) > MAX_ROWS:
            raise EvidenceError("MALFORMED", f"more than {MAX_ROWS} evidence rows")

    if seen_header and not rows:
        raise EvidenceError("MALFORMED", "Measured Evidence section has a header but no rows")
    return rows


def _row_from(cells: list[str], line_no: int) -> Row:
    row_id, row_type, metric, raw_value, unit, sha, run_id, source, evidence = cells
    where = f"line {line_no}"

    if not _ROW_ID.match(row_id):
        raise EvidenceError("MALFORMED", f"{where}: row ID {row_id!r} is not R<number>")
    if row_type not in ROW_TYPES:
        raise EvidenceError("MALFORMED",
                            f"{where}: type {row_type!r} is not one of {sorted(ROW_TYPES)}")
    if not metric:
        raise EvidenceError("MALFORMED", f"{where}: metric name is empty")
    try:
        value = float(raw_value.replace(",", ""))
    except ValueError as exc:
        raise EvidenceError("MALFORMED",
                            f"{where}: claimed value {raw_value!r} is not numeric") from exc
    if unit not in UNITS:
        raise EvidenceError(
            "MALFORMED", f"{where}: unit {unit!r} is not in the closed set {sorted(UNITS)}",
            "Units are never guessed at or converted. Use one of the listed units.")
    if source not in SOURCES:
        raise EvidenceError("MALFORMED",
                            f"{where}: source {source!r} is not one of {sorted(SOURCES)}")
    if not evidence.strip():
        raise EvidenceError("MALFORMED", f"{where}: evidence marker is empty")

    dash = {"", "-", "—", "–", "n/a", "N/A"}
    if row_type == "derived":
        if source != "formula":
            raise EvidenceError("MALFORMED", f"{where}: a derived row must have source `formula`")
    else:
        if source == "formula":
            raise EvidenceError("MALFORMED",
                                f"{where}: only a derived row may have source `formula`")
        if sha in dash:
            raise EvidenceError("MALFORMED", f"{where}: a {row_type} row must name a SHA")
        if run_id in dash or not run_id.isdigit():
            raise EvidenceError("MALFORMED",
                                f"{where}: a {row_type} row must name a numeric run ID")

    return Row(row_id, row_type, metric, value, unit,
               "" if sha in dash else sha,
               "" if run_id in dash else run_id,
               source, evidence, line_no)


def unsupported_claims(body: str, rows: list[Row]) -> list[tuple[int, str]]:
    """Measured-looking claims sitting outside the table with no provenance nearby."""
    match = HEADING.search(body)
    table_span = range(0, 0)
    if match is not None:
        end = body.find("\n#", match.end())
        table_span = range(body[:match.start()].count("\n"),
                           body[:end if end != -1 else len(body)].count("\n") + 1)

    metrics = {r.metric.lower() for r in rows}
    lines = body.split("\n")
    found: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        if index in table_span:
            continue
        if not (CLAIM_NUMBER.search(line) and CLAIM_METRIC.search(line)):
            continue
        if CLAIM_REQUIREMENT.search(line):
            continue
        near = "\n".join(lines[max(0, index - CLAIM_WINDOW): index + CLAIM_WINDOW + 1])
        if CLAIM_PROVENANCE.search(near):
            continue
        if any(m and m in line.lower() for m in metrics):
            continue           # the table already carries this metric
        found.append((index + 1, line.strip()))
    return found


# --------------------------------------------------------------------------
# GitHub access
# --------------------------------------------------------------------------
class Fetcher(Protocol):
    """Injected so every test runs offline. A gate whose tests need the network
    is a gate whose tests are skipped."""

    def run(self, run_id: str) -> dict[str, Any]: ...
    def jobs(self, run_id: str) -> list[dict[str, Any]]: ...
    def job_log(self, run_id: str, job_id: int) -> str: ...
    def check_runs(self, sha: str) -> list[dict[str, Any]]: ...
    def runs_for_sha(self, sha: str) -> list[dict[str, Any]]: ...


class GitHubFetcher:
    """`gh api` over subprocess, argv-only, bounded, and cached per run."""

    def __init__(self, repository: str = REPOSITORY, deadline: float | None = None) -> None:
        self.repository = repository
        self.deadline = deadline
        self._cache: dict[str, Any] = {}

    def _gh(self, path: str) -> Any:
        if path in self._cache:
            return self._cache[path]
        if self.deadline is not None and time.monotonic() > self.deadline:
            raise EvidenceError("INFRASTRUCTURE_BLOCK",
                                f"fetch budget of {TOTAL_BUDGET_S}s exhausted before {path}")
        exe = shutil.which("gh")
        if exe is None:
            raise EvidenceError("INFRASTRUCTURE_BLOCK", "gh is not on PATH")
        last = ""
        for attempt in range(FETCH_RETRIES + 1):
            out = subprocess.run(                       # noqa: S603 - argv only, no shell
                [exe, "api", path], capture_output=True, text=True,
                timeout=FETCH_TIMEOUT_S, stdin=subprocess.DEVNULL, shell=False)
            if out.returncode == 0:
                parsed = json.loads(out.stdout) if out.stdout.strip() else {}
                self._cache[path] = parsed
                return parsed
            last = (out.stderr or out.stdout).strip().splitlines()[-1:] or [""]
            last = last[0]
        raise EvidenceError(
            "INFRASTRUCTURE_BLOCK",
            f"GET {path} failed after {FETCH_RETRIES + 1} attempts: {last}",
            "Check GitHub availability and that the token carries actions:read and checks:read.")

    def run(self, run_id: str) -> dict[str, Any]:
        return cast("dict[str, Any]",
                    self._gh(f"repos/{self.repository}/actions/runs/{run_id}"))

    def jobs(self, run_id: str) -> list[dict[str, Any]]:
        payload = self._gh(f"repos/{self.repository}/actions/runs/{run_id}/jobs?per_page=100")
        return cast("list[dict[str, Any]]", payload.get("jobs", []))

    def job_log(self, run_id: str, job_id: int) -> str:
        exe = shutil.which("gh")
        if exe is None:
            raise EvidenceError("INFRASTRUCTURE_BLOCK", "gh is not on PATH")
        out = subprocess.run(                           # noqa: S603 - argv only, no shell
            [exe, "api", f"repos/{self.repository}/actions/jobs/{job_id}/logs"],
            capture_output=True, text=True, timeout=FETCH_TIMEOUT_S,
            stdin=subprocess.DEVNULL, shell=False)
        if out.returncode != 0:
            raise EvidenceError("INFRASTRUCTURE_BLOCK",
                                f"log for job {job_id} of run {run_id} could not be fetched")
        return out.stdout

    def check_runs(self, sha: str) -> list[dict[str, Any]]:
        payload = self._gh(f"repos/{self.repository}/commits/{sha}/check-runs?per_page=100")
        return cast("list[dict[str, Any]]", payload.get("check_runs", []))

    def runs_for_sha(self, sha: str) -> list[dict[str, Any]]:
        payload = self._gh(f"repos/{self.repository}/actions/runs?head_sha={sha}&per_page=50")
        return cast("list[dict[str, Any]]", payload.get("workflow_runs", []))


# --------------------------------------------------------------------------
# Binding a row to real evidence
# --------------------------------------------------------------------------
_API_DURATION = re.compile(r"^jobs\[(?P<job>[^\]]+)\]\.duration$")
_API_CONCLUSION = re.compile(r"^jobs\[(?P<job>[^\]]+)\]\.conclusion$")


def _seconds(job: dict[str, Any]) -> float:
    started, completed = job.get("started_at"), job.get("completed_at")
    if not started or not completed:
        raise EvidenceError("PARTIAL", f"job {job.get('name')!r} has no completed_at")
    import datetime as dt
    begin = dt.datetime.fromisoformat(str(started).replace("Z", "+00:00"))
    end = dt.datetime.fromisoformat(str(completed).replace("Z", "+00:00"))
    return (end - begin).total_seconds()


def bind_row(row: Row, fetcher: Fetcher, head_sha: str) -> str:
    """Prove one row against GitHub, or raise with the state that blocked it.

    Returns the evidence actually observed, for the dossier.
    """
    run = fetcher.run(row.run_id)

    full_name = str((run.get("repository") or {}).get("full_name", ""))
    if full_name and full_name != REPOSITORY:
        raise EvidenceError(
            "CONTRADICTED",
            f"{row.row_id}: run {row.run_id} belongs to {full_name}, not {REPOSITORY}",
            "Evidence may only cite runs of this repository.")

    run_sha = str(run.get("head_sha", ""))
    if not run_sha:
        raise EvidenceError("UNKNOWN", f"{row.row_id}: run {row.run_id} reports no head_sha")
    if not (run_sha.startswith(row.sha) or row.sha.startswith(run_sha)):
        raise EvidenceError(
            "STALE", f"{row.row_id}: row names SHA {row.sha} but run {row.run_id} ran on {run_sha}")
    if row.row_type == "current" and not (run_sha.startswith(head_sha)
                                          or head_sha.startswith(run_sha)):
        raise EvidenceError(
            "STALE",
            f"{row.row_id}: a `current` row must cite the head SHA {head_sha}, not {run_sha}",
            "Use type `baseline` for evidence from an earlier commit.")

    jobs = fetcher.jobs(row.run_id)
    if row.source == "api":
        return _bind_api(row, jobs)
    return _bind_log(row, jobs, fetcher)


def _bind_api(row: Row, jobs: list[dict[str, Any]]) -> str:
    """A closed set of JSON paths. A general path evaluator over untrusted text
    is the ambiguity this gate exists to remove."""
    marker = normalize_marker(row.evidence)
    duration, conclusion = _API_DURATION.match(marker), _API_CONCLUSION.match(marker)
    if duration is None and conclusion is None:
        raise EvidenceError(
            "MALFORMED",
            f"{row.row_id}: {row.evidence!r} is not a supported API path",
            "Supported: jobs[<job>].duration and jobs[<job>].conclusion")

    name = (duration or conclusion).group("job")          # type: ignore[union-attr]
    job = next((j for j in jobs if str(j.get("name")) == name), None)
    if job is None:
        raise EvidenceError(
            "CONTRADICTED",
            f"{row.row_id}: run {row.run_id} has no job named {name!r}",
            f"Jobs in that run: {', '.join(sorted(str(j.get('name')) for j in jobs)) or 'none'}")

    if conclusion is not None:
        return f"jobs[{name}].conclusion = {job.get('conclusion')}"

    actual = _seconds(job)
    if row.unit == "ms":
        actual *= 1000.0
    elif row.unit != "seconds":
        raise EvidenceError("MALFORMED",
                            f"{row.row_id}: a duration must be in seconds or ms, not {row.unit}")
    if not close_enough(row.value, actual):
        raise EvidenceError(
            "CONTRADICTED",
            f"{row.row_id}: claims {row.value} {row.unit}, "
            f"but jobs[{name}].duration is {actual:.2f} {row.unit}")
    return f"jobs[{name}].duration = {actual:.2f} {row.unit}"


def _bind_log(row: Row, jobs: list[dict[str, Any]], fetcher: Fetcher) -> str:
    marker = normalize_marker(row.evidence)
    candidates = [j for j in jobs if str(j.get("name")) == row.metric] or jobs
    for job in candidates:
        log = normalize_log(fetcher.job_log(row.run_id, int(job["id"])))
        if marker not in log:
            continue
        if not value_present_in(marker, row.value):
            raise EvidenceError(
                "CONTRADICTED",
                f"{row.row_id}: the marker {row.evidence!r} is in the log of "
                f"{job.get('name')!r}, but it does not carry the claimed value {row.value}",
                "The number in the PR must be the number in the log.")
        return f"{job.get('name')}: {marker}"
    raise EvidenceError(
        "UNKNOWN",
        f"{row.row_id}: marker {row.evidence!r} was not found in any log of run {row.run_id}")


# --------------------------------------------------------------------------
# Failure dossier
# --------------------------------------------------------------------------
def dossier(pr: str, sha: str, workflow: str, run_id: str, job: dict[str, Any],
            log: str) -> str:
    """The record a failed required job must produce. It never invents a cause.

    If the log proves only that a command exited non-zero, `OBSERVED WHY` says
    UNKNOWN and `NEXT SAFE FIX` says INVESTIGATE. A confidently wrong root cause
    is worse than an admitted absence of one: it sends the next person to the
    wrong file.
    """
    findings: list[dict[str, Any]] = []
    try:
        import run_gate
        findings = run_gate.extract_findings(log)
    except Exception:                                   # noqa: BLE001 - extraction is best effort
        findings = []

    step = next((s for s in job.get("steps", []) if s.get("conclusion") == "failure"), {})
    first = findings[0] if findings else {}

    what = str(first.get("what") or "").strip()
    where = str(first.get("where") or "").strip()
    why = str(first.get("why") or "").strip()
    fix = str(first.get("fix") or "").strip()

    if not what:
        what = (f"step {step.get('name')!r} concluded `failure`"
                if step else f"job concluded {job.get('conclusion')!r}")

    excerpt = "\n".join(
        line for line in normalize_log(log).split("\n")
        if line and ("error" in line.lower() or "failed" in line.lower()))[-1200:]

    return "\n".join([
        "STATUS: FAIL",
        f"PR: {pr}",
        f"LATEST_SHA: {sha}",
        f"WORKFLOW: {workflow}",
        f"RUN_ID: {run_id}",
        f"JOB: {job.get('name')}",
        f"STEP: {step.get('name', 'UNKNOWN')}",
        f"LOG_SOURCE: actions/jobs/{job.get('id')}/logs",
        "",
        f"WHAT FAILED:\n{what}",
        "",
        f"WHERE:\n{where or 'UNKNOWN — LOG DOES NOT NAME A LOCATION'}",
        "",
        f"OBSERVED WHY:\n{why or 'UNKNOWN — LOG DOES NOT PROVE ROOT CAUSE'}",
        "",
        f"NEXT SAFE FIX:\n{fix or 'INVESTIGATE — ROOT CAUSE NOT PROVEN'}",
        "",
        "REQUIRED ACTION:",
        "Fix the code/configuration/evidence issue.",
        "Push a new SHA.",
        "Run all required checks again.",
        "No merge until latest-SHA evidence is green.",
        "",
        f"EVIDENCE:\n{excerpt or '(no error-bearing lines in log)'}",
    ])


# --------------------------------------------------------------------------
# Required-context status evidence
# --------------------------------------------------------------------------
def required_contexts(manifest: Path | None = None) -> list[str]:
    path = manifest or (REPO_ROOT / "ci" / "gates.toml")
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return list(data["ruleset"]["required_checks"])


@dataclass
class StatusEvidence:
    context: str
    conclusion: str
    run_id: str
    sha: str
    job: dict[str, Any] = field(default_factory=dict)


def collect_status(fetcher: Fetcher, sha: str, contexts: list[str],
                   exclude: str) -> tuple[list[StatusEvidence], list[str]]:
    """Status evidence for every required context on this exact SHA.

    `exclude` is this gate's own context. A gate that waits for itself to become
    terminal never becomes terminal.
    """
    seen = {str(c.get("name")): c for c in fetcher.check_runs(sha)}
    evidence: list[StatusEvidence] = []
    missing: list[str] = []
    for context in contexts:
        if context == exclude:
            continue
        check = seen.get(context)
        if check is None:
            missing.append(context)
            continue
        if str(check.get("status")) != "completed":
            missing.append(f"{context} (status={check.get('status')})")
            continue
        run_id = ""
        url = str(check.get("details_url") or check.get("html_url") or "")
        found = re.search(r"/runs/(\d+)", url)
        if found:
            run_id = found.group(1)
        evidence.append(StatusEvidence(context, str(check.get("conclusion")), run_id, sha))
    return evidence, missing


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def evaluate(body: str, sha: str, fetcher: Fetcher, contexts: list[str],
             pr: str = "", self_context: str = "merge-evidence") -> tuple[bool, list[str]]:
    """The whole decision, offline-testable. Returns (allowed, reasons)."""
    reasons: list[str] = []

    if len(body.encode("utf-8")) > MAX_BODY_BYTES:
        return False, [f"MALFORMED: PR body exceeds {MAX_BODY_BYTES} bytes"]

    status, missing = collect_status(fetcher, sha, contexts, self_context)
    for gap in missing:
        reasons.append(f"NOT_FETCHED: no completed check-run for required context {gap} on {sha}")
    for item in status:
        if item.conclusion != "success":
            reasons.append(
                f"FAILED: required context {item.context} concluded {item.conclusion} on {sha}")
            if item.run_id:
                try:
                    jobs = fetcher.jobs(item.run_id)
                    job = next((j for j in jobs if str(j.get("name")) == item.context), None)
                    if job is not None:
                        log = fetcher.job_log(item.run_id, int(job["id"]))
                        reasons.append(dossier(pr, sha, item.context, item.run_id, job, log))
                except EvidenceError as exc:
                    reasons.append(f"{exc.state}: dossier unavailable — {exc.detail}")

    try:
        rows = parse_table(body)
    except EvidenceError as exc:
        return False, reasons + [f"{exc.state}: {exc.detail}"]

    for line_no, text in unsupported_claims(body, rows):
        reasons.append(
            f"UNSUPPORTED: line {line_no} states a measured result outside the "
            f"Measured Evidence section — {text[:120]}")

    values: dict[str, float] = {}
    for row in (r for r in rows if r.row_type != "derived"):
        try:
            observed = bind_row(row, fetcher, sha)
            values[row.row_id] = row.value
            reasons.append(f"BOUND: {row.row_id} {row.metric} = {row.value} {row.unit} ← {observed}")
        except EvidenceError as exc:
            reasons.append(f"{exc.state}: {exc.detail}")

    for row in (r for r in rows if r.row_type == "derived"):
        try:
            actual = safe_eval(row.evidence, values)
        except EvidenceError as exc:
            reasons.append(f"{exc.state}: {row.row_id}: {exc.detail}")
            continue
        if not close_enough(row.value, actual):
            reasons.append(
                f"CONTRADICTED: {row.row_id} claims {row.value} {row.unit}, "
                f"but {row.evidence} recomputes to {actual:.4f}")
        else:
            values[row.row_id] = row.value
            reasons.append(f"RECOMPUTED: {row.row_id} {row.evidence} = {actual:.4f} ✓")

    blocked = [r for r in reasons if r.split(":", 1)[0] not in {"BOUND", "RECOMPUTED"}]
    return not blocked, reasons


def fetch_pr_body(pr: str) -> str:
    """Read the pull request body through `gh`.

    `exe` is bound here, from `shutil.which`, and nowhere else in this scope --
    that is not style. scripts/security_gate.py re-derives the safe subprocess
    pattern from this file's AST every run, and it requires argv[0] to be a name
    whose every binding in scope comes from `shutil.which(...)`. Writing
    `shutil.which("gh") or ""` is a BoolOp, not that call, and it disqualified
    the whole file: the checker returns on the first unproven site, so one
    convenient `or ""` turned three verified calls into four UNRESOLVED
    findings and took the security gate red.
    """
    exe = shutil.which("gh")
    if exe is None:
        raise EvidenceError("INFRASTRUCTURE_BLOCK", "gh is not on PATH")
    out = subprocess.run(                               # noqa: S603 - argv only, no shell
        [exe, "pr", "view", pr, "--json", "body", "--jq", ".body"],
        capture_output=True, text=True, timeout=FETCH_TIMEOUT_S,
        stdin=subprocess.DEVNULL, shell=False)
    return out.stdout if out.returncode == 0 else ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pr", default=os.environ.get("PR_NUMBER", ""))
    parser.add_argument("--sha", default=os.environ.get("GITHUB_SHA", ""))
    parser.add_argument("--body-file", default="")
    parser.add_argument("--self-context", default="merge-evidence")
    args = parser.parse_args()

    with Gate("merge-evidence", "1.0.0") as gate:
        gate.set_scope(
            repository=REPOSITORY,
            head_sha=args.sha,
            pull_request=args.pr,
            checks="status evidence for every required context; logs for failed jobs "
                   "and for cited evidence rows only",
            does_not_check="complete raw logs of successful jobs")

        deadline = time.monotonic() + TOTAL_BUDGET_S
        fetcher = GitHubFetcher(deadline=deadline)

        try:
            if args.body_file:
                body = Path(args.body_file).read_text(encoding="utf-8")
            elif args.pr:
                body = fetch_pr_body(args.pr)
            else:
                body = ""
            allowed, reasons = evaluate(body, args.sha, fetcher, required_contexts(),
                                        args.pr, args.self_context)
        except EvidenceError as exc:
            gate.fail(what=f"evidence could not be collected ({exc.state})",
                      where=f"{REPOSITORY}@{args.sha}", why=exc.detail,
                      requirement="Evidence must be collected before a merge decision.",
                      fix=exc.fix or "Retry once GitHub is reachable.")
            return 1

        for reason in reasons:
            state = reason.split(":", 1)[0]
            if state in {"BOUND", "RECOMPUTED"}:
                gate.check(reason, True)
            else:
                gate.fail(what=reason.split("\n", 1)[0],
                          where=f"{REPOSITORY}@{args.sha}",
                          why=reason,
                          requirement="Every measured claim binds to current-SHA evidence, and "
                                      "every required job has terminal success on this SHA.",
                          fix="Correct the claim, or push a SHA whose runs support it.",
                          severity="CRITICAL" if state == "FAILED" else "ERROR")

        if not reasons:
            gate.check("no measured claims and no evidence table", True,
                       "nothing to bind; this gate has no opinion")
        return 0 if allowed else 1


if __name__ == "__main__":
    sys.exit(main())
