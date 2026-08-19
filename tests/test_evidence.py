"""Attacks on scripts/generate_evidence.py and on gate.py's environment block.

The generator exists to make two failures impossible rather than unlikely:
a credential reaching evidence.md, and a gate that did not run being reported
as if it had. Both are properties, so both are tested by trying to violate
them, not by checking that a good run looks good.

The secret test plants a real-shaped token in the narrative constant -- the
exact path the historical leak took, since the leak was in prose -- and
asserts the generator dies rather than writing. The NOT_RUN test removes a
report and asserts the gate never renders as PASS.
"""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import gate as gate_mod  # noqa: E402
import generate_evidence as gen  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts" / "generate_evidence.py"
GATE = REPO / "scripts" / "gate.py"
RUN_GATE = REPO / "scripts" / "run_gate.py"
VERIFY = REPO / ".github" / "workflows" / "verify.yml"

# Assembled at runtime so this test file never contains a credential-shaped
# literal itself. A test that plants a secret by hard-coding one has put a
# secret in the repository to prove secrets stay out of the repository.
FAKE_TOKEN = "github" + "_pat_" + "11ABCDEFG0" + "abcdefghijklmnop"


def run_generator(output: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(output)],
        cwd=REPO, capture_output=True, text=True, timeout=300, check=False)


@pytest.fixture(scope="module")
def generated(tmp_path_factory: pytest.TempPathFactory) -> str:
    """One real generation, reused by the read-only assertions below.

    Written outside the repository so generating it does not perturb the
    working tree the next assertion measures.
    """
    out = tmp_path_factory.mktemp("evidence") / "evidence.md"
    proc = run_generator(out)
    assert proc.returncode == 0, f"generator failed:\n{proc.stderr}"
    return out.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# It runs, and it reports this commit
# ---------------------------------------------------------------------------
def test_generator_exits_zero(tmp_path: Path) -> None:
    proc = run_generator(tmp_path / "evidence.md")
    assert proc.returncode == 0, proc.stderr
    assert (tmp_path / "evidence.md").is_file()


def test_output_names_the_current_commit(generated: str) -> None:
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO,
                          capture_output=True, text=True, check=True
                          ).stdout.strip()
    assert len(head) == 40, "expected a full SHA to search for"
    assert head in generated, "evidence does not carry the commit it describes"


def test_output_is_not_a_stale_copy_of_the_old_hand_written_file(
        generated: str) -> None:
    """The point of the change: the artifact must announce that it is output.

    Without this, a future hand edit reintroduces exactly the drift the
    generator was built to remove, and nothing notices.
    """
    assert "This file is generated" in generated


# ---------------------------------------------------------------------------
# SECRET SAFETY
# ---------------------------------------------------------------------------
def test_no_credential_pattern_in_real_output(generated: str) -> None:
    assert gen.scan_for_disclosure_shapes(generated) == []


def test_scanner_catches_each_known_prefix() -> None:
    """Every literal prefix must actually be wired in, not just listed."""
    for prefix in gen._LITERAL_PREFIXES:  # pyright: ignore[reportPrivateUsage]
        planted = f"harmless text {prefix}AbC123deadbeefXY more text"
        assert gen.scan_for_disclosure_shapes(planted), f"{prefix} not detected"


def test_scanner_catches_high_entropy_token() -> None:
    assert gen.scan_for_disclosure_shapes("token=" + "aB3" * 12 + " end")


def test_scanner_reports_position_but_never_echoes_the_secret() -> None:
    """A scanner that prints the match into a CI log has moved the leak."""
    findings = gen.scan_for_disclosure_shapes(f"leak: {FAKE_TOKEN} here")
    assert findings
    for finding in findings:
        assert FAKE_TOKEN not in finding
        assert FAKE_TOKEN[11:] not in finding


def test_scanner_does_not_fire_on_a_git_sha() -> None:
    """A 40-char lowercase SHA is in every run. Firing on it disables the scan.

    ci/gates.toml pins actions by SHA, so these reach the output legitimately.
    """
    assert gen.scan_for_disclosure_shapes("commit 94c59675f78aae22137e65ea1c4ae9c01d9f9416") == []
    assert gen.scan_for_disclosure_shapes(
        "github/codeql-action/init@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd") == []


def test_scanner_does_not_fire_on_english_containing_sk_dash() -> None:
    assert gen.scan_for_disclosure_shapes("a risk-free, task-based, disk-bound design") == []


