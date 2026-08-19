"""ADVERSARIAL TESTS — prove the defences, do not assert them.

Every test here performs a real attack against a throwaway copy of the
verification system and asserts the system catches it. Checking that a function
exists proves nothing; these run the actual checker or aggregator against
sabotaged input and require a non-zero exit or a blocking verdict.

The scenarios are the ones that currently pass silently in most CI systems:
a gate deleted while its job stays green, a report quietly missing, an
infrastructure failure dressed up as a test failure.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from typing import Any, cast

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable


# The aggregator binds evidence to the current run via these variables. The
# sandbox must not inherit the real ones: inside GitHub Actions they are set,
# so a test writing "local" reports would fail there while passing on a laptop.
# Stripping them makes every sandbox identity "local" on both, and the tests
# that need a mismatch set them explicitly.
RUN_IDENTITY_ENV = ("GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT",
                    "GITHUB_WORKFLOW")


def run(args: list[str], cwd: Path,
        env_extra: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    """Run a checker in an isolated working directory."""
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)  # never write to the real summary
    for var in RUN_IDENTITY_ENV:
        env.pop(var, None)
    env.update(env_extra or {})
    return subprocess.run([PY, *args], cwd=cwd, capture_output=True,
                          text=True, timeout=300, env=env)


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    """A copy of the verification system that tests may sabotage freely."""
    for rel in ("scripts", "ci", ".github/workflows"):
        src = REPO / rel
        dst = tmp_path / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dst)
    (tmp_path / "reports").mkdir()
    return tmp_path


def integrity(cwd: Path) -> subprocess.CompletedProcess[str]:
    return run([str(cwd / "scripts" / "gate_integrity.py")], cwd)


def aggregate(cwd: Path,
              env_extra: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return run([str(cwd / "scripts" / "aggregate_gates.py")], cwd, env_extra)


def write_report(cwd: Path, gate: str, status: str = "PASS",
                 *, filename: str | None = None,
                 omit: tuple[str, ...] = (),
                 **overrides: object) -> None:
    """Write one report. Defaults describe THIS run; overrides forge another.

    `omit` drops fields entirely, which is the distinct attack of leaving the
    identity out rather than getting it wrong.
    """
    report: dict[str, object] = {
        "schema_version": "1.1", "gate": gate, "status": status,
        "commit": "local", "run_id": "local", "run_attempt": "local",
        "workflow": "local",
        "duration_ms": 1, "checks_passed": 1, "checks_failed": 0,
        "scope": {}, "failures": [],
    }
    report.update(overrides)
    for field in omit:
        report.pop(field, None)
    name = filename or gate
    (cwd / "reports" / f"{name}.json").write_text(json.dumps(report),
                                                  encoding="utf-8")


VERIFY = ".github/workflows/verify.yml"


def all_gates(cwd: Path) -> list[str]:
    """Mandatory gates that must PRODUCE a report.

    The finalizer is mandatory but is excluded: its evidence is the manifest it
    is writing, so it cannot have reported before it runs. Writing a report for
    it would land in the `unexpected` bucket, which is correct behaviour.
    """
    import tomllib
    data = tomllib.loads((cwd / "ci" / "gates.toml").read_text(encoding="utf-8"))
    # `finalizer` has not reported when it runs; `scanner` (CodeQL) runs in
    # another workflow and publishes to code scanning, so neither contributes a
    # reports/*.json to this run's evidence tree.
    return [n for n, spec in data["gates"].items()
            if spec.get("mandatory")
            and spec.get("role") not in {"finalizer", "scanner",
                                          "code-scanning"}]


# --------------------------------------------------------------------------
# Baseline: the sandbox is healthy, so a caught attack is the attack's doing.
# --------------------------------------------------------------------------
def test_baseline_integrity_passes(sandbox: Path) -> None:
    assert integrity(sandbox).returncode == 0, "sandbox is not healthy to begin with"


def test_baseline_aggregate_passes_when_all_gates_report(sandbox: Path) -> None:
    for gate in all_gates(sandbox):
        write_report(sandbox, gate)
    assert aggregate(sandbox).returncode == 0


# --------------------------------------------------------------------------
# Attack 1 — delete a gate invocation, leave the job green
# --------------------------------------------------------------------------
def test_attack_deleted_gate_invocation_is_caught(sandbox: Path) -> None:
    """The headline scenario: remove the AXLE proof step, job still exits 0."""
    wf = sandbox / VERIFY
    text = wf.read_text()
    sabotaged = "\n".join(l for l in text.splitlines()
                          if "scripts/axle_gate.py" not in l)
    assert sabotaged != text, "sabotage did not modify the workflow"
    wf.write_text(sabotaged)

    result = integrity(sandbox)
    assert result.returncode != 0, "a deleted gate invocation was NOT detected"
    assert "no longer invokes its command" in result.stdout


# --------------------------------------------------------------------------
# Attack 2 — remove a required workflow entirely
# --------------------------------------------------------------------------
def test_attack_deleted_workflow_is_caught(sandbox: Path) -> None:
    (sandbox / VERIFY).unlink()
    result = integrity(sandbox)
    assert result.returncode != 0, "a deleted workflow was NOT detected"
    assert "lost its workflow" in result.stdout


# --------------------------------------------------------------------------
# Attack 3 — introduce continue-on-error
# --------------------------------------------------------------------------
def test_attack_continue_on_error_is_caught(sandbox: Path) -> None:
    wf = sandbox / VERIFY
    wf.write_text(wf.read_text().replace(
        "  pyright:\n", "  pyright:\n    continue-on-error: true\n", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "continue-on-error was NOT detected"
    assert "continue-on-error" in result.stdout


# --------------------------------------------------------------------------
# Attack 4 — suppress a gate failure with `|| true`
# --------------------------------------------------------------------------
def test_attack_failure_suppression_is_caught(sandbox: Path) -> None:
    wf = sandbox / VERIFY
    text = wf.read_text()
    line = next(l for l in text.splitlines() if "check_vacuity.py" in l)
    wf.write_text(text.replace(line, line + " || true"))
    result = integrity(sandbox)
    assert result.returncode != 0, "`|| true` on a gate command was NOT detected"
    assert "suppress" in result.stdout.lower()


# --------------------------------------------------------------------------
# Attack 5 — rename a job so the required check can never report
# --------------------------------------------------------------------------
def test_attack_renamed_job_is_caught(sandbox: Path) -> None:
    wf = sandbox / VERIFY
    wf.write_text(wf.read_text().replace("\n  coverage:", "\n  coverage_renamed:", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "a renamed job was NOT detected"
    assert "renamed or removed" in result.stdout


# --------------------------------------------------------------------------
# Attack 6 — delete a script a workflow invokes
# --------------------------------------------------------------------------
def test_attack_missing_script_is_caught(sandbox: Path) -> None:
    (sandbox / "scripts" / "check_vacuity.py").unlink()
    result = integrity(sandbox)
    assert result.returncode != 0, "a missing verifier script was NOT detected"
    assert "does not exist" in result.stdout


# --------------------------------------------------------------------------
# Attack 7 — a gate produces no report at all
# --------------------------------------------------------------------------
def test_attack_missing_report_fails_aggregation(sandbox: Path) -> None:
    gates = all_gates(sandbox)
    for gate in gates[1:]:
        write_report(sandbox, gate)
    result = aggregate(sandbox)
    assert result.returncode != 0, "a missing gate report did NOT fail aggregation"
    assert "no report produced" in result.stdout
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert manifest["overall"] == "FAIL"
    assert manifest["mergeable"] is False
    assert gates[0] in manifest["gates_missing"]


# --------------------------------------------------------------------------
# Attack 8 — a report is corrupt
# --------------------------------------------------------------------------
def test_attack_malformed_report_fails_aggregation(sandbox: Path) -> None:
    for gate in all_gates(sandbox):
        write_report(sandbox, gate)
    (sandbox / "reports/coverage.json").write_text("{not valid json", encoding="utf-8")
    result = aggregate(sandbox)
    assert result.returncode != 0, "a corrupt report did NOT fail aggregation"
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert manifest["overall"] == "FAIL"


# --------------------------------------------------------------------------
# Attack 9 — a gate reports a non-PASS status
# --------------------------------------------------------------------------
@pytest.mark.parametrize("status", ["FAIL", "INFRASTRUCTURE_FAILURE", "UNKNOWN", "SKIPPED"])
def test_non_pass_status_never_becomes_mergeable(sandbox: Path, status: str) -> None:
    """Only PASS and NOT_APPLICABLE may contribute to a mergeable run."""
    gates = all_gates(sandbox)
    for gate in gates:
        write_report(sandbox, gate)
    write_report(sandbox, gates[0], status=status)
    result = aggregate(sandbox)
    assert result.returncode != 0, f"status {status} was treated as mergeable"
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert manifest["mergeable"] is False
    assert gates[0] in manifest["blocking"]


def test_not_applicable_is_the_only_other_mergeable_status(sandbox: Path) -> None:
    gates = all_gates(sandbox)
    for gate in gates:
        write_report(sandbox, gate)
    write_report(sandbox, gates[0], status="NOT_APPLICABLE")
    assert aggregate(sandbox).returncode == 0


# --------------------------------------------------------------------------
# Attack 10 — the gate runner itself throws
# --------------------------------------------------------------------------
def test_crashing_gate_is_infrastructure_failure_not_pass(sandbox: Path) -> None:
    """An exception inside a gate must be recorded, not lost."""
    probe = sandbox / "scripts" / "crashing_gate.py"
    probe.write_text(
        "import sys\nfrom pathlib import Path\n"
        "sys.path.insert(0, str(Path(__file__).resolve().parent))\n"
        "from gate import Gate\n"
        "with Gate('crashy') as g:\n"
        "    raise RuntimeError('verifier exploded')\n",
        encoding="utf-8")
    result = run([str(probe)], sandbox)
    assert result.returncode != 0, "a crashing gate exited zero"
    report = json.loads((sandbox / "reports/crashy.json").read_text())
    assert report["status"] == "INFRASTRUCTURE_FAILURE"
    assert report["mergeable_contribution"] is False
    assert any("exploded" in f.get("why", "") for f in report["failures"])


# --------------------------------------------------------------------------
# Attack 11 — a gate exits without declaring a result
# --------------------------------------------------------------------------
def test_gate_that_declares_nothing_is_not_pass(sandbox: Path) -> None:
    """Silence must never be read as success."""
    probe = sandbox / "scripts" / "silent_gate.py"
    probe.write_text(
        "import sys\nfrom pathlib import Path\n"
        "sys.path.insert(0, str(Path(__file__).resolve().parent))\n"
        "from gate import Gate\n"
        "with Gate('silent') as g:\n"
        "    pass\n",
        encoding="utf-8")
    result = run([str(probe)], sandbox)
    assert result.returncode != 0, "a gate that declared nothing exited zero"
    report = json.loads((sandbox / "reports/silent.json").read_text())
    assert report["status"] == "UNKNOWN"


# --------------------------------------------------------------------------
# Attack 12 — wrapped command exits non-zero
# --------------------------------------------------------------------------
def test_wrapped_failing_command_produces_fail(sandbox: Path) -> None:
    result = run([str(sandbox / "scripts" / "run_gate.py"), "--name", "failing",
                  "--", PY, "-c", "import sys; sys.exit(3)"], sandbox)
    assert result.returncode != 0, "a failing wrapped command exited zero"
    report = json.loads((sandbox / "reports/failing.json").read_text())
    assert report["status"] == "FAIL"
    assert report["checks_failed"] == 1


def test_wrapped_missing_binary_is_infrastructure_failure(sandbox: Path) -> None:
    """A tool that is not installed is not a test failure."""
    result = run([str(sandbox / "scripts" / "run_gate.py"), "--name", "notool",
                  "--", "definitely-not-a-real-binary-xyz"], sandbox)
    assert result.returncode != 0
    report = json.loads((sandbox / "reports/notool.json").read_text())
    assert report["status"] == "INFRASTRUCTURE_FAILURE"


# --------------------------------------------------------------------------
# Schema — consumers must be able to trust the shape
# --------------------------------------------------------------------------
REQUIRED_FIELDS = [
    "schema_version", "gate", "gate_version", "status", "commit", "workflow",
    "job", "run_id", "run_attempt", "ref", "started_at", "ended_at", "duration_ms",
    "tool_versions", "scope", "checks_executed", "checks_passed",
    "checks_failed", "failures", "warnings", "artifacts",
]


def test_report_carries_every_required_field(sandbox: Path) -> None:
    run([str(sandbox / "scripts" / "run_gate.py"), "--name", "shape",
         "--", PY, "-c", "print('ok')"], sandbox)
    report = json.loads((sandbox / "reports/shape.json").read_text())
    missing = [f for f in REQUIRED_FIELDS if f not in report]
    assert not missing, f"report is missing required fields: {missing}"
    assert report["schema_version"] == "1.1"


# --------------------------------------------------------------------------
# Attack 13 — evidence generation itself fails
#
# Found live: an unwritable reports/ made the gate print a warning and exit 0,
# producing a green required check backed by no evidence at all.
# --------------------------------------------------------------------------
def test_unwritable_reports_dir_is_infrastructure_failure(sandbox: Path) -> None:
    reports = sandbox / "reports"
    reports.chmod(0o500)
    try:
        result = run([str(sandbox / "scripts" / "run_gate.py"), "--name", "noevidence",
                      "--", "/bin/echo", "hi"], sandbox)
        assert result.returncode != 0, (
            "a gate that could not write evidence exited zero — false green")
        assert "EVIDENCE GENERATION FAILED" in result.stdout
    finally:
        reports.chmod(0o700)


def test_report_is_written_atomically(sandbox: Path) -> None:
    """Write-then-rename: a crash mid-write must not leave a parseable stub."""
    run([str(sandbox / "scripts" / "run_gate.py"), "--name", "atomic",
         "--", PY, "-c", "print('ok')"], sandbox)
    assert (sandbox / "reports/atomic.json").is_file()
    assert not list((sandbox / "reports").glob("*.tmp")), "temp file left behind"


# --------------------------------------------------------------------------
# Attack 14 — a gate prints PASS while its command fails
# --------------------------------------------------------------------------
def test_stdout_saying_pass_cannot_override_exit_code(sandbox: Path) -> None:
    """Log text is not evidence. The exit code is."""
    result = run([str(sandbox / "scripts" / "run_gate.py"), "--name", "liar", "--",
                  PY, "-c", "print('PASS'); print('all gates green'); import sys; sys.exit(7)"],
                 sandbox)
    assert result.returncode != 0
    report = json.loads((sandbox / "reports/liar.json").read_text())
    assert report["status"] == "FAIL"
    assert report["mergeable_contribution"] is False


def test_killed_process_is_not_pass(sandbox: Path) -> None:
    result = run([str(sandbox / "scripts" / "run_gate.py"), "--name", "killed",
                  "--", "bash", "-c", "kill -9 $$"], sandbox)
    assert result.returncode != 0
    report = json.loads((sandbox / "reports/killed.json").read_text())
    assert report["status"] != "PASS"


# --------------------------------------------------------------------------
# Attack 15 — evidence that is real, valid and PASS, but from another run
#
# This is the attack that does not need a forger: it happens by itself. A
# rerun, a cached artifact, a stale checkout, `reports/` left on a self-hosted
# runner. Every report below is well-formed and says PASS. The only thing
# wrong with it is that it does not describe THIS commit.
# --------------------------------------------------------------------------
def test_attack_full_set_of_reports_from_another_run_is_rejected(sandbox: Path) -> None:
    """Yesterday's green must not satisfy today's merge."""
    for gate in all_gates(sandbox):
        write_report(sandbox, gate, commit="deadbeef" * 5, run_id="111111111",
                     workflow="full-verify")
    result = aggregate(sandbox, {"GITHUB_SHA": "a" * 40,
                                 "GITHUB_RUN_ID": "999999999",
                                 "GITHUB_WORKFLOW": "full-verify"})
    assert result.returncode != 0, (
        "ten PASS reports from a different run satisfied verification — false green")
    assert "belongs to another run" in result.stdout
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert manifest["mergeable"] is False
    assert set(manifest["gates_rejected"]) == set(all_gates(sandbox))


# run_attempt is the one that fires without anyone forging anything: hit
# "Re-run failed jobs" and GITHUB_RUN_ID is unchanged while the attempt moves.
@pytest.mark.parametrize("field", ["commit", "run_id", "run_attempt", "workflow"])
def test_attack_single_mismatched_identity_field_blocks(sandbox: Path,
                                                        field: str) -> None:
    """Each identity field is load-bearing on its own, not only in combination."""
    gates = all_gates(sandbox)
    env = {"GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "42",
           "GITHUB_RUN_ATTEMPT": "2", "GITHUB_WORKFLOW": "full-verify"}
    truth: dict[str, str] = {"commit": "a" * 40, "run_id": "42",
                             "run_attempt": "2", "workflow": "full-verify"}
    for gate in gates:
        write_report(sandbox, gate, commit=truth["commit"], run_id=truth["run_id"],
                     run_attempt=truth["run_attempt"], workflow=truth["workflow"])
    assert aggregate(sandbox, env).returncode == 0, "baseline identity should match"

    forged = dict(truth, **{field: "wrong-value"})
    write_report(sandbox, gates[0], commit=forged["commit"], run_id=forged["run_id"],
                 run_attempt=forged["run_attempt"], workflow=forged["workflow"])
    result = aggregate(sandbox, env)
    assert result.returncode != 0, f"a mismatched {field} did not block the merge"
    assert gates[0] in result.stdout


@pytest.mark.parametrize("omitted", ["commit", "run_id", "run_attempt",
                                     "workflow", "schema_version"])
def test_attack_report_omitting_identity_is_rejected(sandbox: Path, omitted: str) -> None:
    """Absence must fail closed, or forging evidence is just leaving fields out."""
    gates = all_gates(sandbox)
    for gate in gates:
        write_report(sandbox, gate)
    write_report(sandbox, gates[0], omit=(omitted,))
    result = aggregate(sandbox)
    assert result.returncode != 0, (
        f"a report with no {omitted} counted as evidence — unverifiable is not verified")
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert gates[0] in manifest["gates_rejected"]


def test_attack_report_claiming_a_real_commit_during_a_local_run_is_rejected(
        sandbox: Path) -> None:
    """The 'local' default must not become a hole that skips validation."""
    for gate in all_gates(sandbox):
        write_report(sandbox, gate, commit="c" * 40, run_id="7", workflow="full-verify")
    result = aggregate(sandbox)  # no GITHUB_* set -> identity is "local"
    assert result.returncode != 0, (
        "reports claiming a real run were admitted by a local run")


def test_attack_report_cannot_stand_in_for_another_gate(sandbox: Path) -> None:
    """One valid report renamed must not cover a gate that never ran."""
    gates = all_gates(sandbox)
    victim, donor = gates[0], gates[1]
    for gate in gates:
        write_report(sandbox, gate)
    # A real, PASSing report for `donor`, saved under `victim`'s filename.
    write_report(sandbox, donor, filename=victim)
    result = aggregate(sandbox)
    assert result.returncode != 0, (
        f"{donor}'s report stood in for {victim} — one gate covered two")
    assert "different gate than its filename" in result.stdout


def test_attack_future_schema_version_is_not_trusted(sandbox: Path) -> None:
    """Fields in an unknown major may not mean what this finalizer thinks."""
    gates = all_gates(sandbox)
    for gate in gates:
        write_report(sandbox, gate)
    write_report(sandbox, gates[0], schema_version="9.0")
    result = aggregate(sandbox)
    assert result.returncode != 0, "an unknown schema major was read as evidence"


# --------------------------------------------------------------------------
# Attack 16 — a gate that verifies nothing at all
#
# `while read; do ...; done` over an empty list runs zero times and exits 0.
# Three mandatory gates (spec-composition, mutmut, honest-report) are that
# loop, so an empty spec set would report PASS having checked no function.
# Same shape as an empty scan uploading a valid-but-blank report.
# --------------------------------------------------------------------------
def test_attack_per_function_loop_over_nothing_is_not_pass(tmp_path: Path) -> None:
    work = tmp_path / "work"
    (work / "scripts").mkdir(parents=True)
    (work / "specs").mkdir()
    shutil.copy(SCRIPTS / "verify_per_function.sh", work / "scripts")
    # A spec_source that resolves nothing, without failing: the loop's input is
    # empty for a reason the loop itself cannot see.
    (work / "scripts" / "spec_source.py").write_text("", encoding="utf-8")

    (work / "scripts" / "noop_verifier.py").write_text("", encoding="utf-8")
    result = subprocess.run(
        ["bash", "scripts/verify_per_function.sh", "scripts/noop_verifier.py"],
        cwd=work, capture_output=True, text=True, timeout=60)
    assert result.returncode != 0, (
        "a per-function gate with zero functions to verify exited 0 — false green")
    assert "zero functions" in result.stdout + result.stderr


def test_per_function_loop_still_reports_what_it_covered(tmp_path: Path) -> None:
    """The guard must not fire on the real spec set, and must state the count."""
    stub = tmp_path / "noop_verifier.py"
    stub.write_text("", encoding="utf-8")
    result = subprocess.run(
        ["bash", "scripts/verify_per_function.sh", str(stub)],
        cwd=REPO, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "verifying" in result.stdout and "source file(s)" in result.stdout


# --------------------------------------------------------------------------
# Attack 17 — the AXLE gate's SET, not its members
#
# The old shell loop verified every spec it found and reported success. It
# never asked whether the set it found was the set that should exist, so an
# empty specs/ and a deleted spec both produced a green required check.
# These run without touching AXLE: the completeness invariant is decided
# before any proof is submitted, which is the point of checking it first.
# --------------------------------------------------------------------------
def axle_sandbox(tmp_path: Path, specs: list[str], proofs: list[str]) -> Path:
    work = tmp_path / "axle"
    (work / "scripts").mkdir(parents=True)
    (work / "specs").mkdir()
    (work / "proofs").mkdir()
    (work / "reports").mkdir()
    for script in ("axle_gate.py", "gate.py"):
        shutil.copy(SCRIPTS / script, work / "scripts")
    for name in specs:
        shutil.copy(REPO / "specs" / f"{name}_spec.lean", work / "specs")
    for name in proofs:
        shutil.copy(REPO / "proofs" / f"{name}_proof.lean", work / "proofs")
    return work


def axle_gate(cwd: Path) -> subprocess.CompletedProcess[str]:
    return run([str(cwd / "scripts" / "axle_gate.py")], cwd)


def test_attack_axle_with_zero_specs_is_not_pass(tmp_path: Path) -> None:
    """Measured on the old gate: empty specs/ printed 'All proofs verified'."""
    result = axle_gate(axle_sandbox(tmp_path, [], []))
    assert result.returncode != 0, (
        "an empty spec set reported success — the gate verified nothing")
    assert "no specs to verify" in result.stdout


def test_attack_axle_orphan_proof_is_not_pass(tmp_path: Path) -> None:
    """Deleting a spec must not silently drop a function from verification."""
    result = axle_gate(axle_sandbox(tmp_path, [], ["add"]))
    assert result.returncode != 0, "a proof whose spec was deleted passed"
    assert "proof but no spec" in result.stdout


def test_attack_axle_missing_proof_is_not_pass(tmp_path: Path) -> None:
    result = axle_gate(axle_sandbox(tmp_path, ["add"], []))
    assert result.returncode != 0, "a spec with no proof passed"
    assert "spec but no proof" in result.stdout


def test_axle_reports_incompleteness_as_fail_not_infrastructure(
        tmp_path: Path) -> None:
    """An incomplete set is the repository's fault, not the service's."""
    axle_gate(work := axle_sandbox(tmp_path, [], ["add"]))
    report = json.loads((work / "reports/axle-verify.json").read_text())
    assert report["status"] == "FAIL"
    assert report["mergeable_contribution"] is False
    assert report["scope"]["specs_found"] == 0
    assert report["scope"]["proofs_found"] == 1


def test_axle_missing_binary_is_infrastructure_failure(tmp_path: Path) -> None:
    """'Could not verify' must stay distinguishable from 'did not verify'."""
    work = axle_sandbox(tmp_path, ["add"], ["add"])
    env = dict(os.environ)
    env["PATH"] = "/nonexistent"
    env.pop("GITHUB_STEP_SUMMARY", None)
    result = subprocess.run([PY, str(work / "scripts" / "axle_gate.py")],
                            cwd=work, capture_output=True, text=True,
                            timeout=120, env=env)
    assert result.returncode != 0
    report = json.loads((work / "reports/axle-verify.json").read_text())
    assert report["status"] == "INFRASTRUCTURE_FAILURE", (
        "an absent AXLE was reported as a failed proof")


# --------------------------------------------------------------------------
# Attack 18 — documentation describing a verification system that is not the
# one running. The README told people to run a script that had been deleted,
# and nothing failed. Narrow by design: an INVOCATION of a missing script, not
# every mention, so evidence.md can keep honestly documenting what is absent.
# --------------------------------------------------------------------------
def test_attack_doc_invoking_a_deleted_script_is_caught(sandbox: Path) -> None:
    (sandbox / "README.md").write_text(
        "## Use\n\n```bash\npython3 scripts/ghost_gate.py\n```\n", encoding="utf-8")
    result = integrity(sandbox)
    assert result.returncode != 0, (
        "a doc telling people to run a nonexistent verifier was not caught")
    assert "documentation names a script that does not exist" in result.stdout


def test_doc_documenting_an_absent_script_is_allowed(sandbox: Path) -> None:
    """Honesty about what does not exist must not be punished."""
    (sandbox / "evidence.md").write_text(
        "| `scripts/translate_to_lean.py` | **NO** — not built |\n",
        encoding="utf-8")
    assert integrity(sandbox).returncode == 0, (
        "documenting an absent script as absent was treated as drift")


# --------------------------------------------------------------------------
# Attack 19 — a gate that runs, goes red, and blocks nothing
#
# ci/gates.toml's [ruleset] block was a copy of the live GitHub ruleset that
# nothing compared against GitHub. gate_integrity check 6 validated the
# manifest against itself, so the dangerous direction — a mandatory gate that
# GitHub does not actually require — was invisible.
# --------------------------------------------------------------------------
def ruleset_sandbox(tmp_path: Path, gates_toml: str) -> Path:
    work = tmp_path / "rs"
    (work / "scripts").mkdir(parents=True)
    (work / "ci").mkdir()
    shutil.copy(SCRIPTS / "check_ruleset.py", work / "scripts")
    (work / "ci" / "gates.toml").write_text(gates_toml, encoding="utf-8")
    return work


def test_attack_required_check_with_no_mandatory_gate_is_caught(
        tmp_path: Path) -> None:
    toml = (REPO / "ci" / "gates.toml").read_text(encoding="utf-8")
    toml = toml.replace('"bandit", "mutmut",', '"bandit", "mutmut", "ghost-gate",')
    work = ruleset_sandbox(tmp_path, toml)
    result = run([str(work / "scripts" / "check_ruleset.py")], work)
    assert result.returncode != 0
    assert "ghost-gate" in result.stdout


def test_ruleset_check_treats_unreachable_github_as_unknown(
        tmp_path: Path) -> None:
    """'Could not compare' must not read as 'aligned'."""
    work = ruleset_sandbox(
        tmp_path, (REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    env = dict(os.environ)
    env["PATH"] = "/nonexistent"      # no gh
    env.pop("GITHUB_STEP_SUMMARY", None)
    result = subprocess.run([PY, str(work / "scripts" / "check_ruleset.py")],
                            cwd=work, capture_output=True, text=True,
                            timeout=120, env=env)
    assert result.returncode != 0, "an unverifiable ruleset reported success"
    assert "CANNOT COMPARE" in result.stdout


# --------------------------------------------------------------------------
# Attack 20 — every spec verifier, given nothing, must not report success
#
# Property, not example: `for spec in sys.argv[1:]` exits 0 when the list is
# empty, so any verifier written that way passes having examined nothing.
# check_vacuity.py and find_counterexample.py both did. Parametrised so a
# verifier added later is covered without anyone remembering to add a test.
# --------------------------------------------------------------------------
SPEC_VERIFIERS = ["enforce_spec.py", "check_vacuity.py",
                  "find_counterexample.py", "check_composition.py"]


@pytest.mark.parametrize("verifier", SPEC_VERIFIERS)
def test_spec_verifier_with_no_specs_is_not_success(verifier: str,
                                                    tmp_path: Path) -> None:
    result = subprocess.run([PY, str(SCRIPTS / verifier)], cwd=REPO,
                            capture_output=True, text=True, timeout=120)
    assert result.returncode != 0, (
        f"{verifier} exited 0 with no specs — it verified nothing and said so "
        "in the affirmative")


@pytest.mark.parametrize("verifier", SPEC_VERIFIERS)
def test_spec_verifier_with_a_nonexistent_path_is_not_success(
        verifier: str, tmp_path: Path) -> None:
    """bash leaves an unmatched glob as a literal, so this is the live path."""
    result = subprocess.run(
        [PY, str(SCRIPTS / verifier), str(tmp_path / "*_spec.lean")],
        cwd=REPO, capture_output=True, text=True, timeout=120)
    assert result.returncode != 0, (
        f"{verifier} exited 0 on a spec path that does not exist")


# ==========================================================================
# The consolidated topology: verify.yml, artifact-based aggregation.
# ==========================================================================

def evidence_tree(cwd: Path, gates: list[str], **kw: object) -> Path:
    """Reproduce what download-artifact leaves behind: one dir per artifact."""
    root = cwd / "evidence"
    for gate in gates:
        (root / f"reports-{gate}").mkdir(parents=True, exist_ok=True)
        report: dict[str, object] = {
            "schema_version": "1.1", "gate": gate, "status": "PASS",
            "commit": "local", "run_id": "local", "run_attempt": "local",
            "workflow": "local", "duration_ms": 1, "failures": [],
        }
        report.update(kw)
        (root / f"reports-{gate}" / f"{gate}.json").write_text(
            json.dumps(report), encoding="utf-8")
    return root


def aggregate_root(cwd: Path, root: Path) -> subprocess.CompletedProcess[str]:
    return run([str(cwd / "scripts" / "aggregate_gates.py"),
                "--evidence-root", str(root)], cwd)


# --------------------------------------------------------------------------
# Attack 21 — a gate step that is present but conditioned away
#
# `if: false` is the reason this checker parses YAML instead of searching text.
# The step is in the file, the job exits 0, the required check goes green, and
# the gate never ran. Containment is not execution.
# --------------------------------------------------------------------------
def test_attack_gate_step_conditioned_away_is_caught(sandbox: Path) -> None:
    wf = sandbox / VERIFY
    text = wf.read_text()
    line = next(l for l in text.splitlines() if "scripts/axle_gate.py" in l)
    indent = " " * (len(line) - len(line.lstrip()))
    wf.write_text(text.replace(line, f"{line}\n{indent}if: false", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "a conditioned-away gate step was NOT detected"
    assert "runs conditionally" in result.stdout


def test_attack_undeclared_job_condition_is_caught(sandbox: Path) -> None:
    """Only the finalizer may carry a job-level `if:`, and only as declared."""
    wf = sandbox / VERIFY
    wf.write_text(wf.read_text().replace(
        "  mutmut:\n", "  mutmut:\n    if: github.actor != 'nobody'\n", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "an undeclared job condition was NOT detected"
    assert "runs conditionally" in result.stdout


# --------------------------------------------------------------------------
# Attack 22 — evidence that never arrives, quietly
#
# `if-no-files-found: ignore` means a gate that produced no report uploads
# nothing and the job stays green. The finalizer then sees a missing gate, but
# only if the upload itself was supposed to be loud.
# --------------------------------------------------------------------------
def test_attack_ignoring_a_missing_artifact_is_caught(sandbox: Path) -> None:
    wf = sandbox / VERIFY
    wf.write_text(wf.read_text().replace(
        "if-no-files-found: error", "if-no-files-found: ignore", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "a silently-ignored missing artifact was allowed"
    assert "ignores a missing artifact" in result.stdout


def test_attack_evidence_only_uploaded_on_success_is_caught(sandbox: Path) -> None:
    """Evidence matters most on failure."""
    wf = sandbox / VERIFY
    text = wf.read_text()
    i = text.index("name: reports-coverage")
    j = text.rindex("if: always()", 0, i)
    wf.write_text(text[:j] + "if: success()" + text[j + len("if: always()"):])
    result = integrity(sandbox)
    assert result.returncode != 0, "upload-only-on-success was NOT detected"
    assert "only uploads evidence when it passes" in result.stdout


# --------------------------------------------------------------------------
# Attack 23 — the finalizer must block nothing less than the complete set
# --------------------------------------------------------------------------
def test_aggregate_reads_downloaded_artifact_tree(sandbox: Path) -> None:
    """Baseline: one directory per artifact, exactly as download-artifact leaves it."""
    root = evidence_tree(sandbox, all_gates(sandbox))
    assert aggregate_root(sandbox, root).returncode == 0


def test_attack_one_artifact_missing_from_the_tree(sandbox: Path) -> None:
    gates = all_gates(sandbox)
    root = evidence_tree(sandbox, gates[1:])          # first gate's upload failed
    result = aggregate_root(sandbox, root)
    assert result.returncode != 0, "a gate with no artifact was counted as verified"
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert gates[0] in manifest["gates_missing"]
    assert gates[0] in manifest["blocking"]


def test_attack_duplicate_reports_for_one_gate_block(sandbox: Path) -> None:
    """Two authoritative answers is an ambiguity, not redundancy."""
    gates = all_gates(sandbox)
    root = evidence_tree(sandbox, gates)
    # A re-run leaving a second artifact behind that also claims this gate.
    stray = root / "reports-rerun"
    stray.mkdir(parents=True)
    shutil.copy(root / f"reports-{gates[0]}" / f"{gates[0]}.json",
                stray / f"{gates[0]}.json")
    result = aggregate_root(sandbox, root)
    assert result.returncode != 0, "two reports for one gate were merged silently"
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert gates[0] in manifest["gates_duplicated"]


def test_attack_unexpected_gate_evidence_blocks(sandbox: Path) -> None:
    """ObservedGateSet == ExpectedGateSet, not merely ⊇."""
    root = evidence_tree(sandbox, [*all_gates(sandbox), "ghost-gate"])
    result = aggregate_root(sandbox, root)
    assert result.returncode != 0, "evidence for an undeclared gate was accepted"
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert "ghost-gate" in manifest["gates_unexpected"]


def test_finalizer_is_not_expected_to_report_on_itself(sandbox: Path) -> None:
    """Its evidence is the manifest it is writing; requiring one would deadlock."""
    manifest_spec = (sandbox / "ci" / "gates.toml").read_text(encoding="utf-8")
    assert 'role = "finalizer"' in manifest_spec
    root = evidence_tree(sandbox, all_gates(sandbox))
    assert aggregate_root(sandbox, root).returncode == 0
    manifest = json.loads((sandbox / "reports/gate-manifest.json").read_text())
    assert "full" not in manifest["gates_expected"]


# --------------------------------------------------------------------------
# Attack 24 — a mandatory gate that GitHub does not require blocks nothing
# --------------------------------------------------------------------------
def test_attack_mandatory_gate_absent_from_required_checks_is_caught(
        sandbox: Path) -> None:
    toml = sandbox / "ci" / "gates.toml"
    text = toml.read_text()
    line = next(l for l in text.splitlines() if '"mutmut"' in l and "required" not in l)
    toml.write_text(text.replace(line, '  "bandit",'))
    result = integrity(sandbox)
    assert result.returncode != 0, "a gate that blocks nothing was not detected"
    assert "mandatory but not required" in result.stdout


def test_preflight_is_itself_mandatory(sandbox: Path) -> None:
    """An integrity failure that does not block a merge is a diagnostic."""
    import tomllib
    data = tomllib.loads((sandbox / "ci" / "gates.toml").read_text(encoding="utf-8"))
    assert data["gates"]["preflight"]["mandatory"] is True
    assert "preflight" in data["ruleset"]["required_checks"]
    assert "full" in data["ruleset"]["required_checks"]


# ==========================================================================
# Attack 25 — the two enforcement blockers: preflight and CodeQL
#
# Both exist to be REQUIRED. A scanner that runs and reports, but that GitHub
# does not require, blocks nothing — and an integrity check outside the
# enforcement boundary is a diagnostic, not a gate.
# ==========================================================================
CODEQL = ".github/workflows/codeql.yml"


def manifest_of(sandbox: Path) -> dict[str, Any]:
    import tomllib
    return tomllib.loads((sandbox / "ci" / "gates.toml").read_text(encoding="utf-8"))


def test_codeql_and_preflight_are_mandatory_and_required(sandbox: Path) -> None:
    data = manifest_of(sandbox)
    gates = cast_dict(data["gates"])
    required = set(cast_list(cast_dict(data["ruleset"])["required_checks"]))
    for name in ("preflight", "full", "codeql-python", "codeql-actions"):
        assert cast_dict(gates[name])["mandatory"] is True, name
        assert name in required, f"{name} is mandatory but not required"


def cast_dict(v: object) -> dict[str, Any]:
    assert isinstance(v, dict)
    return cast("dict[str, Any]", v)


def cast_list(v: object) -> list[Any]:
    assert isinstance(v, list)
    return cast("list[Any]", v)


def test_attack_codeql_workflow_deleted_is_caught(sandbox: Path) -> None:
    (sandbox / CODEQL).unlink()
    result = integrity(sandbox)
    assert result.returncode != 0, "deleting the CodeQL workflow was not caught"
    assert "lost its workflow" in result.stdout


def test_attack_codeql_job_renamed_is_caught(sandbox: Path) -> None:
    wf = sandbox / CODEQL
    wf.write_text(wf.read_text().replace("\n  codeql-python:", "\n  codeql_py:", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "renaming a CodeQL job was not caught"
    assert "renamed or removed" in result.stdout


def test_attack_codeql_analyze_step_removed_is_caught(sandbox: Path) -> None:
    """Init without analyze produces no results, and no results is not clean."""
    wf = sandbox / CODEQL
    text = wf.read_text()
    wf.write_text("\n".join(l for l in text.splitlines()
                            if "codeql-action/analyze@" not in l))
    result = integrity(sandbox)
    assert result.returncode != 0, "removing the analyze step was not caught"
    assert "no longer invokes its command" in result.stdout


def test_attack_codeql_step_conditioned_away_is_caught(sandbox: Path) -> None:
    wf = sandbox / CODEQL
    text = wf.read_text()
    line = next(l for l in text.splitlines() if "codeql-action/analyze@" in l)
    indent = " " * (len(line) - len(line.lstrip()))
    wf.write_text(text.replace(line, f"{line}\n{indent}if: false", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "a conditioned-away CodeQL analysis passed"
    assert "runs conditionally" in result.stdout


def test_attack_continue_on_error_on_codeql_is_caught(sandbox: Path) -> None:
    wf = sandbox / CODEQL
    wf.write_text(wf.read_text().replace(
        "  codeql-python:\n", "  codeql-python:\n    continue-on-error: true\n", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "continue-on-error on CodeQL was not caught"
    assert "continue-on-error" in result.stdout


# `github.event.<path>` is the attacker-controlled payload — issue titles, PR
# bodies, branch names — and `github.head_ref` is attacker-chosen text. Both
# belong in this pattern. `github.event_name` does not: it is a GitHub-set enum
# from a closed set (`push`, `pull_request`, `schedule`, …) with no attacker
# input anywhere in it.
#
# The earlier pattern was `github\.(event|head_ref)`, which matched
# `github.event_name` because `event` prefixes it. That is a false positive, and
# false positives are how a security gate gets switched off: the first person to
# hit one has to choose between a legitimate change and a red build, and the
# gate loses that argument eventually. Requiring the dot makes the pattern say
# what its docstring already said.
_UNTRUSTED_INTERPOLATION = re.compile(r"\$\{\{\s*github\.(event\.|head_ref)")


def test_codeql_workflow_has_no_untrusted_interpolation(sandbox: Path) -> None:
    """A workflow that interpolates event text into a shell is the injection
    class CodeQL's `actions` pack exists to find. Not in our own file."""
    text = (sandbox / CODEQL).read_text(encoding="utf-8")
    assert not _UNTRUSTED_INTERPOLATION.search(text)


