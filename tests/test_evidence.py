"""Attacks on scripts/generate_evidence.py.

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

import re
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import generate_evidence as gen  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts" / "generate_evidence.py"

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
