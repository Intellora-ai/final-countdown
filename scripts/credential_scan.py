#!/usr/bin/env python3
"""CREDENTIAL SCAN -- tracked content must carry no credential material.

WHY THIS GATE EXISTS.
`evidence.md` on the public default branch carried a GitHub fine-grained PAT
prefix plus its 22-character token id. The secret half was truncated, so it
could not authenticate, but a credential prefix published on a public branch is
disclosed the moment it is fetched. The working tree is clean now. History is
not, and rewriting history does not un-publish what was already cloned -- only
rotation closes that, and rotation is the owner's action. This gate is the part
that CAN be closed: it makes recurrence impossible rather than unlikely.

WHAT IT SCANS, AND WHY ONLY THAT.
Tracked content, and nothing else. Tracked content is precisely the content a
push publishes, so it is precisely the content whose disclosure this gate can
prevent. An untracked working file cannot be published by a push and is
therefore out of scope -- deliberately, not by oversight. Scanning the whole
filesystem instead would drag in `.venv/` and `reports/`, produce noise nobody
reads, and a scanner nobody reads catches nothing.

WHY THE TRACKED SET COMES FROM `.git/index` AND NOT FROM `git ls-files`.
`git ls-files` reads `.git/index` and prints it; this reads the same file
directly, so the two enumerate the same set by construction --
`tests/test_credential_scan.py` asserts that equality against real `git`
output rather than assuming it.

The reason for going direct is that the alternative costs more than it buys.
Shelling out would mean `import subprocess`, and bandit flags that import
(B404) and the call (B603) at LOW severity. `scripts/security_gate.py` clears
those two findings only for `(test_id, filename)` pairs listed in its
`ELIGIBLE` set, AFTER re-deriving the safe pattern from the AST. The safe
pattern alone is not enough: `scripts/tcb_gate.py` resolves git through
`shutil.which`, passes an argv list literal with a timeout and no shell, and is
still reported UNRESOLVED because its filename is not in that set. A new
subprocess-using script here would fail the mandatory `bandit` gate until
`security_gate.py` were edited too. Reading the index needs no child process,
no PATH resolution, and no security exception, so the gate has no such
coupling. Only index versions 2 and 3 are understood; anything else exits 2
(cannot run) rather than reporting a clean scan it did not perform.

FINDINGS NEVER ECHO THE MATCH.
Every finding carries a pattern label, a file, a line and a length -- never the
matched text. This output goes to a public CI log. A scanner that prints the
secret it found has published it a second time, in a place with worse retention
than the file it just objected to.

HOW SELF-EXCLUSION WORKS, AND WHY THERE IS NO FILE ALLOWLIST.
This file and `scripts/generate_evidence.py` both legitimately contain the
literal prefixes, because that is what a credential scanner is made of.
Excluding those two files wholesale would create the one hole big enough to
matter: a real secret pasted into an excluded file would be invisible to the
gate guarding against exactly that.

So no file is ever excluded. Instead every pattern below matches a prefix PLUS
a credential-shaped payload, so a bare prefix constant is not a match in any
file, and a real credential is a match in EVERY file including this one.
`github_pat_` followed by `[` is the start of a regex; followed by twenty-odd
token characters it is a credential, and this gate fails on it here just as it
would in `evidence.md`. That property is a consequence of the pattern table,
not a special case bolted onto it, and the tests pin it directly.

EXIT CODES.
  0  no credential material in tracked content
  1  findings -- the gate blocks
  2  the scan could not run (no repository, unreadable or unsupported index)
"""

from __future__ import annotations

import re
import struct
import sys
from pathlib import Path
from typing import Final, NamedTuple


class CannotScan(Exception):
    """The scan could not run. Distinct from 'ran and found nothing'."""


class Pattern(NamedTuple):
    """A credential shape: a label for the log, and the shape itself.

    Every regex here is prefix + payload. The payload requirement is what makes
    a bare prefix constant inert while keeping a real credential detectable in
    the same file. Nothing below matches a prefix on its own.
    """

    label: str
    regex: re.Pattern[str]


