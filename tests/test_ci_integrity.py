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
import tomllib
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

    # Read from ci/gates.toml rather than pinned to a literal. The manifest
    # block calls itself "the report shape scripts/gate.py writes", so the two
    # must agree; a literal here makes every additive schema bump a test edit,
    # and a test people edit to make green stops being a check. Both directions
    # are caught: gate.py bumping without the manifest, and the reverse.
    declared = tomllib.loads(
        (sandbox / "ci" / "gates.toml").read_text(encoding="utf-8"))
    assert report["schema_version"] == declared["schema"]["version"], (
        f"gate.py writes {report['schema_version']}, ci/gates.toml declares "
        f"{declared['schema']['version']}")

    # And the manifest's own field list must be satisfied, which is the part
    # that was declared and never read: `required_fields` had zero consumers.
    manifest_missing = [f for f in declared["schema"]["required_fields"]
                        if f not in report]
    assert not manifest_missing, (
        f"ci/gates.toml declares fields the report does not carry: "
        f"{manifest_missing}")


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
    # The STEP that runs axle_gate.py, not the first line that mentions it.
    # Since the gate moved inside a `bash -c` chain, the workflow also carries
    # COMMENT lines naming the script -- and `if:` after a comment is inert, so
    # anchoring on a mention would sabotage nothing and the attack would look
    # defeated when it had never been mounted.
    line = next(l for l in text.splitlines()
                if l.lstrip().startswith("- name:")
                and "verify all proofs with AXLE" in l)
    # `+ 2` because the `- ` of the list item occupies two columns: a sibling
    # key of `name:` sits two further in. At the dash's own indent the file
    # stops being valid YAML, and gate_integrity then rejects it for parsing
    # rather than for the conditional -- which is a different check passing,
    # not this attack being caught.
    indent = " " * (len(line) - len(line.lstrip()) + 2)
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
    # In-chain form: axle_gate.py moved inside the
    # `run_gate.py --name axle-verify -- bash -c` wrapper, so the old bare
    # `run:` line no longer exists. The attack is unchanged -- a launcher that
    # only prints the command still runs no verification -- and `sabotage`
    # asserts the target is present, so this cannot silently swap nothing.
    sabotage(sandbox, VERIFY, AXLE_GATE_STEP,
             AXLE_GATE_STEP.replace("python3 scripts/axle_gate.py",
                                    f"{prefix} python3 scripts/axle_gate.py"))
    result = integrity(sandbox)
    assert result.returncode != 0, (
        f"`{prefix} <gate command>` satisfied the gate — it runs nothing")
    # `:` makes `run: : cmd` invalid YAML, so it is caught one step earlier.
    # Either detection is correct; silently passing is the only failure.
    assert ("no longer invokes its command" in result.stdout
            or "not valid YAML" in result.stdout), result.stdout[-600:]


def test_attack_gate_command_only_in_a_comment(sandbox: Path) -> None:
    """A comment naming a verifier is documentation, not an invocation."""
    sabotage(sandbox, VERIFY, AXLE_GATE_STEP,
             "            # python3 scripts/axle_gate.py\n            true")
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


# --------------------------------------------------------------------------
# Attack 27 — the token is present, and nothing in command position runs it
#
# `executes()` returned True for any line whose FIRST word was a known
# launcher and whose token appeared ANYWHERE on that line. Two places the
# token can sit while running nothing:
#
#   * a trailing `#` comment. Only lines STARTING with `#` were skipped, and
#     inside a `run: |` block scalar YAML hands the `#` through as shell text.
#   * a quoted string: `python3 -c "print('scripts/axle_gate.py')"`.
#
# Measured on this repository before the fix: each sabotage below left
# gate_integrity at `passed=80 failed=0`, exit 0 — the threshold lowered or
# the gate replaced by a no-op, and preflight still green.
# --------------------------------------------------------------------------
E2E = ".github/workflows/e2e.yml"

COVERAGE_STEP = ('run: python3 scripts/run_gate.py --name coverage -- pytest '
                 '--cov=src --cov-branch --cov-fail-under=95 -m "not axle"')
MUTMUT_STEP = ('run: python3 scripts/run_gate.py --name mutmut -- bash '
               'scripts/verify_per_function.sh scripts/mutation_gate.py '
               '--min-score 0.95')
