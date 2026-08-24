"""The registry gate must be able to say no.

A gate that has only ever been run against a correct file is not known to
reject anything. Every defect class scripts/registry_gate.py claims to catch is
injected into a temporary copy here and shown to be REJECTED, with the exit code
that distinguishes "wrong" (1) from "could not read" (2). The last test in the
file is the control: the real ci/requirements.yml and ci/assumptions.yml pass.

The control matters as much as the attacks. A checker that rejects everything is
as useless as one that rejects nothing, and only the pair of them shows which
this is.
"""

from __future__ import annotations

import subprocess
import sys
import tomllib
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
GATE = REPO / "scripts" / "registry_gate.py"
REAL_GATES = REPO / "ci" / "gates.toml"
REAL_REQS = REPO / "ci" / "requirements.yml"
REAL_ASMS = REPO / "ci" / "assumptions.yml"
DOCS = REPO / "docs" / "registries.md"
PY = sys.executable

Row = dict[str, Any]
Doc = dict[str, Any]


# ---------------------------------------------------------------------------
# HARNESS
# ---------------------------------------------------------------------------
def run_gate(
    requirements: Path = REAL_REQS,
    assumptions: Path = REAL_ASMS,
    gates: Path = REAL_GATES,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            PY,
            str(GATE),
            "--gates",
            str(gates),
            "--requirements",
            str(requirements),
            "--assumptions",
            str(assumptions),
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=180,
    )


def load(path: Path) -> Doc:
    return cast("Doc", yaml.safe_load(path.read_text(encoding="utf-8")))


def rows_of(doc: Doc, collection: str) -> list[Row]:
    return cast("list[Row]", doc[collection])


def dump(path: Path, doc: Doc) -> Path:
    path.write_text(
        yaml.safe_dump(doc, sort_keys=False, allow_unicode=True), encoding="utf-8"
    )
    return path


def broken_requirements(tmp_path: Path, edit: Callable[[list[Row]], None]) -> Path:
    doc = load(REAL_REQS)
    edit(rows_of(doc, "requirements"))
    return dump(tmp_path / "requirements.yml", doc)


def broken_assumptions(tmp_path: Path, edit: Callable[[list[Row]], None]) -> Path:
    doc = load(REAL_ASMS)
    edit(rows_of(doc, "assumptions"))
    return dump(tmp_path / "assumptions.yml", doc)


def first_high_unverified(rows: list[Row]) -> Row:
    for row in rows:
        if row["impact"] == "high" and row["status"] == "unverified":
            return row
    raise AssertionError("fixture assumes ci/assumptions.yml has one of these")


# ---------------------------------------------------------------------------
# EXIT 1 — the registry is wrong about the system it describes
# ---------------------------------------------------------------------------
def test_verification_naming_a_gate_that_does_not_exist_is_rejected(
    tmp_path: Path,
) -> None:
    """The whole point of the file is that these names resolve."""

    def edit(rows: list[Row]) -> None:
        rows[0]["verification"] = "spec-strenght"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "is not in ci/gates.toml" in r.stderr
    assert "'spec-strenght'" in r.stderr


def test_evidence_that_is_not_the_gates_own_evidence_is_rejected(
    tmp_path: Path,
) -> None:
    """An evidence path nobody writes is a citation to a file that never exists."""

    def edit(rows: list[Row]) -> None:
        rows[0]["evidence"] = "reports/preflight.jsonl"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "does not match the evidence" in r.stderr


def test_evidence_declared_for_a_requirement_nothing_verifies_is_rejected(
    tmp_path: Path,
) -> None:
    def edit(rows: list[Row]) -> None:
        target = next(r for r in rows if r["verification"] == "none")
        target["evidence"] = "reports/coverage.json"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "nothing produces evidence for a requirement nothing verifies" in r.stderr


def test_duplicate_requirement_id_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[1]["id"] = rows[0]["id"]

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "duplicate id REQ-001" in r.stderr


def test_duplicate_assumption_id_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[1]["id"] = rows[0]["id"]

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "duplicate id ASM-001" in r.stderr


def test_severity_outside_the_closed_set_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["severity"] = "critical"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "severity 'critical' is outside {blocking, advisory}" in r.stderr


def test_status_outside_the_closed_set_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["status"] = "mostly-verified"

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "status 'mostly-verified' is outside" in r.stderr


def test_impact_outside_the_closed_set_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["impact"] = "catastrophic"

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "impact 'catastrophic' is outside {high, medium, low}" in r.stderr


def test_blocking_severity_on_a_gate_that_blocks_nothing_is_rejected(
    tmp_path: Path,
) -> None:
    """The failure scripts/check_ruleset.py describes, one level up."""

    def edit(rows: list[Row]) -> None:
        # Any gate with mandatory = false will do; this needs one that exists.
        # It was `fast` until pr-fast.yml was removed for being slower than the
        # required jobs it duplicated.
        rows[0]["verification"] = "ai-review"
        rows[0]["evidence"] = "reports/ai-review.json"
        rows[0]["severity"] = "blocking"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "mandatory = false" in r.stderr
    assert "must be 'advisory'" in r.stderr