@pytest.mark.parametrize("dangerous", [
    "run: echo ${{ github.event.issue.title }}",
    "run: echo ${{ github.event.pull_request.body }}",
    "run: echo ${{ github.event.comment.body }}",
    "run: echo ${{ github.event.head_commit.message }}",
    "ref: refs/heads/${{ github.head_ref }}",
    "run: echo ${{  github.event.issue.title  }}",          # extra whitespace
])
def test_the_injection_shapes_still_fire(dangerous: str) -> None:
    """The narrowing above must not have bought quiet by going blind.

    Every one of these is real attacker-controlled text reaching a workflow.
    If a change to the pattern ever stops one of them matching, that change
    weakened a security check rather than corrected it, and this goes red.
    """
    assert _UNTRUSTED_INTERPOLATION.search(dangerous), (
        f"injection shape no longer detected: {dangerous}")


@pytest.mark.parametrize("safe", [
    "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    "group: ${{ github.workflow }}-${{ github.ref }}",
    "if: ${{ github.repository == 'Intellora-ai/final-countdown' }}",
])
def test_github_set_values_are_not_flagged(safe: str) -> None:
    """The values GitHub sets itself carry no attacker input and must pass."""
    assert not _UNTRUSTED_INTERPOLATION.search(safe), (
        f"false positive on a GitHub-set value: {safe}")