# ANCHORED ON THE IN-CHAIN FORM, for the same reason SHELLCHECK_STEP below is.
# enforce_spec.py used to be a bare `run:` step that owned no report: a spec
# breaking a syntactic rule turned axle-verify red with every detail of WHICH
# spec and WHICH rule living only in the job log, because axle_gate.py -- what
# writes reports/axle-verify.json -- never ran. It now runs inside the
# `run_gate.py --name axle-verify -- bash -c` chain.
#
# The attack these tests model still lands on the in-chain form: `set -e` stops
# at the first non-zero exit, so a suppressor on this line discards it and the
# chain runs on to record a PASS over a failed check. Re-anchored, not deleted.
ENFORCE_STEP = "            python3 scripts/enforce_spec.py specs/*_spec.lean"
# shellcheck is no longer a standalone step. It runs inside the bandit gate's
# single `run_gate.py --name bandit -- bash -c` chain, so it now DOES own a
# report -- that was the point of wrapping it. The attack still matters: `set -e`
# stops the chain at the first non-zero exit, and a suppressor on this line
# discards that exit, so the chain continues and the gate records a PASS over a
# check that failed. Anchored on the indented in-chain form.
# `-f gcc` is part of the pinned string, not incidental: run_gate.py's
# shellcheck extractor parses that format, and shellcheck's default rendering
# is three lines per finding with a caret ruler that carries no parseable
# position. Dropping the flag would silently collapse every shell finding back
# into one record, so the sabotage target names the whole invocation.
SHELLCHECK_STEP = "            shellcheck -f gcc scripts/*.sh"

# axle_gate.py runs inside the `run_gate.py --name axle-verify -- bash -c`
# chain, not as a bare `run:` step. Same re-anchoring as ENFORCE_STEP above and
# SHELLCHECK_STEP here: the attacks these tests model all still land on the
# in-chain form, because `set -e` stops at the first non-zero exit and a
# suppressor on this line discards it.
AXLE_GATE_STEP = "            python3 scripts/axle_gate.py"


def sabotage(sandbox: Path, workflow: str, old: str, new: str) -> None:
    """Swap one step, asserting the target really was there to swap."""
    p = sandbox / workflow
    text = p.read_text(encoding="utf-8")
    assert old in text, f"sabotage target not present in {workflow}: {old!r}"
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


@pytest.mark.parametrize(("workflow", "old", "new"), [
    # coverage floor dropped to 0; the real threshold demoted to a comment
    (VERIFY, COVERAGE_STEP,
     'run: |\n          python3 scripts/run_gate.py --name coverage -- pytest '
     '--cov=src --cov-branch --cov-fail-under=0 -m "not axle"   '
     '# was --cov-fail-under=95'),
    # mutation score floor dropped from 0.95 to 0.10 the same way
    (VERIFY, MUTMUT_STEP,
     'run: |\n          python3 scripts/run_gate.py --name mutmut -- bash '
     'scripts/verify_per_function.sh scripts/mutation_gate.py --min-score 0.10'
     '   # was --min-score 0.95'),
    # the e2e suite replaced by a no-op that merely names it
    (E2E, "run: npm run test:e2e",
     "run: |\n          npm --version   # npm run test:e2e"),
], ids=["coverage-threshold", "mutation-threshold", "e2e-noop"])
def test_attack_token_demoted_to_a_trailing_comment(sandbox: Path,
                                                    workflow: str,
                                                    old: str, new: str) -> None:
    """A `#` comment naming the gate is documentation, not an invocation —
    wherever on the line it sits."""
    sabotage(sandbox, workflow, old, new)
    result = integrity(sandbox)
    assert result.returncode != 0, (
        "the threshold was lowered and the old value parked in a comment; "
        "gate_integrity passed")
    assert "no longer invokes its command" in result.stdout, result.stdout[-800:]


def test_attack_token_only_inside_a_quoted_string(sandbox: Path) -> None:
    """`python3 -c "print('...')"` starts with a launcher and runs nothing."""
    sabotage(sandbox, VERIFY, AXLE_GATE_STEP,
             "            python3 -c \"print('scripts/axle_gate.py')\"")
    result = integrity(sandbox)
    assert result.returncode != 0, "a quoted mention satisfied the gate"
    assert "no longer invokes its command" in result.stdout, result.stdout[-800:]