def test_planted_secret_aborts_the_generator_and_writes_nothing(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The historical leak path: a credential inside the prose.

    Asserts three things, because two of them are the ones that were missing
    when this actually happened: non-zero exit, and NO FILE. A generator that
    warns and writes has not stopped the leak.
    """
    out = tmp_path / "evidence.md"
    monkeypatch.setattr(gen, "NARRATIVE",
                        f"## Measured by hand\n\nleaked: {FAKE_TOKEN}\n")

    with pytest.raises(SystemExit) as excinfo:
        gen.main(["--output", str(out)])

    assert excinfo.value.code != 0, "aborted with a success exit code"
    assert not out.exists(), "wrote a file it was supposed to abort on"


def test_planted_secret_does_not_clobber_an_existing_file(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Abort must leave the previous evidence intact, not truncate it."""
    out = tmp_path / "evidence.md"
    out.write_text("PREVIOUS EVIDENCE\n", encoding="utf-8")
    monkeypatch.setattr(gen, "LIMITATIONS", f"## LIMITATIONS\n\n{FAKE_TOKEN}\n")

    with pytest.raises(SystemExit) as excinfo:
        gen.main(["--output", str(out)])

    assert excinfo.value.code != 0
    assert out.read_text(encoding="utf-8") == "PREVIOUS EVIDENCE\n"


def test_generator_cannot_read_the_environment() -> None:
    """Structural, not behavioural: there is no expression that could leak one.

    The generator inherits an environment for its subprocesses, but nothing in
    it reads one back. Checked in the source because the guarantee is the
    absence of a capability, and absence is not observable from a passing run.
    """
    source = SCRIPT.read_text(encoding="utf-8")
    code = "\n".join(line for line in source.splitlines()
                     if not line.lstrip().startswith("#"))
    body = code.split('"""', 2)[-1]  # drop the module docstring's prose
    for forbidden in ("os.environ", "getenv", "environb", "os.putenv"):
        assert forbidden not in body, f"generator references {forbidden}"
    assert not re.search(r"^\s*import os\b", body, re.MULTILINE)
    assert not re.search(r"^\s*from os\b", body, re.MULTILINE)


# ---------------------------------------------------------------------------
# ABSENT EVIDENCE
# ---------------------------------------------------------------------------
def _gate_row(text: str, gate: str) -> str:
    for line in text.splitlines():
        if line.startswith(f"| `{gate}` |"):
            return line
    raise AssertionError(f"gate {gate!r} missing from the evidence table")


def test_missing_report_is_not_run_never_pass(generated: str) -> None:
    """No reports/<gate>.json means the gate did not run here.

    Rendering that as PASS is the single worst thing an evidence file can do,
    because it is indistinguishable from a real pass at the point of reading.
    """
    absent = [g for g in ("axle-verify", "mutmut", "coverage", "full")
              if not (REPO / "reports" / f"{g}.json").is_file()]
    assert absent, "no gate is missing a report; test cannot discriminate"

    for gate in absent:
        row = _gate_row(generated, gate)
        assert gen.NOT_RUN in row, f"{gate} lacks a report but reads {row!r}"
        assert "PASS" not in row, f"{gate} has no report and renders PASS"


def test_every_mandatory_gate_appears(generated: str) -> None:
    import tomllib
    manifest: dict[str, Any] = tomllib.loads(
        (REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    gates: dict[str, Any] = manifest["gates"]
    mandatory = [name for name, spec in gates.items()
                 if isinstance(spec, dict)
                 and cast("dict[str, Any]", spec).get("mandatory") is True]
    assert mandatory
    for name in mandatory:
        _gate_row(generated, name)


def test_report_for_a_different_gate_is_not_credited(tmp_path: Path) -> None:
    """A report is only evidence for the gate that wrote it.

    Renaming coverage.json to mutmut.json must not let coverage's PASS satisfy
    mutmut -- the aggregate blocks this in CI, and the evidence file must not
    quietly disagree with the aggregate.
    """
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "mutmut.json").write_text(
        '{"gate": "coverage", "status": "PASS", "duration_ms": 1}',
        encoding="utf-8")
    (tmp_path / "ci").mkdir()
    (tmp_path / "ci" / "gates.toml").write_text(
        '[gates.mutmut]\nmandatory = true\nmust_contain = ["x"]\n',
        encoding="utf-8")

    rows = gen.mandatory_gates(tmp_path)
    assert rows, "gate not read from the manifest"
    _, _, status, _ = rows[0]
    assert status == "MISMATCH", status
    assert status != "PASS"


# ---------------------------------------------------------------------------
# DETERMINISM
# ---------------------------------------------------------------------------
def test_two_runs_differ_only_in_the_timestamp(tmp_path: Path) -> None:
    """Same commit, same tree, same document -- except when it was made.

    Any other difference means a value in here is not a measurement of the
    repository, and a document that changes without the repository changing is
    back to being prose.
    """
    first, second = tmp_path / "a.md", tmp_path / "b.md"
    assert run_generator(first).returncode == 0
    assert run_generator(second).returncode == 0

    a = first.read_text(encoding="utf-8").splitlines()
    b = second.read_text(encoding="utf-8").splitlines()
    assert len(a) == len(b), "line count changed between two identical runs"

    differing = [(x, y) for x, y in zip(a, b) if x != y]
    assert len(differing) == 1, f"unexpected non-determinism: {differing}"
    assert gen.TIMESTAMP_LABEL in differing[0][0]


# ---------------------------------------------------------------------------
# THE CONSTRAINT gate_integrity.py check 10 IMPOSES
# ---------------------------------------------------------------------------
def test_every_script_the_evidence_tells_you_to_run_exists(
        generated: str) -> None:
    """Otherwise the preflight gate fails on the document it just generated."""
    assert gen.scan_for_missing_scripts(generated, REPO) == []


def test_generator_refuses_to_emit_an_invocation_of_a_missing_script(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The check must be enforced, not merely satisfied by luck today."""
    out = tmp_path / "evidence.md"
    monkeypatch.setattr(
        gen, "NARRATIVE",
        "## Measured by hand\n\nRun `python3 scripts/does_not_exist.py`.\n")

    with pytest.raises(SystemExit) as excinfo:
        gen.main(["--output", str(out)])

    assert excinfo.value.code != 0
    assert not out.exists()


def test_mention_without_invocation_is_allowed() -> None:
    """Naming a script that does not exist, to say it does not exist, is honest.

    The narrative does exactly this. A checker that flagged it would push the
    project toward deleting true statements about what was never built.
    """
    assert gen.scan_for_missing_scripts(
        "`translate_to_lean.py` was never built.", REPO) == []
    assert gen.scan_for_missing_scripts(
        "Run `python3 scripts/translate_to_lean.py`.", REPO) != []


# ---------------------------------------------------------------------------
# CONTENT THAT MUST NOT SILENTLY DISAPPEAR
# ---------------------------------------------------------------------------
def test_limitations_section_is_present_and_from_the_constant(
        generated: str) -> None:
    assert "## LIMITATIONS" in generated
    for clause in gen.LIMITATIONS.splitlines():
        if clause.strip().startswith(("1.", "5.", "10.")):
            assert clause in generated


def test_hand_measured_findings_survive_into_the_output(
        generated: str) -> None:
    """The two things a machine cannot re-derive must not be lost in the move."""
    assert "add_comm" in generated, "the Lean hallucination finding is gone"
    assert "Python-to-Lean trust boundary" in generated
    assert "written by hand" in generated


def test_tool_versions_are_measured_or_unavailable(generated: str) -> None:
    """No third option. A guessed version is worse than a missing one."""
    rows = gen.tool_versions()
    assert {name for name, _, _ in rows} == {name for name, _ in gen.TOOLS}
    for name, version, how in rows:
        assert version, f"{name} produced an empty version cell"
        assert how, f"{name} does not say how it was measured"
        if version != gen.UNAVAILABLE:
            assert any(ch.isdigit() for ch in version), \
                f"{name} version {version!r} carries no version number"


# ===========================================================================
# scripts/gate.py -- THE ENVIRONMENT FINGERPRINT AND THE PROVENANCE BLOCK
#
# "The same commit passed on Tuesday and failed today. What changed?" is the
# question these two blocks exist to answer. Everything below attacks one of
# four properties, because each is a property and not a happy path:
#
#   1. the blocks are there and carry what they claim
#   2. NOTHING from the environment reaches them except by name  <- the one
#      that matters; the historical leak was a credential in a public artifact
#   3. a collector that dies records a reason instead of destroying the report
#   4. the fingerprint is a fingerprint: two runs on one machine match
# ===========================================================================
CI_VARS = ("GITHUB_SHA", "GITHUB_WORKFLOW", "GITHUB_JOB", "GITHUB_RUN_ID",
           "GITHUB_RUN_ATTEMPT", "GITHUB_REF", "GITHUB_STEP_SUMMARY",
           "GITHUB_WORKFLOW_REF", "GITHUB_EVENT_NAME", "GITHUB_EVENT_PATH",
           "RUNNER_OS", "RUNNER_ARCH", "ImageOS", "ImageVersion")

# Every environment variable scripts/gate.py is allowed to read, by name.
# Asserted by EQUALITY below, not containment: adding a read has to be argued
# for here, which is the only thing standing between this report and the
# blanket `os.environ` dump that would publish a credential.
ALLOWED_ENV_VARS = set(CI_VARS)

SHA_A = "a1" * 20
SHA_B = "b2" * 20


class Boom(BaseException):
    """Not an Exception. `except Exception` would not hold this."""


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """No inherited CI context: these tests must read the same on a laptop
    and on a runner, or they are testing the runner."""
    for var in CI_VARS:
        monkeypatch.delenv(var, raising=False)


def read_report(tmp_path: Path, name: str) -> dict[str, Any]:
    raw = (tmp_path / "reports" / f"{name}.json").read_text(encoding="utf-8")
    return cast("dict[str, Any]", json.loads(raw))


# ---------------------------------------------------------------------------
# 1. THE BLOCKS ARE PRESENT AND CARRY WHAT THEY DECLARE
# ---------------------------------------------------------------------------
def test_report_carries_an_environment_block_with_every_declared_field(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    monkeypatch.chdir(tmp_path)
    with gate_mod.Gate("shape") as g:
        g.passed()
    report = read_report(tmp_path, "shape")
    assert set(report["environment"]) == set(gate_mod.ENVIRONMENT_FIELDS)
    assert set(report["commit_identity"]) == set(gate_mod.COMMIT_IDENTITY_FIELDS)
    for field in ("workflow_ref", "event", "pull_request", "commit_identity"):
        assert field in report, f"provenance field {field} is missing"


def test_environment_and_tool_versions_cannot_disagree(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """tool_versions stays a top-level field because ci/gates.toml requires
    it. Two independently built views of the same fact drift; one does not."""
    monkeypatch.chdir(tmp_path)
    with gate_mod.Gate("mirror") as g:
        g.set_scope(command="pytest --cov=src")
        g.passed()
    report = read_report(tmp_path, "mirror")
    assert report["tool_versions"] == report["environment"]["tools"]


def test_local_run_produces_values_rather_than_none(clean_env: None) -> None:
    """Outside GitHub Actions there is no RUNNER_OS. `local`, never null, and
    never a crash -- the same idiom the report's other fields already use."""
    fingerprint = gate_mod.environment_fingerprint()
    for field in ("runner_os", "runner_arch", "runner_image",
                  "runner_image_version"):
        assert fingerprint[field] == "local", field
    assert isinstance(fingerprint["python"], str)
    assert fingerprint["python"][0].isdigit()
    assert isinstance(fingerprint["cpu_count"], int)
    assert fingerprint["cpu_count"] >= 1
    assert None not in fingerprint.values()
    assert fingerprint["collection_errors"] == []
    json.dumps(fingerprint)  # must survive the report writer


# ---------------------------------------------------------------------------
# COST -- a version costs a subprocess, in twelve gates, on every push
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(("command", "expected"), [
    # The real commands, copied from .github/workflows/verify.yml.
    ("python3 scripts/check_vacuity.py specs/add_spec.lean", []),
    ("python3 scripts/check_composition.py specs/add_spec.lean "
     "--min-strength 0.9", []),
    ("bash scripts/verify_per_function.sh scripts/mutation_gate.py "
     "--min-score 0.95", []),
    ('pytest --cov=src --cov-branch --cov-fail-under=95 -m "not axle"',
     ["coverage", "pytest"]),
    ("pyright", ["node", "pyright"]),
    ("python3 scripts/security_gate.py src scripts", ["bandit"]),
    ("python3 scripts/correspondence_gate.py", ["axle"]),
    ("", []),
])
def test_only_the_tools_a_gate_actually_ran_are_probed(
        command: str, expected: list[str]) -> None:
    """Eight of the twelve gates are pure Python and must pay nothing.

    Measured: probing all six tools in every gate costs 1426 ms per gate;
    deriving the set from scope.command costs 0.01 ms in a pure-Python gate.
    """
    assert sorted(gate_mod.probes_for(command)) == expected


def test_probe_matching_is_delimited_not_substring() -> None:
    """`axle` inside `axle_gate.py` is not an invocation of axle.

    Substring matching would spend a subprocess on a tool the gate never ran
    and record its version as though it had produced the verdict.
    """
    assert gate_mod.probes_for("python3 scripts/axle_gate.py") == {}
    assert "axle" in gate_mod.probes_for("axle verify-proof x.lean")


def test_indirect_tool_mappings_still_match_their_wrapper() -> None:
    """The staleness guard.

    Two entries map a WRAPPER SCRIPT to a tool its command line never names.
    run_gate.py's SCOPE_PATTERNS already demonstrated the failure mode: a
    mapping that stops being true reports nothing rather than failing, and
    nothing notices. Re-derive it from the wrapper's own source instead.
    """
    indirect = {token: tools for token, tools
                in gate_mod._COMMAND_TOOLS.items()  # pyright: ignore[reportPrivateUsage]
                if token.endswith(".py")}
    assert indirect, "no indirect mapping left to check -- delete this test"
    for script, tools in indirect.items():
        source = (REPO / "scripts" / script).read_text(encoding="utf-8")
        for tool in tools:
            assert tool in source, (
                f"{script} no longer mentions {tool}, so recording {tool}'s "
                f"version as part of that gate's evidence is a fabrication")


# ---------------------------------------------------------------------------
# 2. SECRET SAFETY -- the test that matters
# ---------------------------------------------------------------------------
def test_a_credential_shaped_sentinel_never_reaches_the_report(
        tmp_path: Path) -> None:
    """Plant a credential in every place the collector could reach it.

    The report is uploaded as a public artifact and this repository has
    already published one PAT prefix on a public branch. So: put the sentinel
    in the environment under names a real runner really carries, in the event
    payload (which genuinely contains committer emails and more), and in
    RUNNER_NAME -- the field this design deliberately declined to record.
    Then assert it is in neither the report nor the log.
    """
    payload = tmp_path / "event.json"
    payload.write_text(json.dumps({
        "number": 42,
        "pull_request": {
            "head": {"sha": SHA_A, "repo": {"clone_url": FAKE_TOKEN}},
            "base": {"sha": SHA_B},
            "user": {"login": "someone", "email": FAKE_TOKEN},
            "body": f"deploy key {FAKE_TOKEN}",
        },
        "repository": {"master_branch": FAKE_TOKEN},
    }), encoding="utf-8")

    env = dict(os.environ)
    env.update({
        "GITHUB_TOKEN": FAKE_TOKEN,
        "ACTIONS_RUNTIME_TOKEN": FAKE_TOKEN,
        "AWS_SECRET_ACCESS_KEY": FAKE_TOKEN,
        "NPM_TOKEN": FAKE_TOKEN,
        # Not an accident: RUNNER_NAME was considered and rejected, and on a
        # self-hosted fleet it is an internal hostname. If it ever gets added,
        # this test is what fails.
        "RUNNER_NAME": FAKE_TOKEN,
        "RUNNER_OS": "Linux",
        "GITHUB_EVENT_NAME": "pull_request",
        "GITHUB_EVENT_PATH": str(payload),
    })
    proc = subprocess.run(
        [sys.executable, str(RUN_GATE), "--name", "sentinel", "--",
         "/bin/echo", "hello"],
        cwd=tmp_path, env=env, capture_output=True, text=True, timeout=300,
        check=False)

    raw = (tmp_path / "reports" / "sentinel.json").read_text(encoding="utf-8")
    assert FAKE_TOKEN not in raw, "a credential reached the evidence artifact"
    assert FAKE_TOKEN not in proc.stdout, "a credential reached the CI log"
    assert FAKE_TOKEN not in proc.stderr
    # The repository's own credential scanner, turned on its own evidence.
    assert gen.scan_for_disclosure_shapes(raw) == []

    report = cast("dict[str, Any]", json.loads(raw))
    assert report["environment"]["runner_os"] == "Linux", (
        "the collector did not actually read the environment, so this test "
        "proved nothing")
    # Exactly the three fields named, and nothing else from a payload that
    # carried four planted secrets.
    assert report["pull_request"] == {
        "number": 42, "head_sha": SHA_A, "base_sha": SHA_B}


def test_gate_reads_only_the_environment_variables_named_here() -> None:
    """Structural: the capability to leak has to be absent, not merely unused.

    Every `os.environ.get("LITERAL")` in gate.py, plus every variable reached
    indirectly through the runner table. Equality, so a new read is a failing
    test rather than a silent widening.
    """
    tree = ast.parse(GATE.read_text(encoding="utf-8"))
    literals: set[str] = set()
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call)
                and ast.unparse(node.func) == "os.environ.get"
                and node.args and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)):
            literals.add(node.args[0].value)
    indirect = set(gate_mod._RUNNER_VARS.values())  # pyright: ignore[reportPrivateUsage]
    assert literals | indirect == ALLOWED_ENV_VARS


