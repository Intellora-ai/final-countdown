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
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )


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
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert len(head) == 40, "expected a full SHA to search for"
    assert head in generated, "evidence does not carry the commit it describes"


def test_output_is_not_a_stale_copy_of_the_old_hand_written_file(
    generated: str,
) -> None:
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
    assert (
        gen.scan_for_disclosure_shapes(
            "commit 94c59675f78aae22137e65ea1c4ae9c01d9f9416"
        )
        == []
    )
    assert (
        gen.scan_for_disclosure_shapes(
            "github/codeql-action/init@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd"
        )
        == []
    )


def test_scanner_does_not_fire_on_english_containing_sk_dash() -> None:
    assert (
        gen.scan_for_disclosure_shapes("a risk-free, task-based, disk-bound design")
        == []
    )


def test_planted_secret_aborts_the_generator_and_writes_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The historical leak path: a credential inside the prose.

    Asserts three things, because two of them are the ones that were missing
    when this actually happened: non-zero exit, and NO FILE. A generator that
    warns and writes has not stopped the leak.
    """
    out = tmp_path / "evidence.md"
    monkeypatch.setattr(
        gen, "NARRATIVE", f"## Measured by hand\n\nleaked: {FAKE_TOKEN}\n"
    )

    with pytest.raises(SystemExit) as excinfo:
        gen.main(["--output", str(out)])

    assert excinfo.value.code != 0, "aborted with a success exit code"
    assert not out.exists(), "wrote a file it was supposed to abort on"


def test_planted_secret_does_not_clobber_an_existing_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
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
    code = "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith("#")
    )
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


def isolated_tree(root: Path, reports: dict[str, str]) -> Path:
    """A tracked-files copy of this repository with a CONTROLLED reports/ dir.

    The generator resolves `reports/` against its working directory, so the
    only way to decide what it sees is to give it a working directory of our
    own. `git ls-files` is the copy list: 194 tracked files, which is what a
    fresh checkout is, and it excludes every generated directory by
    construction rather than by an exclusion list that can drift.
    """
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    for rel in tracked:
        src, dst = REPO / rel, root / rel
        if not src.is_file():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())

    # The generator reads git for the commit identity and the working-tree
    # state, so the copy has to be a repository.
    subprocess.run(["git", "init", "-q", "."], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "user.name=t",
            "commit",
            "-qm",
            "isolated",
        ],
        cwd=root,
        check=True,
        capture_output=True,
    )

    (root / "reports").mkdir(exist_ok=True)
    for gate, body in reports.items():
        (root / "reports" / f"{gate}.json").write_text(body, encoding="utf-8")
    return root


def test_missing_report_is_not_run_never_pass(tmp_path: Path) -> None:
    """No reports/<gate>.json means the gate did not run here.

    Rendering that as PASS is the single worst thing an evidence file can do,
    because it is indistinguishable from a real pass at the point of reading.

    ISOLATED, because the previous version read the LIVE repository-root
    `reports/` directory and asserted something was missing from it. That made
    the test's ability to discriminate depend on what the developer had run
    last: it passes in CI only because a fresh runner starts with the directory
    empty, and fails locally after any real gate run has filled it. Under
    pytest-xdist it is worse -- another worker can create a report between the
    listing and the assertion.

    The property is unchanged and the assertion is not weakened. What changed
    is that the test now CREATES the condition it needs instead of hoping to
    find it.
    """
    present = "present-gate"
    absent = ["axle-verify", "mutmut", "coverage", "full"]
    root = isolated_tree(
        tmp_path / "iso",
        {
            present: json.dumps(
                {
                    "gate": present,
                    "status": "PASS",
                    "schema_version": "1.3",
                    "checks": [],
                    "failures": [],
                }
            )
        },
    )

    out = root / "evidence.md"
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(out)],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert proc.returncode == 0, (
        f"generator failed in the isolated tree:\n{proc.stderr}"
    )
    rendered = out.read_text(encoding="utf-8")

    for gate in absent:
        row = _gate_row(rendered, gate)
        assert gen.NOT_RUN in row, f"{gate} lacks a report but reads {row!r}"
        assert "PASS" not in row, f"{gate} has no report and renders PASS"


def test_the_isolated_tree_ignores_repository_root_reports(tmp_path: Path) -> None:
    """Regression guard: pre-existing repo-root reports cannot change the result.

    This is the defect the test above used to have. If the isolation ever
    regresses -- someone reverts to `cwd=REPO`, or the generator starts
    resolving reports/ against something other than its working directory --
    a real report sitting in the repository root would silently make the
    assertion vacuous, and nothing would say so.
    """
    root = isolated_tree(tmp_path / "iso", {})
    out = root / "evidence.md"
    subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(out)],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=300,
        check=True,
    )
    rendered = out.read_text(encoding="utf-8")

    # Whatever the real repository happens to hold right now, every gate is
    # NOT_RUN in a tree whose reports/ is empty.
    for gate in ("axle-verify", "mutmut", "coverage", "full"):
        assert gen.NOT_RUN in _gate_row(rendered, gate), (
            f"{gate} did not render NOT_RUN in a tree with an empty reports/; "
            "the generator is reading a directory other than its own"
        )


def test_every_mandatory_gate_appears(generated: str) -> None:
    import tomllib

    manifest: dict[str, Any] = tomllib.loads(
        (REPO / "ci" / "gates.toml").read_text(encoding="utf-8")
    )
    gates: dict[str, Any] = manifest["gates"]
    mandatory = [
        name
        for name, spec in gates.items()
        if isinstance(spec, dict)
        and cast("dict[str, Any]", spec).get("mandatory") is True
    ]
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
        '{"gate": "coverage", "status": "PASS", "duration_ms": 1}', encoding="utf-8"
    )
    (tmp_path / "ci").mkdir()
    (tmp_path / "ci" / "gates.toml").write_text(
        '[gates.mutmut]\nmandatory = true\nmust_contain = ["x"]\n', encoding="utf-8"
    )

    rows = gen.mandatory_gates(tmp_path)
    assert rows, "gate not read from the manifest"
    _, _, status, _ = rows[0]
    assert status == "MISMATCH", status
    assert status != "PASS"


# ---------------------------------------------------------------------------
# DETERMINISM
# ---------------------------------------------------------------------------
def dirty_paths() -> int:
    """How many paths differ from HEAD right now, by git's own count."""
    out = subprocess.run(["git", "status", "--porcelain"], cwd=REPO,
                         capture_output=True, text=True, timeout=60, check=False)
    return len([ln for ln in out.stdout.splitlines() if ln.strip()])


