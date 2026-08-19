"""THE VERIFIERS THEMSELVES, ATTACKED — every failure mode must fail closed.

src/ is well tested. scripts/ is what decides whether src/ may merge, and a
verifier that fails OPEN turns every green check downstream into a lie: the
report still says PASS, nothing crashed, and nothing was checked.

So these tests never assert that a verifier works. They break it — kill the
subprocess, strip PATH, feed the tool garbage, delete the file it needs — and
require that the result is anything except PASS. `scripts/gate.py` names six
results and calls exactly two of them mergeable (PASS, NOT_APPLICABLE); the
single invariant under test is that NO failure mode reaches either one.

Hermetic on purpose. `axle` IS on this machine's PATH and every call to it hits
a hosted Lean service, so the tests that exercise the proof path put a stub
`axle` on a PATH of their own instead. Nothing here touches the network, reads
reports/ from a previous run, or writes outside tmp_path — a fail-closed test
that depends on ambient state is just a slower way to be wrong.
"""

from __future__ import annotations

import json
import os
import signal
import stat
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import gate  # noqa: E402

# The six results and the two mergeable ones are written out as literals rather
# than imported. Importing MERGEABLE_RESULTS to check MERGEABLE_RESULTS proves
# nothing: the day someone adds PASS_WITH_WARNINGS to that set, this file has to
# be the thing that objects.
ALL_RESULTS = ("PASS", "FAIL", "INFRASTRUCTURE_FAILURE", "SKIPPED",
               "NOT_APPLICABLE", "UNKNOWN")
MERGEABLE = ("PASS", "NOT_APPLICABLE")

# The gate binds its evidence to the current run through these. Inside GitHub
# Actions they are set, so a sandbox that inherited them would produce reports
# describing the real run. Stripped, every sandbox is "local" on a laptop and in
# CI alike.
RUN_IDENTITY_ENV = ("GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT",
                    "GITHUB_WORKFLOW", "GITHUB_JOB", "GITHUB_REF")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def run(args: Sequence[str], cwd: Path,
        env_extra: Mapping[str, str] | None = None,
        ) -> subprocess.CompletedProcess[str]:
    """Run a verifier in an isolated working directory."""
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)  # never append to the real summary
    for var in RUN_IDENTITY_ENV:
        env.pop(var, None)
    env.update(env_extra or {})
    return subprocess.run([PY, *args], cwd=cwd, capture_output=True, text=True,
                          timeout=300, env=env)


