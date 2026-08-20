"""The merge-evidence gate, attacked.

A gate that refuses unsupported claims is itself a claim. These tests are the
support: every acceptance criterion in the plan is proven here against a fake
GitHub, offline, so nothing is skipped for want of a network or a token.

The fixture world is the real one, shrunk. Run 222 is the head SHA, run 111 is
an earlier commit, and their `correspondence` job logs carry the two lines that
actually decided pull request #28 -- `13 passed, 772 deselected in 22.27s` and
the same line at 14.17s. The contradiction those two numbers refute is the
reason this file exists.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import merge_evidence_gate as meg  # noqa: E402

HEAD = "861f64dcd25123578061180bece165d293d711fc"
OLD = "8ea48f3600000000000000000000000000000000"
OTHER = "0000000000000000000000000000000000000000"

LOG_AFTER = (
    "2026-08-20T13:24:34.4680068Z \x1b[32m13 passed, 772 deselected in 14.17s\x1b[0m\n"
    "2026-08-20T13:24:34.4680069Z AXLE_CALLS=3\n"
)
LOG_BEFORE = (
    "2026-08-20T12:57:30.2370201Z 13 passed, 767 deselected in 22.27s\n"
    "2026-08-20T12:57:30.2370202Z AXLE_CALLS=9\n"
)

REQUIRED = ["correspondence", "coverage", "e2e", "full"]


class FakeFetcher:
    """Offline GitHub. Records what was fetched so tests can assert the gate did
    not quietly download every successful log while claiming it did not."""

    def __init__(
        self,
        runs: dict[str, dict[str, Any]],
        jobs: dict[str, list[dict[str, Any]]],
        logs: dict[int, str],
        checks: list[dict[str, Any]],
    ) -> None:
        self._runs, self._jobs, self._logs, self._checks = runs, jobs, logs, checks
        self.logs_fetched: list[int] = []

    def run(self, run_id: str) -> dict[str, Any]:
        if run_id not in self._runs:
            raise meg.EvidenceError("UNKNOWN", f"no such run {run_id}")
        return self._runs[run_id]

    def jobs(self, run_id: str) -> list[dict[str, Any]]:
        return self._jobs.get(run_id, [])

    def job_log(self, run_id: str, job_id: int) -> str:
        self.logs_fetched.append(job_id)
        return self._logs.get(job_id, "")

    def check_runs(self, sha: str) -> list[dict[str, Any]]:
        return [c for c in self._checks if c.get("_sha", HEAD) == sha]

    def runs_for_sha(self, sha: str) -> list[dict[str, Any]]:
        return [r for r in self._runs.values() if r["head_sha"] == sha]


def _job(
    job_id: int, name: str, start: str, end: str, conclusion: str = "success"
) -> dict[str, Any]:
    return {
        "id": job_id,
        "name": name,
        "conclusion": conclusion,
        "started_at": start,
        "completed_at": end,
        "steps": [{"name": f"Run {name}", "conclusion": conclusion}],
    }


def fetcher(*, all_green: bool = True, missing: str = "") -> FakeFetcher:
    runs = {
        "222": {"head_sha": HEAD, "repository": {"full_name": meg.REPOSITORY}},
        "111": {"head_sha": OLD, "repository": {"full_name": meg.REPOSITORY}},
        "999": {"head_sha": HEAD, "repository": {"full_name": "someone/else"}},
    }
    # Timestamps are chosen so the durations ARE the numbers under test: run 222's
    # correspondence job spans exactly 14.17s and run 111's exactly 22.27s. A fake
    # whose arithmetic does not match the claims would let a broken gate pass.
    jobs = {
        "222": [
            _job(
                1,
                "correspondence",
                "2026-08-20T13:24:04.00Z",
                "2026-08-20T13:24:18.17Z",
            ),
            _job(2, "coverage", "2026-08-20T13:24:04.00Z", "2026-08-20T13:24:54.00Z"),
        ],
        "111": [
            _job(
                3,
                "correspondence",
                "2026-08-20T12:56:51.00Z",
                "2026-08-20T12:57:13.27Z",
            )
        ],
        "999": [
            _job(
                4,
                "correspondence",
                "2026-08-20T13:24:04.00Z",
                "2026-08-20T13:24:18.17Z",
            )
        ],
    }
    logs = {1: LOG_AFTER, 2: LOG_AFTER, 3: LOG_BEFORE, 4: LOG_AFTER}
    checks: list[dict[str, Any]] = []
    for name in REQUIRED:
        if name == missing:
            continue
        conclusion = "success" if (all_green or name != "coverage") else "failure"
        checks.append(
            {
                "name": name,
                "status": "completed",
                "conclusion": conclusion,
                "details_url": f"https://github.com/x/y/actions/runs/222/job/1",
                "_sha": HEAD,
            }
        )
    return FakeFetcher(runs, jobs, logs, checks)


def table(*rows: str) -> str:
    head = (
        "## Measured Evidence\n\n"
        "| ID | Type | Metric | Value | Unit | SHA | Run | Source | Evidence |\n"
        "|---|---|---|---:|---|---|---:|---|---|\n"
    )
    return head + "\n".join(rows) + "\n"


def verdict(
    body: str, fetch: FakeFetcher | None = None, sha: str = HEAD
) -> tuple[bool, list[str]]:
    return meg.evaluate(body, sha, fetch or fetcher(), REQUIRED, pr="99")


# --------------------------------------------------------------------------
# Criterion 1 and 12 -- the failure that motivated the gate
# --------------------------------------------------------------------------
def test_claimed_value_contradicting_the_log_is_blocked() -> None:
    """Pull request #28, reproduced exactly: the marker is REAL, the number is not.

    This is the case a marker-presence check alone would wave through. The log
    genuinely prints `AXLE_CALLS=3`; the row cites that very line and then claims
    13. Finding the evidence is not the same as the evidence agreeing.
    """
    body = table(
        "| R1 | current | correspondence | 13 | calls | "
        f"{HEAD} | 222 | log | `AXLE_CALLS=3` |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("CONTRADICTED" in r and "R1" in r for r in reasons), reasons


def test_the_same_marker_with_the_true_number_is_accepted() -> None:
    """The control for the test above: only the claimed value differs."""
    body = table(
        "| R1 | current | correspondence | 3 | calls | "
        f"{HEAD} | 222 | log | `AXLE_CALLS=3` |"
    )
    allowed, reasons = verdict(body)
    assert allowed, reasons


def test_derived_row_that_does_not_recompute_is_blocked() -> None:
    """The subtraction is where the 42-to-13 error actually lived."""
    body = table(
        f"| R1 | baseline | correspondence | 22.27 | seconds | {OLD} | 111 | api "
        "| jobs[correspondence].duration |",
        f"| R2 | current | correspondence | 14.17 | seconds | {HEAD} | 222 | api "
        "| jobs[correspondence].duration |",
        "| R3 | derived | duration saved | 29.00 | seconds | — | — | formula | R1 - R2 |",
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("CONTRADICTED" in r and "R3" in r for r in reasons), reasons


# --------------------------------------------------------------------------
# Criterion 2 -- the honest case passes
# --------------------------------------------------------------------------
def test_matching_current_evidence_is_accepted() -> None:
    body = table(
        f"| R1 | current | correspondence | 14.17 | seconds | {HEAD} | 222 | log "
        "| `13 passed, 772 deselected in 14.17s` |"
    )
    allowed, reasons = verdict(body)
    assert allowed, reasons


def test_baseline_and_derived_rows_reconstruct_pr_28_honestly() -> None:
    """What #28 should have said. Both measurements real, the arithmetic checked."""
    body = table(
        f"| R1 | baseline | correspondence | 22.27 | seconds | {OLD} | 111 | api "
        "| jobs[correspondence].duration |",
        f"| R2 | current | correspondence | 14.17 | seconds | {HEAD} | 222 | api "
        "| jobs[correspondence].duration |",
        "| R3 | derived | duration saved | 8.10 | seconds | — | — | formula | R1 - R2 |",
        "| R4 | derived | speedup | 1.57 | x | — | — | formula | R1 / R2 |",
    )
    allowed, reasons = verdict(body)
    assert allowed, reasons
    assert sum("RECOMPUTED" in r for r in reasons) == 2


