#!/usr/bin/env python3
"""Generate knowledge/README.md from what is ACTUALLY checked out.

WHY THIS IS GENERATED AND NOT HAND-WRITTEN
------------------------------------------
The manifest records, for every source in the corpus: the upstream repository,
the exact pinned revision, the source URL, and the licence. A hand-maintained
table states those four things once and then silently stops being true the
first time anybody runs `git submodule update --remote`.

This script reads the revision from `git submodule status`, so the document and
the checkout cannot disagree. If they ever do, the script is wrong and that is
a bug worth fixing -- a stale manifest is worse than no manifest, because it
looks authoritative.

Licence is read from the checked-out LICENSE file where one exists. A source
with no licence file is recorded as UNLICENSED rather than left blank: "no
licence found" and "nobody looked" are different claims, and only one of them
is honest.

Usage:
    python3 scripts/knowledge_manifest.py            # write knowledge/README.md
    python3 scripts/knowledge_manifest.py --check    # exit 1 if out of date
"""

from __future__ import annotations

import argparse
import configparser
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GITMODULES = REPO / ".gitmodules"
OUT = REPO / "knowledge" / "README.md"

LICENCE_FILES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "LICENCE")

# Matched against the first 2000 characters of the licence file. Ordered:
# the first hit wins, so put the more specific patterns first.
LICENCE_PATTERNS = (
    ("CC0-1.0", r"CC0 1\.0|Creative Commons Zero"),
    ("CC-BY-SA-4.0", r"Attribution-ShareAlike 4\.0"),
    ("CC-BY-4.0", r"Attribution 4\.0 International"),
    ("Apache-2.0", r"Apache License,?\s+Version 2\.0"),
    ("GPL-3.0", r"GNU GENERAL PUBLIC LICENSE\s+Version 3"),
    ("AGPL-3.0", r"GNU AFFERO GENERAL PUBLIC LICENSE"),
    ("BSD-3-Clause", r"Redistributions of source code.*3\.|BSD 3-Clause"),
    ("MIT", r"MIT License|Permission is hereby granted, free of charge"),
)


# Resolved once, by the process, never by PATH at call time. security_gate.py
# re-derives this from the AST on every run: argv[0] must come from
# shutil.which (or sys.executable), argv must be a list literal, shell must be
# False, and a timeout must be present. A bare "git" is rejected because PATH
# then decides what executes. This is a verified exception, not a suppression --
# if any of the four stops holding, the gate fails again.
GIT = shutil.which("git")


def git_submodule_status() -> str:
    """`git submodule status`, the only subprocess this script runs."""
    if GIT is None:
        raise RuntimeError("git is not on PATH; cannot read submodule revisions")
    return subprocess.run(
        [GIT, "submodule", "status"],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    ).stdout


