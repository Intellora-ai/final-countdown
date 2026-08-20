"""A verifier that wrote its own report keeps its checks when it is wrapped.

WHY THIS EXISTS.

Six verifications run as bare steps inside a job whose report is written by a
DIFFERENT script:

    preflight       tcb_gate.py · check_ruleset.py · registry_gate.py
                    ... then gate_integrity.py, which writes preflight.json
    axle-verify     axle_health.py · enforce_spec.py
                    ... then axle_gate.py, which writes axle-verify.json
    correspondence  axle_health.py

The ordering is deliberate and fail-closed: the report writer runs LAST, so a
failure in any earlier step leaves NO report and aggregate_gates.py turns that
absence into a blocking UNKNOWN. The merge stays blocked. What is missing is
not the verdict -- it is every detail of it. The finalizer can only say "no
evidence was produced for this gate", never which trusted path drifted or
which spec broke which rule.

Wrapping the chain in run_gate.py is how bandit and correspondence already
solve this. The obstacle was that the inner report writer owns the same
reports/<name>.json the wrapper writes, so the wrapper overwrote it.

MEASURED: reports/preflight.json carries 84 structured checks; a bare wrapper
report carries one. Overwriting trades 84 checks for N findings, which is a
net loss of evidence, not a fix. So the wrapper merges -- and the wrapper's
STATUS still wins, because the chain's exit code is the verdict and the inner
script only ever saw its own step.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import gate as gate_mod  # noqa: E402
import run_gate  # noqa: E402


def write_report(root: Path, name: str, **extra: object) -> Path:
    """A report shaped like the one an inner verifier writes for itself."""
    reports = root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    body: dict[str, object] = {
        "gate": name,
        "status": "PASS",
        "checks": [
            {"subject": "manifest parses", "result": "PASS", "detail": "18 gates"},
            {"subject": "every job is declared", "result": "PASS", "detail": ""},
        ],
        "scope": {"gates_declared": 18, "command": "python3 scripts/inner.py"},
        "warnings": [],
    }
    body.update(extra)
    path = reports / f"{name}.json"
    path.write_text(json.dumps(body), encoding="utf-8")
    return path


def absorb_into(root: Path, name: str, not_before: float) -> gate_mod.Gate:
    """Run `absorb` against a report on disk, without the Gate lifecycle."""
    original = gate_mod.REPORTS
    run_gate.REPORTS = root / "reports"
    try:
        g = gate_mod.Gate(name)
        run_gate.absorb(g, name, not_before)
        return g
    finally:
        run_gate.REPORTS = original


# ---------------------------------------------------------------------------
# WHAT IS KEPT
# ---------------------------------------------------------------------------

def test_the_inner_checks_survive_the_wrapper(tmp_path: Path) -> None:
    """The whole point: 84 checks must not become 1."""
    write_report(tmp_path, "preflight")
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    subjects = [c["subject"] for c in g.checks]
    assert subjects == ["manifest parses", "every job is declared"]
    assert all(c["result"] == "PASS" for c in g.checks)


def test_a_failing_inner_check_stays_failing(tmp_path: Path) -> None:
    """Folding must not launder a check that did not hold."""
    write_report(tmp_path, "preflight", checks=[
        {"subject": "ruleset alignment", "result": "FAIL", "detail": "drift"}])
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert [c["result"] for c in g.checks] == ["FAIL"]


def test_the_inner_scope_is_kept_but_not_its_command(tmp_path: Path) -> None:
    """`command` is the wrapper's own and describes the whole chain.

    The inner value names one step of it, and would be the more specific
    answer to a less useful question.
    """
    write_report(tmp_path, "preflight")
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert g.scope.get("gates_declared") == 18
    assert "command" not in g.scope


def test_inner_warnings_are_carried_up(tmp_path: Path) -> None:
    """A warning that reaches only a file the wrapper overwrites is discarded."""
    write_report(tmp_path, "preflight", warnings=["ruleset read anonymously"])
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert "ruleset read anonymously" in g.warnings


# ---------------------------------------------------------------------------
# WHAT IS REFUSED
# ---------------------------------------------------------------------------

def test_a_report_from_a_previous_run_is_not_folded(tmp_path: Path) -> None:
    """The defect this guard exists for.

    reports/ is not cleaned between local runs, and CI re-runs against a warm
    tree. A stale report folded in publishes LAST run's checks as evidence for
    this one -- the same class of lie aggregate_gates.py rejects with its
    identity fields, and refused here for the same reason.
    """
    path = write_report(tmp_path, "preflight")
    stale = time.time() - 3600
    import os
    os.utime(path, (stale, stale))

    g = absorb_into(tmp_path, "preflight", time.time() - 60)
    assert g.checks == [], "a report older than this run's command was folded in"


def test_a_report_claiming_another_gate_is_refused(tmp_path: Path) -> None:
    """Evidence for another gate must not stand in for this one."""
    write_report(tmp_path, "preflight", gate="mutmut")
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert g.checks == []
    assert any("mutmut" in w for w in g.warnings), \
        "refused silently; a merge that did nothing must not look like one with nothing to do"


def test_a_malformed_report_warns_rather_than_raising(tmp_path: Path) -> None:
    """This runs inside a gate that has already decided its verdict.

    A reporting bug must never be able to change one, so every refusal is a
    warning and never an exception.
    """
    reports = tmp_path / "reports"
    reports.mkdir(parents=True)
    (reports / "preflight.json").write_text("{ not json", encoding="utf-8")

    g = absorb_into(tmp_path, "preflight", time.time() - 60)
    assert g.checks == []
    assert g.warnings, "a malformed report was refused silently"


def test_a_report_that_is_not_an_object_warns(tmp_path: Path) -> None:
    """Valid JSON is not a valid report."""
    reports = tmp_path / "reports"
    reports.mkdir(parents=True)
    (reports / "preflight.json").write_text("[1, 2, 3]", encoding="utf-8")

    g = absorb_into(tmp_path, "preflight", time.time() - 60)
    assert g.checks == []
    assert g.warnings


def test_no_inner_report_is_not_an_error(tmp_path: Path) -> None:
    """Most gates wrap a command that writes nothing. That is the normal case."""
    (tmp_path / "reports").mkdir(parents=True)
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert g.checks == []
    assert g.warnings == []


# ---------------------------------------------------------------------------
# THE VERDICT IS STILL THE CHAIN'S
# ---------------------------------------------------------------------------

def test_an_inner_pass_does_not_survive_a_failing_chain(tmp_path: Path) -> None:
    """The property that makes merging safe at all.

    An inner report saying PASS from step 4 of 5 must never survive a chain
    that failed at step 5. The inner script only ever saw its own step; the
    exit code is what saw the whole chain. Driven end to end, because this is
    the one thing a merge could get wrong that a blocked merge would hide.
    """
    work = tmp_path / "run"
    (work / "reports").mkdir(parents=True)
    inner = tmp_path / "inner.py"
    inner.write_text(
        "import json, pathlib\n"
        "pathlib.Path('reports').mkdir(exist_ok=True)\n"
        "pathlib.Path('reports/preflight.json').write_text(json.dumps({\n"
        "    'gate': 'preflight', 'status': 'PASS',\n"
        "    'checks': [{'subject': 'inner ran', 'result': 'PASS', 'detail': ''}],\n"
        "}))\n", encoding="utf-8")
    chain = tmp_path / "chain.sh"
    chain.write_text(
        "set -e\n"
        f'echo "== preflight gate 1/2: integrity" >&2\n'
        f"python3 {inner}\n"
        f'echo "== preflight gate 2/2: later step" >&2\n'
        "echo '  scripts/gate.py:1:1 - error: broke (reportGeneralTypeIssues)'\n"
        "exit 1\n", encoding="utf-8")

    result = subprocess.run(
        [PY, str(SCRIPTS / "run_gate.py"), "--name", "preflight", "--",
         "bash", str(chain)],
        cwd=work, capture_output=True, text=True, timeout=600)

    assert result.returncode != 0, "the wrapper rewrote a failing exit code"
    report = json.loads((work / "reports" / "preflight.json").read_text(
        encoding="utf-8"))

    assert report["status"] == "FAIL", \
        "an inner PASS survived a chain that failed after it"
    assert any(c["subject"] == "inner ran" for c in report["checks"]), \
        "the inner script's checks were overwritten rather than merged"
    assert report["failures"], "the failing chain recorded no finding"
