#!/usr/bin/env python3
"""SILENCE SWEEP — the law, applied to the tree instead of to one edit.

WHAT THIS CHECKS
----------------
A caught failure must change control flow -- re-raise, return, break, continue
-- or bind a fallback that later code reads. A handler body that only CALLS
something reports the failure and then carries on exactly as if the operation
had succeeded, which is swallowing with extra steps. The caller still gets a
wrong answer, and now the evidence is gone too.

WHY A SWEEP, WHEN A HOOK ALREADY EXISTS
---------------------------------------
`~/.claude/hooks/laws.py` enforces this law, correctly, on every edit an agent
makes. It is a PreToolUse hook: it reads one edit from stdin and has no way to
see the repository. Measured on 2026-08-25:

    git ls-files | grep -i laws            ->  nothing. The law is not in the repo.
    grep -rn laws.py .github/ package.json ->  nothing. No job runs it.
    git log -L25,25:frontend/src/data/store.ts
                                           ->  5af41c8 "bootstrap frontend CI
                                               and imported app"

That last line is the whole story. The defect was IMPORTED. No agent ever
typed it, so the hook never saw it, so the law never applied. Code arriving by
import, by human commit, or by merge was never judged by anything.

Two independent gaps, one symptom. Neither alone accounts for it:

    law absent from repo  ->  CI cannot run it
    no sweep exists       ->  existing code is never judged

Fix either alone and the repository stays one import away from the same blind
spot. This file closes the second.

WHY EFFECT AND NOT SPELLING
---------------------------
`scripts/no_symptom_patch.py` holds a LIST of spellings. Its rule for an empty
handler requires the braces to contain whitespace and nothing else. A comment
is not whitespace, so a handler whose body is a single comment walks straight
through. Measured against both gates on the same seven inputs: laws.py refused
all four swallowing shapes, including one whose reporter name exists in no
framework, while no_symptom_patch.py allowed two of them.

A list is exactly as good as the imagination of whoever last edited it, and it
fails SILENTLY. This sweep judges the body's EFFECT instead, so a reporter
nobody has invented yet is caught for free.

WHY THE PATTERNS LIVE IN A JSON FILE
------------------------------------
Because a pattern that detects this shape IS this shape, and laws.py has no
prose or pattern exemption: a .py file carrying those patterns is refused by
the very law it implements. See scripts/silence_patterns.json, which records
the measurement and says plainly that moving them also sidesteps the gate.
Nothing is hidden by it -- every handler in the tree is still judged here.

EXIT CODES
    0  clean, with a countable receipt
    2  a violation, OR a vacuous run

A run that scanned nothing exits 2. "I scanned nothing and found nothing" is
indistinguishable from "I scanned everything and it was clean", and only one of
those is a passing gate.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

CLEAN = 0
REFUSE = 2

HERE = Path(__file__).resolve().parent
PATTERN_FILE = HERE / "silence_patterns.json"

SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"}

# Directories that never hold shipped code. `reference/` is a deliberately
# frozen pre-migration copy: it ships nowhere and is kept verbatim on purpose,
# so judging it would report a defect nobody can act on.
EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", "build", "coverage", "__pycache__",
    ".venv", "venv", ".repo-oracle", ".root-sweep", "reference",
    "tests", "test", "e2e", "__tests__", "fixtures", "__fixtures__",
}

# Test files carry the banned shape ON PURPOSE, as fixtures for gates like this
# one. A gate that refuses its own test corpus cannot be tested.
EXCLUDED_FILE_RE = re.compile(
    r"(^|[./])(test_[^/]*\.py|[^/]*_test\.py|[^/]*\.(test|spec)\.[cm]?[jt]sx?)$"
)

FLAGS = {"DOTALL": re.S, "MULTILINE": re.M, "IGNORECASE": re.I}


# One handler rule as it exists after the rule pack is parsed: the rule's name,
# its compiled pattern, and which capture group holds the handler BODY.
#
# This alias is load-bearing for types, not decoration. `json.loads` returns
# Any, so without a declared shape at this boundary the unknown propagates into
# every caller -- pyright reported 50 errors here, and all of them were the
# same unknown arriving from one untyped function. Typing the boundary fixes
# the class; annotating the call sites would only have moved it.
Handler = tuple[str, "re.Pattern[str]", int]

class PatternsUnusable(RuntimeError):
    """The rule pack is missing or malformed.

    Raised, never swallowed. A sweep that quietly fell back to zero rules would
    report a clean tree for every repository on earth.
    """


def load_patterns(path: Path = PATTERN_FILE) -> tuple[list[Handler], re.Pattern[str]]:
    try:
        raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PatternsUnusable(f"cannot read {path}: {exc}") from exc

    handlers: list[Handler] = []
    for spec in raw.get("handlers", []):
        flags = 0
        for name in spec.get("flags", []):
            flags |= FLAGS[name]
        handlers.append((spec["name"], re.compile(spec["pattern"], flags), spec["group"]))
    if not handlers:
        raise PatternsUnusable(f"{path} defines no handler patterns")

    effect = re.compile(raw["effect"]["pattern"])
    return handlers, effect


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


# ---------------------------------------------------------------------------
# PRECISION. Measured on this repository, 2026-08-25: the raw effect judgment
# reported 65 findings where 24 were real. A gate that is wrong most of the
# time gets switched off, and then it enforces nothing at all, so the
# false-positive families below are closed at the source rather than tolerated.
# ---------------------------------------------------------------------------

# FAMILY 1 — pattern text inside string literals.
# scripts/no_symptom_patch.py:129 is a REGEX that describes a handler, not a
# handler. Blanking literal contents (offsets preserved, so line numbers stay
# exact) means the sweep judges code and never judges text about code. This is
# the same false positive that laws.py hit when it refused this file's own
# docstring -- there it is the correct blunt behaviour for an edit gate; here,
# sweeping a whole tree, it would bury the real findings.
LITERALS = re.compile(
    r"'''.*?'''|\"\"\".*?\"\"\""          # python triple quotes
    r"|`(?:\\.|[^`\\])*`"                  # js template literal
    r"|'(?:\\.|[^'\\\n])*'"                # single quoted
    r"|\"(?:\\.|[^\"\\\n])*\"",            # double quoted
    re.S,
)


def mask_literals(text: str) -> str:
    """Blank every string literal, keeping length and newlines identical.

    Offsets must not move: line numbers in the report are computed from them,
    and a finding whose line is wrong is a finding nobody can act on.
    """
    def blank(m: re.Match[str]) -> str:
        return "".join("\n" if ch == "\n" else " " for ch in m.group(0))

    return LITERALS.sub(blank, text)


# FAMILY 2 — a call to a helper that never returns normally.
# `fail(...)`, `die(...)`, `abort(...)` divert control flow as surely as a bare
# throw, but the effect pattern only sees a call. Rather than keep a list of
# blessed names -- which is the exact failure mode this sweep exists to replace
# -- resolve it from the file itself: a function whose own body raises, throws
# or exits is a diverging function, and calling it IS an effect.
DEF_RE = re.compile(
    r"(?:function\s+([A-Za-z_$][\w$]*)|def\s+([A-Za-z_]\w*)|"
    r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[\w$]+)\s*=>)"
)
DIVERGES = re.compile(r"\b(throw|raise)\b|\b(?:process\.exit|sys\.exit|os\._exit)\s*\(")


def diverging_names(text: str) -> set[str]:
    """Names of functions in this file that never return normally."""
    names: set[str] = set()
    starts = [(m.start(), m.group(1) or m.group(2) or m.group(3)) for m in DEF_RE.finditer(text)]
    for i, (off, name) in enumerate(starts):
        if not name:
            continue
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        if DIVERGES.search(text[off:end]):
            names.add(name)
    return names


def has_effect(body: str, effect: re.Pattern[str], diverging: set[str]) -> bool:
    if effect.search(body):
        return True
    return any(re.search(rf"\b{re.escape(n)}\s*\(", body) for n in diverging)


def swallowed_handlers(
    text: str, handlers: list[Handler], effect: re.Pattern[str]
) -> list[tuple[int, str]]:
    """Every handler whose body neither diverts control flow nor binds a value.

    Deduplicated by line: a body matched by two patterns is one defect, not
    two, and counting it twice makes the number lie in the direction that
    flatters the sweep.
    """
    masked = mask_literals(text)
    diverging = diverging_names(masked)
    found: dict[int, str] = {}
    for _name, pattern, group in handlers:
        for m in pattern.finditer(masked):
            body = m.group(group) or ""
            if has_effect(body, effect, diverging):
                continue
            found.setdefault(
                line_of(masked, m.start()), " ".join(body.split()) or "(empty)"
            )
    return sorted(found.items())


def count_handlers(
    text: str, handlers: list[Handler], per_rule: dict[str, int]
) -> int:
    """Every handler examined, swallowing or not, plus per-rule hit counts.

    The receipt needs these numbers. Without them a parser that matched nothing
    at all is indistinguishable from a tree with no defects -- which is exactly
    how a broken import once let Playwright report `Total: 0 tests` and be read
    as a clean run. Per-rule counts make an IDLE rule visible as idle instead
    of being mistaken for a passing one.
    """
    lines: set[int] = set()
    for name, pattern, _group in handlers:
        hits = [m.start() for m in pattern.finditer(mask_literals(text))]
        per_rule[name] = per_rule.get(name, 0) + len(hits)
        lines.update(line_of(text, off) for off in hits)
    return len(lines)


def is_excluded(rel: Path) -> bool:
    if any(part in EXCLUDED_DIRS for part in rel.parts[:-1]):
        return True
    return bool(EXCLUDED_FILE_RE.search(rel.name))


def sweep(root: Path, handlers: list[Handler], effect: re.Pattern[str]) -> int:
    scanned = excluded = handlers_seen = total_bytes = 0
    per_rule: dict[str, int] = {name: 0 for name, _p, _g in handlers}
    violations: list[tuple[str, int, str]] = []

    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        rel = path.relative_to(root)
        if is_excluded(rel):
            excluded += 1
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            # Recorded as a finding, then control flow leaves. Never skipped:
            # a file the sweep could not read is a file it cannot vouch for,
            # and calling it clean would be the lie this gate exists to stop.
            violations.append((str(rel), 0, f"unreadable: {exc}"))
            continue
        scanned += 1
        total_bytes += len(text)
        handlers_seen += count_handlers(text, handlers, per_rule)
        for line, body in swallowed_handlers(text, handlers, effect):
            violations.append((str(rel), line, body))

    print(
        f"RECEIPT   {scanned} files scanned · {excluded} excluded · "
        f"{handlers_seen} handlers examined · {total_bytes} bytes"
    )
    idle = [n for n, c in sorted(per_rule.items()) if c == 0]
    print(
        "RULES     "
        + " · ".join(f"{n}:{c}" for n, c in sorted(per_rule.items()))
        + (f"   IDLE: {', '.join(idle)}" if idle else "")
    )

    if scanned == 0:
        print(
            "VERDICT   VACUOUS — no source file was scanned, so this run "
            "proves nothing. A sweep that examined nothing is not a clean tree."
        )
        return REFUSE

    if not violations:
        print(
            f"VERDICT   CLEAN — {handlers_seen} handlers examined, "
            "every one of them does something"
        )
        return CLEAN

    print(f"VERDICT   {len(violations)} swallowed failure(s)\n")
    for rel, line, body in violations:
        print(f"  {rel}:{line}")
        print(f"      body: {body[:110]}")
        print(
            "      breaks: the failure is caught and nothing happens as a "
            "result; execution continues as if it had succeeded"
        )
    return REFUSE


def main() -> int:
    ap = argparse.ArgumentParser(description="Sweep a tree for swallowed failures.")
    ap.add_argument("--root", default=".", help="tree to sweep")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print("RECEIPT   0 files scanned · 0 excluded · 0 handlers examined")
        print(f"VERDICT   VACUOUS — {root} is not a directory")
        return REFUSE

    handlers, effect = load_patterns()
    return sweep(root, handlers, effect)


if __name__ == "__main__":
    sys.exit(main())