def submodule_paths_and_urls() -> dict[str, str]:
    """Read declared submodules from .gitmodules.

    Declared, not discovered. A directory under knowledge/ that is not a
    declared submodule is not part of the corpus -- it is something somebody
    left there, and the manifest should not legitimise it by listing it.
    """
    if not GITMODULES.exists():
        return {}
    cp = configparser.ConfigParser()
    cp.read_string(GITMODULES.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for section in cp.sections():
        path = cp[section].get("path")
        url = cp[section].get("url")
        if path and url:
            out[path] = url
    return out


def pinned_revisions() -> dict[str, tuple[str, bool]]:
    """path -> (sha, initialised). A leading '-' means never initialised."""
    revs: dict[str, tuple[str, bool]] = {}
    for line in git_submodule_status().splitlines():
        if not line.strip():
            continue
        initialised = not line.startswith("-")
        parts = line.strip().lstrip("-+U").split()
        if len(parts) >= 2:
            revs[parts[1]] = (parts[0], initialised)
    return revs


def detect_licence(path: Path) -> str:
    for name in LICENCE_FILES:
        f = path / name
        if not f.is_file():
            continue
        try:
            head = f.read_text(encoding="utf-8", errors="replace")[:2000]
        except OSError as exc:
            return f"UNREADABLE ({exc.__class__.__name__})"
        for spdx, pattern in LICENCE_PATTERNS:
            if re.search(pattern, head, re.IGNORECASE | re.DOTALL):
                return spdx
        return "SEE LICENSE FILE"
    return "UNLICENSED"


def build() -> str:
    urls = submodule_paths_and_urls()
    revs = pinned_revisions()

    rows: list[tuple[str, str, str, str]] = []
    uninitialised: list[str] = []
    for path in sorted(urls):
        url = urls[path]
        sha, initialised = revs.get(path, ("(not recorded)", False))
        if not initialised:
            uninitialised.append(path)
        name = path.removeprefix("knowledge/")
        licence = detect_licence(REPO / path) if initialised else "(not fetched)"
        rows.append((name, url, sha[:12], licence))

    lines = [
        "# Knowledge corpus",
        "",
        "Curated third-party sources, pinned as Git submodules.",
        "",
        "**This file is generated. Do not edit it by hand.**",
        "Regenerate with `python3 scripts/knowledge_manifest.py`; the revisions",
        "below are read from `git submodule status`, so they cannot drift away",
        "from what is actually checked out.",
        "",
        "## Rules",
        "",
        "- **Nothing in here is ours.** Each directory is a third-party",
        "  repository under its own licence, listed below. We did not write it",
        "  and we do not claim it.",
        "- **Do not modify anything under `knowledge/`.** These are pinned",
        "  upstream checkouts. A local edit would be silently lost on the next",
        "  submodule update, and would misrepresent the upstream source.",
        "- **Background knowledge only.** For anything time-sensitive -- a",
        "  framework API, a library version, an SDK signature, a cloud product,",
        "  a service's free tier -- these sources supply history and context.",
        "  Current official documentation supplies the truth. See",
        "  `.claude/skills/knowledge-research/SKILL.md`.",
        "- **Curated lists are candidates, not facts.** An entry in",
        "  `public-apis`, `free-for-dev`, `awesome`, `awesome-ios`, or",
        "  `awesome-selfhosted` may name a service that changed or disappeared",
        "  after that list was last edited. Verify before relying on it.",
        "",
        "## Two kinds of knowledge live here",
        "",
        "**Ours, written by us — check these FIRST:**",
        "",
        "| Folder | Holds |",
        "|---|---|",
        "| `architecture/` | how the system works: components, data flow, boundaries |",
        "| `decisions/` | past decisions and why they were made |",
        "| `patterns/` | code patterns and conventions to follow here |",
        "| `api/` | API docs, schemas, endpoints |",
        "| `references/` | external docs, links, specs, with the date checked |",
        "",
        "**Third-party, pinned — background only.** Everything in the table",
        "below. See the precedence order in `CLAUDE.md`: our own knowledge and",
        "current official documentation both outrank the corpus.",
        "",
        "## Fetching",
        "",
        "```bash",
        "git submodule update --init --recursive",
        "```",
        "",
        f"## Sources ({len(rows)})",
        "",
        "| Source | Upstream | Pinned revision | Licence |",
        "|---|---|---|---|",
    ]
    for name, url, sha, licence in rows:
        lines.append(f"| `{name}` | {url} | `{sha}` | {licence} |")

    if uninitialised:
        lines += [
            "",
            "## Not yet fetched",
            "",
            "These are declared and pinned, but not checked out in this working",
            "tree. Run the fetch command above.",
            "",
        ]
        lines += [f"- `{p}`" for p in uninitialised]

    lines += [
        "",
        "## Licence note",
        "",
        "`UNLICENSED` means no licence file was found in the checkout, not that",
        "the work is public domain. Treat those sources as read-only reference",
        "and do not copy from them. `SEE LICENSE FILE` means a licence exists",
        "but did not match a known pattern -- read it before relying on it.",
        "",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if the manifest on disk is out of date",
    )
    args = ap.parse_args()

    content = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != content:
            print("knowledge/README.md is out of date.")
            print("Regenerate: python3 scripts/knowledge_manifest.py")
            return 1
        print("knowledge/README.md is up to date.")
        return 0

    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