def test_executes_rejects_mentions_that_run_nothing() -> None:
    """Unit level, against the live function. Every one of these returned
    True before the fix."""
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import executes
    assert not executes('python3 -c "print(\'scripts/axle_gate.py\')"',
                        "scripts/axle_gate.py")
    assert not executes("pytest -q  # shellcheck scripts/*.sh", "shellcheck")
    assert not executes("npm run something-else  # npm run test:e2e",
                        "npm run test:e2e")
    assert not executes("pytest --cov-fail-under=0  # was --cov-fail-under=95",
                        "--cov-fail-under=95")
    assert not executes("bash x.sh --min-score 0.10  # was --min-score 0.95",
                        "--min-score 0.95")
    # a token buried inside a quoted argument is data, not a command
    assert not executes('pytest -m "not --cov-fail-under=95 x"',
                        "--cov-fail-under=95")


def test_every_mandatory_token_is_still_found_in_the_real_workflows() -> None:
    """The strictness must not have been bought by going blind.

    Every `must_contain` token in the shipped manifest has to resolve against
    the shipped workflows, or the fix broke the repository it guards.
    """
    import sys as _s
    import tomllib

    import yaml
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import executes, steps_of
    data = tomllib.loads((REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    checked = 0
    for name, spec in cast_dict(data["gates"]).items():
        s = cast_dict(spec)
        if not s.get("mandatory") or s.get("role") == "code-scanning":
            continue
        wf = REPO / ".github" / "workflows" / str(s["workflow"])
        doc = cast_dict(yaml.safe_load(wf.read_text(encoding="utf-8")) or {})
        job = cast_dict(doc["jobs"]).get(str(s["job"]))
        assert job is not None, f"{name}: job {s['job']} missing"
        steps = steps_of(cast_dict(job))
        for token in [str(t) for t in cast_list(s.get("must_contain", []))]:
            found = any(token in str(st.get("uses", ""))
                        or executes(str(st.get("run", "")), token)
                        for st in steps)
            assert found, f"{name}: token {token!r} no longer resolves in {wf.name}"
            checked += 1
    assert checked >= 25, f"only {checked} tokens checked — the walk found nothing"


# --------------------------------------------------------------------------
# Attack 28 — suppression the enumerated regex did not spell
#
# `SUPPRESSION = re.compile(r"\|\|\s*(true|echo|:)")` names three spellings.
# Measured before the fix: `|| true` failed correctly, while `|| exit 0`,
# `|| /bin/true`, `; true` and `| cat` each left gate_integrity at exit 0
# with zero findings. On the steps that own no report — enforce_spec.py,
# tcb_gate.py, shellcheck, credential_scan.py, `pytest -m axle`, `npm ci` —
# nothing downstream catches that either.
#
# The rule is now positional, not lexical: the gate command must be the last
# thing on its line that can decide the step's exit status.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("tail", [
    " || true",          # the one spelling the old regex caught
    " || exit 0",
    " || /bin/true",
    " || :",
    "; true",
    "; exit 0",
    " | cat",
    " &",
])
def test_attack_any_exit_status_discarding_operator_is_caught(sandbox: Path,
                                                              tail: str) -> None:
    sabotage(sandbox, VERIFY, ENFORCE_STEP, ENFORCE_STEP + tail)
    result = integrity(sandbox)
    assert result.returncode != 0, (
        f"`{tail.strip()}` after a gate command was not detected")
    # A trailing `|| :` makes `run:` invalid YAML, so it is caught one step
    # earlier. Either detection is correct; going green is the only failure.
    assert ("suppress" in result.stdout
            or "not valid YAML" in result.stdout), result.stdout[-800:]


@pytest.mark.parametrize("tail", [" || exit 0", "; true", " | cat"])
def test_attack_suppression_on_a_step_that_owns_no_report(sandbox: Path,
                                                          tail: str) -> None:
    """A suppressor inside the gate's own chain still hides a failed check.

    shellcheck used to be a standalone step that wrote no reports/*.json, so
    the finalizer could not notice it failing at all. It now runs inside the
    bandit gate's single wrapped chain, which fixed that -- but not this: the
    chain relies on `set -e` stopping at the first non-zero exit, and an
    operator that discards shellcheck's exit code lets the chain run on and the
    gate record a PASS over a check that failed. gate_integrity is what stands
    between that and a green PR.
    """
    sabotage(sandbox, VERIFY, SHELLCHECK_STEP, SHELLCHECK_STEP + tail)
    result = integrity(sandbox)
    assert result.returncode != 0, f"`{tail.strip()}` on shellcheck went green"
    assert "suppress" in result.stdout, result.stdout[-800:]