def run_gate(cwd: Path, name: str, command: Sequence[str],
             *, timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    args = [str(SCRIPTS / "run_gate.py"), "--name", name]
    if timeout is not None:
        args += ["--timeout", str(timeout)]
    return run([*args, "--", *command], cwd)


def report(cwd: Path, name: str) -> dict[str, Any]:
    """The machine-readable evidence, which is the only thing that counts."""
    path = cwd / "reports" / f"{name}.json"
    assert path.is_file(), f"no evidence written at {path}"
    return cast("dict[str, Any]", json.loads(path.read_text(encoding="utf-8")))


def fake_bin(root: Path, name: str, body: str) -> str:
    """A stub executable on a PATH of its own. Keeps the axle tests offline."""
    d = root / "fakebin"
    d.mkdir(exist_ok=True)
    p = d / name
    p.write_text(body, encoding="utf-8")
    p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return str(d)


def fake_bandit(root: Path, body: str) -> None:
    """Shadow the real scanner.

    `python -m bandit` puts the child's cwd at the head of sys.path, so a
    `bandit` package in the sandbox wins over the installed one without setting
    a single environment variable.
    """
    pkg = root / "bandit"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("", encoding="utf-8")
    (pkg / "__main__.py").write_text(body, encoding="utf-8")


def spec_and_proof(root: Path, *, with_proof: bool = True) -> str:
    (root / "specs").mkdir(exist_ok=True)
    (root / "proofs").mkdir(exist_ok=True)
    (root / "specs" / "x_spec.lean").write_text(
        "def x (a : Int) : Int := a\n\ntheorem x_spec (a : Int) : x a = a := by rfl\n",
        encoding="utf-8")
    if with_proof:
        (root / "proofs" / "x_proof.lean").write_text(
            "theorem x_spec (a : Int) : x a = a := by rfl\n", encoding="utf-8")
    return "specs/x_spec.lean"


def gate_driver(cwd: Path, name: str, body: str) -> subprocess.CompletedProcess[str]:
    """Drive scripts/gate.py directly, in its own process, in its own cwd."""
    script = cwd / "driver.py"
    script.write_text(
        "import sys\n"
        f"sys.path.insert(0, {str(SCRIPTS)!r})\n"
        "from gate import Gate\n"
        f"with Gate({name!r}) as g:\n"
        f"{body}\n",
        encoding="utf-8")
    return run([str(script)], cwd)


# ===========================================================================
# SUBPROCESS / TOOL FAILURES — scripts/run_gate.py wraps every shelling gate,
# so its verdict rule is the one that has to survive a hostile child process.
# ===========================================================================
def test_wrapped_command_exiting_nonzero_is_fail_never_pass(tmp_path: Path) -> None:
    """The exit code is the verdict. Text claiming success does not override it."""
    r = run_gate(tmp_path, "nonzero",
                 [PY, "-c", "print('ALL CHECKS PASSED'); raise SystemExit(3)"])
    assert r.returncode != 0, f"a gate whose command exited 3 exited 0\n{r.stdout}"
    rep = report(tmp_path, "nonzero")
    assert rep["status"] == "FAIL", rep["status"]
    assert rep["mergeable_contribution"] is False
    assert "exit=3" in json.dumps(rep["checks"])


def test_wrapped_command_killed_by_a_signal_is_not_pass(tmp_path: Path) -> None:
    """A killed process returns a NEGATIVE code. `!= 0` must be the test, not `> 0`."""
    r = run_gate(tmp_path, "signalled",
                 [PY, "-c", "import os, signal; os.kill(os.getpid(), signal.SIGKILL)"])
    assert r.returncode != 0, f"a SIGKILLed gate exited 0\n{r.stdout}"
    rep = report(tmp_path, "signalled")
    assert rep["status"] != "PASS", "a process killed mid-run reported PASS"
    assert rep["mergeable_contribution"] is False
    assert f"exit=-{int(signal.SIGKILL)}" in json.dumps(rep["checks"]), (
        "the negative exit code was not preserved as evidence")


def test_wrapped_command_that_times_out_is_infrastructure_failure_not_fail(
        tmp_path: Path) -> None:
    """"Did not finish" is not "finished and was wrong".

    Collapsing the two would send someone hunting a bug in code that was never
    executed, and would let a hung tool be triaged as a normal red test.
    """
    r = run_gate(tmp_path, "slow", [PY, "-c", "import time; time.sleep(30)"],
                 timeout=1)
    assert r.returncode != 0, f"a timed-out gate exited 0\n{r.stdout}"
    rep = report(tmp_path, "slow")
    assert rep["status"] == "INFRASTRUCTURE_FAILURE", rep["status"]
    assert rep["status"] != "FAIL", "a timeout was collapsed into FAIL"
    assert rep["mergeable_contribution"] is False
    assert "timed out" in json.dumps(rep["failures"])


def test_wrapped_binary_that_does_not_exist_is_infrastructure_failure(
        tmp_path: Path) -> None:
    r = run_gate(tmp_path, "absent", ["definitely-not-a-real-binary-4f2a9c"])
    assert r.returncode != 0, f"a gate with no tool to run exited 0\n{r.stdout}"
    rep = report(tmp_path, "absent")
    assert rep["status"] == "INFRASTRUCTURE_FAILURE", rep["status"]
    assert rep["mergeable_contribution"] is False
    assert "not on PATH" in json.dumps(rep["failures"])


def test_garbage_on_stdout_with_a_zero_exit_is_judged_by_the_exit_code(
        tmp_path: Path) -> None:
    """The other direction of the same rule, and the reason it is a rule.

    A wrapper that scraped the log for verdict words would flip to FAIL here on
    a tool that succeeded, and (see the nonzero test above) to PASS on a tool
    that failed while printing something reassuring. The exit code decides; the
    text is only evidence.
    """
    r = run_gate(tmp_path, "noisy", [
        PY, "-c",
        "print('FAIL'); print('ERROR: everything is broken'); "
        "print('Traceback (most recent call last):'); print('UNKNOWN')"])
    assert r.returncode == 0, f"a successful command was failed by its own noise\n{r.stdout}"
    rep = report(tmp_path, "noisy")
    assert rep["status"] == "PASS", rep["status"]
    assert "exit=0" in json.dumps(rep["checks"])


# ===========================================================================
# MALFORMED TOOL OUTPUT — a parser that shrugs is the classic fail-open: the
# tool said nothing usable and the gate reported "nothing wrong".
# ===========================================================================
def test_security_gate_rejects_non_json_bandit_output(tmp_path: Path) -> None:
    """Unparseable is not empty. Empty findings must never be inferred."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "ok.py").write_text("def f() -> int:\n    return 1\n",
                                            encoding="utf-8")
    fake_bandit(tmp_path, "print('bandit: something went very wrong')\n")
    r = run([str(SCRIPTS / "security_gate.py"), "src"], tmp_path)
    assert r.returncode != 0, (
        f"non-JSON scanner output was read as a clean scan\n{r.stdout}")
    assert "PASS" not in r.stdout, r.stdout


def test_security_gate_rejects_a_bandit_report_missing_its_results_key(
        tmp_path: Path) -> None:
    """Valid JSON of the wrong SHAPE is the same hole with better manners.

    `.get("results", [])` on a report whose schema moved returns zero findings
    and the gate goes green, so the key is now required to be there.
    """
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "ok.py").write_text("def f() -> int:\n    return 1\n",
                                            encoding="utf-8")
    fake_bandit(tmp_path, 'print(\'{"errors": [], "metrics": {"src/ok.py": {}}}\')\n')
    r = run([str(SCRIPTS / "security_gate.py"), "src"], tmp_path)
    assert r.returncode != 0, (
        f"a report with no results list was read as zero findings\n{r.stdout}")
    assert "PASS" not in r.stdout, r.stdout


def test_security_gate_does_not_call_an_unscannable_file_clean(tmp_path: Path) -> None:
    """FAIL-OPEN, FIXED — bandit exits 0 over a file it could not parse.

    The file lands in the report's "errors" list, never in "results", and the
    process succeeds. Reading only "results" printed `bandit: 0 findings` and
    returned PASS over source nobody scanned.
    """
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "fine.py").write_text("def f() -> int:\n    return 1\n",
                                              encoding="utf-8")
    (tmp_path / "src" / "broken.py").write_text("def broken(:\n    return 1\n",
                                                encoding="utf-8")
    r = run([str(SCRIPTS / "security_gate.py"), "src"], tmp_path)
    assert r.returncode != 0, (
        f"a file the scanner could not read was reported as clean\n{r.stdout}")
    assert "broken.py" in r.stdout + r.stderr, "the unscanned file was not named"
    assert "0 findings" not in r.stdout


def test_security_gate_does_not_pass_over_a_target_that_does_not_exist(
        tmp_path: Path) -> None:
    """FAIL-OPEN, FIXED — `security_gate.py doesnotexist` was a green gate.

    Same root cause as the unscannable file: a missing path is an entry in
    "errors" and an exit code of 0. A typo in a workflow would have retired the
    security gate silently.
    """
    r = run([str(SCRIPTS / "security_gate.py"), "no_such_directory_9b1"], tmp_path)
    assert r.returncode != 0, (
        f"scanning a path that does not exist returned PASS\n{r.stdout}")
    assert "PASS" not in r.stdout, r.stdout


def test_axle_health_without_the_axle_binary_exits_nonzero(tmp_path: Path) -> None:
    r = run([str(SCRIPTS / "axle_health.py")], tmp_path, {"PATH": ""})
    assert r.returncode != 0, f"a missing prover client reported healthy\n{r.stdout}"
    assert "UNREACHABLE" in r.stdout


def test_axle_health_rejects_a_service_that_lists_no_lean_environments(
        tmp_path: Path) -> None:
    """Answering is not working: exit 0 with no `lean-` environment is unusable."""
    path = fake_bin(tmp_path, "axle", "#!/bin/sh\necho '{\"environments\": []}'\nexit 0\n")
    r = run([str(SCRIPTS / "axle_health.py")], tmp_path, {"PATH": path})
    assert r.returncode != 0, (
        f"a service with no Lean environment reported reachable\n{r.stdout}")
    assert "UNREACHABLE" in r.stdout


def test_proof_gate_rejects_plain_text_error_with_a_zero_exit(tmp_path: Path) -> None:
    """The documented trap: axle prints a plain-text Error and exits 0.

    Neither the exit code nor the absence of `"okay": false` says anything, so
    output that is not JSON at all must land as UNVERIFIED.
    """
    spec = spec_and_proof(tmp_path)
    path = fake_bin(tmp_path, "axle",
                    "#!/bin/sh\necho 'Error: unknown identifier x'\nexit 0\n")
    r = run([str(SCRIPTS / "proof_gate.py"), spec], tmp_path, {"PATH": path})
    assert r.returncode != 0, f"unparseable prover output counted as proof\n{r.stdout}"
    assert "UNVERIFIED" in r.stdout


def test_proof_gate_rejects_okay_false_with_a_zero_exit(tmp_path: Path) -> None:
    """`axle verify-proof` exits 0 when okay is false. Parse it or believe a lie."""
    spec = spec_and_proof(tmp_path)
    # `echo` only: the stub runs with PATH set to its own directory, so a shell
    # builtin is the only thing it can reach.
    path = fake_bin(
        tmp_path, "axle",
        "#!/bin/sh\n"
        "echo '{\"okay\": false, \"lean_messages\": {\"errors\": [\"unsolved goals\"]}}'\n"
        "exit 0\n")
    r = run([str(SCRIPTS / "proof_gate.py"), spec], tmp_path, {"PATH": path})
    assert r.returncode != 0, f"a rejected proof exited 0\n{r.stdout}"
    assert "REJECTED" in r.stdout


def test_proof_gate_missing_proof_file_is_nonzero_even_if_axle_says_yes(
        tmp_path: Path) -> None:
    """The absent artefact is caught before the service is consulted at all."""
    spec = spec_and_proof(tmp_path, with_proof=False)
    path = fake_bin(tmp_path, "axle", "#!/bin/sh\necho '{\"okay\": true}'\nexit 0\n")
    r = run([str(SCRIPTS / "proof_gate.py"), spec], tmp_path, {"PATH": path})
    assert r.returncode != 0, f"a proof that does not exist verified\n{r.stdout}"
    assert "MISSING" in r.stdout


# ===========================================================================
# MISSING / WRONG FILES — scripts/spec_source.py decides WHICH source file a
# spec constrains. Resolving to the wrong file, or to nothing without saying so,
# aims every downstream verifier at the wrong target.
# ===========================================================================
def test_spec_source_missing_spec_file_is_nonzero(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    r = run([str(SCRIPTS / "spec_source.py"), "specs/nope_spec.lean"], tmp_path)
    assert r.returncode != 0, "a spec file that does not exist resolved successfully"
    assert r.stdout.strip() == "", f"a pair was emitted anyway: {r.stdout!r}"


def test_spec_source_def_naming_a_file_outside_src_is_nonzero(tmp_path: Path) -> None:
    """The spec names its subject; if that subject has no source, there is nothing
    to verify AGAINST and silence would be read as 'nothing to do'."""
    (tmp_path / "src").mkdir()
    (tmp_path / "specs").mkdir()
    (tmp_path / "specs" / "ghost_spec.lean").write_text(
        "def ghost (a : Int) : Int := a\n", encoding="utf-8")
    r = run([str(SCRIPTS / "spec_source.py"), "specs/ghost_spec.lean"], tmp_path)
    assert r.returncode != 0, "a spec naming a nonexistent source resolved successfully"
    assert "no `def` naming a file under src/" in r.stderr


def test_spec_source_empty_spec_is_nonzero(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "specs").mkdir()
    (tmp_path / "specs" / "empty_spec.lean").write_text("", encoding="utf-8")
    r = run([str(SCRIPTS / "spec_source.py"), "specs/empty_spec.lean"], tmp_path)
    assert r.returncode != 0, "an empty spec resolved successfully"
    assert r.stdout.strip() == ""


@pytest.mark.parametrize("style,body", [
    ("line", "-- def foo is the subject of this contract\n-- nothing is defined here\n"),
    ("block", "/-\ndef foo (x : Int) : Int := x\n-/\n"),
])
def test_spec_source_comment_only_spec_is_nonzero(tmp_path: Path, style: str,
                                                  body: str) -> None:
    """FAIL-OPEN, FIXED (block form) — a commented-out def is not a def.

    src/foo.py exists here on purpose: the ONLY thing between a file of pure
    comments and a green resolution is whether comments are stripped first.
    Anchoring `^def` to line start defeats `-- def foo`, but a `/- ... -/` block
    can carry a line that BEGINS with def, so a spec that was nothing but a
    commented-out definition resolved to a real source file and exited 0.
    """
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "foo.py").write_text("def foo(x: int) -> int:\n    return x\n",
                                             encoding="utf-8")
    (tmp_path / "specs").mkdir()
    (tmp_path / "specs" / "foo_spec.lean").write_text(body, encoding="utf-8")
    r = run([str(SCRIPTS / "spec_source.py"), "specs/foo_spec.lean"], tmp_path)
    assert r.returncode != 0, (
        f"a {style}-comment-only spec resolved to a source file: {r.stdout!r}")
    assert "src/foo.py" not in r.stdout


# ===========================================================================
# RESULT-TYPE INTEGRITY — scripts/gate.py, directly. Everything above only
# matters because these two rules hold: non-PASS is not mergeable, and a gate
# that says nothing is not a gate that said PASS.
# ===========================================================================
@pytest.mark.parametrize("status", ALL_RESULTS)
def test_only_pass_and_not_applicable_are_mergeable(status: str) -> None:
    g = gate.Gate("resulttype")
    g.tools = {}  # __enter__ populates this; the report reads it
    g.result = status
    rep = g.to_dict(0)
    assert rep["status"] == status
    assert rep["mergeable_contribution"] is (status in MERGEABLE), (
        f"{status} contributed {rep['mergeable_contribution']} to mergeability")


def test_the_result_vocabulary_is_exactly_six_and_two_are_mergeable() -> None:
    """A seventh result, or a third mergeable one, has to be argued for here."""
    declared = {gate.PASS, gate.FAIL, gate.INFRASTRUCTURE_FAILURE, gate.SKIPPED,
                gate.NOT_APPLICABLE, gate.UNKNOWN}
    assert declared == set(ALL_RESULTS)
    assert gate.MERGEABLE_RESULTS == set(MERGEABLE)


@pytest.mark.parametrize("status", ALL_RESULTS)
def test_only_mergeable_results_exit_zero(tmp_path: Path, status: str) -> None:
    """The same rule at process level, where CI actually reads it."""
    r = gate_driver(tmp_path, "endtoend", f"    g.result = {status!r}")
    assert (r.returncode == 0) is (status in MERGEABLE), (
        f"{status} exited {r.returncode}\n{r.stdout}")
    rep = report(tmp_path, "endtoend")
    assert rep["status"] == status
    assert rep["mergeable_contribution"] is (status in MERGEABLE)


def test_gate_that_never_declares_a_result_is_unknown_and_exits_nonzero(
        tmp_path: Path) -> None:
    """Silence is the cheapest false green there is: delete the call, keep the job."""
    r = gate_driver(tmp_path, "silent", "    pass")
    assert r.returncode != 0, f"a gate that decided nothing exited 0\n{r.stdout}"
    rep = report(tmp_path, "silent")
    assert rep["status"] == "UNKNOWN", rep["status"]
    assert rep["mergeable_contribution"] is False
    assert any("without setting a result" in f["what"] for f in rep["failures"]), (
        "the report does not say the gate never declared a result")


def test_gate_whose_body_raises_is_infrastructure_failure_with_the_traceback(
        tmp_path: Path) -> None:
    """A crashed verifier verified nothing, and the crash must survive in evidence."""
    r = gate_driver(tmp_path, "boom",
                    "    raise RuntimeError('the verifier itself exploded')")
    assert r.returncode != 0, f"a gate that crashed exited 0\n{r.stdout}"
    rep = report(tmp_path, "boom")
    assert rep["status"] == "INFRASTRUCTURE_FAILURE", rep["status"]
    assert rep["mergeable_contribution"] is False
    assert "[TRACEBACK]" in r.stdout and "RuntimeError" in r.stdout
    failures = json.dumps(rep["failures"])
    assert "RuntimeError" in failures and "the verifier itself exploded" in failures, (
        "the crash was recorded without saying what crashed")


# ===========================================================================
# ENVIRONMENT — the whole toolchain gone. Nothing resolves, so nothing was
# verified, so nothing may be green.
# ===========================================================================
@pytest.mark.parametrize("script,args,expect", [
    ("run_gate.py", ["--name", "pathless", "--", "pytest"], "INFRASTRUCTURE_FAILURE"),
    ("axle_health.py", [], "UNREACHABLE"),
    ("proof_gate.py", ["specs/x_spec.lean"], "UNVERIFIED"),
])
def test_a_stripped_path_never_produces_a_green_gate(
        tmp_path: Path, script: str, args: list[str], expect: str) -> None:
    spec_and_proof(tmp_path)
    r = run([str(SCRIPTS / script), *args], tmp_path, {"PATH": ""})
    assert r.returncode != 0, f"{script} was green with an empty PATH\n{r.stdout}"
    assert expect in r.stdout + r.stderr, r.stdout + r.stderr
    for path in (tmp_path / "reports").glob("*.json"):
        rep = cast("dict[str, Any]", json.loads(path.read_text(encoding="utf-8")))
        assert rep["status"] != "PASS", f"{path.name} claimed PASS with no toolchain"
        assert rep["mergeable_contribution"] is False
