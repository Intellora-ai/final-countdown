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
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

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


def all_gates(cwd: Path) -> list[str]:
    import tomllib
    data = tomllib.loads((cwd / "ci" / "gates.toml").read_text(encoding="utf-8"))
    return [n for n, s in data["gates"].items() if s.get("mandatory")]


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
    wf = sandbox / ".github/workflows/axle-verify.yml"
    text = wf.read_text()
    sabotaged = "\n".join(l for l in text.splitlines()
                          if "scripts/axle_gate.py" not in l)
    assert sabotaged != text, "sabotage did not modify the workflow"
    wf.write_text(sabotaged)

    result = integrity(sandbox)
    assert result.returncode != 0, "a deleted gate invocation was NOT detected"
    assert "no longer runs its command" in result.stdout


# --------------------------------------------------------------------------
# Attack 2 — remove a required workflow entirely
# --------------------------------------------------------------------------
def test_attack_deleted_workflow_is_caught(sandbox: Path) -> None:
    (sandbox / ".github/workflows/coverage.yml").unlink()
    result = integrity(sandbox)
    assert result.returncode != 0, "a deleted workflow was NOT detected"
    assert "lost its workflow" in result.stdout


# --------------------------------------------------------------------------
# Attack 3 — introduce continue-on-error
# --------------------------------------------------------------------------
def test_attack_continue_on_error_is_caught(sandbox: Path) -> None:
    wf = sandbox / ".github/workflows/typecheck.yml"
    wf.write_text(wf.read_text().replace(
        "    steps:", "    continue-on-error: true\n    steps:", 1))
    result = integrity(sandbox)
    assert result.returncode != 0, "continue-on-error was NOT detected"
    assert "continue-on-error" in result.stdout


# --------------------------------------------------------------------------
# Attack 4 — suppress a gate failure with `|| true`
# --------------------------------------------------------------------------
def test_attack_failure_suppression_is_caught(sandbox: Path) -> None:
    wf = sandbox / ".github/workflows/vacuity-check.yml"
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
    wf = sandbox / ".github/workflows/coverage.yml"
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
