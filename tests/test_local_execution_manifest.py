"""The local execution manifest, attacked.

`ci/local-execution.toml` decides which of GitHub's seventeen required contexts run before a push.
If it can silently drop one, it reproduces the failure it was built to prevent: on 2026-08-20
`pyright` was missing from the set run before pushing and four CI runs went red in a row.

These tests hold three lines. The manifest covers every required context exactly once. The runner
never lies about what it did or did not run. And the pre-push hook actually stops `git push` --
proven against a real repository and a real bare remote, because a test that merely executes the
hook script proves the script runs, not that the push was blocked.
"""

from __future__ import annotations

import json
import sys
import tomllib
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import local_gates as lg  # noqa: E402

MANIFEST = tomllib.loads(
    (REPO / "ci" / "local-execution.toml").read_text(encoding="utf-8")
)
CONTEXTS: dict[str, dict[str, Any]] = MANIFEST["contexts"]
REQUIRED: list[str] = tomllib.loads(
    (REPO / "ci" / "gates.toml").read_text(encoding="utf-8")
)["ruleset"]["required_checks"]


# --------------------------------------------------------------------------
# Coverage of the required set
# --------------------------------------------------------------------------
def test_every_required_context_appears() -> None:
    """A context absent from the manifest is a check nobody runs and nobody misses."""
    missing = sorted(set(REQUIRED) - set(CONTEXTS))
    assert not missing, f"required contexts absent from the manifest: {missing}"


def test_no_context_is_invented() -> None:
    """The manifest may not claim a context GitHub does not require."""
    extra = sorted(set(CONTEXTS) - set(REQUIRED))
    assert not extra, f"manifest declares contexts GitHub does not require: {extra}"


def test_each_context_appears_exactly_once() -> None:
    raw = (REPO / "ci" / "local-execution.toml").read_text(encoding="utf-8")
    for name in REQUIRED:
        headers = raw.count(f'[contexts."{name}"]')
        assert headers == 1, f"{name} has {headers} table headers, expected exactly 1"


def test_context_identity_matches_gates_toml() -> None:
    """`required_context` is the join key back to the authoritative required set."""
    for name, spec in CONTEXTS.items():
        assert spec["required_context"] == name, (
            f"{name}: required_context is {spec['required_context']!r}; the key and the "
            "declared identity must agree or the join to ci/gates.toml is meaningless"
        )
        assert spec["required_context"] in REQUIRED


# --------------------------------------------------------------------------
# Shape: yes carries a command, no carries a reason, nothing is vague
# --------------------------------------------------------------------------
def test_every_context_is_yes_or_no() -> None:
    """There is no `partial`. Partial is how an omission hides."""
    for name, spec in CONTEXTS.items():
        assert spec["locally_runnable"] in {"yes", "no"}, (
            f"{name}: locally_runnable={spec['locally_runnable']!r}"
        )


def test_runnable_contexts_carry_argv_and_timeout() -> None:
    for name, spec in CONTEXTS.items():
        if spec["locally_runnable"] != "yes":
            continue
        command = cast("list[Any]", spec.get("command"))
        assert isinstance(command, list) and command, f"{name}: no command array"
        assert all(isinstance(t, str) for t in command), (
            f"{name}: command is not argv strings"
        )
        assert isinstance(spec.get("timeout_seconds"), int), (
            f"{name}: no integer timeout"
        )
        assert spec.get("evidence"), f"{name}: no evidence identifier"


def test_commands_are_argv_arrays_never_shell_strings() -> None:
    """A shell string is a place for a shell to interpret something nobody intended."""
    for name, spec in CONTEXTS.items():
        command = spec.get("command")
        if command is None:
            continue
        assert not isinstance(command, str), f"{name}: command is a shell string"
        joined = " ".join(command)
        for meta in ("&&", "||", ";", "|", ">", "<"):
            assert meta not in command, (
                f"{name}: shell metacharacter {meta!r} is a standalone argv token; "
                f"the command is being used as a shell line: {joined[:120]}"
            )


def test_non_runnable_contexts_carry_an_exact_reason_and_no_command() -> None:
    for name, spec in CONTEXTS.items():
        if spec["locally_runnable"] != "no":
            continue
        reason = str(spec.get("reason", ""))
        assert len(reason) > 30, f"{name}: reason too thin to be exact: {reason!r}"
        assert "command" not in spec, (
            f"{name}: marked not-runnable but carries a command; one of the two is a lie"
        )


# --------------------------------------------------------------------------
# The pyright invariant
# --------------------------------------------------------------------------
def test_pyright_is_locally_runnable_and_in_the_fast_tier() -> None:
    """The check whose omission started this. It may not be optional here.

    `pyright` is a required GitHub context that runs perfectly well on a laptop. On
    2026-08-20 it was left out of the pre-push set and CI caught it instead, at a cost of
    roughly 100 seconds plus the diagnosis. Inspection must never conclude it is
    GitHub-only.
    """
    spec = CONTEXTS.get("pyright")
    assert spec is not None, "pyright is absent from the manifest"
    assert spec["locally_runnable"] == "yes"
    assert spec.get("command"), "pyright has no argv"
    assert spec.get("in_fast") is True, "pyright is not in the fast tier"
    assert "pyright" in lg.select(CONTEXTS, "fast")
    assert "pyright" in lg.select(CONTEXTS, "full")