def test_a_github_expression_is_not_a_shell_operator(sandbox: Path) -> None:
    """`${{ github.base_ref || 'main' }}` is a GitHub default, evaluated
    before any shell sees it. Flagging it would be the false positive that
    gets the whole check switched off."""
    text = (sandbox / VERIFY).read_text(encoding="utf-8")
    assert "github.base_ref || 'main'" in text, "the guarded line is gone"
    assert integrity(sandbox).returncode == 0


def test_an_and_chain_is_not_suppression(sandbox: Path) -> None:
    """`gate && next` is NOT suppression and must not be reported as one.

    Measured with `bash -e` (what GitHub runs a `run:` block as) against a
    command that exits 1:  `gate && true` -> step exits 1. The gate still
    decides. A checker that flagged this would be raising a false positive,
    and a false positive is how a check gets switched off.
    """
    sabotage(sandbox, VERIFY, ENFORCE_STEP, ENFORCE_STEP + " && true")
    assert integrity(sandbox).returncode == 0


@pytest.mark.parametrize("disable", ["set +e", "set +o errexit", "set +ex"])
def test_attack_errexit_disabled_around_the_gate_is_caught(sandbox: Path,
                                                           disable: str) -> None:
    """The operators on the gate's OWN line are not the whole story.

    Measured under `bash -e` against a command that exits 1:
        gate / exit 0           -> step exits 1   (errexit aborted first)
        set +e / gate / exit 0  -> step exits 0   SUPPRESSED
        set +e / gate / set -e  -> step exits 0   SUPPRESSED
    """
    # Injected INSIDE the `bash -c` chain, which is where errexit now lives:
    # the wrapper runs `set -e` as the chain's first line, so disabling it
    # mid-chain is the same attack against the same mechanism.
    sabotage(sandbox, VERIFY, ENFORCE_STEP,
             f"            {disable}\n"
             "            python3 scripts/enforce_spec.py specs/*_spec.lean\n"
             "            exit 0")
    result = integrity(sandbox)
    assert result.returncode != 0, f"`{disable}` around a gate went green"
    assert "errexit disabled" in result.stdout, result.stdout[-800:]


def test_errexit_restored_before_the_gate_is_not_flagged(sandbox: Path) -> None:
    """`set +e` that is turned back off again before the gate runs leaves the
    gate's failure deciding the step, so it must not be reported."""
    sabotage(sandbox, VERIFY, ENFORCE_STEP,
             "            set +e\n            true\n            set -e\n"
             "            python3 scripts/enforce_spec.py specs/*_spec.lean")
    assert integrity(sandbox).returncode == 0


def test_a_token_word_naming_a_path_must_match_exactly() -> None:
    """The path-suffix relaxation exists for `run_gate.py`, which ci/gates.toml
    spells without its directory. It must not let a DIFFERENT file with the
    same tail satisfy a token that already names a path: check 8 asserts only
    that `scripts/axle_gate.py` exists, which it still would."""
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import executes
    assert not executes("python3 evil/scripts/axle_gate.py",
                        "scripts/axle_gate.py")
    assert executes("python3 scripts/axle_gate.py", "scripts/axle_gate.py")
    # slash-free token words keep the relaxation: an absolute path to the tool
    # and the repo's own `scripts/run_gate.py` spelling both still count
    assert executes("/usr/bin/shellcheck scripts/*.sh", "shellcheck")
    assert executes("python3 scripts/run_gate.py --name pyright -- pyright",
                    "run_gate.py --name pyright -- pyright")


def test_a_backslash_continuation_does_not_open_a_command_position() -> None:
    """Found by attacking the fix. The shell reads a trailing `\\` and the
    line under it as ONE command; judging them separately gave the second
    line its own command position, and `echo \\` / `--cov-fail-under=95`
    satisfied the coverage gate while running `echo`."""
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import executes
    assert not executes("echo \\\n  --cov-fail-under=95", "--cov-fail-under=95")
    assert not executes("echo \\\n  python3 scripts/axle_gate.py",
                        "scripts/axle_gate.py")
    # the legitimate wrap keeps its real head and must still count
    assert executes(
        "python3 scripts/run_gate.py --name coverage -- pytest \\\n"
        "  --cov-fail-under=95", "--cov-fail-under=95")


def test_a_token_must_match_whole_words_not_prefixes() -> None:
    """`--cov-fail-under=950` is not `--cov-fail-under=95`, and
    `npm run test:e2e-disabled` is not `npm run test:e2e`."""
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import executes
    assert not executes("pytest --cov-fail-under=950", "--cov-fail-under=95")
    assert executes("pytest --cov-fail-under=95", "--cov-fail-under=95")
    assert not executes("npm run test:e2e-disabled", "npm run test:e2e")
    assert executes("npm   run    test:e2e", "npm run test:e2e")