# The payload floors are set just under the real credential widths, so a
# genuine token cannot slip under them: a GitHub fine-grained PAT carries a
# 22-character token id, a classic token 36 characters, an AWS access key id 16
# uppercase alphanumerics. Each floor is comfortably above anything that
# follows a prefix written as source code, where the next character is a quote
# or a bracket.
_PATTERNS: Final[tuple[Pattern, ...]] = (
    # GitHub fine-grained PAT. The published prefix was this shape.
    Pattern("github-fine-grained-pat",
            re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    # GitHub classic (p), OAuth (o), server-to-server (s), user-to-server (u).
    Pattern("github-token", re.compile(r"gh[posu]_[A-Za-z0-9]{20,}")),
    # AWS access key id.
    Pattern("aws-access-key-id", re.compile(r"AKIA[A-Z0-9]{12,}")),
    # PEM armour: the header only closes with five dashes, so the bare prefix
    # constant does not match while every real private key or certificate does.
    Pattern("pem-block", re.compile(r"-----BEGIN[A-Z ]*-----")),
    # `sk-` is the one prefix that occurs in ordinary English -- "risk-free",
    # "task-based", "disk-bound" all contain it. Guarding on a word boundary
    # and requiring a real key-length payload is what keeps this rule switched
    # on; a scanner that fires on the word "risk-based" is one somebody
    # disables, and a disabled scanner catches nothing.
    Pattern("api-key-sk", re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}")),
)

# Generic catch-all for credential shapes with no known prefix. Deliberately
# narrower than "long random-looking string": the run must mix upper case,
# lower case AND digits. This repository is full of 40-character lowercase git
# SHAs and SHA-pinned action references, and a 64-character lowercase sha256
# hash on every line of requirements.lock. None of them carry upper case, so
# none of them match. Neither do paths (`/` ends the run) nor SCREAMING_CONSTANT
# names (no lower case).
_TOKEN_RUN: Final = re.compile(r"[A-Za-z0-9_\-]{32,}")

_INDEX_SIGNATURE: Final = b"DIRC"
_SUPPORTED_INDEX_VERSIONS: Final = frozenset({2, 3})
# ctime, mtime, dev, ino, mode, uid, gid, size, sha1, flags.
_ENTRY_FIXED_BYTES: Final = 62
_NAME_LEN_MASK: Final = 0x0FFF
_EXTENDED_FLAG: Final = 0x4000
# A NUL in the first few KiB means binary. Cheap, and the same sniff `git
# diff` uses; a scanner that tries to read a PNG as text finds nothing useful
# and risks dying on the attempt.
_BINARY_SNIFF_BYTES: Final = 8192


class Finding(NamedTuple):
    """What is reported. The matched text is deliberately absent."""

    label: str
    path: str
    line: int
    length: int


def _mixed_alphabet(run: str) -> bool:
    return (any(c.isupper() for c in run)
            and any(c.islower() for c in run)
            and any(c.isdigit() for c in run))


def scan_text(text: str, path: str) -> list[Finding]:
    """Return one finding per credential-SHAPED match in `text`.

    Findings carry a label, a location and a length. They never carry the
    matched value: this output reaches a public CI log.
    """
    findings: list[Finding] = []

    def line_of(offset: int) -> int:
        return text.count("\n", 0, offset) + 1

    for pattern in _PATTERNS:
        for m in pattern.regex.finditer(text):
            findings.append(Finding(pattern.label, path, line_of(m.start()),
                                    len(m.group(0))))

    for m in _TOKEN_RUN.finditer(text):
        run = m.group(0)
        if _mixed_alphabet(run):
            findings.append(Finding("high-entropy-token", path,
                                    line_of(m.start()), len(run)))

    return sorted(findings, key=lambda f: (f.line, f.label))


def index_path(root: Path) -> Path:
    """Locate `.git/index`, following the `gitdir:` redirect a worktree uses."""
    dot = root / ".git"
    if dot.is_dir():
        return dot / "index"
    if dot.is_file():
        text = dot.read_text(encoding="utf-8", errors="replace").strip()
        prefix = "gitdir:"
        if not text.startswith(prefix):
            raise CannotScan(f"{dot} is not a gitdir redirect")
        target = Path(text[len(prefix):].strip())
        if not target.is_absolute():
            target = (root / target).resolve()
        return target / "index"
    raise CannotScan(f"no git repository at {root}")


def repo_root(start: Path) -> Path:
    """Nearest enclosing repository root, or raise. Never guesses."""
    for candidate in (start, *start.parents):
        if (candidate / ".git").exists():
            return candidate
    raise CannotScan(f"no git repository at or above {start}")


def tracked_paths(index: Path) -> list[str]:
    """Every path in the git index -- the same set `git ls-files` prints.

    Parsed rather than shelled out to; see the module docstring for why. An
    index this cannot parse raises, because a scan that enumerated nothing must
    not be reported as a scan that found nothing.
    """
    try:
        data = index.read_bytes()
    except OSError as exc:
        raise CannotScan(f"cannot read {index}: {exc}") from exc

    if len(data) < 12 or data[:4] != _INDEX_SIGNATURE:
        raise CannotScan(f"{index} is not a git index (bad signature)")

    version, count = struct.unpack(">II", data[4:12])
    if version not in _SUPPORTED_INDEX_VERSIONS:
        raise CannotScan(
            f"git index version {version} is not supported (this reads "
            f"{sorted(_SUPPORTED_INDEX_VERSIONS)}); rewrite it with "
            "`git update-index --index-version 2`")

    paths: list[str] = []
    pos = 12
    for _ in range(count):
        if pos + _ENTRY_FIXED_BYTES > len(data):
            raise CannotScan(f"{index} is truncated after {len(paths)} entries")
        flags = struct.unpack(">H", data[pos + 60:pos + 62])[0]
        name_start = pos + _ENTRY_FIXED_BYTES
        if flags & _EXTENDED_FLAG:
            name_start += 2
        name_len = flags & _NAME_LEN_MASK
        if name_len == _NAME_LEN_MASK:
            # A path at or beyond 4095 bytes stores no length; it is
            # NUL-terminated instead.
            end = data.find(b"\x00", name_start)
            if end < 0:
                raise CannotScan(f"{index} has an unterminated path entry")
        else:
            end = name_start + name_len
        if end > len(data):
            raise CannotScan(f"{index} is truncated inside a path entry")
        paths.append(data[name_start:end].decode("utf-8", errors="replace"))
        # Entries are NUL-padded to a multiple of 8 bytes, with at least one
        # NUL, so an entry whose length is already a multiple of 8 still gains
        # a full 8 bytes of padding.
        pos += ((end - pos + 8) // 8) * 8

    return paths


def scan_repository(root: Path) -> tuple[list[Finding], int, int]:
    """Scan every tracked file. Returns (findings, scanned, skipped)."""
    findings: list[Finding] = []
    scanned = skipped = 0

    for rel in sorted(tracked_paths(index_path(root))):
        target = root / rel
        try:
            raw = target.read_bytes()
        except OSError:
            # Tracked but absent from the working tree (a sparse checkout, or
            # a deletion staged elsewhere). There is no content to scan.
            skipped += 1
            continue
        if b"\x00" in raw[:_BINARY_SNIFF_BYTES]:
            skipped += 1
            continue
        scanned += 1
        findings.extend(scan_text(raw.decode("utf-8", errors="replace"), rel))

    return findings, scanned, skipped


def main() -> int:
    try:
        root = repo_root(Path.cwd())
        findings, scanned, skipped = scan_repository(root)
    except CannotScan as exc:
        print(f"  CANNOT SCAN -- {exc}", file=sys.stderr)
        print("  A scan that did not run is not a clean scan.", file=sys.stderr)
        return 2

    print(f"  credential scan: {scanned} tracked text file(s) scanned, "
          f"{skipped} binary or absent")

    if not findings:
        print("  PASS -- no credential material in tracked content")
        return 0

    for f in findings:
        # Label, location, length. Never the value: this reaches a public log.
        print(f"  CREDENTIAL SHAPE  {f.label}  {f.path}:{f.line}  "
              f"({f.length} chars, value withheld)")
    print(f"\n  FAIL -- {len(findings)} credential-shaped match(es) in tracked "
          "content")
    print("  Tracked content is what a push publishes. Remove the value and "
          "rotate the credential:", file=sys.stderr)
    print("  a prefix on a public branch is disclosed the moment it is "
          "fetched, and deleting it later does not recall it.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
