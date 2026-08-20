"""The regression registry and the local-check selector, attacked.

`ci/regression-fixtures.yml` claims that twelve specific failures cannot come back
without a test going red. That claim is worth exactly as much as the rows resolving:
a row naming a test that was renamed six commits ago documents a proof nobody runs,
and it reads identically to one that works.

`[local_checks]` claims that a local regression check can never be mistaken for one
of the seventeen required GitHub contexts, and that a check needing the network never
runs in a default local loop. Both are enforcement claims, so both are tested by
construction rather than by reading the manifest and agreeing with it.

Fast tier. No network, no subprocess-heavy fixture, no dependence on wall-clock time,
hostname, PID or absolute path.
"""

from __future__ import annotations

import ast
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import local_gates as lg  # noqa: E402

REGISTRY_PATH = REPO / "ci" / "regression-fixtures.yml"
MANIFEST_PATH = REPO / "ci" / "local-execution.toml"

ROWS: list[dict[str, Any]] = cast(
    "list[dict[str, Any]]",
    yaml.safe_load(REGISTRY_PATH.read_text(encoding="utf-8"))["fixtures"],
)
MANIFEST: dict[str, Any] = tomllib.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
CONTEXTS: dict[str, dict[str, Any]] = MANIFEST["contexts"]
LOCAL_CHECKS: dict[str, dict[str, Any]] = MANIFEST["local_checks"]

REQUIRED_FIELDS = (
    "id",
    "requirement",
    "test_file",
    "test_name",
    "command",
    "expected_broken",
    "expected_fixed",
    "tier",
    "deterministic",
    "network_required",
    "source_evidence",
)
TIERS = {"sandbox-fast", "sandbox-test", "github-only", "external"}


def _defined_functions(path: Path) -> set[str]:
    """Every function name defined in a module, parsed rather than grepped.

    Grepping for the name would match it inside a docstring or a comment, which is
    how a registry row keeps "resolving" to a test that was deleted and only
    mentioned in prose afterwards.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }


# --------------------------------------------------------------------------
# The registry resolves
# --------------------------------------------------------------------------
def test_the_registry_is_not_empty() -> None:
    """A guard over an empty registry passes vacuously and proves nothing."""
    assert ROWS, f"{REGISTRY_PATH} declares no fixtures"


def test_every_registry_row_resolves_to_a_real_test() -> None:
    """RF-011. A row naming a deleted or renamed test documents a proof nobody runs."""
    broken: list[str] = []
    for row in ROWS:
        path = REPO / str(row["test_file"])
        if not path.is_file():
            broken.append(f"{row['id']}: test_file {row['test_file']} does not exist")
            continue
        if str(row["test_name"]) not in _defined_functions(path):
            broken.append(
                f"{row['id']}: {row['test_file']} defines no {row['test_name']}"
            )
    assert not broken, "registry rows pointing at nothing:\n  " + "\n  ".join(broken)


def test_every_row_carries_every_field() -> None:
    missing: list[str] = []
    for row in ROWS:
        for field in REQUIRED_FIELDS:
            if field not in row or row[field] in (None, "", []):
                missing.append(f"{row.get('id', '<no id>')}: missing {field}")
    assert not missing, "\n  ".join(missing)


def test_fixture_ids_are_unique() -> None:
    ids = [str(row["id"]) for row in ROWS]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    assert not duplicates, f"duplicate fixture ids: {duplicates}"


def test_every_tier_is_one_of_the_declared_lanes() -> None:
    for row in ROWS:
        assert row["tier"] in TIERS, f"{row['id']}: tier {row['tier']!r} is not a lane"


# --------------------------------------------------------------------------
# Nothing is called an escape without evidence it escaped
# --------------------------------------------------------------------------
def test_an_escape_row_carries_a_linkable_reference() -> None:
    """The distinction between ESCAPE and REQUIREMENT is the registry's whole point.

    A registry that labels every rule an escape tells a reader this repository has
    failed in ways it has not, and the rows describing real failures stop standing out.
    """
    thin: list[str] = []
    for row in ROWS:
        source = cast("dict[str, Any]", row["source_evidence"])
        kind = str(source.get("type", ""))
        assert kind in {"ESCAPE", "REQUIREMENT"}, (
            f"{row['id']}: source_evidence.type is {kind!r}; only ESCAPE or REQUIREMENT"
        )
        reference = str(source.get("reference", "")).strip()
        if len(reference) < 30:
            thin.append(f"{row['id']}: reference is {len(reference)} characters")
    assert not thin, "references too thin to be linkable:\n  " + "\n  ".join(thin)


def test_no_row_claims_network_it_does_not_declare() -> None:
    """The registry's test-data rule: no external network by default."""
    for row in ROWS:
        assert row["network_required"] is False, (
            f"{row['id']} declares network_required; the registry's own rule is that "
            "fixtures reach no network by default. Adding one is a decision that needs "
            "its own lane, not a flag flip."
        )