def test_gate_never_enumerates_the_environment() -> None:
    """A blanket dump is the credential leak. There must be no way to write one."""
    code = "\n".join(line for line in GATE.read_text(encoding="utf-8").splitlines()
                     if not line.lstrip().startswith("#"))
    body = code.split('"""', 2)[-1]
    for forbidden in ("os.environ.items", "os.environ.keys",
                      "os.environ.values", "os.environ.copy",
                      "dict(os.environ", "**os.environ", "environb",
                      # getenv would read a variable the AST allowlist above
                      # does not see, which would make that test a decoration.
                      "os.getenv", "for k in os.environ",
                      "json.dumps(payload", "json.dumps(_event_payload"):
        assert forbidden not in body, f"gate.py contains {forbidden}"


def test_the_event_payload_is_never_carried_into_the_report(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """Three scalars are lifted out of it. The payload itself never lands."""
    payload = tmp_path / "event.json"
    marker = "PAYLOAD-FIELD-THAT-MUST-NOT-TRAVEL"
    payload.write_text(json.dumps({
        "number": 7,
        "pull_request": {"head": {"sha": SHA_A}, "base": {"sha": SHA_B},
                         "title": marker},
        "sender": {"login": marker},
    }), encoding="utf-8")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(payload))
    monkeypatch.setenv("GITHUB_EVENT_NAME", "pull_request")
    block = gate_mod.provenance()
    assert marker not in json.dumps(block)
    assert block["pull_request"] == {
        "number": 7, "head_sha": SHA_A, "base_sha": SHA_B}


