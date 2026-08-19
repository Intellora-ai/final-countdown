"""The trusted computing base cannot be changed by accident.

CODEOWNERS names the trusted paths but enforces nothing here: enforcement
needs `require_code_owner_review`, and GitHub forbids approving your own pull
request, so on a one-person repository that setting is a deadlock rather than
a protection. scripts/tcb_gate.py takes the third option — a required check
the owner CAN satisfy, but only deliberately and only on the record.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

from tcb_gate import TRUSTED_PREFIXES  # noqa: E402


def git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                          text=True, timeout=60)


def repo(tmp_path: Path) -> Path:
    w = tmp_path / "r"
    w.mkdir()
    git("init", "-q", "-b", "main", cwd=w)
    git("config", "user.email", "t@example.com", cwd=w)
    git("config", "user.name", "t", cwd=w)
    (w / "scripts").mkdir()
    (w / "README.md").write_text("start\n", encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "base", cwd=w)
    (w / "scripts" / "tcb_gate.py").write_text(
        (SCRIPTS / "tcb_gate.py").read_text(encoding="utf-8"), encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "add gate", cwd=w)
    git("branch", "-f", "base-ref", cwd=w)
    return w


def run_gate(w: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([PY, "scripts/tcb_gate.py", "--base", "base-ref"],
                          cwd=w, capture_output=True, text=True, timeout=60)


def test_untrusted_change_needs_no_acknowledgement(tmp_path: Path) -> None:
    w = repo(tmp_path)
    (w / "README.md").write_text("edited\n", encoding="utf-8")
    git("commit", "-aqm", "docs tweak", cwd=w)
    r = run_gate(w)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "nothing to acknowledge" in r.stdout


def test_trusted_change_without_acknowledgement_fails(tmp_path: Path) -> None:
    """The accidental case: a trusted file edited in passing."""
    w = repo(tmp_path)
    (w / "scripts" / "gate.py").write_text("x = 1\n", encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "unrelated refactor", cwd=w)
    r = run_gate(w)
    assert r.returncode == 1, r.stdout
    assert "no commit says why" in r.stderr
    assert "scripts/gate.py" in r.stdout


def test_trusted_change_with_acknowledgement_passes(tmp_path: Path) -> None:
    w = repo(tmp_path)
    (w / "scripts" / "gate.py").write_text("x = 1\n", encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "widen a gate\n\nTCB: gate.py gains a result type; "
        "aggregate_gates must learn it too", cwd=w)
    r = run_gate(w)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "acknowledged in 1 commit" in r.stdout


def test_acknowledgement_must_carry_a_reason(tmp_path: Path) -> None:
    """`TCB:` alone is a checkbox. The point is the sentence."""
    w = repo(tmp_path)
    (w / "ci").mkdir()
    (w / "ci" / "gates.toml").write_text("x = 1\n", encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "change\n\nTCB:", cwd=w)
    assert run_gate(w).returncode == 1


@pytest.mark.parametrize("path", [
    ".github/workflows/verify.yml", "scripts/gate.py", "ci/gates.toml",
    "specs/x_spec.lean", "proofs/x_proof.lean", "semantics/specs/x.lean",
    "requirements.txt", "requirements.lock",
])
def test_every_trusted_path_is_detected(tmp_path: Path, path: str) -> None:
    w = repo(tmp_path)
    f = w / path
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text("x\n", encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "touch", cwd=w)
    assert run_gate(w).returncode == 1, f"{path} is not guarded"


def test_a_missing_base_is_not_permission_to_proceed(tmp_path: Path) -> None:
    """A shallow clone must not read as 'nothing changed'."""
    w = repo(tmp_path)
    r = subprocess.run([PY, "scripts/tcb_gate.py", "--base", "no/such/ref"],
                       cwd=w, capture_output=True, text=True, timeout=60)
    assert r.returncode == 2
    assert "CANNOT COMPARE" in r.stderr


def test_codeowners_covers_exactly_the_enforced_paths() -> None:
    """Two lists that must agree are two lists that drift."""
    text = (REPO / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
    owned = {ln.split()[0].strip("/") for ln in text.splitlines()
             if ln.strip() and not ln.lstrip().startswith("#")}
    owned.discard("*")
    owned.discard(".github/CODEOWNERS")
    enforced = {p.strip("/") for p in TRUSTED_PREFIXES}
    missing = enforced - owned
    assert not missing, (
        f"tcb_gate enforces paths CODEOWNERS does not name: {sorted(missing)}")
