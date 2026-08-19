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
    r = subprocess.run([PY, "-m", "bandit", "-r", "src", "scripts", "-f", "sarif",
                        "-o", str(out), "--severity-level", "low",
                        "--confidence-level", "low"],
                       cwd=cwd, capture_output=True, text=True, timeout=300)
    assert out.is_file(), (
        f"bandit produced no SARIF (exit {r.returncode}). Install "
        f"bandit[sarif].\n{(r.stderr or r.stdout)[:400]}")


def suppress(cwd: Path, sarif: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([PY, str(SCRIPTS / "sarif_suppress.py"),
                           "--sarif", str(sarif), "src", "scripts"],
                          cwd=cwd, capture_output=True, text=True, timeout=300)


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
    broken = text.replace(", timeout=timeout)", ")", 1)
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
        "    subprocess.run(cmd, shell=True)\n", encoding="utf-8")
    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    suppress(w, sarif)
    assert any("danger.py" in json.dumps(r) for r in results(sarif)), (
        "a shell=True call was hidden from code scanning")
