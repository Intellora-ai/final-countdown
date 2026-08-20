"""The deep verification lane, attacked.

This lane is the ONE place in the repository authorised to reach the network, so the
invariant that matters most is negative: nothing it does may make AXLE reachable from
`make sandbox-fast`. That is proven here by construction, not by reading select().

The second thing worth attacking is the migration verdict. `NOT_APPLICABLE` is a claim
that a category has nothing to verify, and a claim nobody re-derives is an assumption
wearing a status. The absence checks must therefore say NOT_APPLICABLE only when every
probe came back empty AND every probe actually ran -- "the search did not work" and "the
search found nothing" are different facts, and only one of them supports the claim.

No network in this file: every probe here is synthetic and local.
"""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import local_gates as lg  # noqa: E402

MANIFEST_PATH = REPO / "ci" / "local-execution.toml"
MANIFEST: dict[str, Any] = tomllib.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
CONTEXTS: dict[str, dict[str, Any]] = MANIFEST["contexts"]
LOCAL_CHECKS: dict[str, dict[str, Any]] = MANIFEST["local_checks"]
DEEP: dict[str, dict[str, Any]] = MANIFEST["deep_checks"]

REQUIRED_CATEGORIES = {
    "full regression",
    "integration",
    "migration",
    "security",
    "determinism",
}


# --------------------------------------------------------------------------
# The lane covers what Milestone 5 names
# --------------------------------------------------------------------------
def test_every_required_category_has_at_least_one_component() -> None:
    """A lane missing a category reports on four things and is named for five."""
    present = {str(spec["category"]) for spec in DEEP.values()}
    missing = sorted(REQUIRED_CATEGORIES - present)
    assert not missing, f"deep lane declares no component for: {missing}"


def test_every_component_declares_what_it_proves() -> None:
    for name, spec in DEEP.items():
        assert str(spec.get("requirement", "")).strip(), f"{name}: no requirement"
        assert str(spec.get("category", "")).strip(), f"{name}: no category"
        assert spec.get("evidence"), f"{name}: no evidence identifier"
        assert isinstance(spec.get("timeout_seconds"), int), f"{name}: no timeout"


def test_the_three_tables_are_disjoint() -> None:
    """A deep check that could occupy a required context's name would print a line
    indistinguishable from the check GitHub actually enforces."""
    assert not (set(DEEP) & set(CONTEXTS)), "a deep check shares a required context name"
    assert not (set(DEEP) & set(LOCAL_CHECKS)), "a deep check shares a local check name"


def test_the_real_manifest_loads(  ) -> None:
    loaded = lg.load_deep_checks(MANIFEST_PATH)
    assert set(loaded) == set(DEEP)


# --------------------------------------------------------------------------
# THE INVARIANT: the deep lane does not open a hole in sandbox-fast
# --------------------------------------------------------------------------
def test_no_network_component_can_reach_the_fast_tier() -> None:
    """The whole point of putting AXLE here. Proven against the real manifest."""
    fast = set(lg.select(CONTEXTS, "fast"))
    full = set(lg.select(CONTEXTS, "full"))
    for name, spec in CONTEXTS.items():
        if lg.requires_network(spec):
            assert name not in fast, f"{name} requires the network and is in the fast tier"
            assert name not in full, f"{name} requires the network and is in the full tier"


def test_the_axle_component_lives_only_in_the_deep_lane() -> None:
    """`pytest -m axle` must not appear in any context or local check."""
    axle_deep = [n for n, s in DEEP.items() if lg.requires_network(s)]
    assert axle_deep, "the deep lane declares no network component; integration is unproven"

    def touches_axle(spec: dict[str, Any]) -> bool:
        return "axle" in " ".join(str(t) for t in cast("list[Any]", spec.get("command", [])))

    leaked = [n for n, s in CONTEXTS.items() if touches_axle(s) and s.get("in_fast")]
    leaked += [n for n, s in LOCAL_CHECKS.items() if touches_axle(s)]
    assert not leaked, f"an AXLE invocation leaked out of the deep lane: {leaked}"


def test_every_network_component_states_its_reason_and_endpoint() -> None:
    for name, spec in DEEP.items():
        if lg.requires_network(spec):
            assert str(spec.get("network_reason", "")).strip(), f"{name}: no reason"
            assert str(spec.get("endpoint", "")).strip(), f"{name}: no endpoint recorded"


# --------------------------------------------------------------------------
# Loader refusals — proven by construction
# --------------------------------------------------------------------------
def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "m.toml"
    path.write_text(body, encoding="utf-8")
    return path


def test_a_component_with_both_a_command_and_probes_is_refused(tmp_path: Path) -> None:
    """One of the two is a lie about how the category is evaluated."""
    bad = _write(
        tmp_path,
        '[deep_checks."x"]\ncategory = "c"\nrequirement = "r"\n'
        'evidence = "x.json"\ntimeout_seconds = 60\n'
        'command = ["python3", "-c", "pass"]\n'
        '[[deep_checks."x".probes]]\nname = "p"\nargv = ["true"]\n',
    )
    with pytest.raises(lg.ManifestError, match="both a command and probes"):
        lg.load_deep_checks(bad)


def test_a_component_with_neither_is_refused(tmp_path: Path) -> None:
    bad = _write(
        tmp_path,
        '[deep_checks."x"]\ncategory = "c"\nrequirement = "r"\n'
        'evidence = "x.json"\ntimeout_seconds = 60\n',
    )
    with pytest.raises(lg.ManifestError, match="neither a command nor probes"):
        lg.load_deep_checks(bad)