# ---------------------------------------------------------------------------
# 3. RAISE SAFETY -- gate.py is the thing that records failures
# ---------------------------------------------------------------------------
def test_environment_collector_that_raises_does_not_destroy_a_recorded_fail(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """The whole reason the collector is wrapped.

    An unhandled raise inside the recorder turns a recorded FAIL into a crash
    with no report -- the verdict is lost, and the merge is blocked by a
    mystery instead of by evidence. The FAIL must survive, and the reason the
    fingerprint is missing must be in the report.
    """
    monkeypatch.chdir(tmp_path)

    def explode(*_args: object, **_kwargs: object) -> dict[str, Any]:
        raise Boom("collector exploded")

    monkeypatch.setattr(gate_mod, "environment_fingerprint", explode)
    with pytest.raises(SystemExit) as excinfo:
        with gate_mod.Gate("collectorboom") as g:
            g.failed()

    assert excinfo.value.code == 1, "a FAIL stopped blocking"
    report = read_report(tmp_path, "collectorboom")
    assert report["status"] == "FAIL", "the verdict was lost"
    environment = cast("dict[str, Any]", report["environment"])
    assert set(environment) == set(gate_mod.ENVIRONMENT_FIELDS), (
        "the degraded block has a different shape, so a consumer cannot read "
        "both")
    errors = cast("list[str]", environment["collection_errors"])
    assert any("Boom" in e for e in errors), errors


def test_provenance_collector_that_raises_does_not_destroy_the_report(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    monkeypatch.chdir(tmp_path)

    def explode() -> dict[str, Any]:
        raise Boom("provenance exploded")

    monkeypatch.setattr(gate_mod, "provenance", explode)
    with pytest.raises(SystemExit) as excinfo:
        with gate_mod.Gate("provboom") as g:
            g.failed()

    assert excinfo.value.code == 1
    report = read_report(tmp_path, "provboom")
    assert report["status"] == "FAIL"
    identity = cast("dict[str, Any]", report["commit_identity"])
    assert set(identity) == set(gate_mod.COMMIT_IDENTITY_FIELDS)
    # Unverifiable is not verified. A degraded block must not read as a pass.
    assert identity["identity_verified"] is None
    assert report["pull_request"] is None
    assert any("Boom" in e
               for e in cast("list[str]", identity["collection_errors"]))


def test_one_field_failing_does_not_cost_the_others(
        monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """Per-field, not all-or-nothing: a broken `platform` must not erase the
    tool versions, which are the fields that usually hold the answer."""
    def explode() -> str:
        raise Boom("no platform for you")

    monkeypatch.setattr(gate_mod.platform, "platform", explode)
    fingerprint = gate_mod.environment_fingerprint()
    assert fingerprint["platform"] == gate_mod.UNAVAILABLE
    assert fingerprint["machine"] != gate_mod.UNAVAILABLE
    assert fingerprint["python"][0].isdigit()
    assert any("platform" in e and "Boom" in e
               for e in cast("list[str]", fingerprint["collection_errors"]))


def test_a_failed_version_probe_is_recorded_not_guessed(
        clean_env: None) -> None:
    """A tool that is not installed reads `unavailable`, never a version."""
    assert gate_mod.tool_version(["definitely-not-a-real-binary-xyz", "-v"]) \
        == gate_mod.UNAVAILABLE


def test_degraded_blocks_have_the_same_keys_as_healthy_ones() -> None:
    healthy = gate_mod.environment_fingerprint()
    degraded = gate_mod.degraded_environment("because", {"python": "3.12.0"})
    assert set(healthy) == set(degraded) == set(gate_mod.ENVIRONMENT_FIELDS)
    assert degraded["tools"] == {"python": "3.12.0"}
    assert set(gate_mod.degraded_provenance("because")) \
        == set(gate_mod.PROVENANCE_FIELDS)


# ---------------------------------------------------------------------------
# 4. DETERMINISM -- a fingerprint that changes between runs is a timestamp
# ---------------------------------------------------------------------------
def test_two_collections_on_one_machine_fingerprint_identically(
        clean_env: None) -> None:
    """Nothing timestamped, nothing ordered by chance. Otherwise two reports
    cannot be diffed, which is the only thing the block is for."""
    command = 'pytest --cov=src --cov-branch -m "not axle"'
    assert gate_mod.environment_fingerprint(command) \
        == gate_mod.environment_fingerprint(command)


def test_two_gate_runs_differ_only_where_time_passed(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    monkeypatch.chdir(tmp_path)
    blocks: list[dict[str, Any]] = []
    for name in ("det1", "det2"):
        with gate_mod.Gate(name) as g:
            g.passed()
        blocks.append(read_report(tmp_path, name))
    assert blocks[0]["environment"] == blocks[1]["environment"]
    assert blocks[0]["commit_identity"] == blocks[1]["commit_identity"]


# ---------------------------------------------------------------------------
# PROVENANCE -- which workflow, which event, which tree
# ---------------------------------------------------------------------------
def test_push_shaped_event_records_no_pull_request(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """null, not an empty dict and not a guess: on a push there is no PR, and
    a fabricated base SHA would make the report claim a comparison it never
    made."""
    payload = tmp_path / "event.json"
    payload.write_text(json.dumps(
        {"ref": "refs/heads/main", "after": SHA_A,
         "head_commit": {"id": SHA_A}}), encoding="utf-8")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(payload))
    monkeypatch.setenv("GITHUB_EVENT_NAME", "push")
    block = gate_mod.provenance()
    assert block["pull_request"] is None
    assert block["event"] == "push"


def test_a_missing_or_unreadable_event_payload_is_not_a_crash(
        monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    monkeypatch.setenv("GITHUB_EVENT_PATH", "/no/such/event/payload.json")
    block = gate_mod.provenance()
    assert block["pull_request"] is None
    identity = cast("dict[str, Any]", block["commit_identity"])
    assert any("event payload" in e
               for e in cast("list[str]", identity["collection_errors"]))


def test_workflow_ref_and_event_fall_back_to_local(clean_env: None) -> None:
    block = gate_mod.provenance()
    assert block["workflow_ref"] == "local"
    assert block["event"] == "local"


def test_a_sha_mismatch_downgrades_a_passing_gate_to_infrastructure_failure(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """The point of the check.

    If the runner tested a tree GitHub does not attribute this run to, the
    code was never judged -- so the gate did not FAIL, it could not RUN. PASS
    is the answer that must be impossible here.
    """
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GITHUB_SHA", SHA_A)
    monkeypatch.setattr(gate_mod, "checked_out_sha", lambda: SHA_B)

    with pytest.raises(SystemExit) as excinfo:
        with gate_mod.Gate("mismatch") as g:
            g.passed()

    assert excinfo.value.code == 1, "a mismatched tree merged"
    report = read_report(tmp_path, "mismatch")
    assert report["status"] == "INFRASTRUCTURE_FAILURE"
    assert report["mergeable_contribution"] is False
    identity = cast("dict[str, Any]", report["commit_identity"])
    assert identity["identity_verified"] is False
    assert identity["checked_out_sha"] == SHA_B
    assert identity["expected_sha"] == SHA_A
    assert any(SHA_A in f["why"] or SHA_A in f["what"]
               for f in cast("list[dict[str, str]]", report["failures"]))


def test_a_matching_sha_verifies_and_leaves_the_verdict_alone(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GITHUB_SHA", SHA_A)
    monkeypatch.setattr(gate_mod, "checked_out_sha", lambda: SHA_A)
    with gate_mod.Gate("matched") as g:
        g.passed()
    report = read_report(tmp_path, "matched")
    assert report["status"] == "PASS"
    assert report["commit_identity"]["identity_verified"] is True


def test_local_run_is_unverified_not_failed(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None) -> None:
    """No GITHUB_SHA means nothing to compare against. `null`, because "not
    checked" is not "checked and fine" -- and certainly not a failure that
    would make every local run of every gate red."""
    monkeypatch.chdir(tmp_path)
    with gate_mod.Gate("localrun") as g:
        g.passed()
    report = read_report(tmp_path, "localrun")
    assert report["status"] == "PASS"
    identity = cast("dict[str, Any]", report["commit_identity"])
    assert identity["identity_verified"] is None
    assert identity["expected_sha"] == "local"


def test_git_is_asked_and_answers_with_this_repository_head() -> None:
    """The comparison is only worth anything if the left-hand side is real."""
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO,
                          capture_output=True, text=True, check=True
                          ).stdout.strip()
    monkeypatched = subprocess.run(
        [sys.executable, "-c",
         "import sys; sys.path.insert(0, 'scripts');"
         " import gate; print(gate.checked_out_sha())"],
        cwd=REPO, capture_output=True, text=True, timeout=120, check=True)
    assert monkeypatched.stdout.strip() == head


def test_no_checkout_overrides_the_ref_the_identity_check_assumes() -> None:
    """The falsifier for the one assumption the SHA check rests on.

    HEAD == GITHUB_SHA holds on `push` AND on `pull_request` only because
    actions/checkout is left on its default ref. The day someone adds
    `ref: ${{ github.event.pull_request.head.sha }}`, HEAD becomes the branch
    head while GITHUB_SHA stays the merge commit, and the check would redden
    all twelve gates on every PR. This fails first, and says why.
    """
    for workflow in sorted((REPO / ".github" / "workflows").glob("*.yml")):
        text = workflow.read_text(encoding="utf-8")
        assert not re.search(r"^\s+ref:", text, re.MULTILINE), (
            f"{workflow.name} overrides the checkout ref; gate.py's "
            "commit_identity() assumes HEAD == GITHUB_SHA and must be "
            "revisited before this lands")


# ---------------------------------------------------------------------------
# SCHEMA -- an additive change must not make the evidence unreadable
# ---------------------------------------------------------------------------
def test_the_schema_minor_moved_and_the_major_did_not() -> None:
    """Adding fields is a MINOR bump. A major bump would have been the
    catastrophe: scripts/aggregate_gates.py rejects any report whose major it
    does not know, so 2.0 would make every gate's evidence unreadable in the
    same push that added a field to it.
    """
    import aggregate_gates  # noqa: PLC0415 - read here, not at import time

    assert gate_mod.SCHEMA_VERSION == "1.2"
    assert gate_mod.SCHEMA_VERSION.split(".")[0] == aggregate_gates.SCHEMA_MAJOR


# The xfail(strict=True) marker that stood here has been removed, by the
# mechanism it was built with: ci/gates.toml is now [schema] version = "1.2"
# with required_fields extended to 28, so this XPASSed, and pytest reports an
# XPASS under strict as a failure. The marker could not outlive the gap it
# documented, which is what strict=True was for.
def test_ci_gates_toml_still_declares_the_shape_this_writes() -> None:
    """The manifest must keep describing the report gate.py actually writes.

    A manifest nothing checks is how `required_fields` came to be consumed by
    no code at all -- grepped across scripts/ and tests/, nothing reads it. So
    this reads it, and the drift is named rather than discovered later.
    """
    import tomllib  # noqa: PLC0415

    manifest = tomllib.loads(
        (REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    schema = cast("dict[str, Any]", manifest["schema"])
    declared = set(cast("list[str]", schema["required_fields"]))

    written = set(gate_mod.Gate("shapeprobe").to_dict(0))
    missing = sorted(written - declared)
    assert not missing, (
        f"ci/gates.toml [schema].required_fields does not list {missing}; "
        f"set version = \"{gate_mod.SCHEMA_VERSION}\" and add them")
    assert schema["version"] == gate_mod.SCHEMA_VERSION, (
        f"ci/gates.toml declares schema {schema['version']!r}, gate.py writes "
        f"{gate_mod.SCHEMA_VERSION!r}")