def test_scanner_role_is_exempt_only_from_the_artifact_check(sandbox: Path) -> None:
    """CodeQL publishes to code scanning, not to reports/ — but every
    structural check still applies, which the sabotage tests above prove."""
    gates = cast_dict(manifest_of(sandbox)["gates"])
    for name in ("codeql-python", "codeql-actions"):
        spec = cast_dict(gates[name])
        assert spec["role"] == "scanner"
        assert spec["artifact"] == ""
        assert "code scanning" in str(spec["evidence"])


# --------------------------------------------------------------------------
# Attack 26 — the command is present and nothing runs it
#
# Found live, on this repository: `echo python3 scripts/axle_gate.py` passed
# gate_integrity with exit 0. The string was there, the gate was gone, and
# preflight went green — the exact failure the checker's own docstring names.
# Containment is not execution, and neither is a comment.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("prefix", ["echo", "printf", "cat", "true", ":"])
def test_attack_gate_command_is_only_printed_not_run(sandbox: Path,
                                                     prefix: str) -> None:
    wf = sandbox / VERIFY
    wf.write_text(wf.read_text().replace(
        "        run: python3 scripts/axle_gate.py",
        f"        run: {prefix} python3 scripts/axle_gate.py", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, (
        f"`{prefix} <gate command>` satisfied the gate — it runs nothing")
    # `:` makes `run: : cmd` invalid YAML, so it is caught one step earlier.
    # Either detection is correct; silently passing is the only failure.
    assert ("no longer invokes its command" in result.stdout
            or "not valid YAML" in result.stdout), result.stdout[-600:]


def test_attack_gate_command_only_in_a_comment(sandbox: Path) -> None:
    """A comment naming a verifier is documentation, not an invocation."""
    wf = sandbox / VERIFY
    wf.write_text(wf.read_text().replace(
        "        run: python3 scripts/axle_gate.py",
        "        run: |\n          # python3 scripts/axle_gate.py\n          true", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "a commented-out gate satisfied the gate"


def test_real_launchers_still_count_as_execution(sandbox: Path) -> None:
    """The fix must not reject the ways gates are actually launched here."""
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import executes
    assert executes("python3 scripts/axle_gate.py", "scripts/axle_gate.py")
    assert executes("bash scripts/verify_per_function.sh scripts/x.py --min 0.9",
                    "scripts/x.py")
    assert executes("python3 scripts/run_gate.py --name c -- pytest --cov-fail-under=95",
                    "--cov-fail-under=95")
    assert executes("AXLE_ENV=lean-4.33.0 python3 scripts/axle_gate.py",
                    "scripts/axle_gate.py")
    assert not executes("echo python3 scripts/axle_gate.py", "scripts/axle_gate.py")
    assert not executes("# python3 scripts/axle_gate.py", "scripts/axle_gate.py")


def test_only_app_posted_roles_are_exempt_from_reporting(sandbox: Path) -> None:
    """Every mandatory gate that IS a workflow job must still report.

    The exemption exists because three roles genuinely produce no
    reports/*.json in the verify run. If it ever widened to a role that runs as
    a job, that gate could go missing and the finalizer would not notice.
    """
    import tomllib
    data = tomllib.loads((sandbox / "ci" / "gates.toml").read_text(encoding="utf-8"))
    exempt = {"finalizer", "scanner", "code-scanning"}
    for name, spec in cast_dict(data["gates"]).items():
        s = cast_dict(spec)
        if not s.get("mandatory"):
            continue
        if s.get("role") in exempt:
            continue
        assert s.get("job"), f"{name} must name the job that produces its report"
        assert s.get("artifact"), f"{name} must declare an artifact"