# --------------------------------------------------------------------------
# Attack 29 — a verified exception granted to a reassigned argv[0]
#
# `which_vars` was a set of NAMES. Once any name was ever bound from
# shutil.which, every later `subprocess.run([name, ...])` in that file was
# reported "verified" no matter what the name held by then. Measured before
# the fix, all four files below returned
#   (True, 'shell=False, argv list literal, argv[0]=exe from shutil.which, ...')
# --------------------------------------------------------------------------
REASSIGNED = '''
import shutil
import subprocess


def go(user_supplied: str) -> None:
    exe = shutil.which("git")
    exe = user_supplied
    subprocess.run([exe, "status"], capture_output=True, timeout=30)
'''

DEAD_BRANCH = '''
import shutil
import subprocess


def go(user_supplied: str) -> None:
    if False:
        exe = shutil.which("git")
    exe = user_supplied
    subprocess.run([exe, "status"], capture_output=True, timeout=30)
'''

PARAMETER = '''
import shutil
import subprocess


def seed() -> None:
    exe = shutil.which("git")
    subprocess.run([exe, "status"], capture_output=True, timeout=30)


def go(exe: str) -> None:
    subprocess.run([exe, "status"], capture_output=True, timeout=30)
'''

LOOP_TARGET = '''
import shutil
import subprocess


def go(candidates: list[str]) -> None:
    exe = shutil.which("git")
    for exe in candidates:
        subprocess.run([exe, "status"], capture_output=True, timeout=30)
'''

# Legitimate and must keep passing: scripts/generate_evidence.py binds `exe`
# from shutil.which twice, once with an explicit search path and once without.
REBOUND_FROM_WHICH = '''
import shutil
import subprocess
import sys
from pathlib import Path


def go(name: str, flag: str) -> None:
    exe = shutil.which(name, path=str(Path(sys.executable).parent))
    if exe is None:
        exe = shutil.which(name)
    if exe is None:
        return
    subprocess.run([exe, flag], capture_output=True, timeout=30)
'''


def _safety(tmp_path: Path, source: str) -> tuple[bool, str]:
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from security_gate import check_subprocess_safety
    f = tmp_path / "subject.py"
    f.write_text(source, encoding="utf-8")
    return check_subprocess_safety(str(f))


@pytest.mark.parametrize(("source", "why"), [
    (REASSIGNED, "plainly reassigned from a parameter"),
    (DEAD_BRANCH, "bound from shutil.which only on a branch never taken"),
    (PARAMETER, "the name is a function parameter elsewhere in the file"),
    (LOOP_TARGET, "the name is rebound by a for-loop target"),
], ids=["reassigned", "dead-branch", "parameter", "loop-target"])
def test_attack_argv0_name_no_longer_holds_a_resolved_path(tmp_path: Path,
                                                           source: str,
                                                           why: str) -> None:
    ok, evidence = _safety(tmp_path, source)
    assert not ok, (
        f"exception granted to an argv[0] that is {why}: {evidence}")


GLOBAL_REBIND = '''
import shutil
import subprocess

exe = shutil.which("git")


def poison(user_supplied: str) -> None:
    global exe
    exe = user_supplied


def go() -> None:
    subprocess.run([exe, "status"], capture_output=True, timeout=30)
'''


def test_attack_a_global_rebinds_the_name_in_an_outer_scope(tmp_path: Path) -> None:
    """Found by attacking the scope-aware fix. `global exe; exe = user`
    assigns the MODULE's name, so filing that assignment under the declaring
    function left the module binding looking untouched and the exception was
    granted."""
    ok, evidence = _safety(tmp_path, GLOBAL_REBIND)
    assert not ok, f"a global rebinding kept the exception: {evidence}"


@pytest.mark.parametrize("source", [
    # a ternary is not a shutil.which call
    'import shutil\nimport subprocess\n\n\ndef f(u: str) -> None:\n'
    '    exe = shutil.which("g") if u else u\n'
    '    subprocess.run([exe, "s"], timeout=1)\n',
    # the environment is not a resolver
    'import os\nimport subprocess\n\n\ndef f() -> None:\n'
    '    exe = os.environ["X"]\n'
    '    subprocess.run([exe, "s"], timeout=1)\n',
    # a walrus in argv[0] is not a Name bound anywhere checkable
    'import shutil\nimport subprocess\n\n\ndef f(u: str) -> None:\n'
    '    exe = shutil.which("g")\n'
    '    subprocess.run([(exe := u), "s"], timeout=1)\n',
], ids=["ternary", "environ", "walrus"])
def test_argv0_from_an_unresolvable_expression_is_rejected(tmp_path: Path,
                                                           source: str) -> None:
    ok, evidence = _safety(tmp_path, source)
    assert not ok, f"exception granted to an unresolved argv[0]: {evidence}"


