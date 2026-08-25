#!/usr/bin/env python3
"""BUNDLE BUILDER — one authoritative verification bundle per source SHA.

WHAT THIS IS, AND WHAT IT IS NOT. The output is a VERIFICATION BUNDLE: a snapshot of one
exact commit's tracked source beside the evidence produced by verifying it. It is not a
deployable artifact, not a container image, not a release binary, and not a promotion
candidate. This repository has no deployable artifact -- no Dockerfile, no `[build-system]`
in pyproject.toml, no npm entry point -- and inventing one to make a milestone look
finished would be the exact kind of fiction the rest of this repository exists to remove.

WHY `git archive` IS NOT THE WHOLE BUILDER. `git archive` emits TRACKED files only, which
is precisely what makes it the right source-snapshot mechanism: the exclusions this bundle
needs -- .git, .venv, __pycache__, node_modules, .evidence, credentials, machine-local
files -- come from those paths being untracked or ignored, not from a filter someone has
to keep correct. But verification evidence is GENERATED during the run and is therefore
untracked, so it cannot appear inside a tar that `git archive` produced. The bundle is
assembled here, in two layers:

    sandbox-verification-bundle-<SOURCE_SHA>.tar   the authoritative outer bundle
      source.tar             git archive of SOURCE_SHA, byte-for-byte
      evidence/...           deep-verification evidence from this run
      entries.manifest.json  SHA-256 of source.tar and of every evidence entry

DETERMINISM IS A PROPERTY OF THE ASSEMBLY, NOT A HOPE. Python's tarfile records whatever
the filesystem reports -- owner, group, mode, mtime -- and two machines disagree about all
four. Every entry is therefore normalised: lexical order, uid and gid 0, empty uname and
gname, fixed modes, and mtime taken from the SOURCE COMMIT rather than from the clock.
Uncompressed, because gzip embeds a timestamp of its own and a "deterministic" archive
whose header carries the current time is not one.

The acceptance test is not that the code looks deterministic. It is that two builds from
identical inputs produce byte-identical SHA-256, and tests/test_deep_verify.py runs it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

#: Fixed permission bits. The mode the checkout happens to have is a property of the
#: machine that cloned it, not of the commit, so recording it would make the bundle
#: depend on whoever built it.
FILE_MODE = 0o644
DIR_MODE = 0o755


class CannotBuild(Exception):
    """The bundle cannot be built from proven inputs. Refuse rather than emit a guess."""


def _git(*args: str, binary: bool = False) -> subprocess.CompletedProcess[Any]:
    """Run git without a shell. argv is fixed commands plus a validated SHA."""
    exe = shutil.which("git")
    if exe is None:
        raise CannotBuild("git is not on PATH")
    # No `# nosec`. scripts/security_gate.py clears B603 for this file by re-deriving
    # the safe pattern from this AST every run; suppressing the finding here would
    # delete it before that check runs.
    return subprocess.run(
        [exe, *args],
        cwd=str(REPO_ROOT),
        capture_output=not binary,
        stdout=subprocess.PIPE if binary else None,
        text=not binary,
        timeout=300,
        stdin=subprocess.DEVNULL,
        shell=False,
        check=False,
    )


def validate_sha(sha: str) -> str:
    """A SHA that does not name a commit in this repository is refused, not assumed.

    The branch tip is never substituted for a SHA that could not be resolved: a bundle
    built from a different commit than the one it claims is worse than no bundle.
    """
    if not (len(sha) == 40 and all(c in "0123456789abcdef" for c in sha.lower())):
        raise CannotBuild(f"{sha!r} is not a 40-character hexadecimal commit SHA")
    if _git("cat-file", "-e", f"{sha}^{{commit}}").returncode != 0:
        raise CannotBuild(
            f"{sha} does not name a commit in this repository. Refusing to substitute "
            "the branch tip: a bundle built from a commit other than the one it names "
            "is a false claim about which code was verified."
        )
    return sha.lower()


def commit_timestamp(sha: str) -> int:
    """The commit's own author time. Used as every entry's mtime.

    Taken from the commit rather than the clock so that rebuilding the same SOURCE_SHA
    tomorrow produces the same bytes. A build time in the archive would make the digest
    a function of when someone ran it.
    """
    out = _git("show", "-s", "--format=%ct", sha)
    if out.returncode != 0 or not str(out.stdout).strip().isdigit():
        raise CannotBuild(f"could not read the commit timestamp for {sha}")
    return int(str(out.stdout).strip())


def write_source_tar(sha: str, destination: Path) -> None:
    """`git archive` of the exact SHA. Tracked files only, by construction."""
    out = _git("archive", "--format=tar", sha, binary=True)
    if out.returncode != 0 or not out.stdout:
        raise CannotBuild(f"git archive produced nothing for {sha}")
    destination.write_bytes(bytes(out.stdout))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_entries(staging: Path) -> list[Path]:
    """Every file to be bundled, in lexical order.

    Sorted on the POSIX-style relative path rather than on whatever order the filesystem
    returns, because directory iteration order is not stable across machines and an
    archive whose member order varies is not byte-identical even when its contents are.
    """
    return sorted(
        (p for p in staging.rglob("*") if p.is_file()),
        key=lambda p: p.relative_to(staging).as_posix(),
    )


def assemble(staging: Path, out_tar: Path, mtime: int) -> None:
    """The deterministic outer tar. Every varying field is overwritten, not inherited."""
    with tarfile.open(out_tar, "w", format=tarfile.GNU_FORMAT) as archive:
        for path in collect_entries(staging):
            info = archive.gettarinfo(str(path), arcname=path.relative_to(staging).as_posix())
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            info.mtime = mtime
            info.mode = DIR_MODE if info.isdir() else FILE_MODE
            with path.open("rb") as handle:
                archive.addfile(info, handle)


def build(sha: str, evidence_dir: Path | None, out_dir: Path) -> dict[str, Any]:
    sha = validate_sha(sha)
    mtime = commit_timestamp(sha)
    out_dir.mkdir(parents=True, exist_ok=True)

    staging = out_dir / "staging"
    if staging.exists():
        shutil.rmtree(staging)
    (staging / "evidence").mkdir(parents=True)

    write_source_tar(sha, staging / "source.tar")

    copied: list[str] = []
    if evidence_dir is not None and evidence_dir.is_dir():
        for item in sorted(evidence_dir.iterdir()):
            if item.is_file():
                shutil.copy2(item, staging / "evidence" / item.name)
                copied.append(item.name)

    # entries.manifest.json is written BEFORE the outer tar and is itself an entry, so it
    # can hash source.tar and the evidence but not the archive that will contain it. The
    # outer digest is recorded in bundle.manifest.json, outside the archive, because no
    # file can carry the hash of the container it lives in.
    entries = {
        path.relative_to(staging).as_posix(): sha256_file(path)
        for path in collect_entries(staging)
    }
    (staging / "entries.manifest.json").write_text(
        json.dumps(
            {
                "source_sha": sha,
                "source_commit_timestamp": mtime,
                "entries_sha256": entries,
                "evidence_files": copied,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    bundle_name = f"sandbox-verification-bundle-{sha}.tar"
    out_tar = out_dir / bundle_name
    assemble(staging, out_tar, mtime)
    digest = sha256_file(out_tar)

    manifest = {
        "artifact_type": "verification bundle",
        "not_a_deployable_artifact": True,
        "bundle_name": bundle_name,
        "bundle_sha256": digest,
        "bundle_bytes": out_tar.stat().st_size,
        "source_sha": sha,
        "source_commit_timestamp": mtime,
        "entries_sha256": {
            path.relative_to(staging).as_posix(): sha256_file(path)
            for path in collect_entries(staging)
        },
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "builder": "scripts/build_bundle.py",
    }
    (out_dir / "bundle.manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    shutil.rmtree(staging)
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source-sha", required=True, help="exact 40-hex commit SHA")
    ap.add_argument("--evidence-dir", type=Path, default=None)
    ap.add_argument("--out-dir", type=Path, required=True)
    ns = ap.parse_args()

    try:
        manifest = build(
            str(ns.source_sha),
            ns.evidence_dir if ns.evidence_dir is None else Path(str(ns.evidence_dir)),
            Path(str(ns.out_dir)),
        )
    except CannotBuild as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        return 2

    print("[BUNDLE]")
    print("ARTIFACT_TYPE      verification bundle (NOT deployable)")
    print(f"BUNDLE_NAME        {manifest['bundle_name']}")
    print(f"BUNDLE_SHA256      {manifest['bundle_sha256']}")
    print(f"BUNDLE_BYTES       {manifest['bundle_bytes']}")
    print(f"SOURCE_SHA         {manifest['source_sha']}")
    print(f"ENTRIES            {len(manifest['entries_sha256'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
