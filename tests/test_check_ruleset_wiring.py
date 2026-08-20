"""RULESET DRIFT — prove the check is wired, and prove it is not a rubber stamp.

scripts/check_ruleset.py existed, worked, and ran nowhere. `grep -rn
check_ruleset .github/ ci/` returned comments only, so the one check that
compares ci/gates.toml against the LIVE GitHub ruleset ran only when a human
remembered to type it. The danger its own docstring names — a gate declared
mandatory that GitHub does not actually require, which "merges the PR anyway"
— was therefore caught by nothing.

Two things have to hold, and asserting either one alone is worthless:

    1. the preflight job runs it, and ci/gates.toml requires that it does,
       so deleting the step fails preflight instead of passing quietly
    2. it actually says no to a drifted manifest

Test 2 is the one that matters. A wired check that agrees with everything is
a green light with extra steps, so the drift cases below feed the real script
a ruleset that disagrees with the real manifest and require a non-zero exit.

WHY THE DRIFT CASES ARE HERMETIC.
They answer GitHub with a stub `gh` on PATH rather than calling the API. A
test that needs the network fails when GitHub is slow, which is indistinguishable
from failing because the comparison logic broke, and a drift test that cries
wolf gets deleted. PATH is set to the stub directory ALONE, so if the stub
never runs there is no second transport to fall through to: the script reports
INFRASTRUCTURE_FAILURE and the test fails loudly instead of silently passing
on a network call nobody intended.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tomllib
from collections.abc import Iterable
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
MANIFEST = REPO / "ci" / "gates.toml"
VERIFY = REPO / ".github" / "workflows" / "verify.yml"
PY = sys.executable

sys.path.insert(0, str(SCRIPTS))
from check_ruleset import (  # noqa: E402
    EXIT_ALIGNED,
    EXIT_CANNOT_COMPARE,
    EXIT_DRIFT,
)

GATE_STEP = "scripts/check_ruleset.py"
# The app the real ruleset pins every context to. Any non-null value works for
# these tests; the point is the difference between pinned and null.
GITHUB_ACTIONS_APP = 15368


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def manifest_data(path: Path = MANIFEST) -> dict[str, Any]:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def declared_checks() -> list[str]:
    ruleset = cast("dict[str, Any]", manifest_data()["ruleset"])
    return [str(c) for c in cast("list[Any]", ruleset["required_checks"])]


def declared_tools() -> list[str]:
    ruleset = cast("dict[str, Any]", manifest_data()["ruleset"])
    return [str(t) for t in cast("list[Any]", ruleset["code_scanning_tools"])]


def ruleset_payload(
    contexts: Iterable[str],
    *,
    tools: Iterable[str] | None = None,
    unpinned: frozenset[str] = frozenset(),
    status_rule: bool = True,
) -> dict[str, Any]:
    """A GitHub ruleset response, shaped like the real one."""
    rules: list[dict[str, Any]] = [{"type": "deletion"}, {"type": "non_fast_forward"}]
    if status_rule:
        rules.append(
            {
                "type": "required_status_checks",
                "parameters": {
                    "required_status_checks": [
                        {
                            "context": c,
                            "integration_id": None
                            if c in unpinned
                            else GITHUB_ACTIONS_APP,
                        }
                        for c in contexts
                    ]
                },
            }
        )
    rules.append(
        {
            "type": "code_scanning",
            "parameters": {
                "code_scanning_tools": [
                    {"tool": t} for t in (declared_tools() if tools is None else tools)
                ]
            },
        }
    )
    return {"id": 20990225, "name": "final countdown protection", "rules": rules}


def stub_gh(bin_dir: Path, payload: dict[str, Any]) -> None:
    """A `gh` that answers any argv with `payload`, so no network is touched.

    Every program it names is an absolute path. PATH is the stub directory
    alone, so a stub that shelled out to `dirname` or `cat` would fail to run
    and the script would correctly report that it could not read the ruleset —
    turning a drift assertion into a confusing infrastructure error.
    """
    bin_dir.mkdir(parents=True, exist_ok=True)
    payload_file = bin_dir / "ruleset.json"
    payload_file.write_text(json.dumps(payload), encoding="utf-8")
    exe = bin_dir / "gh"
    exe.write_text(f"#!/bin/sh\nexec /bin/cat '{payload_file}'\n", encoding="utf-8")
    exe.chmod(0o755)


@pytest.fixture
def work(tmp_path: Path) -> Path:
    """The real script and the real manifest, in a directory tests may edit."""
    root = tmp_path / "work"
    (root / "scripts").mkdir(parents=True)
    (root / "ci").mkdir()
    shutil.copy(SCRIPTS / "check_ruleset.py", root / "scripts")
    shutil.copy(MANIFEST, root / "ci")
    return root


def run_check(root: Path, path_value: str) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)
    env["PATH"] = path_value  # the ONLY transports the script may find
    return subprocess.run(
        [PY, str(root / "scripts" / "check_ruleset.py")],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )


def against(root: Path, payload: dict[str, Any]) -> subprocess.CompletedProcess[str]:
    """Run the real check against a ruleset we control."""
    bin_dir = root / "bin"
    stub_gh(bin_dir, payload)
    return run_check(root, str(bin_dir))


def preflight_steps() -> list[dict[str, Any]]:
    doc = cast("dict[str, Any]", yaml.safe_load(VERIFY.read_text(encoding="utf-8")))
    jobs = cast("dict[str, Any]", doc["jobs"])
    job = cast("dict[str, Any]", jobs["preflight"])
    return [
        cast("dict[str, Any]", s)
        for s in cast("list[Any]", job["steps"])
        if isinstance(s, dict)
    ]


# --------------------------------------------------------------------------
# 1. the wiring exists
# --------------------------------------------------------------------------
def test_preflight_job_executes_the_ruleset_check() -> None:
    """The whole defect: the script existed and no job ran it."""
    carriers = [s for s in preflight_steps() if GATE_STEP in str(s.get("run", ""))]
    assert carriers, (
        f"no step in the preflight job runs {GATE_STEP} — the ruleset drift "
        "check is back to being something a human has to remember"
    )
    for step in carriers:
        run_script = str(step["run"]).strip()
        assert run_script.startswith("python3 "), (
            f"{GATE_STEP} is mentioned but not launched: {run_script!r}"
        )
        assert "||" not in run_script, f"failure suppressed: {run_script!r}"


def test_the_step_is_unconditional_and_propagates_failure() -> None:
    """`if:` or continue-on-error on a gate step is a deleted gate."""
    for step in preflight_steps():
        if GATE_STEP not in str(step.get("run", "")):
            continue
        assert step.get("if") is None, (
            "a conditioned ruleset check still leaves preflight green"
        )
        assert not step.get("continue-on-error"), (
            "continue-on-error converts ruleset drift into a passing gate"
        )


def test_the_gate_declaration_requires_the_step() -> None:
    """Without this, the step is deletable and nothing notices."""
    gates = cast("dict[str, Any]", manifest_data()["gates"])
    preflight = cast("dict[str, Any]", gates["preflight"])
    must = [str(t) for t in cast("list[Any]", preflight["must_contain"])]
    assert GATE_STEP in must, (
        f"{GATE_STEP} is not in [gates.preflight].must_contain, so "
        "gate_integrity.py does not require the workflow to keep running it"
    )


def test_deleting_the_step_fails_gate_integrity(tmp_path: Path) -> None:
    """The teeth. must_contain is only a claim until removal is punished."""
    sandbox = tmp_path / "sabotage"
    for rel in ("scripts", "ci", ".github/workflows"):
        dst = sandbox / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(REPO / rel, dst)
    (sandbox / "reports").mkdir()

    workflow = sandbox / ".github" / "workflows" / "verify.yml"
    text = workflow.read_text(encoding="utf-8")
    # In-chain form: check_ruleset.py moved inside the
    # `run_gate.py --name preflight -- bash -c` wrapper.
    sabotaged = text.replace(f"            python3 {GATE_STEP}\n", "", 1)
    assert sabotaged != text, "the step this test deletes was not found"
    workflow.write_text(sabotaged, encoding="utf-8")

    env = dict(os.environ)
    env.pop("GITHUB_STEP_SUMMARY", None)
    result = subprocess.run(
        [PY, str(sandbox / "scripts" / "gate_integrity.py")],
        cwd=sandbox,
        capture_output=True,
        text=True,
        timeout=300,
        env=env,
    )
    assert result.returncode != 0, (
        "the ruleset check was deleted from the workflow and preflight passed"
    )
    assert "no longer invokes its command" in result.stdout, result.stdout[-600:]


# --------------------------------------------------------------------------
# 2. the check is not a rubber stamp
# --------------------------------------------------------------------------
def test_an_aligned_ruleset_passes(work: Path) -> None:
    """Control. Without this, every test below passes for the wrong reason."""
    result = against(work, ruleset_payload(declared_checks()))
    assert result.returncode == EXIT_ALIGNED, result.stdout + result.stderr
    assert "ALIGNED" in result.stdout


def test_manifest_declares_a_check_github_does_not_require(work: Path) -> None:
    """THE dangerous direction: the gate runs, goes red, and nothing is blocked."""
    surviving = [c for c in declared_checks() if c != "mutmut"]
    result = against(work, ruleset_payload(surviving))
    assert result.returncode == EXIT_DRIFT, (
        "a mandatory gate GitHub does not require was reported as aligned:\n"
        + result.stdout
    )
    assert "GATES THAT BLOCK NOTHING" in result.stdout
    assert "mutmut" in result.stdout


def test_github_requires_a_check_the_manifest_does_not_declare(work: Path) -> None:
    """The other direction: a required context with no gate hangs every merge."""
    result = against(work, ruleset_payload([*declared_checks(), "ghost-gate"]))
    assert result.returncode == EXIT_DRIFT, (
        "a required check with no declared gate was reported as aligned:\n"
        + result.stdout
    )
    assert "CHECKS GITHUB REQUIRES THAT THE MANIFEST DOES NOT DECLARE" in result.stdout
    assert "ghost-gate" in result.stdout


def test_an_unpinned_context_is_rejected(work: Path) -> None:
    """A context pinned to no app is a required check any actor can forge."""
    result = against(
        work, ruleset_payload(declared_checks(), unpinned=frozenset({"preflight"}))
    )
    assert result.returncode == EXIT_DRIFT, (
        "an unpinned required context was reported as aligned:\n" + result.stdout
    )
    assert "NOT PINNED TO AN APP" in result.stdout


def test_a_code_scanning_tool_github_stopped_enforcing_is_rejected(work: Path) -> None:
    """Dropping Bandit from the rule makes its findings advisory again."""
    result = against(work, ruleset_payload(declared_checks(), tools=["CodeQL"]))
    assert result.returncode == EXIT_DRIFT, result.stdout
    assert "CODE-SCANNING TOOL MISMATCH" in result.stdout
    assert "Bandit" in result.stdout


def test_deleting_the_status_check_rule_entirely_is_total_drift(work: Path) -> None:
    """Zero required contexts must read as total drift, not as nothing to compare."""
    result = against(work, ruleset_payload([], status_rule=False))
    assert result.returncode == EXIT_DRIFT, (
        "a ruleset requiring no checks at all was not reported as drift:\n"
        + result.stdout
    )
    assert "GATES THAT BLOCK NOTHING" in result.stdout


def test_a_drifted_manifest_is_caught_without_any_ruleset_call(work: Path) -> None:
    """Manifest-internal drift is free to detect and must not need the network."""
    toml = (work / "ci" / "gates.toml").read_text(encoding="utf-8")
    (work / "ci" / "gates.toml").write_text(
        toml.replace('  "preflight",\n', '  "preflight",\n  "ghost-gate",\n', 1),
        encoding="utf-8",
    )
    result = against(work, ruleset_payload(declared_checks()))
    assert result.returncode != EXIT_ALIGNED, result.stdout
    assert "MISMATCH inside the manifest" in result.stdout
    assert "ghost-gate" in result.stdout


# --------------------------------------------------------------------------
# 3. "could not compare" is a third answer, not agreement
# --------------------------------------------------------------------------
def test_an_unreadable_ruleset_is_neither_aligned_nor_drift(work: Path) -> None:
    """Silently skipping means the drift check does not exist."""
    empty = work / "empty-bin"
    empty.mkdir()
    result = run_check(work, str(empty))  # no gh, no curl, no network
    assert result.returncode == EXIT_CANNOT_COMPARE, (
        f"expected INFRASTRUCTURE_FAILURE ({EXIT_CANNOT_COMPARE}), got "
        f"{result.returncode}:\n{result.stdout}"
    )
    assert "CANNOT COMPARE" in result.stdout
    assert "INFRASTRUCTURE_FAILURE" in result.stdout


def test_unreadable_and_drifted_are_distinguishable(work: Path) -> None:
    """Collapsing them loses the difference between 'wrong' and 'unknown'."""
    empty = work / "empty-bin"
    empty.mkdir()
    unreadable = run_check(work, str(empty)).returncode
    drifted = against(
        work, ruleset_payload([c for c in declared_checks() if c != "full"])
    ).returncode
    assert unreadable != drifted, (
        "'could not read the ruleset' and 'the ruleset drifted' exit the same "
        "way, so the workflow cannot tell an outage from a real failure"
    )
    assert EXIT_ALIGNED not in (unreadable, drifted), "a non-aligned state exited 0"


def test_a_ruleset_response_that_is_not_json_is_not_aligned(work: Path) -> None:
    """A proxy's HTML error page must not parse as agreement."""
    bin_dir = work / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    exe = bin_dir / "gh"
    exe.write_text("#!/bin/sh\necho '<html>502 Bad Gateway</html>'\n", encoding="utf-8")
    exe.chmod(0o755)
    result = run_check(work, str(bin_dir))
    assert result.returncode == EXIT_CANNOT_COMPARE, result.stdout
    assert "CANNOT COMPARE" in result.stdout