def test_rebinding_from_shutil_which_is_still_verified(tmp_path: Path) -> None:
    """Two shutil.which bindings of one name still leave it resolved.
    scripts/generate_evidence.py does exactly this, and it is correct."""
    ok, evidence = _safety(tmp_path, REBOUND_FROM_WHICH)
    assert ok, f"a legitimate double shutil.which binding was rejected: {evidence}"


def test_every_eligible_file_still_verifies() -> None:
    """The strictness must not have been bought by rejecting the real code.

    Every file the security gate is willing to verify must still verify; if
    one stops, the gate goes red on the repository's own source.
    """
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from security_gate import ELIGIBLE, check_subprocess_safety
    for _test_id, rel in sorted(ELIGIBLE):
        path = REPO / rel
        if not path.is_file():
            continue
        ok, evidence = check_subprocess_safety(str(path))
        assert ok, f"{rel} lost its verified exception: {evidence}"


# --------------------------------------------------------------------------
# Attack 26 — a `bash -c` chain that never arms errexit
#
# The asymmetry that made this reachable: `errexit_off_at` can only report a
# `set +e` that is PRESENT. In a `run:` block errexit is never absent, because
# GitHub starts one as `bash -e {0}`. `bash -c` starts with errexit OFF, so the
# compensating `set -e` is one line inside a string literal — and ci/gates.toml
# pins the wrapper, not the guard inside it.
#
# Measured before the check existed: deleting that single line left
# gate_integrity exiting 0, and a chain whose first three verifications exit 1
# and whose fourth exits 0 produced a wrapper exit of 0 with status PASS and
# mergeable_contribution true. For preflight that is the TCB check and the
# live-ruleset drift check both failing while `full` certifies an all-green run.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("gate", ["preflight", "axle-verify", "bandit",
                                  "correspondence"])
def test_attack_chain_without_errexit_is_caught(sandbox: Path, gate: str) -> None:
    wf = sandbox / VERIFY
    text = wf.read_text()
    marker = f"--name {gate} -- bash -c"
    assert marker in text, f"{gate} is no longer a bash -c chain"
    head, tail = text[: text.index(marker)], text[text.index(marker):]
    armed = tail.replace("            set -e\n", "", 1)
    assert armed != tail, f"the {gate} chain has no `set -e` to delete"
    wf.write_text(head + armed)

    result = integrity(sandbox)
    assert result.returncode != 0, (
        f"a `{gate}` chain with errexit never enabled satisfied the gate — "
        "every command after a failing one still runs and the chain's exit "
        "code is the last command's, which is the report writer's")
    assert "chain arms errexit" in result.stdout, result.stdout[-800:]


def test_a_chain_that_arms_errexit_is_not_flagged() -> None:
    """The control. Every chain in the real workflow must already pass."""
    import sys as _s
    _s.path.insert(0, str(SCRIPTS))
    from gate_integrity import chain_without_errexit

    # A `run:` block that is not a chain has nothing to arm -- GitHub's own
    # `bash -e {0}` already applies, and demanding `set -e` there would be a
    # false positive, which is how a check gets switched off.
    assert not chain_without_errexit(
        "python3 scripts/axle_gate.py", ["scripts/axle_gate.py"])

    # Against the REAL workflow rather than a synthetic string, because the
    # shape that matters is the one on disk: a hand-written approximation of a
    # multi-line `bash -c` inside YAML is exactly the kind of input that can
    # pass while the real thing fails, or the reverse.
    import yaml as _yaml
    doc = _yaml.safe_load((REPO / VERIFY).read_text(encoding="utf-8"))
    chains = 0
    for job in doc["jobs"].values():
        for step in job.get("steps", []):
            run = str(step.get("run", ""))
            if "-- bash -c" not in run:
                continue
            chains += 1
            token = next(w for w in run.split() if w.endswith(".py")
                         and "run_gate" not in w)
            assert not chain_without_errexit(run, [token]), (
                f"a real chain was flagged as unarmed: {run[:120]!r}")
    assert chains >= 4, f"expected at least 4 bash -c chains, found {chains}"
