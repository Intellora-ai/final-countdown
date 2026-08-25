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
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

@dataclass(frozen=True, slots=True)
class Pair:
    """One manifest and the lock generated from it.

    `manifest` may be a requirements file or a `pyproject.toml`. learning-os
    uses the latter, and pointing at a `.txt` that never existed is exactly the
    defect this class was introduced to end.
    """

    manifest: str
    lock: str
    #: Optional-dependency groups whose packages MUST appear in the lock.
    #: pyproject manifests only; a requirements file has no groups.
    required_extras: tuple[str, ...] = ()
    #: Groups whose packages must be ABSENT from the lock. An absence is a real
    #: guarantee and the easiest kind to lose without anybody noticing.
    forbidden_extras: tuple[str, ...] = ()


# ABSENCE RULES, AND WHY THEY ARE NOT SYMMETRIC.
#
#   both absent   -> skip. That project is not in this tree at all, which is
#                    the normal case for a fixture and for `--root /tmp/...`.
#   lock absent   -> finding. A manifest with no lock is the state this gate
#                    exists to refuse.
#   manifest absent, lock PRESENT -> finding. NEW, and the reason this file
#                    changed: the entry below used to name
#                    `learning-os/requirements-learning-os.txt`, which has
#                    never existed in this repository. The pair was therefore
#                    skipped on every run since it was written, while the gate
#                    printed "every manifest agrees with its lock". A 469-line
#                    lock that installs an entire CI job was compared to
#                    nothing, and no check anywhere said so.
PAIRS: tuple[Pair, ...] = (
    Pair("requirements.txt", "requirements.lock"),
    # The dependency-audit toolchain, kept out of the main lock on purpose: it
    # pulls 27 packages, 16 of them new, and expanding the hash-pinned trusted
    # computing base by sixteen so one job can run one check is the trade this
    # repository already refused when it removed `mutmut`.
    Pair("requirements-audit.txt", "requirements-audit.lock"),
    # learning-os declares its dependencies in pyproject.toml, not a .txt.
    #
    # `live` is FORBIDDEN from the lock, and that is the point rather than a
    # detail. learning-os/pyproject.toml explains why the provider SDKs are an
    # optional extra: "CI installs requirements-learning-os.lock and nothing
    # else, and this is not in it. That is what makes the offline guarantee
    # structural" -- the job cannot reach a provider because the SDK is not
    # present, rather than because every test remembered to use the fake.
    #
    # A guarantee held up by an absence is the easiest kind to lose silently.
    # Adding `anthropic` to that lock would end it and every test would still
    # pass, so the absence is now asserted.
    Pair(
        "learning-os/pyproject.toml",
        "learning-os/requirements-learning-os.lock",
        required_extras=("dev",),
        forbidden_extras=("live",),
    ),
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


def _child(node: object, key: str) -> object:
    """One step down a TOML table, or None. Narrowing helper for pyright."""
    if isinstance(node, dict):
        return cast("dict[str, Any]", node).get(key)
    return None


def _requirement_names(items: object) -> set[str]:
    """PEP 508 requirement strings -> normalised distribution names."""
    out: set[str] = set()
    if not isinstance(items, list):
        return out
    for item in cast("list[object]", items):
        if not isinstance(item, str):
            continue
        match = _REQUIREMENT.match(item)
        if match:
            out.add(normalise(match.group(1)))
    return out


def pyproject_names(
    text: str, extras: tuple[str, ...], *, include_base: bool = True
) -> set[str]:
    """Names from `[project].dependencies` plus the named optional groups.

    `include_base=False` returns ONLY the named groups. The forbidden-group
    check needs that, and the first version of it did not have it: it asked for
    the `live` group, got the base dependencies folded in, and reported
    `pydantic` -- a required dependency -- as a package the lock must not
    contain. Caught by the test that runs this gate against the real
    repository, which is the one fixture that cannot be shaped to agree.

    learning-os declares its dependencies here rather than in a requirements
    file, so a gate that only knew how to read `name>=1.0` lines could not
    check it at all -- and, pointed at a `.txt` that did not exist, silently
    checked nothing instead of saying so.
    """
    parsed: object = tomllib.loads(text)
    project = _child(parsed, "project")
    names: set[str] = (
        _requirement_names(_child(project, "dependencies")) if include_base else set()
    )
    optional = _child(project, "optional-dependencies")
    for extra in extras:
        names |= _requirement_names(_child(optional, extra))
    return names


def manifest_requirements(path: Path, extras: tuple[str, ...]) -> set[str]:
    """Direct requirement names, whichever manifest format this is."""
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".toml":
        return pyproject_names(text, extras)
    return manifest_names(text)


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

    for pair in PAIRS:
        manifest_path = root / pair.manifest
        lock_path = root / pair.lock
        manifest_here = manifest_path.is_file()
        lock_here = lock_path.is_file()

        if not manifest_here and not lock_here:
            # Neither half is in this tree, so this project is not part of it.
            continue

        if not lock_here:
            problems.append(
                f"{pair.manifest} exists but {pair.lock} does not; CI installs "
                f"the lock, so every requirement here would be absent"
            )
            continue

        if not manifest_here:
            problems.append(
                f"{pair.manifest}: declared as the manifest for {pair.lock}, "
                f"and that lock exists, but this file does not. The pair is "
                f"skipped, so that lock is compared to nothing while this gate "
                f"still reports success. Point the pair at the real manifest, "
                f"or remove the pair."
            )
            continue

        wanted = manifest_requirements(manifest_path, pair.required_extras)
        entries = lock_entries(lock_path.read_text(encoding="utf-8"))
        for name in sorted(wanted - set(entries)):
            problems.append(
                f"{name}: named in {pair.manifest} but absent from {pair.lock}. "
                f"CI installs the lock, so it would not be installed at all. "
                f"Regenerate the lock (see its header) and commit both."
            )

        forbidden: set[str] = set()
        if pair.forbidden_extras and manifest_path.suffix == ".toml":
            forbidden = pyproject_names(
                manifest_path.read_text(encoding="utf-8"),
                pair.forbidden_extras,
                include_base=False,
            )
        for name in sorted(forbidden & set(entries)):
            problems.append(
                f"{name}: declared in an optional group this lock must NOT "
                f"contain, and it is in {pair.lock}. That lock is what CI "
                f"installs, and the group is optional precisely so the job "
                f"cannot reach a live provider. Adding it here ends that "
                f"guarantee without failing a single test."
            )

        problems.extend(_unhashed(entries, pair.lock))

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
