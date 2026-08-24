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


# ---------------------------------------------------------------------------
# A DECLARED CHECK THAT SKIPS ITSELF
#
# Found by sweeping every `is_file()` guard in scripts/ for the shape "declared
# input absent -> skip" rather than "declared input absent -> finding".
#
# `PAIRS` named `learning-os/requirements-learning-os.txt`. That file has never
# existed -- learning-os declares its dependencies in `pyproject.toml`. So the
# pair was skipped on every run since it was written, and this gate printed
# "every manifest agrees with its lock" while never once comparing that lock to
# anything.
#
# The lock is 469 lines and installs the whole learning-os CI job.
# ---------------------------------------------------------------------------

PYPROJECT = """\
[project]
name = "demo"
dependencies = ["pydantic>=2.9"]

[project.optional-dependencies]
dev = ["pytest>=8"]
live = ["anthropic>=0.40"]
"""

PYPROJECT_LOCK = (
    "pydantic==2.13.4 \\\n    --hash=sha256:cccc\n"
    "pytest==9.1.1 \\\n    --hash=sha256:dddd\n"
)


def _pyproject_tree(tmp: Path, pyproject: str, lock: str) -> Path:
    """A tree shaped like learning-os: pyproject as the manifest, one lock."""
    root = tmp / "repo"
    # The DECLARED learning-os paths, not invented ones. A fixture at a path
    # PAIRS does not name is a fixture the gate never looks at, which is the
    # same "checked nothing, said PASS" failure this section is about --
    # reproduced once, in the test for it, before it was noticed.
    (root / "learning-os").mkdir(parents=True)
    (root / "learning-os" / "pyproject.toml").write_text(pyproject, encoding="utf-8")
    (root / "learning-os" / "requirements-learning-os.lock").write_text(
        lock, encoding="utf-8"
    )
    return root


def test_a_manifest_that_does_not_exist_beside_a_lock_that_does_is_refused(
    tmp_path: Path,
) -> None:
    """THE DEFECT THIS SECTION WAS WRITTEN FOR.

    A pair where BOTH files are absent means that project is not in this tree,
    and skipping is right -- the fixtures above rely on it. A pair where the
    LOCK exists and the manifest does not is a different thing entirely: the
    manifest was deleted, renamed, or never existed, and the lock is now
    checked by nothing while the gate still reports success.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST, CLEAN_LOCK)
    (root / "requirements.txt").unlink()
    result = run(root)
    assert result.returncode != 0, (
        "a lock whose declared manifest is absent was accepted, so that lock is "
        f"verified by nothing and the gate still says PASS; stdout={result.stdout!r}"
    )
    assert "requirements.txt" in result.stdout, (
        f"the refusal never named the missing manifest: {result.stdout!r}"
    )


def test_a_pair_absent_in_both_halves_is_still_skipped(tmp_path: Path) -> None:
    """THE PAIR for the test above, and the reason it is not over-strict.

    Every fixture in this file builds a tree containing only one project. If an
    absent pair became a finding outright, all of them would fail and the gate
    would be unusable against anything but the whole repository.
    """
    root = _tree(tmp_path, CLEAN_MANIFEST, CLEAN_LOCK)
    result = run(root)
    assert result.returncode == 0, (
        f"a tree that simply does not contain the other projects was refused: "
        f"{result.stdout!r}"
    )


def test_a_pyproject_dependency_missing_from_the_lock_is_refused(
    tmp_path: Path,
) -> None:
    """learning-os declares dependencies in pyproject.toml, not a .txt file.

    Until the pair pointed here, nothing compared them.
    """
    root = _pyproject_tree(tmp_path, PYPROJECT, "pydantic==2.13.4 \\\n    --hash=sha256:cccc\n")
    result = run(root)
    assert result.returncode != 0, (
        f"pytest is declared under [project.optional-dependencies].dev and is "
        f"absent from the lock, and that was accepted: {result.stdout!r}"
    )
    assert "pytest" in result.stdout


def test_a_consistent_pyproject_pair_passes(tmp_path: Path) -> None:
    """THE PAIR. Without it, refusing everything satisfies the test above."""
    root = _pyproject_tree(tmp_path, PYPROJECT, PYPROJECT_LOCK)
    result = run(root)
    assert result.returncode == 0, (
        f"a consistent pyproject/lock pair was refused: {result.stdout!r}"
    )


def test_a_deliberately_absent_extra_appearing_in_the_lock_is_refused(
    tmp_path: Path,
) -> None:
    """THE OFFLINE GUARANTEE, CHECKED RATHER THAN DESCRIBED.

    learning-os keeps `anthropic` and `google-genai` in a `live` extra and OUT
    of the lock CI installs. Its pyproject says why: the job cannot reach a
    provider because the SDK is not present, rather than because every test
    remembered to use the fake.

    That is a structural guarantee held up by an absence, and an absence is
    exactly what nobody notices being removed. Adding the SDK to the lock would
    end the guarantee silently and every test would still pass.
    """
    root = _pyproject_tree(
        tmp_path, PYPROJECT, PYPROJECT_LOCK + "anthropic==0.40.0 \\\n    --hash=sha256:eeee\n"
    )
    result = run(root)
    assert result.returncode != 0, (
        "a package declared in the `live` extra appeared in the lock CI "
        f"installs, and that was accepted: {result.stdout!r}"
    )
    assert "anthropic" in result.stdout


# WHAT THIS SECTION DELIBERATELY DOES NOT CHECK, AND WHY THAT IS NOT LAZINESS.
#
# A HASH_ONLY lock that is ABSENT is the same shape as the defect above, and it
# was proven the same way: a tree with `requirements-preflight.lock` removed
# reported PASS, and the same tree with the file restored and one entry
# unhashed reported FAIL. So this gate alone cannot tell a clean file from no
# file.
#
# It is NOT fixed here, because it is already caught. Hiding
# `requirements-preflight.lock` and running the suite turns
# tests/test_supply_chain.py red -- test_preflight_lock_is_a_strict_subset_of_
# the_main_lock and test_mutmut_stays_out_of_every_requirements_file both fail.
# Adding a second check for a condition an existing test already refuses would
# be duplication, and the rule against that is not decorative: two checks for
# one fact drift, and then one of them is wrong.
#
# The same sweep raised two more of this shape and both were also already
# covered: hiding frontend/playwright.config.ts or
# frontend/scripts/mutation-gate.mjs turns tests/test_ci_integrity.py red.
#
# Recorded here rather than dropped silently, so the next person sweeping for
# this shape does not re-raise it and re-fix it.