def test_two_runs_differ_only_in_the_timestamp(tmp_path: Path) -> None:
    """Same commit, same tree, same document -- except when it was made.

    Any other difference means a value in here is not a measurement of the
    repository, and a document that changes without the repository changing is
    back to being prose.

    THE PREMISE IS "SAME TREE", AND IT HAS TO BE CHECKED RATHER THAN ASSUMED.

    This measures the live working tree, so it is only meaningful while that
    tree holds still between the two runs. Serially it always did. Under
    `pytest -n auto` it does not: another worker creating or removing a file in
    the repository lands between the two generations, and the document reports
    the tree it actually saw. Measured, from a real parallel run:

        ('| Working tree | dirty -- 11 path(s) differ from HEAD |',
         '| Working tree | dirty -- 13 path(s) differ from HEAD |')

    Two paths appeared while the test was running. That is the generator being
    CORRECT -- it measured a tree that genuinely changed -- reported as
    non-determinism, because the test asserted a premise it never verified.

    So the tree is now counted before and after. If it moved, the working-tree
    line is allowed to differ and nothing else is; if it held still, the
    timestamp remains the only permitted difference, exactly as before. The
    generator is never given a pass it has not earned: every other line must
    match in both cases.
    """
    before = dirty_paths()
    first, second = tmp_path / "a.md", tmp_path / "b.md"
    assert run_generator(first).returncode == 0
    assert run_generator(second).returncode == 0
    after = dirty_paths()

    a = first.read_text(encoding="utf-8").splitlines()
    b = second.read_text(encoding="utf-8").splitlines()
    assert len(a) == len(b), "line count changed between two identical runs"

    differing = [(x, y) for x, y in zip(a, b) if x != y]

    timestamp = [d for d in differing if gen.TIMESTAMP_LABEL in d[0]]
    assert len(timestamp) == 1, (
        f"the timestamp must differ between two runs and be the only one that "
        f"always does: {differing}")

    other = [d for d in differing if gen.TIMESTAMP_LABEL not in d[0]]
    if before == after:
        assert not other, f"unexpected non-determinism: {other}"
    else:
        assert all("Working tree" in d[0] for d in other), (
            f"the tree changed under this test ({before} -> {after} dirty "
            f"paths), which explains the working-tree line and nothing else: "
            f"{other}")


# ---------------------------------------------------------------------------
# THE CONSTRAINT gate_integrity.py check 10 IMPOSES
# ---------------------------------------------------------------------------
def test_every_script_the_evidence_tells_you_to_run_exists(generated: str) -> None:
    """Otherwise the preflight gate fails on the document it just generated."""
    assert gen.scan_for_missing_scripts(generated, REPO) == []