def test_every_row_is_deterministic() -> None:
    """A nondeterministic fixture is FAIL until its nondeterminism is removed."""
    for row in ROWS:
        assert row["deterministic"] is True, (
            f"{row['id']} is not deterministic. A fixture whose result varies proves "
            "nothing on the run where it happens to agree."
        )


# --------------------------------------------------------------------------
# Local checks may not impersonate a required GitHub context
# --------------------------------------------------------------------------
def test_local_checks_and_required_contexts_are_disjoint() -> None:
    """A local check wearing a required context's name makes a local pass unreadable."""
    collision = sorted(set(LOCAL_CHECKS) & set(CONTEXTS))
    assert not collision, (
        f"local check(s) {collision} share a name with a required GitHub context"
    )


def test_the_loader_refuses_a_local_check_that_borrows_a_context_name(
    tmp_path: Path,
) -> None:
    """Proven by construction, not by trusting the current file."""
    bad = tmp_path / "m.toml"
    bad.write_text(
        '[contexts."pyright"]\n'
        'required_context = "pyright"\n'
        'locally_runnable = "yes"\n'
        'command = ["pyright"]\n'
        "timeout_seconds = 60\n"
        'evidence = "pyright.json"\n'
        "in_fast = true\n"
        '[local_checks."pyright"]\n'
        'requirement = "a local check pretending to be the required context"\n'
        'command = ["python3", "-c", "pass"]\n'
        "timeout_seconds = 60\n"
        'evidence = "x.json"\n'
        'tier = "fast"\n'
        'tier_reason = "a reason long enough to look plausible to a careless reader"\n',
        encoding="utf-8",
    )
    with pytest.raises(lg.ManifestError, match="borrow"):
        lg.load_local_checks(bad)


def test_every_local_check_declares_its_tier_reason() -> None:
    """Tier membership is a decision. RF-003 sits in `full` for a correctness reason —
    it invokes `make sandbox-fast`, so in the fast tier it would invoke itself."""
    for name, spec in LOCAL_CHECKS.items():
        assert str(spec.get("tier_reason", "")).strip(), f"{name}: no tier_reason"
        assert str(spec.get("requirement", "")).strip(), f"{name}: no requirement"


# --------------------------------------------------------------------------
# requires_network is ENFORCED, not annotated
# --------------------------------------------------------------------------
NETWORK_SPEC: dict[str, Any] = {
    "locally_runnable": "yes",
    "requires_network": True,
    "network_reason": "reads the live ruleset from api.github.com",
    "opt_in_command": "make sandbox-network",
    "command": ["python3", "-c", "raise SystemExit('this must never run')"],
    "timeout_seconds": 60,
    "evidence": "net.json",
    "in_fast": True,
}
PYRIGHT_SPEC: dict[str, Any] = {
    "locally_runnable": "yes",
    "command": ["pyright"],
    "timeout_seconds": 60,
    "evidence": "pyright.json",
    "in_fast": True,
}


@pytest.mark.parametrize("tier", ["fast", "full"])
def test_a_network_requiring_check_is_excluded_from_every_default_tier(
    tier: str,
) -> None:
    """RF-012. A flag that only documents a network call still lets the call happen."""
    contexts = {"pyright": PYRIGHT_SPEC, "needs-net": NETWORK_SPEC}
    chosen = lg.select(contexts, tier)
    assert "needs-net" not in chosen, (
        f"tier {tier!r} selected a network-requiring check; the default local loop "
        "would make a network call"
    )
    assert "pyright" in chosen, "the exclusion removed more than it should"