def test_citing_a_non_mandatory_gate_at_all_is_rejected(tmp_path: Path) -> None:
    """Even labelled advisory: a green-by-construction check verifies nothing."""

    def edit(rows: list[Row]) -> None:
        rows[0]["verification"] = "ai-review"
        rows[0]["evidence"] = (
            "pull request review comments, posted via the claude GitHub App (1236702)"
        )
        rows[0]["severity"] = "advisory"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "which is not mandatory" in r.stderr


def test_advisory_severity_on_a_mandatory_gate_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["severity"] = "advisory"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "must be 'blocking'" in r.stderr


def test_unknown_field_in_a_requirement_is_rejected(tmp_path: Path) -> None:
    """A mistyped field is silently ignored, which is how a registry rots."""

    def edit(rows: list[Row]) -> None:
        rows[0]["sevrity"] = "blocking"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "unknown field(s) sevrity" in r.stderr


def test_a_statement_too_short_to_falsify_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["statement"] = "it works"

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "a falsifiable sentence needs at least 20" in r.stderr


# ---------------------------------------------------------------------------
# EXIT 1 — the acceptance policy
# ---------------------------------------------------------------------------
def test_high_impact_unverified_without_acceptance_is_rejected(tmp_path: Path) -> None:
    """The case the policy exists to catch: a new one nobody thought about."""

    def edit(rows: list[Row]) -> None:
        row = first_high_unverified(rows)
        row.pop("accepted", None)

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "impact high and never tested" in r.stderr
    assert "TCB: acknowledgement" in r.stderr


def test_a_checkbox_acceptance_is_rejected(tmp_path: Path) -> None:
    """`accepted: known` is the failure mode the length floor exists for."""

    def edit(rows: list[Row]) -> None:
        first_high_unverified(rows)["accepted"] = "known, by design"

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "Policy needs at least 40" in r.stderr


def test_high_impact_falsified_is_rejected_even_when_accepted(tmp_path: Path) -> None:
    """The one case with no escape hatch."""

    def edit(rows: list[Row]) -> None:
        row = first_high_unverified(rows)
        row["status"] = "falsified"
        row["accepted"] = (
            "A carefully written and entirely sincere paragraph "
            "explaining why this is fine, which it is not."
        )

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "impact high and status falsified" in r.stderr
    assert "no acceptance that changes that" in r.stderr