def test_the_loader_refuses_a_manifest_that_demotes_pyright(tmp_path: Path) -> None:
    """Proven by construction, not by trusting the current file."""
    bad = tmp_path / "m.toml"
    bad.write_text(
        '[contexts."pyright"]\n'
        'required_context = "pyright"\n'
        'locally_runnable = "no"\n'
        'reason = "a reason long enough to look plausible to a careless reader"\n',
        encoding="utf-8",
    )
    with pytest.raises(lg.ManifestError, match="pyright"):
        lg.load_manifest(bad)


@pytest.mark.parametrize(
    "body,fragment",
    [
        (
            '[contexts."x"]\nrequired_context="x"\nlocally_runnable="partial"\n',
            "only 'yes' or 'no'",
        ),
        (
            '[contexts."x"]\nrequired_context="x"\nlocally_runnable="yes"\n',
            "no command array",
        ),
        ('[contexts."x"]\nrequired_context="x"\nlocally_runnable="no"\n', "no reason"),
    ],
)
def test_the_loader_refuses_malformed_entries(
    tmp_path: Path, body: str, fragment: str
) -> None:
    bad = tmp_path / "m.toml"
    bad.write_text(body, encoding="utf-8")
    with pytest.raises(lg.ManifestError) as caught:
        lg.load_manifest(bad)
    assert fragment in str(caught.value)


# --------------------------------------------------------------------------
# Honesty about what did not run
# --------------------------------------------------------------------------
def test_github_only_contexts_are_reported_and_never_selected() -> None:
    absent = dict(lg.github_only(CONTEXTS))
    runnable = set(lg.select(CONTEXTS, "full"))
    assert absent, "no context is marked GitHub-only; that would be a surprising claim"
    assert not (set(absent) & runnable), (
        "a context is both GitHub-only and selected to run"
    )
    for name, reason in absent.items():
        assert reason.strip(), f"{name} is GitHub-only with no reason"


def test_a_failing_gate_returns_non_zero_and_writes_evidence(tmp_path: Path) -> None:
    """A gate that fails must make the process fail, and leave a record saying why."""
    spec = {
        "command": ["python3", "-c", "import sys; sys.exit(3)"],
        "timeout_seconds": 60,
        "evidence": "x.json",
    }
    record = lg.run_one("deliberate-failure", spec, tmp_path)
    assert record["status"] == "FAIL"
    assert record["exit_code"] == 3
    written = json.loads(
        (tmp_path / "deliberate-failure.json").read_text(encoding="utf-8")
    )
    for field in (
        "argv",
        "working_directory",
        "timeout_seconds",
        "start",
        "end",
        "duration_seconds",
        "exit_code",
    ):
        assert field in written, f"evidence is missing {field}"


def test_a_failing_gate_never_invents_a_cause(tmp_path: Path) -> None:
    """A confidently wrong root cause sends the next person to the wrong file."""
    spec = {
        "command": ["python3", "-c", "import sys; sys.exit(1)"],
        "timeout_seconds": 60,
        "evidence": "x.json",
    }
    record = lg.run_one("unexplained", spec, tmp_path)
    assert "UNKNOWN" in record["observed_why"]
    assert "INVESTIGATE" in record["next_safe_action"]


def test_a_missing_binary_blocks_rather_than_passes(tmp_path: Path) -> None:
    spec = {
        "command": ["a-binary-that-does-not-exist-anywhere"],
        "timeout_seconds": 10,
        "evidence": "x.json",
    }
    record = lg.run_one("absent-tool", spec, tmp_path)
    assert record["status"] == "BLOCK", (
        "a tool that could not run must never read as PASS"
    )


# --------------------------------------------------------------------------
# THE PRE-PUSH HOOK IS GONE, AND ITS PROOFS WENT WITH IT.
#
# Four tests here built a real repository with a real bare remote, installed
# `.githooks/pre-push`, and proved a failing local gate STOPS `git push`. The
# hook was removed by the repository owner's decision (2026-09-01): it was
# failing on the deleted skills tree, and its own banner stated the honest
# limit -- "It is not a security boundary: git push --no-verify, GitHub web UI,
# direct API changes, or another machine can bypass it. GitHub's required
# contexts remain the final merge proof."
#
# The BEHAVIOUR those tests guarded -- broken code cannot merge -- lives at the
# ruleset now: 21 required contexts, held in agreement with ci/gates.toml by
# scripts/check_ruleset.py, which fails the moment the two diverge. A test for
# a local courtesy that no longer exists would be asserting the repository we
# decided not to have.
