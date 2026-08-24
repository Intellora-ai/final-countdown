"""A MANIFEST THAT MOVED WITHOUT ITS LOCK IS A CHANGE THAT DID NOT HAPPEN.

WHY THIS EXISTS.

`requirements.txt` is INTENT. Its own header says so: nothing installs from it.
Every workflow runs `pip install --require-hashes -r requirements.lock`, and
the lock is generated from the manifest by hand.

So the two can disagree, and when they do the disagreement is invisible in the
direction that matters. Add a dependency to `requirements.txt`, forget to
regenerate the lock, and:

  * the manifest says the dependency is a direct requirement
  * the lock does not contain it
  * CI installs the lock, so the dependency is absent
  * every gate that does not import it passes
  * the pull request is green

Dependabot makes this reachable rather than hypothetical. Its `pip` ecosystem
discovers `*requirements*.txt`-shaped files and does NOT read `requirements.lock`
-- `.github/dependabot.yml` says exactly that in its own KNOWN LIMIT section.
So the tool most likely to edit the manifest is the one that cannot update the
lock beside it.

WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT.

Checked:
  * every direct requirement named in `requirements.txt` appears in
    `requirements.lock`
  * every pinned entry in a lock carries at least one sha256 hash, because
    `--require-hashes` is the property that makes the lock a trusted set rather
    than a list of names

NOT checked: whether a `>=` floor in the manifest is SATISFIED by the version
pinned in the lock. Every floor here is `>=`, so every future release satisfies
it and the check would pass vacuously for the case it is meant to catch. Saying
that out loud is better than a green tick that means nothing -- and it is the
same reasoning `ci/assumptions.yml` applies to the limits it records rather
than hides.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts" / "lock_consistency.py"
PY = sys.executable


def run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PY, str(SCRIPT), "--root", str(root)],
        capture_output=True,
        text=True,
        timeout=120,
    )


def _tree(tmp: Path, manifest: str, lock: str) -> Path:
    """A minimal repo shaped like this one: one manifest, one lock."""
    root = tmp / "repo"
    root.mkdir()
    (root / "requirements.txt").write_text(manifest, encoding="utf-8")
    (root / "requirements.lock").write_text(lock, encoding="utf-8")
    return root


CLEAN_MANIFEST = "# a comment\npytest>=8.0\nhypothesis>=6.100\n"
CLEAN_LOCK = (
    "pytest==8.3.4 \\\n    --hash=sha256:aaaa\n"
    "hypothesis==6.165.10 \\\n    --hash=sha256:bbbb\n"
)


def test_a_manifest_entry_missing_from_the_lock_is_refused(tmp_path: Path) -> None:
    """THE ACTUAL BUG. Manifest gains a dependency, lock does not.

    CI installs the lock, so the dependency is simply absent, and every gate
    that does not import it stays green. Nothing else in this repository
    compares these two files.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST + "requests>=2.32\n", CLEAN_LOCK)
    result = run(root)
    assert result.returncode != 0, (
        "a requirement present in the manifest and absent from the lock was "
        f"accepted; stdout={result.stdout!r}"
    )
    assert "requests" in result.stdout, (
        f"the offending package is not named in the output: {result.stdout!r}"
    )


def test_a_lock_entry_without_a_hash_is_refused(tmp_path: Path) -> None:
    """`--require-hashes` is what makes the lock a trusted set.

    An entry pinned by version but not by digest still installs whatever the
    index serves under that version. Pinning without hashing is a weaker
    guarantee wearing the same syntax.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST, CLEAN_LOCK + "requests==2.32.3\n")
    result = run(root)
    assert result.returncode != 0, (
        f"a lock entry with no sha256 was accepted; stdout={result.stdout!r}"
    )
    assert "requests" in result.stdout


def test_a_consistent_pair_passes(tmp_path: Path) -> None:
    """THE PAIR. Without this, `return 1` satisfies both tests above.

    A gate that refuses everything is not a gate; it is an outage that has not
    been noticed yet.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST, CLEAN_LOCK)
    result = run(root)
    assert result.returncode == 0, (
        f"a consistent manifest/lock pair was refused: {result.stdout!r}"
    )


def test_this_repository_is_consistent() -> None:
    """The real tree. If this fails, the finding is in the repository, not here."""
    result = run(REPO)
    assert result.returncode == 0, result.stdout
