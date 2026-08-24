"""The SARIF the repo publishes must agree with the gate that judged it.

Two sources of truth for one set of findings is what put 17 machine-authored
threads on a pull request and blocked it. These pin the two properties that
make one-source-of-truth safe: only PROVED findings are marked, and a failing
gate marks nothing.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable


def bandit_sarif(cwd: Path, out: Path) -> None:
    """Produce SARIF, and fail loudly if the toolchain cannot.

    SARIF output needs the `bandit[sarif]` extra. When only plain `bandit` was
    installed this wrote nothing and the tests died on FileNotFoundError three
    frames later, which named the symptom and hid the cause.
    """
    r = subprocess.run(
        [
            PY,
            "-m",
            "bandit",
            "-r",
            "src",
            "scripts",
            "-f",
            "sarif",
            "-o",
            str(out),
            "--severity-level",
            "low",
            "--confidence-level",
            "low",
        ],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert out.is_file(), (
        f"bandit produced no SARIF (exit {r.returncode}). Install "
        f"bandit[sarif].\n{(r.stderr or r.stdout)[:400]}"
    )


def suppress(cwd: Path, sarif: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            PY,
            str(SCRIPTS / "sarif_suppress.py"),
            "--sarif",
            str(sarif),
            "src",
            "scripts",
        ],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )


def results(sarif: Path) -> list[dict[str, Any]]:
    doc = json.loads(sarif.read_text(encoding="utf-8"))
    return list(doc["runs"][0]["results"])


def workspace(tmp_path: Path) -> Path:
    import shutil

    w = tmp_path / "w"
    w.mkdir()
    for d in ("scripts", "src"):
        shutil.copytree(REPO / d, w / d)
    return w


def test_verified_findings_are_marked_and_none_are_deleted(tmp_path: Path) -> None:
    w = workspace(tmp_path)
    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    before = len(results(sarif))
    assert before > 0, "bandit produced no findings; this test proves nothing"

    assert suppress(w, sarif).returncode == 0
    after = results(sarif)
    assert len(after) < before, "the gate verifies findings but none were withheld"
    # What is omitted must be stated in the file itself, not silently dropped.
    doc = json.loads(sarif.read_text(encoding="utf-8"))
    props = doc["runs"][0]["properties"]
    assert props["gateVerifiedRemovedCount"] == before - len(after)
    assert props["gateVerifiedBy"] == "scripts/security_gate.py"
    assert props["gateVerifiedRemoved"], "the omitted findings must be listed"


def test_a_failing_gate_marks_nothing(tmp_path: Path) -> None:
    """A red gate publishes everything — that is when a human needs it most."""
    w = workspace(tmp_path)
    target = w / "scripts" / "axle_health.py"
    text = target.read_text(encoding="utf-8")
    # Drop the kwarg alone, not the kwarg plus its closing paren. The paren
    # sits on its own line whenever the call is wrapped, which made the old
    # match silently inapplicable; the guard below is what caught it.
    broken = text.replace(", timeout=timeout", "", 1)
    assert broken != text, "could not break the safe pattern"
    target.write_text(broken, encoding="utf-8")

    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    before = len(results(sarif))
    result = suppress(w, sarif)
    assert result.returncode == 0
    assert "suppressing nothing" in result.stdout
    assert len(results(sarif)) == before, "a red gate must publish every finding"


def test_an_unverified_finding_is_never_marked(tmp_path: Path) -> None:
    """Add a genuinely unsafe call; it must stay visible."""
    w = workspace(tmp_path)
    (w / "scripts" / "danger.py").write_text(
        "import subprocess\n"
        "def go(cmd: str) -> None:\n"
        "    subprocess.run(cmd, shell=True)\n",
        encoding="utf-8",
    )
    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    suppress(w, sarif)
    assert any("danger.py" in json.dumps(r) for r in results(sarif)), (
        "a shell=True call was hidden from code scanning"
    )


def test_a_multiline_call_is_marked_despite_the_two_line_numbers(
    tmp_path: Path,
) -> None:
    """The two bandit emitters disagree on which line a multi-line call is on.

    `bandit -f json` reports `line_number` as the line the call node is
    attributed to; `bandit -f sarif` reports `region.startLine` as the FIRST
    line of the statement. `sarif_suppress` reads the first and matches against
    the second, so an exact single-line match silently failed on every call
    written across more than one line -- publishing findings the gate had
    already PROVED safe, which is the exact disagreement this module removes.

    It stayed invisible because single-line calls match by coincidence. This
    pins the multi-line case directly: a call the gate verifies must be
    withheld no matter how it is formatted.
    """
    w = workspace(tmp_path)
    target = w / "scripts" / "ci_metrics.py"
    source = target.read_text(encoding="utf-8")
    assert "subprocess.run(\n" in source, (
        "this test is only meaningful while the call spans several lines"
    )

    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    raw = [r for r in results(sarif) if "ci_metrics.py" in json.dumps(r)]
    assert raw, "bandit reported nothing for ci_metrics.py; test proves nothing"

    assert suppress(w, sarif).returncode == 0
    left = [r for r in results(sarif) if "ci_metrics.py" in json.dumps(r)]
    assert not left, (
        "a gate-verified multi-line subprocess call was published anyway: "
        f"{[r.get('ruleId') for r in left]}"
    )
