#!/usr/bin/env python3
"""DEPENDENCY LOCK CONSISTENCY — the manifest and the lock must agree.

WHY THIS EXISTS.

`requirements.txt` is INTENT and its own header says so: nothing installs from
it. Every workflow runs `pip install --require-hashes -r requirements.lock`,
and the lock is regenerated from the manifest BY HAND.

Two files, one generated from the other, no check that the generation ever
happened. Add a dependency to the manifest, forget the lock, and CI installs a
set that does not contain it -- while the manifest, which is what a human
reads, says it is a direct requirement. Every gate that does not import the
missing package passes, and the pull request is green.

Dependabot makes that reachable rather than hypothetical. Its `pip` ecosystem
discovers `*requirements*.txt`-shaped files and does NOT read
`requirements.lock`; `.github/dependabot.yml` records this in its own KNOWN
LIMIT section. The tool most likely to edit the manifest is the one that cannot
update the lock beside it.

WHAT IS CHECKED

  1. Every direct requirement named in a manifest appears in its lock.
  2. Every pinned entry in a lock carries at least one sha256 hash.

(2) is not decoration. `--require-hashes` is the property that turns the lock
from a list of names into a trusted set: an entry pinned by version alone still
installs whatever the index serves under that version today.

WHAT IS DELIBERATELY NOT CHECKED

Whether a `>=` floor in the manifest is SATISFIED by the version in the lock.
Every floor in this repository is `>=`, so every future release satisfies it
and the check would pass vacuously for exactly the case it was added to catch.
An unchecked property stated out loud is worth more than a green tick that
means nothing -- the same reasoning `ci/assumptions.yml` applies to the limits
it records rather than hides.

Also not checked: that the lock contains ONLY what the manifest implies. A lock
is the full transitive closure, so it legitimately contains packages no
manifest names, and comparing in that direction would fail on every correct
lock this repository has ever had.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# manifest -> lock. Both relative to --root. A pair whose manifest is absent is
# skipped; a pair whose LOCK is absent is a finding, because a manifest with no
# lock is the state this gate exists to refuse.
PAIRS: tuple[tuple[str, str], ...] = (
    ("requirements.txt", "requirements.lock"),
    ("learning-os/requirements-learning-os.txt",
     "learning-os/requirements-learning-os.lock"),
)

# Locks with no manifest of their own. Only rule (2) applies to these.
HASH_ONLY: tuple[str, ...] = ("requirements-preflight.lock",)

_REQUIREMENT = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~]|$)")
_PINNED = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*==")


def normalise(name: str) -> str:
    """PEP 503 normalisation.

    `Foo_Bar`, `foo-bar` and `foo.bar` are the same distribution to pip, so a
    comparison that treats them as different would report a false finding on a
    lock that is perfectly correct.
    """
    return re.sub(r"[-_.]+", "-", name).lower()


def manifest_names(text: str) -> set[str]:
    """Direct requirement names, ignoring comments, blanks and pip flags."""
    out: set[str] = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        match = _REQUIREMENT.match(line)
        if match:
            out.add(normalise(match.group(1)))
    return out


def lock_entries(text: str) -> dict[str, bool]:
    """{normalised name: carries at least one sha256 hash}.

    A pip-compile lock writes `name==version \\` then indented `--hash=` lines,
    so the hash belongs to the most recent pinned name rather than to the line
    it sits on. Tracking the current entry is what makes rule (2) checkable at
    all -- counting hashes file-wide would pass a lock where one entry had ten
    and another had none.
    """
    entries: dict[str, bool] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        pinned = _PINNED.match(line)
        if pinned:
            current = normalise(pinned.group(1))
            entries.setdefault(current, False)
        if "--hash=sha256:" in line and current is not None:
            entries[current] = True
    return entries


def check(root: Path) -> list[str]:
    """Every problem found, as printable lines. Empty means consistent."""
    problems: list[str] = []

    for manifest_rel, lock_rel in PAIRS:
        manifest_path = root / manifest_rel
        lock_path = root / lock_rel
        if not manifest_path.is_file():
            continue
        if not lock_path.is_file():
            problems.append(
                f"{manifest_rel} exists but {lock_rel} does not; CI installs "
                f"the lock, so every requirement here would be absent"
            )
            continue

        wanted = manifest_names(manifest_path.read_text(encoding="utf-8"))
        entries = lock_entries(lock_path.read_text(encoding="utf-8"))
        for name in sorted(wanted - set(entries)):
            problems.append(
                f"{name}: named in {manifest_rel} but absent from {lock_rel}. "
                f"CI installs the lock, so it would not be installed at all. "
                f"Regenerate the lock (see its header) and commit both."
            )
        problems.extend(_unhashed(entries, lock_rel))

    for lock_rel in HASH_ONLY:
        lock_path = root / lock_rel
        if lock_path.is_file():
            problems.extend(
                _unhashed(lock_entries(lock_path.read_text(encoding="utf-8")), lock_rel)
            )

    return problems


def _unhashed(entries: dict[str, bool], lock_rel: str) -> list[str]:
    return [
        f"{name}: pinned in {lock_rel} with no sha256 hash. "
        f"`pip install --require-hashes` would reject this file, and a version "
        f"pin without a digest installs whatever the index serves."
        for name, hashed in sorted(entries.items())
        if not hashed
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    args = parser.parse_args(argv)

    problems = check(args.root)
    if problems:
        print(f"lock-consistency: FAIL — {len(problems)} problem(s)")
        for line in problems:
            print(f"  {line}")
        return 1
    print("lock-consistency: PASS — every manifest agrees with its lock, "
          "and every pinned entry carries a hash")
    return 0


if __name__ == "__main__":
    sys.exit(main())