def test_falsified_at_lower_impact_still_needs_acceptance(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        row = next(r for r in rows if r["status"] == "falsified")
        row.pop("accepted", None)

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "measured and found false" in r.stderr


def test_an_acceptance_the_policy_did_not_ask_for_is_rejected(tmp_path: Path) -> None:
    """An acceptance that buys nothing hides the ones that do."""

    def edit(rows: list[Row]) -> None:
        row = next(r for r in rows if r["status"] == "verified")
        row["accepted"] = (
            "Recording some general context here rather than in "
            "the note field, where it belongs."
        )

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "policy does not require it" in r.stderr
    assert "Move the text to `note:`" in r.stderr


def test_how_to_test_that_is_a_plan_to_make_a_plan_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["how_to_test"] = (
            "Investigate whether the interpreter and "
            "CPython really do agree in general."
        )

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "an intention to think rather than an action to take" in r.stderr


def test_how_to_test_too_short_to_be_an_action_is_rejected(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0]["how_to_test"] = "test it"

    r = run_gate(assumptions=broken_assumptions(tmp_path, edit))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "a concrete action needs at least 20" in r.stderr


# ---------------------------------------------------------------------------
# EXIT 2 — the gate could not read its input, and says so instead of passing
# ---------------------------------------------------------------------------
def test_unparsable_yaml_cannot_run_and_never_passes(tmp_path: Path) -> None:
    bad = tmp_path / "requirements.yml"
    bad.write_text(
        "version: 1\nrequirements:\n  - id: REQ-001\n   bad: [\n", encoding="utf-8"
    )
    r = run_gate(requirements=bad)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "CANNOT RUN" in r.stderr
    assert "does not parse" in r.stderr


def test_a_missing_registry_cannot_run(tmp_path: Path) -> None:
    r = run_gate(assumptions=tmp_path / "not-here.yml")
    assert r.returncode == 2, r.stdout + r.stderr
    assert "is missing" in r.stderr


def test_a_missing_required_field_cannot_run(tmp_path: Path) -> None:
    def edit(rows: list[Row]) -> None:
        rows[0].pop("severity")

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 2, r.stdout + r.stderr
    assert "`severity` is missing or empty" in r.stderr


def test_a_row_using_the_gates_own_namespace_cannot_run(tmp_path: Path) -> None:
    """`_unknown` is bookkeeping; a row that set it could hide its own defects."""

    def edit(rows: list[Row]) -> None:
        rows[0]["_unknown"] = ""

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 2, r.stdout + r.stderr
    assert "field `_unknown` is reserved" in r.stderr


def test_a_non_text_value_cannot_run(tmp_path: Path) -> None:
    """`severity: 3` is not a severity this gate should guess at."""

    def edit(rows: list[Row]) -> None:
        rows[0]["severity"] = 3

    r = run_gate(requirements=broken_requirements(tmp_path, edit))
    assert r.returncode == 2, r.stdout + r.stderr
    assert "is int, not text" in r.stderr


def test_an_empty_registry_cannot_run(tmp_path: Path) -> None:
    """A loop over nothing exits 0, having examined nothing."""
    path = dump(tmp_path / "assumptions.yml", {"version": 1, "assumptions": []})
    r = run_gate(assumptions=path)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "would let this gate report success having checked nothing" in r.stderr


def test_an_unknown_schema_version_cannot_run(tmp_path: Path) -> None:
    doc = load(REAL_REQS)
    doc["version"] = 2
    r = run_gate(requirements=dump(tmp_path / "requirements.yml", doc))
    assert r.returncode == 2, r.stdout + r.stderr
    assert "this gate reads 1" in r.stderr


def test_a_registry_that_is_not_a_mapping_cannot_run(tmp_path: Path) -> None:
    bad = tmp_path / "assumptions.yml"
    bad.write_text("- id: ASM-001\n", encoding="utf-8")
    r = run_gate(assumptions=bad)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "not a mapping at the top level" in r.stderr


def test_a_row_that_is_not_a_mapping_cannot_run(tmp_path: Path) -> None:
    bad = dump(
        tmp_path / "requirements.yml", {"version": 1, "requirements": ["REQ-001"]}
    )
    r = run_gate(requirements=bad)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "entry 1 is not a mapping" in r.stderr


def test_an_unreadable_manifest_cannot_run(tmp_path: Path) -> None:
    bad = tmp_path / "gates.toml"
    bad.write_text("[gates.preflight\nmandatory = true\n", encoding="utf-8")
    r = run_gate(gates=bad)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "does not parse" in r.stderr


def test_a_manifest_with_no_gates_table_cannot_run(tmp_path: Path) -> None:
    bad = tmp_path / "gates.toml"
    bad.write_text("[ruleset]\nid = 1\n", encoding="utf-8")
    r = run_gate(gates=bad)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "declares no [gates] table" in r.stderr


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def _absent(base: Path) -> Path:
    return base / "gone.yml"


def _empty_file(base: Path) -> Path:
    return _write(base / "empty.yml", "")


def _bare_scalar(base: Path) -> Path:
    return _write(base / "scalar.yml", "1\n")


def _collection_is_a_mapping(base: Path) -> Path:
    return _write(base / "nolist.yml", "version: 1\nrequirements: {}\n")


@pytest.mark.parametrize(
    "build",
    [
        pytest.param(_absent, id="missing"),
        pytest.param(_empty_file, id="empty-file"),
        pytest.param(_bare_scalar, id="bare-scalar"),
        pytest.param(_collection_is_a_mapping, id="not-a-list"),
    ],
)
def test_no_malformed_input_ever_exits_zero(
    tmp_path: Path, build: Callable[[Path], Path]
) -> None:
    """Whatever else happens, an unreadable registry is not a passing one."""
    r = run_gate(requirements=build(tmp_path))
    assert r.returncode == 2, f"exit {r.returncode}: {r.stdout + r.stderr}"


# ---------------------------------------------------------------------------
# CONTROL — a checker that rejects everything is no better than one that
# rejects nothing
# ---------------------------------------------------------------------------
def test_the_real_registries_pass() -> None:
    r = run_gate()
    assert r.returncode == 0, r.stdout + r.stderr
    assert "OK — every reference resolves" in r.stdout


def test_the_inventory_is_printed() -> None:
    """The counts are the output a human reads; a silent pass is not a report."""
    r = run_gate()
    for line in (
        "[REGISTRY GATE]",
        "requirements:",
        "verification: none",
        "NOTHING VERIFIES THESE:",
        "assumptions:",
        "status unverified",
        "impact high",
        "carrying an accepted-risk statement:",
        "gates cited by at least one requirement:",
    ):
        assert line in r.stdout, f"missing from the inventory: {line!r}"


def test_every_mandatory_gate_is_cited_by_a_requirement() -> None:
    """A mandatory gate no requirement names is a check with no stated purpose."""
    manifest = tomllib.loads(REAL_GATES.read_text(encoding="utf-8"))
    gates = cast("dict[str, Any]", manifest["gates"])
    mandatory = {
        n for n, s in gates.items() if cast("dict[str, Any]", s).get("mandatory")
    }
    cited = {
        cast("str", r["verification"]) for r in rows_of(load(REAL_REQS), "requirements")
    }
    assert not mandatory - cited, (
        f"mandatory gates no requirement cites: {sorted(mandatory - cited)}"
    )


def test_the_documented_closed_sets_match_the_enforced_ones() -> None:
    """Two lists that must agree are two lists that drift."""
    text = DOCS.read_text(encoding="utf-8")
    for value in (
        "blocking",
        "advisory",
        "high",
        "medium",
        "low",
        "verified",
        "falsified",
        "unverified",
        "not-applicable",
    ):
        assert value in text, f"docs/registries.md does not name {value!r}"