# --------------------------------------------------------------------------
# Criteria 3, 4, 14 -- provenance must be the right provenance
# --------------------------------------------------------------------------
def test_right_number_from_a_stale_sha_is_blocked() -> None:
    body = table(
        f"| R1 | current | correspondence | 22.27 | seconds | {OLD} | 111 | api "
        "| jobs[correspondence].duration |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("STALE" in r for r in reasons), reasons


def test_right_number_from_the_wrong_job_is_blocked() -> None:
    body = table(
        f"| R1 | current | nonexistent-job | 14.17 | seconds | {HEAD} | 222 | api "
        "| jobs[nonexistent-job].duration |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("CONTRADICTED" in r for r in reasons), reasons


def test_run_from_another_repository_is_blocked() -> None:
    """A run ID in a PR body is attacker-chosen. It must belong to this repo."""
    body = table(
        f"| R1 | current | correspondence | 14.17 | seconds | {HEAD} | 999 | api "
        "| jobs[correspondence].duration |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("someone/else" in r for r in reasons), reasons


# --------------------------------------------------------------------------
# Criteria 5, 6, 7 -- missing, malformed, unknown
# --------------------------------------------------------------------------
def test_marker_absent_from_every_log_is_blocked() -> None:
    body = table(
        f"| R1 | current | correspondence | 14.17 | seconds | {HEAD} | 222 | log "
        "| `a line that was never printed` |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("UNKNOWN" in r for r in reasons), reasons


@pytest.mark.parametrize(
    "row,expect",
    [
        (
            "| R1 | current | correspondence | 14.17 | seconds | " + HEAD + " | 222 |",
            "expected 9",
        ),
        (
            "| R1 | sideways | correspondence | 14.17 | seconds | "
            + HEAD
            + " | 222 | log | `x` |",
            "type",
        ),
        (
            "| R1 | current | correspondence | fourteen | seconds | "
            + HEAD
            + " | 222 | log | `x` |",
            "not numeric",
        ),
        (
            "| ONE | current | correspondence | 14.17 | seconds | "
            + HEAD
            + " | 222 | log | `x` |",
            "row ID",
        ),
    ],
)
def test_malformed_rows_are_blocked(row: str, expect: str) -> None:
    allowed, reasons = verdict(table(row))
    assert not allowed
    assert any(expect in r for r in reasons), reasons


def test_unknown_unit_is_blocked_rather_than_converted() -> None:
    body = table(
        f"| R1 | current | correspondence | 14.17 | fortnights | {HEAD} | 222 | log "
        "| `13 passed, 772 deselected in 14.17s` |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("closed set" in r for r in reasons), reasons


# --------------------------------------------------------------------------
# Criterion 8 -- the withdrawn 93-second figure
# --------------------------------------------------------------------------
def test_the_withdrawn_93_second_figure_cannot_be_revived() -> None:
    body = table(
        f"| R1 | current | correspondence | 93 | seconds | {HEAD} | 222 | api "
        "| jobs[correspondence].duration |"
    )
    allowed, reasons = verdict(body)
    assert not allowed
    assert any("CONTRADICTED" in r and "93" in r for r in reasons), reasons


# --------------------------------------------------------------------------
# Criteria 9, 10, 11 -- the false-positive budget
# --------------------------------------------------------------------------
MUST_NOT_TRIGGER = [
    "Merged in PR #27 as commit 070b9d6.",
    "ALIGNED: 17 required checks, all pinned.",
    "The contract is a 900-second target for the whole PR path.",
    "AXLE_CALLS_BEFORE = 2 * 4 + 1 = 9",
    "See `scripts/correspondence_gate.py:192-193` for the set equality.",
    "Measured on 2026-08-20 during the session.",
    "GitHub run 32374645764 produced this artifact.",
    "For example a row reads `| R1 | current | duration | 8.10 | seconds |`.",
    "Coverage threshold is 95% minimum; mutation score floor is 0.95.",
    "The file is 9109 bytes and 179 lines long.",
]


@pytest.mark.parametrize("line", MUST_NOT_TRIGGER)
def test_ordinary_prose_numbers_do_not_trigger(line: str) -> None:
    """A false-positive machine gets switched off, and then enforces nothing.

    Every string here is one the plan named as must-not-trigger: issue numbers,
    required-check counts, thresholds, arithmetic, file:line references, dates,
    run IDs, and documentation examples.
    """
    assert meg.unsupported_claims(line, []) == []


def test_no_table_and_no_claims_passes_silently() -> None:
    allowed, reasons = verdict("Renames a variable. No measurements.")
    assert allowed
    assert reasons == []


BODIES = sorted((REPO / "tests" / "fixtures" / "pr_bodies").glob("pr-*.md"))


def test_the_eight_historical_pr_bodies_produce_no_false_blocks() -> None:
    """THE ACCEPTANCE MEASUREMENT, and an honest distinction inside it.

    A false block is a flag on something from the must-not-trigger list. It is
    NOT the same as "any flag at all": four lines across #23, #24 and #25 state
    genuine measured results -- `117 of its 146 seconds`, `[DURATION] 6049ms vs
    5826ms`, `coverage measured 111s` -- with no run, SHA or table row anywhere
    near them. Flagging those is the gate working, not the gate misfiring, and
    the decision was explicitly no grandfathering.

    Tuning the detector until this number reached zero would have been tuning it
    until it stopped working.
    """
    assert len(BODIES) == 8, "expected fixtures for PR #21 through #28"
    flagged: dict[str, list[str]] = {}
    for path in BODIES:
        body = path.read_text(encoding="utf-8")
        hits = meg.unsupported_claims(body, meg.parse_table(body))
        if hits:
            flagged[path.stem] = [text for _, text in hits]

    for name, lines in flagged.items():
        for text in lines:
            assert meg.CLAIM_METRIC.search(text) and meg.CLAIM_NUMBER.search(text), (
                f"{name} flagged a line carrying no measurement: {text!r}"
            )
            assert not meg.CLAIM_PROVENANCE.search(text), (
                f"{name} flagged a line that does carry provenance: {text!r}"
            )

    assert sum(len(v) for v in flagged.values()) == 4, (
        f"expected the four known unsupported claims, got {flagged}"
    )


# --------------------------------------------------------------------------
# Criterion 13 -- the formula evaluator is not an interpreter
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "formula",
    [
        '__import__("os").system("touch /tmp/pwned")',
        'open("/etc/passwd").read()',
        "R1.__class__.__mro__",
        "(1).__class__.__bases__",
        "[x for x in range(10)]",
        "lambda: 1",
        "R1 if R1 else R2",
        "R1 ** 99999999",
        "eval('1+1')",
    ],
)
def test_formula_injection_is_refused_without_executing(formula: str) -> None:
    """`eval` on a pull request body is remote code execution with extra steps."""
    marker = Path("/tmp/pwned")
    existed = marker.exists()
    with pytest.raises(meg.EvidenceError):
        meg.safe_eval(formula, {"R1": 1.0, "R2": 2.0})
    assert marker.exists() == existed, "the formula evaluator executed something"


def test_formula_referencing_an_undeclared_row_is_blocked() -> None:
    with pytest.raises(meg.EvidenceError) as caught:
        meg.safe_eval("R1 - R7", {"R1": 1.0})
    assert caught.value.state == "UNKNOWN"


@pytest.mark.parametrize(
    "formula,expected",
    [
        ("R1 - R2", 8.10),
        ("R1 / R2", 1.5716),
        ("(R1 - R2) / R1 * 100", 36.372),
        ("max(R1, R2)", 22.27),
        ("abs(R2 - R1)", 8.10),
        ("round(R1)", 22.0),
    ],
)
def test_permitted_arithmetic_computes(formula: str, expected: float) -> None:
    got = meg.safe_eval(formula, {"R1": 22.27, "R2": 14.17})
    assert abs(got - expected) < 0.01


# --------------------------------------------------------------------------
# Criteria 15, 19 -- status evidence and the dossier's honesty
# --------------------------------------------------------------------------
def test_a_failed_required_job_blocks_and_produces_a_dossier() -> None:
    allowed, reasons = verdict("No claims here.", fetcher(all_green=False))
    assert not allowed
    assert any(r.startswith("FAILED:") and "coverage" in r for r in reasons), reasons
    assert any("STATUS: FAIL" in r and "REQUIRED ACTION:" in r for r in reasons), (
        reasons
    )


def test_the_dossier_says_unknown_rather_than_inventing_a_cause() -> None:
    """If the log proves only that a command exited non-zero, that is what it says.

    A confidently wrong root cause sends the next person to the wrong file, which
    is worse than an admitted absence of one.
    """
    job = _job(7, "coverage", "2026-08-20T13:24:04Z", "2026-08-20T13:24:54Z", "failure")
    text = meg.dossier(
        "99", HEAD, "coverage", "222", job, "some output with no known shape\n"
    )
    assert "OBSERVED WHY:\nUNKNOWN — LOG DOES NOT PROVE ROOT CAUSE" in text
    assert "NEXT SAFE FIX:\nINVESTIGATE — ROOT CAUSE NOT PROVEN" in text


def test_a_missing_required_context_blocks_as_not_fetched() -> None:
    allowed, reasons = verdict("No claims here.", fetcher(missing="e2e"))
    assert not allowed
    assert any("NOT_FETCHED" in r and "e2e" in r for r in reasons), reasons


def test_status_evidence_is_collected_for_every_required_context() -> None:
    status, missing = meg.collect_status(fetcher(), HEAD, REQUIRED, "merge-evidence")
    assert missing == []
    assert {s.context for s in status} == set(REQUIRED)
    assert all(s.sha == HEAD for s in status)


def test_the_gate_excludes_itself_from_the_wait_set() -> None:
    """A gate that waits for itself to become terminal never becomes terminal."""
    _, missing = meg.collect_status(
        fetcher(), HEAD, [*REQUIRED, "merge-evidence"], "merge-evidence"
    )
    assert missing == []


# --------------------------------------------------------------------------
# The scope claim itself: successful logs are not downloaded
# --------------------------------------------------------------------------
def test_successful_job_logs_are_not_downloaded() -> None:
    """The gate claims status evidence for all, log evidence only for failures and
    cited rows. This proves the claim rather than restating it."""
    fetch = fetcher()
    allowed, _ = meg.evaluate("Nothing measured here.", HEAD, fetch, REQUIRED, pr="99")
    assert allowed
    assert fetch.logs_fetched == [], "a successful job's log was downloaded"


def test_a_cited_log_row_does_download_exactly_that_log() -> None:
    fetch = fetcher()
    body = table(
        f"| R1 | current | correspondence | 14.17 | seconds | {HEAD} | 222 | log "
        "| `13 passed, 772 deselected in 14.17s` |"
    )
    allowed, reasons = meg.evaluate(body, HEAD, fetch, REQUIRED, pr="99")
    assert allowed, reasons
    assert fetch.logs_fetched == [1]


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------
def test_timestamps_and_colour_do_not_decide_provability() -> None:
    """Matching against transport would make a claim's provability depend on when it ran."""
    assert "13 passed, 772 deselected in 14.17s" in meg.normalize_log(LOG_AFTER)
    assert "\x1b[" not in meg.normalize_log(LOG_AFTER)
    assert "2026-08-20T" not in meg.normalize_log(LOG_AFTER)


@pytest.mark.parametrize(
    "marker,claim,expect",
    [
        ("elapsed: 8.10s", 8.1, True),
        ("elapsed: 8.1 seconds", 8.10, True),
        ("Total coverage: 100.00%", 100.0, True),
        ("AXLE_CALLS=42", 13.0, False),
        ("AXLE_CALLS=42", 42.0, True),
    ],
)
def test_value_normalization(marker: str, claim: float, expect: bool) -> None:
    assert meg.value_present_in(marker, claim) is expect


# --------------------------------------------------------------------------
# Criterion 21 -- the trust boundary is documented, not merely intended
# --------------------------------------------------------------------------
def test_the_trust_boundary_is_stated_in_the_documentation() -> None:
    doc = (REPO / "docs" / "merge-evidence.md").read_text(encoding="utf-8")
    for phrase in [
        "cannot be modified or bypassed by the same pull request",
        "not a complete adversarial security boundary",
        "part of the enforcement boundary",
    ]:
        assert phrase in doc, f"docs/merge-evidence.md must state: {phrase!r}"


def test_the_documentation_does_not_overclaim_log_coverage() -> None:
    doc = (REPO / "docs" / "merge-evidence.md").read_text(encoding="utf-8")
    assert "does not claim to have read every successful log" in doc


# --------------------------------------------------------------------------
# The ban, parsed rather than grepped
# --------------------------------------------------------------------------
def test_the_gate_contains_no_eval_exec_or_shell() -> None:
    """A docstring promising "never eval" is a comment. This is a check.

    Grepping for the word would match the docstring that explains the ban and
    the test payloads that prove it. Parsing finds call sites and nothing else.
    """
    import ast

    source = (REPO / "scripts" / "merge_evidence_gate.py").read_text(encoding="utf-8")
    tree = ast.parse(source)

    dangerous = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in {"eval", "exec", "compile", "__import__"}
    ]
    assert dangerous == [], (
        f"{len(dangerous)} interpreter call site(s) in a script that parses "
        "attacker-controlled pull request bodies"
    )

    shell_true = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.keyword)
        and node.arg == "shell"
        and isinstance(node.value, ast.Constant)
        and node.value.value is True
    ]
    assert shell_true == [], (
        "subprocess with shell=True in a script that reads untrusted text"
    )


def test_the_gate_declares_what_it_does_not_check() -> None:
    """Scope is part of the evidence. A gate that states only what it proves
    invites the reader to assume the rest."""
    source = (REPO / "scripts" / "merge_evidence_gate.py").read_text(encoding="utf-8")
    assert "does_not_check" in source
    assert "complete raw logs of successful jobs" in source


def test_every_exit_path_declares_a_verdict() -> None:
    """scripts/gate.py refuses to infer a result, and it is right to.

    Run 32381293460 went red with "merge-evidence finished without setting a
    result" while every check passed and nothing was refused. A verdict nobody
    stated is not a verdict; inferring one from an empty failure list is how a
    gate that never ran comes to read as a gate that passed.

    Checked by parsing rather than grepping, so a mention in a docstring or a
    comment cannot satisfy it.
    """
    import ast

    source = (REPO / "scripts" / "merge_evidence_gate.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    main = next(
        n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "main"
    )

    called = {
        ast.unparse(n.func)
        for n in ast.walk(main)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
    }
    for verdict_call in ("gate.passed", "gate.failed", "gate.infrastructure_failure"):
        assert verdict_call in called, (
            f"main() never calls {verdict_call}(); a gate that exits without "
            "declaring a result is recorded UNKNOWN, and UNKNOWN blocks"
        )


# --------------------------------------------------------------------------
# Waiting for contexts that live in other workflows
# --------------------------------------------------------------------------
class SlowFetcher(FakeFetcher):
    """A check-run that is `in_progress` for the first `turns` reads.

    Models the thing that actually broke: `e2e` and the CodeQL contexts are in
    separate workflows, so when this job starts they may not be terminal yet.
    """

    def __init__(self, turns: int, late: str = "e2e") -> None:
        base = fetcher()
        super().__init__(base._runs, base._jobs, base._logs, base._checks)
        self.turns, self.late, self.reads = turns, late, 0

    def check_runs(self, sha: str) -> list[dict[str, Any]]:
        self.reads += 1
        out: list[dict[str, Any]] = []
        for check in super().check_runs(sha):
            if check["name"] == self.late and self.reads <= self.turns:
                pending = dict(check)
                pending["status"] = "in_progress"
                pending["conclusion"] = None
                out.append(pending)
            else:
                out.append(check)
        return out


def test_the_gate_waits_for_a_context_in_another_workflow() -> None:
    """Read-once was the defect. PR #29 passed it on timing luck -- 11 seconds
    of gap -- and the same code failed on main, where CodeQL was still running."""
    slow = SlowFetcher(turns=3)
    slept: list[float] = []
    ticks = iter([0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0])
    _, missing = meg.collect_status(
        slow,
        HEAD,
        REQUIRED,
        "merge-evidence",
        wait_budget=60.0,
        sleep=slept.append,
        clock=lambda: next(ticks),
    )
    assert missing == [], missing
    assert slept, "the gate returned without ever waiting"
    assert slow.reads == 4, (
        f"expected three pending reads then a terminal one, got {slow.reads}"
    )


def test_waiting_is_bounded_and_fails_closed() -> None:
    """A gate that gave up waiting has not observed a pass."""
    slow = SlowFetcher(turns=99)
    ticks = iter([0.0, 30.0, 61.0, 90.0])
    _, missing = meg.collect_status(
        slow,
        HEAD,
        REQUIRED,
        "merge-evidence",
        wait_budget=60.0,
        sleep=lambda _: None,
        clock=lambda: next(ticks),
    )
    assert any("e2e" in m for m in missing), missing


def test_zero_budget_does_not_wait_at_all() -> None:
    slow = SlowFetcher(turns=1)
    slept: list[float] = []
    _, missing = meg.collect_status(
        slow, HEAD, REQUIRED, "merge-evidence", wait_budget=0.0, sleep=slept.append
    )
    assert slept == []
    assert any("e2e" in m for m in missing), missing


def test_the_gate_runs_on_pull_requests_only() -> None:
    """A merge policy has no meaning after the merge.

    `CodeQL` is one of the 17 required contexts and it does not exist on a push
    SHA. Measured on 7cc6b0bb, the merged main commit: sixteen of the seventeen
    appear as check-runs and `CodeQL` is absent entirely, because it is a
    code-scanning analysis status GitHub raises for pull requests. The gate
    waited its full budget for a check that could never arrive and then
    correctly reported NOT_FETCHED.

    The fix was to stop running where the policy does not apply, not to teach
    the evidence logic that a missing context is sometimes acceptable. The
    second would have bought a green main at the cost of the fail-closed rule
    that is the only reason this gate is worth having.
    """
    yaml = pytest.importorskip("yaml")
    spec = yaml.safe_load(
        (REPO / ".github" / "workflows" / "verify.yml").read_text(encoding="utf-8")
    )
    condition = str(spec["jobs"]["merge-evidence"].get("if", ""))
    assert "pull_request" in condition, (
        "merge-evidence must not run on push: CodeQL is a required context that "
        "does not exist on a push SHA, so the gate can only ever time out there"
    )
    assert "always()" in condition, (
        "within a pull request the failure dossier is worth most in exactly the "
        "case needs:[full] would otherwise skip this job"
    )