def test_generator_refuses_to_emit_an_invocation_of_a_missing_script(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The check must be enforced, not merely satisfied by luck today."""
    out = tmp_path / "evidence.md"
    monkeypatch.setattr(
        gen,
        "NARRATIVE",
        "## Measured by hand\n\nRun `python3 scripts/does_not_exist.py`.\n",
    )

    with pytest.raises(SystemExit) as excinfo:
        gen.main(["--output", str(out)])

    assert excinfo.value.code != 0
    assert not out.exists()


def test_mention_without_invocation_is_allowed() -> None:
    """Naming a script that does not exist, to say it does not exist, is honest.

    The narrative does exactly this. A checker that flagged it would push the
    project toward deleting true statements about what was never built.
    """
    assert (
        gen.scan_for_missing_scripts("`translate_to_lean.py` was never built.", REPO)
        == []
    )
    assert (
        gen.scan_for_missing_scripts(
            "Run `python3 scripts/translate_to_lean.py`.", REPO
        )
        != []
    )


# ---------------------------------------------------------------------------
# CONTENT THAT MUST NOT SILENTLY DISAPPEAR
# ---------------------------------------------------------------------------
def test_limitations_section_is_present_and_from_the_constant(generated: str) -> None:
    assert "## LIMITATIONS" in generated
    for clause in gen.LIMITATIONS.splitlines():
        if clause.strip().startswith(("1.", "5.", "10.")):
            assert clause in generated


def test_hand_measured_findings_survive_into_the_output(generated: str) -> None:
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
            assert any(ch.isdigit() for ch in version), (
                f"{name} version {version!r} carries no version number"
            )


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
CI_VARS = (
    "GITHUB_SHA",
    "GITHUB_WORKFLOW",
    "GITHUB_JOB",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_REF",
    "GITHUB_STEP_SUMMARY",
    "GITHUB_WORKFLOW_REF",
    "GITHUB_EVENT_NAME",
    "GITHUB_EVENT_PATH",
    "RUNNER_OS",
    "RUNNER_ARCH",
    "ImageOS",
    "ImageVersion",
)

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
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    monkeypatch.chdir(tmp_path)
    with gate_mod.Gate("shape") as g:
        g.passed()
    report = read_report(tmp_path, "shape")
    assert set(report["environment"]) == set(gate_mod.ENVIRONMENT_FIELDS)
    assert set(report["commit_identity"]) == set(gate_mod.COMMIT_IDENTITY_FIELDS)
    for field in ("workflow_ref", "event", "pull_request", "commit_identity"):
        assert field in report, f"provenance field {field} is missing"


def test_environment_and_tool_versions_cannot_disagree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
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
    for field in ("runner_os", "runner_arch", "runner_image", "runner_image_version"):
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
@pytest.mark.parametrize(
    ("command", "expected"),
    [
        # The real commands, copied from .github/workflows/verify.yml.
        ("python3 scripts/check_vacuity.py specs/add_spec.lean", []),
        (
            "python3 scripts/check_composition.py specs/add_spec.lean "
            "--min-strength 0.9",
            [],
        ),
        (
            "bash scripts/verify_per_function.sh scripts/mutation_gate.py "
            "--min-score 0.95",
            [],
        ),
        (
            'pytest --cov=src --cov-branch --cov-fail-under=95 -m "not axle"',
            ["coverage", "pytest"],
        ),
        ("pyright", ["node", "pyright"]),
        ("python3 scripts/security_gate.py src scripts", ["bandit"]),
        ("python3 scripts/correspondence_gate.py", ["axle"]),
        ("", []),
    ],
)
def test_only_the_tools_a_gate_actually_ran_are_probed(
    command: str, expected: list[str]
) -> None:
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
    indirect = {
        token: tools
        for token, tools in gate_mod._COMMAND_TOOLS.items()  # pyright: ignore[reportPrivateUsage]
        if token.endswith(".py")
    }
    assert indirect, "no indirect mapping left to check -- delete this test"
    for script, tools in indirect.items():
        source = (REPO / "scripts" / script).read_text(encoding="utf-8")
        for tool in tools:
            assert tool in source, (
                f"{script} no longer mentions {tool}, so recording {tool}'s "
                f"version as part of that gate's evidence is a fabrication"
            )


# ---------------------------------------------------------------------------
# 2. SECRET SAFETY -- the test that matters
# ---------------------------------------------------------------------------
def test_a_credential_shaped_sentinel_never_reaches_the_report(tmp_path: Path) -> None:
    """Plant a credential in every place the collector could reach it.

    The report is uploaded as a public artifact and this repository has
    already published one PAT prefix on a public branch. So: put the sentinel
    in the environment under names a real runner really carries, in the event
    payload (which genuinely contains committer emails and more), and in
    RUNNER_NAME -- the field this design deliberately declined to record.
    Then assert it is in neither the report nor the log.
    """
    payload = tmp_path / "event.json"
    payload.write_text(
        json.dumps(
            {
                "number": 42,
                "pull_request": {
                    "head": {"sha": SHA_A, "repo": {"clone_url": FAKE_TOKEN}},
                    "base": {"sha": SHA_B},
                    "user": {"login": "someone", "email": FAKE_TOKEN},
                    "body": f"deploy key {FAKE_TOKEN}",
                },
                "repository": {"master_branch": FAKE_TOKEN},
            }
        ),
        encoding="utf-8",
    )

    env = dict(os.environ)
    env.update(
        {
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
        }
    )
    proc = subprocess.run(
        [
            sys.executable,
            str(RUN_GATE),
            "--name",
            "sentinel",
            "--",
            "/bin/echo",
            "hello",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )

    raw = (tmp_path / "reports" / "sentinel.json").read_text(encoding="utf-8")
    assert FAKE_TOKEN not in raw, "a credential reached the evidence artifact"
    assert FAKE_TOKEN not in proc.stdout, "a credential reached the CI log"
    assert FAKE_TOKEN not in proc.stderr
    # The repository's own credential scanner, turned on its own evidence.
    assert gen.scan_for_disclosure_shapes(raw) == []

    report = cast("dict[str, Any]", json.loads(raw))
    assert report["environment"]["runner_os"] == "Linux", (
        "the collector did not actually read the environment, so this test "
        "proved nothing"
    )
    # Exactly the three fields named, and nothing else from a payload that
    # carried four planted secrets.
    assert report["pull_request"] == {
        "number": 42,
        "head_sha": SHA_A,
        "base_sha": SHA_B,
    }


def test_gate_reads_only_the_environment_variables_named_here() -> None:
    """Structural: the capability to leak has to be absent, not merely unused.

    Every `os.environ.get("LITERAL")` in gate.py, plus every variable reached
    indirectly through the runner table. Equality, so a new read is a failing
    test rather than a silent widening.
    """
    tree = ast.parse(GATE.read_text(encoding="utf-8"))
    literals: set[str] = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and ast.unparse(node.func) == "os.environ.get"
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
        ):
            literals.add(node.args[0].value)
    indirect = set(gate_mod._RUNNER_VARS.values())  # pyright: ignore[reportPrivateUsage]
    assert literals | indirect == ALLOWED_ENV_VARS


def test_gate_never_enumerates_the_environment() -> None:
    """A blanket dump is the credential leak. There must be no way to write one."""
    code = "\n".join(
        line
        for line in GATE.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("#")
    )
    body = code.split('"""', 2)[-1]
    for forbidden in (
        "os.environ.items",
        "os.environ.keys",
        "os.environ.values",
        "os.environ.copy",
        "dict(os.environ",
        "**os.environ",
        "environb",
        # getenv would read a variable the AST allowlist above
        # does not see, which would make that test a decoration.
        "os.getenv",
        "for k in os.environ",
        "json.dumps(payload",
        "json.dumps(_event_payload",
    ):
        assert forbidden not in body, f"gate.py contains {forbidden}"


def test_the_event_payload_is_never_carried_into_the_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    """Three scalars are lifted out of it. The payload itself never lands."""
    payload = tmp_path / "event.json"
    marker = "PAYLOAD-FIELD-THAT-MUST-NOT-TRAVEL"
    payload.write_text(
        json.dumps(
            {
                "number": 7,
                "pull_request": {
                    "head": {"sha": SHA_A},
                    "base": {"sha": SHA_B},
                    "title": marker,
                },
                "sender": {"login": marker},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(payload))
    monkeypatch.setenv("GITHUB_EVENT_NAME", "pull_request")
    block = gate_mod.provenance()
    assert marker not in json.dumps(block)
    assert block["pull_request"] == {"number": 7, "head_sha": SHA_A, "base_sha": SHA_B}


# ---------------------------------------------------------------------------
# 3. RAISE SAFETY -- gate.py is the thing that records failures
# ---------------------------------------------------------------------------
def test_environment_collector_that_raises_does_not_destroy_a_recorded_fail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
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
    with pytest.raises(SystemExit) as excinfo, gate_mod.Gate("collectorboom") as g:
        g.failed()

    assert excinfo.value.code == 1, "a FAIL stopped blocking"
    report = read_report(tmp_path, "collectorboom")
    assert report["status"] == "FAIL", "the verdict was lost"
    environment = cast("dict[str, Any]", report["environment"])
    assert set(environment) == set(gate_mod.ENVIRONMENT_FIELDS), (
        "the degraded block has a different shape, so a consumer cannot read both"
    )
    errors = cast("list[str]", environment["collection_errors"])
    assert any("Boom" in e for e in errors), errors


def test_provenance_collector_that_raises_does_not_destroy_the_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    monkeypatch.chdir(tmp_path)

    def explode() -> dict[str, Any]:
        raise Boom("provenance exploded")

    monkeypatch.setattr(gate_mod, "provenance", explode)
    with pytest.raises(SystemExit) as excinfo, gate_mod.Gate("provboom") as g:
        g.failed()

    assert excinfo.value.code == 1
    report = read_report(tmp_path, "provboom")
    assert report["status"] == "FAIL"
    identity = cast("dict[str, Any]", report["commit_identity"])
    assert set(identity) == set(gate_mod.COMMIT_IDENTITY_FIELDS)
    # Unverifiable is not verified. A degraded block must not read as a pass.
    assert identity["identity_verified"] is None
    assert report["pull_request"] is None
    assert any("Boom" in e for e in cast("list[str]", identity["collection_errors"]))


def test_one_field_failing_does_not_cost_the_others(
    monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    """Per-field, not all-or-nothing: a broken `platform` must not erase the
    tool versions, which are the fields that usually hold the answer."""

    def explode() -> str:
        raise Boom("no platform for you")

    monkeypatch.setattr(gate_mod.platform, "platform", explode)
    fingerprint = gate_mod.environment_fingerprint()
    assert fingerprint["platform"] == gate_mod.UNAVAILABLE
    assert fingerprint["machine"] != gate_mod.UNAVAILABLE
    assert fingerprint["python"][0].isdigit()
    assert any(
        "platform" in e and "Boom" in e
        for e in cast("list[str]", fingerprint["collection_errors"])
    )


def test_a_failed_version_probe_is_recorded_not_guessed(clean_env: None) -> None:
    """A tool that is not installed reads `unavailable`, never a version."""
    assert (
        gate_mod.tool_version(["definitely-not-a-real-binary-xyz", "-v"])
        == gate_mod.UNAVAILABLE
    )


def test_degraded_blocks_have_the_same_keys_as_healthy_ones() -> None:
    healthy = gate_mod.environment_fingerprint()
    degraded = gate_mod.degraded_environment("because", {"python": "3.12.0"})
    assert set(healthy) == set(degraded) == set(gate_mod.ENVIRONMENT_FIELDS)
    assert degraded["tools"] == {"python": "3.12.0"}
    assert set(gate_mod.degraded_provenance("because")) == set(
        gate_mod.PROVENANCE_FIELDS
    )


# ---------------------------------------------------------------------------
# 4. DETERMINISM -- a fingerprint that changes between runs is a timestamp
# ---------------------------------------------------------------------------
def test_two_collections_on_one_machine_fingerprint_identically(
    clean_env: None,
) -> None:
    """Nothing timestamped, nothing ordered by chance. Otherwise two reports
    cannot be diffed, which is the only thing the block is for."""
    command = 'pytest --cov=src --cov-branch -m "not axle"'
    assert gate_mod.environment_fingerprint(
        command
    ) == gate_mod.environment_fingerprint(command)


def test_two_gate_runs_differ_only_where_time_passed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
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
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    """null, not an empty dict and not a guess: on a push there is no PR, and
    a fabricated base SHA would make the report claim a comparison it never
    made."""
    payload = tmp_path / "event.json"
    payload.write_text(
        json.dumps(
            {"ref": "refs/heads/main", "after": SHA_A, "head_commit": {"id": SHA_A}}
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(payload))
    monkeypatch.setenv("GITHUB_EVENT_NAME", "push")
    block = gate_mod.provenance()
    assert block["pull_request"] is None
    assert block["event"] == "push"


def test_a_missing_or_unreadable_event_payload_is_not_a_crash(
    monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    monkeypatch.setenv("GITHUB_EVENT_PATH", "/no/such/event/payload.json")
    block = gate_mod.provenance()
    assert block["pull_request"] is None
    identity = cast("dict[str, Any]", block["commit_identity"])
    assert any(
        "event payload" in e for e in cast("list[str]", identity["collection_errors"])
    )


def test_workflow_ref_and_event_fall_back_to_local(clean_env: None) -> None:
    block = gate_mod.provenance()
    assert block["workflow_ref"] == "local"
    assert block["event"] == "local"


def test_a_sha_mismatch_downgrades_a_passing_gate_to_infrastructure_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    """The point of the check.

    If the runner tested a tree GitHub does not attribute this run to, the
    code was never judged -- so the gate did not FAIL, it could not RUN. PASS
    is the answer that must be impossible here.
    """
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GITHUB_SHA", SHA_A)
    monkeypatch.setattr(gate_mod, "checked_out_sha", lambda: SHA_B)

    with pytest.raises(SystemExit) as excinfo, gate_mod.Gate("mismatch") as g:
        g.passed()

    assert excinfo.value.code == 1, "a mismatched tree merged"
    report = read_report(tmp_path, "mismatch")
    assert report["status"] == "INFRASTRUCTURE_FAILURE"
    assert report["mergeable_contribution"] is False
    identity = cast("dict[str, Any]", report["commit_identity"])
    assert identity["identity_verified"] is False
    assert identity["checked_out_sha"] == SHA_B
    assert identity["expected_sha"] == SHA_A
    assert any(
        SHA_A in f["why"] or SHA_A in f["what"]
        for f in cast("list[dict[str, str]]", report["failures"])
    )


def test_a_matching_sha_verifies_and_leaves_the_verdict_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GITHUB_SHA", SHA_A)
    monkeypatch.setattr(gate_mod, "checked_out_sha", lambda: SHA_A)
    with gate_mod.Gate("matched") as g:
        g.passed()
    report = read_report(tmp_path, "matched")
    assert report["status"] == "PASS"
    assert report["commit_identity"]["identity_verified"] is True


def test_local_run_is_unverified_not_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, clean_env: None
) -> None:
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
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    monkeypatched = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; sys.path.insert(0, 'scripts');"
            " import gate; print(gate.checked_out_sha())",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    assert monkeypatched.stdout.strip() == head


def test_no_checkout_overrides_the_ref_the_identity_check_assumes() -> None:
    """The falsifier for the one assumption the SHA check rests on.

    HEAD == GITHUB_SHA holds on `push` AND on `pull_request` only because
    actions/checkout is left on its default ref. The day someone adds
    `ref: ${{ github.event.pull_request.head.sha }}`, HEAD becomes the branch
    head while GITHUB_SHA stays the merge commit, and the check would redden
    all twelve gates on every PR. This fails first, and says why.

    SCOPE, DERIVED RATHER THAN SCANNED BLINDLY. The assumption belongs to
    gate.py's commit_identity(), so it exists in exactly the workflows that
    invoke gate.py or run_gate.py -- measured, not assumed: verify.yml (20
    references) and ai-review.yml (7). codeql.yml and e2e.yml have none and
    never produce a gate report, so a ref override there could not break an
    identity check that never runs.

    This narrows WHERE the rule applies, not WHAT it forbids. The set is
    computed from each file's contents, so a workflow that starts invoking
    run_gate.py tomorrow is covered the same day, and adding `ref:` to
    verify.yml still fails exactly as before. A guard that forbids something it
    was never about teaches people to route around it, and a routed-around
    guard protects nothing.

    deep-verify.yml is the case that surfaced this. It deliberately checks out
    the pull request HEAD, because binding a verification bundle to
    github.sha would bind it to a generated test-merge commit that exists in no
    branch. It runs no gate.py report at all.
    """
    for workflow in sorted((REPO / ".github" / "workflows").glob("*.yml")):
        text = workflow.read_text(encoding="utf-8")
        if "run_gate.py" not in text and "scripts/gate.py" not in text:
            continue
        assert not re.search(r"^\s+ref:", text, re.MULTILINE), (
            f"{workflow.name} overrides the checkout ref AND produces gate.py "
            "reports; commit_identity() assumes HEAD == GITHUB_SHA and must be "
            "revisited before this lands"
        )


def test_the_identity_guard_still_covers_every_workflow_that_runs_a_gate() -> None:
    """The control for the narrowing above. If the scope filter ever excluded a
    workflow that does produce gate reports, the guard would pass vacuously."""
    workflows = sorted((REPO / ".github" / "workflows").glob("*.yml"))
    covered = [
        w.name
        for w in workflows
        if "run_gate.py" in w.read_text(encoding="utf-8")
        or "scripts/gate.py" in w.read_text(encoding="utf-8")
    ]
    assert "verify.yml" in covered, (
        "verify.yml produces every mandatory gate report; if it is not covered "
        "the identity guard is checking nothing that matters"
    )
    assert covered, "no workflow is covered; the guard would pass vacuously"


# ---------------------------------------------------------------------------
# SCHEMA -- an additive change must not make the evidence unreadable
# ---------------------------------------------------------------------------
def test_the_schema_minor_moved_and_the_major_did_not() -> None:
    """Adding fields is a MINOR bump. A major bump would have been the
    catastrophe: scripts/aggregate_gates.py rejects any report whose major it
    does not know, so 2.0 would make every gate's evidence unreadable in the
    same push that added a field to it.
    """
    import tomllib  # noqa: PLC0415

    import aggregate_gates  # noqa: PLC0415 - read here, not at import time

    # Read from ci/gates.toml rather than repeated as a literal here. The
    # manifest is where the version is DECLARED, and a test asserting its own
    # copy of a number proves the two agree with the test, not with each other.
    declared = tomllib.loads((REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    version = str(cast("dict[str, Any]", declared["schema"])["version"])

    assert gate_mod.SCHEMA_VERSION == version, (
        f"gate.py writes {gate_mod.SCHEMA_VERSION} and ci/gates.toml declares "
        f"{version}; the manifest describes a report that is not being written"
    )
    major, minor = version.split(".")[:2]
    assert major == aggregate_gates.SCHEMA_MAJOR, (
        "the major moved, which makes every gate's evidence unreadable to the "
        "finalizer in the same push that changed a field"
    )
    assert int(minor) >= 3, (
        "1.3 added the finding fields -- finding_id, severity, code, file, "
        "line, column, root_cause, reproduction_command, is_root_cause, "
        "dependent_on, merge_blocking. A minor below that describes a shape "
        "gate.py no longer writes"
    )


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

    manifest = tomllib.loads((REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    schema = cast("dict[str, Any]", manifest["schema"])
    declared = set(cast("list[str]", schema["required_fields"]))

    written = set(gate_mod.Gate("shapeprobe").to_dict(0))
    missing = sorted(written - declared)
    assert not missing, (
        f"ci/gates.toml [schema].required_fields does not list {missing}; "
        f'set version = "{gate_mod.SCHEMA_VERSION}" and add them'
    )
    assert schema["version"] == gate_mod.SCHEMA_VERSION, (
        f"ci/gates.toml declares schema {schema['version']!r}, gate.py writes "
        f"{gate_mod.SCHEMA_VERSION!r}"
    )


# ==========================================================================
# SCHEMA 1.3 — a finding is a record, not a sentence
#
# `Gate.fail()` was five strings: what, where, why, requirement, how_to_fix.
# Everything a machine needs to route a defect -- which rule fired, how bad it
# is, which line, whether it is a root cause or a consequence of one, what to
# type to see it again -- was either absent or buried in prose. Measured before
# this: exactly ONE call site in the repository emitted a paste-able command,
# and it was inside `how_to_fix` as a sentence.
#
# The five originals are unchanged and positional, so all twenty-six existing
# call sites read exactly as they did. Everything new is keyword-only with a
# default, which is what makes the addition a MINOR schema bump rather than a
# rewrite of every verifier at once.
# ==========================================================================

FINDING_FIELDS = (
    "finding_id",
    "what",
    "where",
    "why",
    "requirement",
    "how_to_fix",
    "severity",
    "code",
    "file",
    "line",
    "column",
    "root_cause",
    "reproduction_command",
    "is_root_cause",
    "dependent_on",
    "merge_blocking",
)


def one_failure(tmp_path: Path, **kwargs: Any) -> dict[str, Any]:
    """Run a real gate that records one failure; return that failure."""
    tmp_path.mkdir(parents=True, exist_ok=True)  # callers pass sub-paths
    script = tmp_path / "g.py"
    script.write_text(
        "import sys\n"
        f"sys.path.insert(0, {str(GATE.parent)!r})\n"
        "from gate import Gate\n"
        f"kw = {kwargs!r}\n"
        "with Gate('probe') as g:\n"
        "    g.fail(**kw)\n"
        "    g.failed()\n",
        encoding="utf-8",
    )
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)
    subprocess.run(
        [sys.executable, str(script)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    doc = cast(
        "dict[str, Any]",
        json.loads((tmp_path / "reports" / "probe.json").read_text(encoding="utf-8")),
    )
    return cast("list[dict[str, Any]]", doc["failures"])[0]


def test_a_finding_carries_every_declared_field(tmp_path: Path) -> None:
    f = one_failure(tmp_path, what="w", where="src/add.py:3")
    missing = [k for k in FINDING_FIELDS if k not in f]
    assert not missing, f"the record shape lost {missing}"


def test_the_optional_fields_are_recorded_as_given(tmp_path: Path) -> None:
    f = one_failure(
        tmp_path,
        what="hardcoded credential",
        where="src/x.py:12",
        severity="CRITICAL",
        code="B105",
        file="src/x.py",
        line=12,
        column=5,
        root_cause="a literal assigned to a password-shaped name",
        reproduction="python3 scripts/security_gate.py src scripts",
    )
    assert f["severity"] == "CRITICAL"
    assert f["code"] == "B105"
    assert (f["file"], f["line"], f["column"]) == ("src/x.py", 12, 5)
    assert f["reproduction_command"].startswith("python3 ")
    assert f["is_root_cause"] is True
    assert f["merge_blocking"] is True


def test_an_omitted_field_is_null_not_invented(tmp_path: Path) -> None:
    """`unavailable` must stay distinguishable from a measured value.

    A default of "" or 0 would make "nobody recorded a column" indistinguishable
    from "the column is zero", which is the whole reason this repository writes
    `null` rather than a placeholder.
    """
    f = one_failure(tmp_path, what="w", where="src/add.py")
    for k in (
        "code",
        "file",
        "line",
        "column",
        "root_cause",
        "reproduction_command",
        "dependent_on",
    ):
        assert f[k] is None, f"{k} was invented as {f[k]!r}"


def test_severity_defaults_to_error_because_that_is_what_a_failure_meant(
    tmp_path: Path,
) -> None:
    assert one_failure(tmp_path, what="w")["severity"] == "ERROR"


def test_a_dependent_finding_points_at_its_root(tmp_path: Path) -> None:
    """Several verifiers run under one `set -e`, so the first failure stops the
    rest. Those are not independent defects and must not be counted as such."""
    f = one_failure(
        tmp_path,
        what="verifier 3 never ran",
        is_root_cause=False,
        dependent_on="A1B2C3",
    )
    assert f["is_root_cause"] is False
    assert f["dependent_on"] == "A1B2C3"


def test_the_finding_id_matches_the_one_the_finalizer_prints(tmp_path: Path) -> None:
    """Two ids for one defect is two defects, to a reader comparing runs.

    blocker_report computes an id from (gate, what, where) when it renders. The
    gate now stores one. They must be the same string or the handle is useless
    for exactly the thing a handle is for.
    """
    import blocker_report  # noqa: PLC0415

    f = one_failure(tmp_path, what="x fails", where="src/add.py:3")
    assert f["finding_id"] == blocker_report.failure_id("probe", f)


def test_the_finding_id_is_stable_across_runs(tmp_path: Path) -> None:
    a = one_failure(tmp_path / "a", what="x fails", where="src/add.py:3")
    b = one_failure(tmp_path / "b", what="x fails", where="src/add.py:3")
    assert a["finding_id"] == b["finding_id"]


def test_two_different_defects_get_two_different_ids(tmp_path: Path) -> None:
    a = one_failure(tmp_path / "a", what="x fails", where="src/add.py:3")
    b = one_failure(tmp_path / "b", what="y fails", where="src/add.py:3")
    assert a["finding_id"] != b["finding_id"]


def test_every_new_field_reaches_the_log(tmp_path: Path) -> None:
    """A field that only exists in an artifact nobody downloads is a finding
    the system discarded. The log is what a human opens after a push."""
    script = tmp_path / "g.py"
    script.write_text(
        "import sys\n"
        f"sys.path.insert(0, {str(GATE.parent)!r})\n"
        "from gate import Gate\n"
        "with Gate('probe') as g:\n"
        "    g.fail(what='w', where='src/x.py:12', severity='CRITICAL', code='B105',\n"
        "           file='src/x.py', line=12, column=5, root_cause='rc',\n"
        "           reproduction='pytest tests/x.py')\n"
        "    g.failed()\n",
        encoding="utf-8",
    )
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)
    out = subprocess.run(
        [sys.executable, str(script)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    for expected in (
        "finding_id=",
        "severity=CRITICAL",
        "code=B105",
        "file=src/x.py",
        "line=12",
        "column=5",
        "root_cause=rc",
        "reproduction_command=pytest tests/x.py",
        "merge_blocking=True",
    ):
        assert expected in out.stdout, f"{expected!r} never reached the log"


def test_an_absent_field_is_not_printed_as_none(tmp_path: Path) -> None:
    """`column=None` in a log is worse than no line at all: it reads as a
    measurement whose value happens to be None."""
    script = tmp_path / "g.py"
    script.write_text(
        "import sys\n"
        f"sys.path.insert(0, {str(GATE.parent)!r})\n"
        "from gate import Gate\n"
        "with Gate('probe') as g:\n"
        "    g.fail(what='w', where='src/x.py')\n"
        "    g.failed()\n",
        encoding="utf-8",
    )
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)
    out = subprocess.run(
        [sys.executable, str(script)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    block = out.stdout.split("[FAILURE]")[1].split("[GATE RESULT]")[0]
    assert "=None" not in block, block


def test_the_original_five_argument_form_still_works(tmp_path: Path) -> None:
    """THE CONTROL. Twenty-six call sites pass these positionally and must not
    have to change for a field they do not use."""
    f = one_failure(tmp_path, what="w", where="s", why="y", requirement="r", fix="f")
    assert (f["what"], f["where"], f["why"], f["requirement"], f["how_to_fix"]) == (
        "w",
        "s",
        "y",
        "r",
        "f",
    )


def test_the_step_summary_is_bounded_and_says_what_it_left_out(tmp_path: Path) -> None:
    """An uncapped digest does not truncate. It vanishes.

    $GITHUB_STEP_SUMMARY is limited to 1 MiB and the write swallows OSError, so
    the run that most needs a summary -- a branch with thousands of findings --
    is exactly the run that would silently produce none. One record per defect
    is what made that reachable; before it, a gate recorded one failure.

    The omission is stated rather than silent, for the same reason a gate that
    checked two of four source files may not report as though it checked four.
    """
    summary = tmp_path / "summary.md"
    script = tmp_path / "g.py"
    script.write_text(
        "import sys\n"
        f"sys.path.insert(0, {str(GATE.parent)!r})\n"
        "from gate import Gate\n"
        "with Gate('probe') as g:\n"
        "    for i in range(120):\n"
        "        g.fail(what='defect %d' % i, where='src/x%d.py:1' % i)\n"
        "    g.failed()\n",
        encoding="utf-8",
    )
    env = dict(os.environ)
    env["GITHUB_STEP_SUMMARY"] = str(summary)
    out = subprocess.run(
        [sys.executable, str(script)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )

    body = summary.read_text(encoding="utf-8")
    assert body.count("**defect") == 50, "the digest is not bounded"
    assert "**Failures (120)**" in body, "the true total is not stated"
    assert "70 further finding(s) not shown" in body, (
        "findings were dropped without saying so"
    )
    assert "reports/probe.json" in body, "the complete record is not pointed at"
    assert len(body) < 100_000, f"digest is {len(body)} bytes"

    # The job log is deliberately NOT capped: it truncates gracefully and keeps
    # what fits, while the summary is written whole or not at all.
    assert out.stdout.count("[FAILURE]") == 120, (
        "the log dropped findings; only the all-or-nothing renderer is bounded"
    )
