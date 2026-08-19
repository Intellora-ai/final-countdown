"""The credential gate must catch real credentials and ignore the rest.

A scanner is defined as much by what it does NOT fire on. One that reports
every 40-character git SHA in a repository built on git SHAs, or the word
"risk-free", is a scanner somebody switches off within a week -- and a switched
-off scanner catches nothing. So the false-positive cases below carry the same
weight as the detection cases.

WHY EVERY PLANTED VALUE IS ASSEMBLED FROM FRAGMENTS.
This file is tracked, so the gate scans it. Writing a credential shape as a
literal here would plant a real finding in tracked content and the gate would
correctly fail on its own test suite. Each fixture is therefore concatenated at
run time, so the shape exists only in memory. `test_the_real_repository_is_
clean` is what keeps that discipline honest: if a literal ever creeps back into
this file, that test goes red.

The token ids below are synthetic. The one that was actually published is
deliberately not reproduced here -- re-introducing it into tracked content is
the exact thing this gate exists to prevent.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
SCANNER = SCRIPTS / "credential_scan.py"
PY = sys.executable

# Assembled so the shape never appears as a literal in tracked content.
PAT_PREFIX = "github" + "_pat_"
PAT_ID = "A1b2C3d4E5f6G7h8I9j0K1"          # 22 chars, as a real token id is
FINE_GRAINED_PAT = PAT_PREFIX + PAT_ID
CLASSIC_TOKEN = "gh" + "p_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
AWS_KEY_ID = "AKI" + "AIOSFODNN7EXAMPLE"
PEM_HEADER = "-----" + "BEGIN RSA PRIVATE KEY-----"
SK_KEY = "sk" + "-" + "A1b2C3d4E5f6G7h8I9j0"

# Shapes that must NOT fire. Safe to write literally: that is the claim.
GIT_SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09"
ACTION_PIN = ("      - uses: actions/checkout@"
              "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0")
ENGLISH = ("A risk-free, task-based approach to disk-bound work: the whisky-"
           "aged, brisk-paced sort.")


def git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                          text=True, timeout=60)


def repo(tmp_path: Path) -> Path:
    """A real git repository, because the gate reads a real git index."""
    w = tmp_path / "r"
    w.mkdir()
    git("init", "-q", "-b", "main", cwd=w)
    git("config", "user.email", "t@example.com", cwd=w)
    git("config", "user.name", "t", cwd=w)
    (w / "README.md").write_text("start\n", encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "base", cwd=w)
    return w


def commit_file(w: Path, name: str, body: str) -> None:
    target = w / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
    git("add", "-A", cwd=w)
    git("commit", "-qm", f"add {name}", cwd=w)


def run_scan(cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([PY, str(SCANNER)], cwd=cwd, capture_output=True,
                          text=True, timeout=120)


# ---------------------------------------------------------------------------
# The present state of this repository
# ---------------------------------------------------------------------------

def test_the_real_repository_is_clean() -> None:
    """The gate's verdict on the tree it actually guards.

    Also the guard on this test file: every fixture above is concatenated so
    that no credential shape is a literal in tracked content. Write one
    literally and this goes red.
    """
    r = run_scan(REPO)
    assert r.returncode == 0, r.stdout + r.stderr


def test_tracked_set_equals_git_ls_files() -> None:
    """The index parser must enumerate exactly what `git ls-files` prints.

    The scanner reads `.git/index` directly rather than shelling out. That is
    only safe while the two agree, so the equality is asserted against real git
    output instead of assumed.
    """
    sys.path.insert(0, str(SCRIPTS))
    from credential_scan import index_path, tracked_paths

    mine = sorted(tracked_paths(index_path(REPO)))
    out = subprocess.run(["git", "ls-files", "-z"], cwd=REPO,
                         capture_output=True, text=True, timeout=60).stdout
    assert mine == sorted(p for p in out.split("\0") if p)


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

def test_fine_grained_pat_is_caught_and_never_echoed(tmp_path: Path) -> None:
    """The shape that was published. Catching it is half the requirement.

    The other half is that the finding does not reproduce it: this output goes
    to a public CI log, and a scanner that prints the secret has disclosed it a
    second time in a place with worse retention than the file it objected to.
    """
    w = repo(tmp_path)
    commit_file(w, "notes.md", f"the token was {FINE_GRAINED_PAT} at the time\n")
    r = run_scan(w)
    assert r.returncode == 1, r.stdout + r.stderr

    combined = r.stdout + r.stderr
    assert FINE_GRAINED_PAT not in combined, "the scanner echoed the credential"
    assert PAT_ID not in combined, "the scanner echoed the token id"
    assert "github-fine-grained-pat" in combined
    assert "notes.md" in combined


@pytest.mark.parametrize(("label", "planted"), [
    ("github-token", CLASSIC_TOKEN),
    ("aws-access-key-id", AWS_KEY_ID),
    ("pem-block", PEM_HEADER),
    ("api-key-sk", SK_KEY),
])
def test_each_credential_shape_blocks(tmp_path: Path, label: str,
                                      planted: str) -> None:
    w = repo(tmp_path)
    commit_file(w, "leak.txt", f"value: {planted}\n")
    r = run_scan(w)
    assert r.returncode == 1, r.stdout + r.stderr
    assert label in r.stdout
    assert planted not in r.stdout + r.stderr, "the scanner echoed the value"


# ---------------------------------------------------------------------------
# The false positives that would get the gate switched off
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(("name", "body"), [
    ("sha.txt", f"commit {GIT_SHA}\n"),
    ("workflow.yml", f"jobs:\n  a:\n    steps:\n{ACTION_PIN}\n"),
    ("prose.md", f"{ENGLISH}\n"),
    ("lock.txt", "--hash=sha256:" + "abcdef0123456789" * 4 + "\n"),
])
def test_ordinary_content_does_not_trip_the_gate(tmp_path: Path, name: str,
                                                 body: str) -> None:
    """40-char git SHAs, SHA-pinned actions, English, and lockfile hashes.

    This repository is built out of all four. A gate that fires on them is a
    gate that gets disabled, so each one is pinned as a non-finding.
    """
    w = repo(tmp_path)
    commit_file(w, name, body)
    r = run_scan(w)
    assert r.returncode == 0, r.stdout + r.stderr


def test_a_bare_pattern_constant_is_not_a_finding(tmp_path: Path) -> None:
    """A prefix with no payload is source code, not a credential."""
    w = repo(tmp_path)
    commit_file(w, "patterns.py",
                "PREFIXES = (\n"
                f'    "{PAT_PREFIX}",   # GitHub fine-grained PAT\n'
                '    "gh" "p_",       # classic\n'
                ")\n")
    r = run_scan(w)
    assert r.returncode == 0, r.stdout + r.stderr


# ---------------------------------------------------------------------------
# Self-exclusion is payload-aware, not file-wide
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("script", ["credential_scan.py", "generate_evidence.py"])
def test_the_pattern_bearing_scripts_are_inert_unmodified(tmp_path: Path,
                                                          script: str) -> None:
    """Both files carry the literal prefixes, and neither is a finding.

    Not because either is excluded -- no file is -- but because a prefix with
    no credential-shaped payload does not match anywhere.
    """
    w = repo(tmp_path)
    commit_file(w, f"scripts/{script}",
                (SCRIPTS / script).read_text(encoding="utf-8"))
    r = run_scan(w)
    assert r.returncode == 0, r.stdout + r.stderr


def test_a_real_secret_inside_the_scanner_itself_still_fails(
        tmp_path: Path) -> None:
    """The hole a wholesale self-exclusion would have opened.

    If `credential_scan.py` were excluded by filename, a credential pasted into
    it would be invisible to the gate guarding against exactly that. Exclusion
    is by payload shape, so the same file that legitimately holds the pattern
    constants still fails on a real credential.
    """
    w = repo(tmp_path)
    source = SCANNER.read_text(encoding="utf-8")
    commit_file(w, "scripts/credential_scan.py",
                f'{source}\n_LEAKED = "{FINE_GRAINED_PAT}"\n')
    r = run_scan(w)
    assert r.returncode == 1, r.stdout + r.stderr
    assert "scripts/credential_scan.py" in r.stdout
    assert FINE_GRAINED_PAT not in r.stdout + r.stderr


# ---------------------------------------------------------------------------
# Scope and robustness
# ---------------------------------------------------------------------------

def test_untracked_files_are_out_of_scope(tmp_path: Path) -> None:
    """Only tracked content can be published, so only tracked content is scanned.

    A push publishes the tracked set. An untracked working file -- a scratch
    `.env`, a local dump -- is not in it and cannot be disclosed by pushing,
    so it is deliberately outside this gate's remit rather than missed by it.
    Widening the scan to the whole filesystem would pull in `.venv/` and
    `reports/` and bury real findings in noise.
    """
    w = repo(tmp_path)
    (w / "secret.env").write_text(f"TOKEN={FINE_GRAINED_PAT}\n", encoding="utf-8")
    r = run_scan(w)
    assert r.returncode == 0, r.stdout + r.stderr

    # ... and the moment it becomes publishable, it is in scope.
    git("add", "-A", cwd=w)
    git("commit", "-qm", "oops", cwd=w)
    assert run_scan(w).returncode == 1


def test_binary_files_are_skipped_without_crashing(tmp_path: Path) -> None:
    w = repo(tmp_path)
    (w / "blob.bin").write_bytes(
        b"\x89PNG\r\n\x1a\n\x00\x00" + FINE_GRAINED_PAT.encode() + b"\x00\xff")
    git("add", "-A", cwd=w)
    git("commit", "-qm", "binary", cwd=w)
    r = run_scan(w)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "1 binary or absent" in r.stdout


def test_outside_a_repository_it_reports_it_cannot_run(tmp_path: Path) -> None:
    """Exit 2, not 0. A scan that did not run is not a clean scan."""
    bare = tmp_path / "not_a_repo"
    bare.mkdir()
    r = run_scan(bare)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "CANNOT SCAN" in r.stderr


def test_an_unreadable_index_is_not_a_clean_scan(tmp_path: Path) -> None:
    w = repo(tmp_path)
    (w / ".git" / "index").write_bytes(b"NOTANINDEX" + b"\x00" * 32)
    r = run_scan(w)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "CANNOT SCAN" in r.stderr
