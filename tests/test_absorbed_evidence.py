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
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import pytest  # noqa: E402

import gate as gate_mod  # noqa: E402
import run_gate  # noqa: E402


# The identity fields gate.py stamps on every report from the environment, and
# that `absorb` now checks before folding anything. A fixture that omits them
# is not a report an inner verifier could ever have written: in CI these are
# always set, so an unstamped fixture is indistinguishable from evidence for
# another run and is correctly refused. Measured -- omitting them passed
# locally, where GITHUB_SHA is unset and the check is skipped, and failed every
# one of these tests in CI.
IDENTITY = {"commit": "GITHUB_SHA", "run_id": "GITHUB_RUN_ID",
            "run_attempt": "GITHUB_RUN_ATTEMPT", "workflow": "GITHUB_WORKFLOW"}


def this_run() -> dict[str, object]:
    """The identity a report written by THIS run would carry."""
    return {field: os.environ.get(var, "local") for field, var in IDENTITY.items()}


def write_report(root: Path, name: str, **extra: object) -> Path:
    """A report shaped like the one an inner verifier writes for itself."""
    reports = root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    body: dict[str, object] = {
        **this_run(),
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
    # Stamped from the environment, the way gate.py stamps every real report.
    inner.write_text(
        "import json, os, pathlib\n"
        "identity = {f: os.environ.get(v, 'local') for f, v in "
        f"{IDENTITY!r}.items()}}\n"
        "pathlib.Path('reports').mkdir(exist_ok=True)\n"
        "pathlib.Path('reports/preflight.json').write_text(json.dumps({\n"
        "    **identity, 'gate': 'preflight', 'status': 'PASS',\n"
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


def test_a_report_from_another_run_is_refused_even_when_it_is_fresh(
        tmp_path: Path, monkeypatch: "pytest.MonkeyPatch") -> None:
    """mtime answers "written recently", not "written by THIS run".

    Any mechanism that preserves or advances a timestamp defeats a freshness
    test on its own -- an archive extraction, a warm self-hosted workspace, a
    clock that stepped forward. Demonstrated before this guard existed: a
    report from run 111 with a future mtime was folded in, publishing a PASS
    check and a scope from a three-day-old run as this run's evidence.

    The fields that settle it are already in the file, and this is the same
    comparison aggregate_gates.rejection() makes.
    """
    monkeypatch.setenv("GITHUB_SHA", "1111111111111111111111111111111111111111")
    monkeypatch.setenv("GITHUB_RUN_ID", "999")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "1")
    monkeypatch.setenv("GITHUB_WORKFLOW", "verify")

    write_report(tmp_path, "preflight", commit="dead" * 10, run_id="111")
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert g.checks == [], "evidence from another run was folded in"
    assert any("another run" in w or "not folded in" in w for w in g.warnings), \
        "foreign evidence was refused silently"


def test_a_report_carrying_this_run_is_folded(
        tmp_path: Path, monkeypatch: "pytest.MonkeyPatch") -> None:
    """The control. The guard must not refuse the case it exists to allow."""
    monkeypatch.setenv("GITHUB_SHA", "1111111111111111111111111111111111111111")
    monkeypatch.setenv("GITHUB_RUN_ID", "999")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "1")
    monkeypatch.setenv("GITHUB_WORKFLOW", "verify")

    write_report(tmp_path, "preflight")
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert [c["subject"] for c in g.checks] == [
        "manifest parses", "every job is declared"]


def test_the_inner_findings_are_folded_not_dropped(tmp_path: Path) -> None:
    """The half the first version of absorb() missed.

    Folding checks and scope while dropping `failures` loses exactly what this
    exists to keep: when the inner writer is the step that FAILS, its findings
    are the routable ones. Measured before this fix -- two findings, each with
    a requirement and a fix and one with a file path, became ONE fallback
    record whose `where` was the multi-line bash script and whose `why` was
    the inner gate's own [GATE END] banner.
    """
    write_report(tmp_path, "preflight", status="FAIL", failures=[{
        "what": "gate 'preflight' no longer invokes its command",
        "where": ".github/workflows/verify.yml",
        "why": "no step runs: scripts/registry_gate.py",
        "requirement": "Every declared token must be executed.",
        "how_to_fix": "Restore `scripts/registry_gate.py` in the preflight job.",
        "severity": "ERROR", "code": "MUST_CONTAIN",
        "file": ".github/workflows/verify.yml", "line": 12, "column": None,
        "root_cause": None, "reproduction_command": "python3 scripts/gate_integrity.py",
        "is_root_cause": True, "dependent_on": None, "merge_blocking": True,
    }])
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert len(g.failures) == 1, "the inner findings were dropped"
    folded = g.failures[0]
    assert folded["code"] == "MUST_CONTAIN"
    assert folded["file"] == ".github/workflows/verify.yml"
    assert folded["line"] == 12
    assert folded["how_to_fix"].startswith("Restore")
    assert folded["reproduction_command"] == "python3 scripts/gate_integrity.py"


def test_the_inner_gate_version_is_adopted(tmp_path: Path) -> None:
    """gate_integrity.py and axle_gate.py both declare 2.0.0; run_gate's
    --version defaults to 1.0.0, so wrapping silently regressed the field.
    ci/gates.toml requires it but pins no value, so nothing caught it."""
    write_report(tmp_path, "preflight", gate_version="2.0.0")
    g = absorb_into(tmp_path, "preflight", time.time() - 60)

    assert g.version == "2.0.0"