def test_a_deep_check_borrowing_a_context_name_is_refused(tmp_path: Path) -> None:
    bad = _write(
        tmp_path,
        '[contexts."pyright"]\nrequired_context = "pyright"\n'
        'locally_runnable = "yes"\ncommand = ["pyright"]\ntimeout_seconds = 60\n'
        'evidence = "p.json"\nin_fast = true\n'
        '[deep_checks."pyright"]\ncategory = "c"\nrequirement = "r"\n'
        'evidence = "x.json"\ntimeout_seconds = 60\ncommand = ["true"]\n',
    )
    with pytest.raises(lg.ManifestError, match="borrow"):
        lg.load_deep_checks(bad)


def test_a_component_with_no_requirement_is_refused(tmp_path: Path) -> None:
    bad = _write(
        tmp_path,
        '[deep_checks."x"]\ncategory = "c"\nevidence = "x.json"\n'
        'timeout_seconds = 60\ncommand = ["true"]\n',
    )
    with pytest.raises(lg.ManifestError, match="no requirement"):
        lg.load_deep_checks(bad)


# --------------------------------------------------------------------------
# NOT_APPLICABLE is earned, never assumed
# --------------------------------------------------------------------------
SILENT: dict[str, Any] = {
    "category": "migration",
    "requirement": "nothing to verify",
    "evidence": "m.json",
    "timeout_seconds": 60,
    "expect": "NOT_APPLICABLE",
    "probes": [
        {"name": "finds nothing", "argv": ["python3", "-c", "pass"]},
        {"name": "also finds nothing", "argv": ["python3", "-c", "pass"]},
    ],
}


def test_all_silent_probes_earn_not_applicable(tmp_path: Path) -> None:
    record = lg.run_absence_check("migration", SILENT, tmp_path)
    assert record["status"] == "NOT_APPLICABLE"
    assert len(cast("list[Any]", record["probes"])) == 2
    assert "5 searches" not in str(record["observed_why"])
    assert (tmp_path / "migration.json").is_file()


def test_a_probe_that_finds_something_fails_the_claim(tmp_path: Path) -> None:
    """If a migration mechanism appears later, the category must stop claiming to be
    inapplicable -- loudly, not by degrading to a quieter status."""
    spec = {
        **SILENT,
        "probes": [
            {"name": "finds nothing", "argv": ["python3", "-c", "pass"]},
            {
                "name": "finds a migration directory",
                "argv": ["python3", "-c", "print('./db/migrations')"],
            },
        ],
    }
    record = lg.run_absence_check("migration", spec, tmp_path)
    assert record["status"] == "FAIL", "a found mechanism did not falsify the claim"
    matched = [p for p in cast("list[dict[str, Any]]", record["probes"]) if p["matched"]]
    assert len(matched) == 1
    assert "./db/migrations" in str(matched[0]["stdout"]), (
        "the raw probe output was not retained, so a reader cannot check the finding"
    )


def test_a_probe_that_could_not_run_is_unknown_not_absent(tmp_path: Path) -> None:
    """A search that did not work is not a search that found nothing."""
    spec = {
        **SILENT,
        "probes": [
            {"name": "finds nothing", "argv": ["python3", "-c", "pass"]},
            {"name": "cannot run", "argv": ["a-binary-that-does-not-exist-anywhere"]},
        ],
    }
    record = lg.run_absence_check("migration", spec, tmp_path)
    assert record["status"] == "UNKNOWN"
    assert "INVESTIGATE" in str(record["next_safe_action"])


def test_probe_output_is_retained_even_when_empty(tmp_path: Path) -> None:
    """A boolean result cannot be re-checked by a reader."""
    record = lg.run_absence_check("migration", SILENT, tmp_path)
    for probe in cast("list[dict[str, Any]]", record["probes"]):
        assert "stdout" in probe
        assert "argv" in probe
        assert probe["exit_code"] == 0


# --------------------------------------------------------------------------
# Count parsing — the integration record carries numbers, not a wall of dots
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("13 passed, 912 deselected in 22.00s", {"passed": 13}),
        ("2 failed, 3 passed in 1.0s", {"failed": 2, "passed": 3}),
        ("1 passed, 2 skipped in 0.1s", {"passed": 1, "skipped": 2}),
        ("....... [100%]", {}),
    ],
)
def test_pytest_counts_parses_real_summary_lines(
    text: str, expected: dict[str, int]
) -> None:
    assert lg.pytest_counts(text) == expected


# --------------------------------------------------------------------------
# The markdown renderer serves both lanes
# --------------------------------------------------------------------------
def test_the_renderer_handles_a_lane_that_records_source_sha() -> None:
    """The quality gate records SHA; the deep lane records SOURCE_SHA, because on a
    pull_request run GITHUB_SHA is a test-merge commit and the two must stay distinct.
    One renderer, not two that drift."""
    rendered = lg.render_markdown(
        {"LANE": "deep-verify", "STATUS": "PASS", "SOURCE_SHA": "abc", "RUN_ID": "r", "TOTAL_SECONDS": 1}
    )
    assert "deep-verify" in rendered
    assert "abc" in rendered


def test_the_renderer_does_not_crash_on_a_missing_identity_key() -> None:
    """A run whose gates all passed must not die rendering its own summary."""
    rendered = lg.render_markdown({"STATUS": "PASS"})
    assert "UNKNOWN" in rendered