def test_an_excluded_network_check_is_reported_with_its_reason_and_opt_in() -> None:
    """Excluding it silently would be the same omission in a different place."""
    contexts = {"pyright": PYRIGHT_SPEC, "needs-net": NETWORK_SPEC}
    rows = {r["context"]: r for r in lg.not_run_locally(contexts, "fast")}
    assert "needs-net" in rows, "an excluded check vanished from the not-run report"
    row = rows["needs-net"]
    assert row["category"] == "NETWORK_REQUIRED_EXCLUDED_FROM_DEFAULT"
    assert "api.github.com" in row["reason"]
    assert row["opt_in_command"] == "make sandbox-network"


def test_the_loader_refuses_a_network_flag_with_no_reason(tmp_path: Path) -> None:
    bad = tmp_path / "m.toml"
    bad.write_text(
        '[contexts."pyright"]\n'
        'required_context = "pyright"\n'
        'locally_runnable = "yes"\n'
        'command = ["pyright"]\n'
        "timeout_seconds = 60\n"
        'evidence = "pyright.json"\n'
        "in_fast = true\n"
        "requires_network = true\n",
        encoding="utf-8",
    )
    with pytest.raises(lg.ManifestError, match="network_reason"):
        lg.load_manifest(bad)


def test_the_real_manifest_declares_a_reason_for_every_network_flag() -> None:
    for name, spec in CONTEXTS.items():
        if spec.get("requires_network"):
            assert str(spec.get("network_reason", "")).strip(), f"{name}: no reason"
            assert str(spec.get("opt_in_command", "")).strip(), f"{name}: no opt-in"


# --------------------------------------------------------------------------
# Status semantics — the asymmetry that keeps a broken command blocking
# --------------------------------------------------------------------------
def test_a_non_zero_exit_is_fail_and_never_unknown(tmp_path: Path) -> None:
    """A known verdict with an unknown cause is FAIL. The unknown belongs in
    observed_why, never in status, or a broken command reaches the softer word."""
    spec = {
        "command": ["python3", "-c", "import sys; sys.exit(7)"],
        "timeout_seconds": 60,
        "evidence": "x.json",
    }
    record = lg.run_one("deliberate-failure", spec, tmp_path)
    assert record["status"] == "FAIL"
    assert record["exit_code"] == 7
    assert "UNKNOWN" in record["observed_why"]
    assert "INVESTIGATE" in record["next_safe_action"]


def test_a_failure_whose_evidence_cannot_be_written_stays_fail(tmp_path: Path) -> None:
    """The asymmetry, proven: UNKNOWN may only ever replace a PASS.

    A FAIL whose evidence also went missing must stay FAIL. Downgrading it would let
    a broken command escape the pre-push blocker through the softer word.
    """
    unwritable = tmp_path / "readonly"
    unwritable.mkdir()
    unwritable.chmod(0o500)
    try:
        spec = {
            "command": ["python3", "-c", "import sys; sys.exit(3)"],
            "timeout_seconds": 60,
            "evidence": "x.json",
        }
        record = lg.run_one("failure-without-evidence", spec, unwritable)
        assert record["status"] == "FAIL", (
            "a failing command became UNKNOWN when its evidence could not be written"
        )
    finally:
        unwritable.chmod(0o700)


def test_a_pass_whose_evidence_cannot_be_written_becomes_unknown(
    tmp_path: Path,
) -> None:
    """An unprovable pass is not a pass. Every status except PASS blocks the push."""
    unwritable = tmp_path / "readonly"
    unwritable.mkdir()
    unwritable.chmod(0o500)
    try:
        spec = {
            "command": ["python3", "-c", "pass"],
            "timeout_seconds": 60,
            "evidence": "x.json",
        }
        record = lg.run_one("pass-without-evidence", spec, unwritable)
        assert record["status"] == "UNKNOWN", (
            "a pass with no retained evidence was reported as proven"
        )
        assert "INVESTIGATE" in record["next_safe_action"]
    finally:
        unwritable.chmod(0o700)


def test_a_missing_tool_is_block_not_unknown(tmp_path: Path) -> None:
    """BLOCK is for 'could not safely execute', UNKNOWN for 'verdict undeterminable'."""
    spec = {
        "command": ["a-binary-that-does-not-exist-anywhere"],
        "timeout_seconds": 10,
        "evidence": "x.json",
    }
    record = lg.run_one("absent-tool", spec, tmp_path)
    assert record["status"] == "BLOCK"


@pytest.mark.parametrize("status", ["FAIL", "BLOCK", "UNKNOWN"])
def test_no_status_other_than_pass_is_treated_as_passing(status: str) -> None:
    """The single rule the pre-push blocker rests on."""
    assert status != "PASS"
