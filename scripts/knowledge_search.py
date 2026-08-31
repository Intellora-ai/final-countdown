#!/usr/bin/env python3
"""Search the pinned knowledge corpus and return a small, ranked answer.

WHY THIS EXISTS, AND WHY IT IS NOT AN INDEX.

MEASURED 2026-08-29, on the corpus as it stands after the openstax install:

    total                11.6 GB
    searchable text      610.4 MB across 52,450 files
      .cnxml             371.7 MB   9,883 files   (openstax, 55 books)
      .md                122.9 MB  32,399 files
      .js                 71.2 MB   2,271 files
    PDFs                 213.9 MB      251 files

THE INDEX TRIGGER THIS FILE WROTE HAS NOW FIRED. The original rule was:

    build an index only when searchable text exceeds 200MB, OR a routed query
    p95 exceeds 2s.

Searchable text is 610.4MB. That is 3x the threshold. The routed condition has
fired too, but only for one source -- MEASURED, five runs each:

    --only system-design-primer   0.07s  (0.09s cold)
    --only openstax              11.59s

openstax alone is ~10GB and 9,883 .cnxml files, so "routed" no longer implies
"small". Both conditions are now MET, and the no-index decision is therefore
NOT covered by the reasoning that produced it:

    condition 1 (searchable text > 200MB)   MET  -- 610.4MB
    condition 2 (routed p95 > 2s)           MET  -- 11.59s into openstax

This is recorded rather than quietly carried forward. Building the index is out
of scope for the change that added this file, and it is not a decision to take
silently inside a search tool: it needs an owner, a staleness story and a
measurement of which queries actually matter. What is true today is that every
routed query EXCEPT openstax answers in under a tenth of a second, and that
`--all` is slow enough to avoid -- a three-term unscoped query measured 48.6s
wall, almost all of it the single unavoidable pass over the corpus. Route the
query, and expect openstax to cost seconds.

TWO MEASURED CORPUS BUGS THIS TOOL EXISTS TO SURVIVE.

  * `grep` without `-I` returns `knowledge/papers-we-love/nautilus.db`, a 1MB
    binary, as a "result" for `distributed cache`. MEASURED 2026-08-29 at
    615MB, same query, same corpus, one flag apart:

        grep -rl  -E -i "distributed|cache" knowledge   114.67s, 1 binary hit
        grep -rIl -E -i "distributed|cache" knowledge    21.96s, 0 binary hits
  * `knowledge/TheAlgorithms/Python/strings/words.txt` is an English
    dictionary. It scored a perfect 3/3 on `distributed cache invalidation`.
    It matches every single-word query in the language.

EXIT CODES. The distinction is the point of the tool:

  0  at least one result
  1  ran correctly, ZERO matches
  2  usage error (bad query, unknown source, no scope, too many sources)
  3  corpus/environment fault (nothing was searched)
  4  timed out with zero results
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
KNOWLEDGE = REPO / "knowledge"
MANIFEST = KNOWLEDGE / "README.md"

OUR_DIRS = ("architecture", "decisions", "patterns", "api", "references")

# `cnxml` is here because openstax ships its 55 books as CNXML, not markdown.
# Leaving it out did not make openstax rank badly -- it made 371.7MB across
# 9,883 files return ZERO, SILENTLY. That is the same defect the exit codes
# exist to prevent (nothing searched, reported as "no matches"), one layer up
# in the whitelist instead of in the submodule check. `.rst` is here for the
# same reason: what-happens-when/README.rst is the whole of that source.
DEFAULT_EXT = "md,rst,txt,cnxml,py,js,ts,tsx,java,c,cpp,rs,go,sql,yml,yaml,json,sh"

STOPWORDS = frozenset("a an the of for to in on and or is are how what".split())

# Suppressed unless the query itself carries non-ASCII. MEASURED: `cache
# invalidation` returned README-ja.md and README-zh-TW.md as two of its three
# top hits, because a translation is a full copy of the document.
TRANSLATION_LANGS = (
    "zh-Hans",
    "zh-TW",
    "ja",
    "es",
    "fr",
    "pt-BR",
    "ko",
    "ru",
    "tr",
    "it",
    "de",
)
TRANSLATION_RE = re.compile(
    r"-(" + "|".join(re.escape(x) for x in TRANSLATION_LANGS) + r")\.(md|rst|txt)$"
)

# MEASURED: words.txt scored 3/3 on distributed+cache+invalidation. It is an
# English dictionary -- it matches every single-word query in the language, so
# every hit it produces is noise. Same for the trie dictionaries, the sqlite
# blob, and machine-generated lock/minified files.
NOISE_SUFFIXES = (
    "/strings/words.txt",
    "/strings/dictionary.txt",
    "/data_structures/trie/dictionary.txt",
    "/games/words.txt",
    "/project_euler/problem_042/words.txt",
    "/papers-we-love/nautilus.db",
    ".min.js",
    "-lock.json",
    "-lock.yaml",
    "package-lock.json",
    "pnpm-lock.yaml",
)

SCORE_TERM_BODY = 40
SCORE_TERM_PATH = 25
SCORE_ALL_ON_ONE_LINE = 15
SCORE_TERM_HEADING = 10
SCORE_EXTRA_OCCURRENCE = 5
SCORE_EXTRA_OCCURRENCE_CAP = 25
DEMOTE_TRANSLATION = -60
DEMOTE_NOISE = -1000

STDOUT_CEILING = 64 * 1024
GREP_MAX_COUNT = 20
# Files handed to one grep invocation. Keeps the argv well under ARG_MAX while
# still amortising process startup over thousands of candidates.
GREP_BATCH = 2000
PDF_FANOUT = 8

HEADING_RE = re.compile(r"^#{1,6}\s")


def fold_for(case: bool) -> Callable[[str], str]:
    """Case folding as a named function, not a lambda: strict type checking
    cannot infer a lambda's parameter type, and an unknown type here silently
    spreads to every comparison the ranking depends on."""
    if case:
        return lambda s: s
    return lambda s: s.lower()


class Usage(Exception):
    """Exit 2 -- the caller asked for something that cannot be run."""


class Fault(Exception):
    """Exit 3 -- nothing was searched. NOT a zero-result answer."""


@dataclass
class Hit:
    path: str  # repo-relative, always; these get pasted into Read calls
    source: str
    kind: str  # text | filename | pdf
    score: int = 0
    line: int = 0
    heading: str = ""
    excerpt: list[str] = field(default_factory=list[str])
    demoted: bool = False


# ---------------------------------------------------------------- manifest


def read_sources(manifest: Path) -> list[str]:
    """Parse the source names out of the generated `## Sources` table.

    The names are NOT hardcoded here on purpose: `scripts/knowledge_manifest.py`
    generates that table, and two lists of the same thing drift.
    """
    try:
        text = manifest.read_text(encoding="utf-8")
    except OSError as exc:
        raise Fault(f"cannot read {manifest}: {exc}") from exc
    body = text.split("## Sources", 1)
    if len(body) != 2:
        raise Fault(
            f"{manifest} has no '## Sources' table; regenerate it with "
            "scripts/knowledge_manifest.py"
        )
    names: list[str] = []
    for line in body[1].splitlines():
        if not line.startswith("|"):
            if names:
                break
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2 or not cells[0].startswith("`"):
            continue
        names.append(cells[0].strip("`"))
    if not names:
        raise Fault(f"{manifest} '## Sources' table is empty or unparseable")
    return names


def resolve_scope(only: str, sources: list[str], root: Path) -> list[tuple[str, Path]]:
    """Turn `--only` into (label, directory) pairs, or refuse."""
    requested = [x.strip() for x in only.split(",") if x.strip()]
    if not requested:
        raise Usage("--only was given no source names")
    if len(requested) > 5:
        raise Usage(
            "--only takes at most 5 sources; selecting 5 means the routing "
            "step was done badly"
        )
    groups = sorted({s.split("/")[0] for s in sources if "/" in s})
    GROUPS.update(groups)
    valid = set(sources) | set(groups) | set(OUR_DIRS) | {"ours"}
    scope: list[tuple[str, Path]] = []
    for name in requested:
        if name not in valid:
            raise Usage(f"unknown source: {name}")
        if name == "ours":
            scope.extend((d, root / d) for d in OUR_DIRS)
        elif name in groups:
            scope.extend((s, root / s) for s in sources if s.startswith(name + "/"))
        else:
            scope.append((name, root / name))
    seen: set[Path] = set()
    unique = [(lbl, p) for lbl, p in scope if not (p in seen or seen.add(p))]
    for label, path in unique:
        if not path.is_dir():
            raise Fault(
                f"{label}: {path} does not exist. Nothing was searched. "
                "This is NOT a zero-result answer."
            )
        if not any(path.iterdir()):
            raise Fault(
                f"{label}: {path} is empty -- submodule not initialised. Run "
                "`git submodule update --init --recursive`. Nothing was "
                "searched. This is NOT a zero-result answer."
            )
    return unique


# ---------------------------------------------------------------- terms


def parse_terms(words: list[str]) -> list[str]:
    raw = [w.lower() for chunk in words for w in chunk.split() if w.strip()]
    if not raw:
        raise Usage("empty query")
    terms = [w for w in raw if w not in STOPWORDS]
    if not terms:
        raise Usage(
            "query is all stopwords: " + " ".join(raw) + " -- a stopword-only "
            "query cannot select anything"
        )
    out: list[str] = []
    for t in terms:
        if t not in out:
            out.append(t)
    return out


# ---------------------------------------------------------------- grep


def grep_options(term: str, exts: list[str], case: bool, names_only: bool) -> list[str]:
    """Options for one grep pass.

    `--max-count=20` is a per-file backstop, and it counts LINES matching the
    pattern. MEASURED: with a single alternation over the whole query, `cache
    invalidation` against system-design-primer returned NOTHING -- README.md
    hits the 20-line cap on `cache` long before line 1311, where
    `invalidation` lives, so the tool concluded the file lacked the second
    term. Each term therefore gets its own pass and its own 20-line budget.
    """
    argv = ["-r", "-I", "-E"]
    argv.append("-l" if names_only else "-n")
    if not names_only:
        argv.append(f"--max-count={GREP_MAX_COUNT}")
    if not case:
        argv.append("-i")
    for ext in exts:
        argv.append(f"--include=*.{ext}")
    argv += ["-e", term, "--"]
    return argv


def run_grep(
    engine: str,
    term: str,
    targets: list[str],
    exts: list[str],
    case: bool,
    timeout: float,
    names_only: bool = False,
) -> tuple[str, bool]:
    """Run grep without a shell.

    The argv is a list literal here rather than a variable so that
    `scripts/security_gate.py` can VERIFY the shape instead of taking its
    safety on trust: argv[0] comes from `shutil.which`, nothing is joined into
    a string, and a timeout is always set. The pattern reaches grep after `-e`
    and the targets after `--`, so no caller string can be read as an option.
    """
    exe = shutil.which(engine)
    if exe is None:
        raise Fault(f"{engine} not found on PATH")
    try:
        proc = subprocess.run(
            [exe, *grep_options(term, exts, case, names_only), *targets],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            shell=False,
        )
    except subprocess.TimeoutExpired as exp:
        partial = exp.stdout or ""
        if isinstance(partial, bytes):
            partial = partial.decode("utf-8", "replace")
        return str(partial), True
    if proc.returncode not in (0, 1):
        raise Fault(f"grep failed: {proc.stderr.strip()[:400]}")
    return proc.stdout, False


def collect_matches(
    engine: str,
    terms: list[str],
    dirs: list[Path],
    exts: list[str],
    case: bool,
    started: float,
    budget: float,
) -> tuple[str, bool]:
    """Read the corpus ONCE, then look at candidates only.

    A per-term pass over every directory is correct but pays the full read
    cost per term, and the corpus is 11.6GB. So:

      pass 1  `grep -l` over the whole scope with ONE alternation -- grep can
              stop at a file's first match, and the output is one line per
              file rather than one per hit.
      pass 2+ `grep -n --max-count=20` per term, over that candidate FILE LIST.

    This loses nothing. A file that carries a term only in its PATH still
    reaches the candidate set through whichever term IS in its text, and a
    file with none of the terms anywhere cannot be an answer to an all-terms
    query. Single-term queries skip pass 1 entirely -- there is nothing to
    narrow.
    """

    def left() -> float:
        return max(budget - (time.monotonic() - started), 0.1)

    if len(terms) == 1:
        return run_grep(
            engine, re.escape(terms[0]), [str(d) for d in dirs], exts, case, left()
        )

    alternation = "|".join(re.escape(t) for t in terms)
    listing, timed_out = run_grep(
        engine,
        alternation,
        [str(d) for d in dirs],
        exts,
        case,
        left(),
        names_only=True,
    )
    candidates = [ln for ln in listing.splitlines() if ln]
    if not candidates:
        return "", timed_out
    chunks: list[str] = []
    for term in terms:
        for i in range(0, len(candidates), GREP_BATCH):
            batch = candidates[i : i + GREP_BATCH]
            out, term_timed_out = run_grep(
                engine, re.escape(term), batch, [], case, left()
            )
            timed_out = timed_out or term_timed_out
            chunks.append(out)
    return "".join(chunks), timed_out


# ---------------------------------------------------------------- scoring


def path_tokens(path: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", path.lower()) if t}


def slug_tokens(stem: str) -> set[str]:
    """Split a filename stem on slug boundaries, NOT raw substring.

    MEASURED: `find -iname '*raft*'` matches `airc-RAFT-contro.pdf`, which has
    nothing to do with Raft."""
    return {t for t in re.split(r"[-_\s.]+", stem.lower()) if t}


def is_noise(rel: str) -> bool:
    return any(rel.endswith(sfx) for sfx in NOISE_SUFFIXES)


# Group names (`TheAlgorithms`, `openstax`, ...) are the first segment of a
# two-segment source name in the manifest. Populated once from the manifest so
# that a result inside openstax is labelled with its BOOK and not with the
# 10GB umbrella it happens to live under. Hardcoding them would drift the
# moment a new grouped corpus is added.
GROUPS: set[str] = set()


def source_of(rel: str) -> str:
    parts = rel.split("/")
    if len(parts) >= 3 and parts[1] in GROUPS:
        return parts[1] + "/" + parts[2]
    return parts[1] if len(parts) > 1 else rel


@dataclass
class FileMatches:
    rel: str
    lines: list[tuple[int, str]] = field(default_factory=list[tuple[int, str]])
    # Per-term passes can report the same line twice; counting it twice would
    # inflate the occurrence bonus.
    seen: set[tuple[int, str]] = field(default_factory=set[tuple[int, str]])


def score_file(fm: FileMatches, terms: list[str], case: bool, demote: bool) -> Hit:
    hit = Hit(path=fm.rel, source=source_of(fm.rel), kind="text")
    fold = fold_for(case)
    ptoks = path_tokens(fm.rel)
    score = 0
    body_terms: set[str] = set()
    heading_terms: set[str] = set()
    occurrences = 0
    best: tuple[int, int, str] | None = None
    all_on_one_line = False
    for lineno, text in fm.lines:
        folded = fold(text)
        present = [t for t in terms if fold(t) in folded]
        body_terms.update(present)
        occurrences += sum(folded.count(fold(t)) for t in terms)
        if HEADING_RE.match(text):
            heading_terms.update(present)
        if len(present) == len(terms):
            all_on_one_line = True
        rank = (len(present), -lineno, text)
        if best is None or rank[:2] > best[:2]:
            best = rank
    score += SCORE_TERM_BODY * len(body_terms)
    score += SCORE_TERM_PATH * len([t for t in terms if t in ptoks])
    if all_on_one_line:
        score += SCORE_ALL_ON_ONE_LINE
    score += SCORE_TERM_HEADING * len(heading_terms)
    extra = max(0, occurrences - 1) * SCORE_EXTRA_OCCURRENCE
    score += min(extra, SCORE_EXTRA_OCCURRENCE_CAP)
    if is_noise(fm.rel):
        score += DEMOTE_NOISE
    if demote and TRANSLATION_RE.search(fm.rel):
        score += DEMOTE_TRANSLATION
        hit.demoted = True
    if best is not None:
        hit.line = -best[1]
    hit.score = score
    return hit


def matched_terms(fm: FileMatches, terms: list[str], case: bool) -> set[str]:
    fold = fold_for(case)
    ptoks = path_tokens(fm.rel)
    found = {t for t in terms if t in ptoks}
    for _, text in fm.lines:
        folded = fold(text)
        found.update(t for t in terms if fold(t) in folded)
    return found


def fill_excerpt(
    hit: Hit,
    fm: FileMatches,
    terms: list[str],
    case: bool,
    max_lines: int,
    max_chars: int,
) -> None:
    fold = fold_for(case)
    ranked = sorted(
        fm.lines,
        key=lambda lt: (-len([t for t in terms if fold(t) in fold(lt[1])]), lt[0]),
    )
    chosen = sorted(ranked[:max_lines], key=lambda lt: lt[0])
    hit.excerpt = [lt[1].strip()[:max_chars] for lt in chosen]
    if ranked:
        # `line` is the BEST line (most query terms), not the first one shown.
        # Excerpts stay in document order because that is how they read; the
        # line number is what gets pasted into a Read call, so it has to point
        # at the strongest evidence.
        hit.line = ranked[0][0]
        hit.heading = nearest_heading(REPO / hit.path, ranked[0][0])


def nearest_heading(path: Path, lineno: int) -> str:
    if path.suffix.lower() not in (".md", ".markdown", ".rst"):
        return ""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            found = ""
            for i, text in enumerate(fh, start=1):
                if i >= lineno:
                    break
                if HEADING_RE.match(text):
                    found = text.strip()
            return found
    except OSError:
        return ""


# ---------------------------------------------------------------- pdf


def find_pdfs(dirs: list[Path]) -> list[Path]:
    out: list[Path] = []
    for d in dirs:
        out.extend(sorted(d.rglob("*.pdf")))
    return out


def pdf_filename_hits(
    pdfs: list[Path], terms: list[str], require_all: bool
) -> list[Hit]:
    hits: list[Hit] = []
    for p in pdfs:
        toks = slug_tokens(p.stem)
        found = [t for t in terms if t in toks]
        if (require_all and len(found) < len(terms)) or not found:
            continue
        rel = p.relative_to(REPO).as_posix()
        hits.append(
            Hit(
                path=rel,
                source=source_of(rel),
                kind="filename",
                score=SCORE_TERM_PATH * len(found) + SCORE_ALL_ON_ONE_LINE,
                excerpt=[f"(filename match: {p.name})"],
            )
        )
    return hits


def extract_pdf(path: Path, timeout: float) -> str:
    """Resolve `pdftotext` here, in the scope that runs it, so the argv shape
    stays verifiable by scripts/security_gate.py. NEVER feed PDF bytes to
    grep."""
    exe = shutil.which("pdftotext")
    if exe is None:
        return ""
    try:
        proc = subprocess.run(
            [exe, "-q", "-enc", "UTF-8", str(path), "-"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            shell=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return ""
    return proc.stdout


def pdf_text_hits(
    pdfs: list[Path],
    terms: list[str],
    case: bool,
    require_all: bool,
    max_lines: int,
    max_chars: int,
    timeout: float,
) -> tuple[list[Hit], bool]:
    if shutil.which("pdftotext") is None:
        return [], False
    fold = fold_for(case)

    def one(path: Path) -> Hit | None:
        text = extract_pdf(path, timeout)
        if not text:
            return None
        rel = path.relative_to(REPO).as_posix()
        fm = FileMatches(rel=rel)
        for i, line in enumerate(text.splitlines(), start=1):
            if any(fold(t) in fold(line) for t in terms):
                fm.lines.append((i, line))
            if len(fm.lines) >= GREP_MAX_COUNT:
                break
        found = matched_terms(fm, terms, case)
        if not found or (require_all and len(found) < len(terms)):
            return None
        hit = score_file(fm, terms, case, demote=False)
        hit.kind = "pdf"
        fill_excerpt(hit, fm, terms, case, max_lines, max_chars)
        hit.heading = ""
        return hit

    with ThreadPoolExecutor(max_workers=PDF_FANOUT) as pool:
        results = [h for h in pool.map(one, pdfs) if h is not None]
    return results, True


# ---------------------------------------------------------------- counting


def count_by_type(dirs: list[Path], exts: list[str]) -> dict[str, int]:
    """Only called when there are zero results: '0 results' has to be a claim
    with evidence behind it, not a shrug."""
    wanted = {"." + e for e in exts} if exts else None
    counts: dict[str, int] = {}
    for d in dirs:
        for _root, _dirs, files in os.walk(d):
            for name in files:
                ext = Path(name).suffix.lower()
                if ext == ".pdf" or wanted is None or ext in wanted:
                    counts[ext or "(none)"] = counts.get(ext or "(none)", 0) + 1
    return counts


# ---------------------------------------------------------------- output


def render(
    hits: list[Hit],
    terms: list[str],
    scope_label: str,
    engine: str,
    elapsed_ms: int,
    suppressed: int,
    counts: dict[str, int] | None,
    list_only: bool,
) -> str:
    if list_only:
        return "".join(h.path + "\n" for h in hits)
    out: list[str] = []
    out.append("knowledge_search  query: " + " ".join(terms))
    out.append(
        f"scope: {scope_label}  engine: {engine}  results: {len(hits)}  "
        f"elapsed: {elapsed_ms}ms"
    )
    out.append("")
    for n, h in enumerate(hits, start=1):
        out.append(f"[{n}] {h.source}  score {h.score}  ({h.kind})")
        out.append(f"    {h.path}:{h.line}" if h.line else f"    {h.path}")
        if h.heading:
            out.append(f"    heading: {h.heading}")
        # Excerpts are corpus text, which is untrusted data. The "> " prefix
        # keeps it from impersonating the tool's own framing.
        for line in h.excerpt:
            out.append("    > " + line)
        out.append("")
    if suppressed:
        out.append(
            f"note: {suppressed} translated copy/copies suppressed "
            "(pass --no-demote to include them)"
        )
    if counts is not None:
        total = sum(counts.values())
        detail = ", ".join(
            f"{ext} {n}" for ext, n in sorted(counts.items(), key=lambda kv: -kv[1])[:8]
        )
        out.append(f"0 results. Searched {total} files in {scope_label}: {detail}")
    return "\n".join(out) + "\n"


def emit(text: str) -> None:
    data = text.encode("utf-8")
    if len(data) > STDOUT_CEILING:
        clipped = data[: STDOUT_CEILING - 1].decode("utf-8", "ignore")
        sys.stdout.write(clipped)
        if not clipped.endswith("\n"):
            sys.stdout.write("\n")
        print(
            f"note: output truncated at {STDOUT_CEILING} bytes "
            f"({len(data)} bytes formatted); narrow the query with --only or "
            "lower --max",
            file=sys.stderr,
        )
    else:
        sys.stdout.write(text)


# ---------------------------------------------------------------- main


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="knowledge_search.py",
        description="Search knowledge/ and return a small ranked answer.",
    )
    p.add_argument("query", nargs="*")
    p.add_argument("--only", default="", help="comma-separated source names, max 5")
    p.add_argument("--all", action="store_true", help="search the whole corpus")
    p.add_argument("--max", type=int, default=8)
    p.add_argument("--chars", type=int, default=240)
    p.add_argument("--lines", type=int, default=2)
    p.add_argument("--ext", default=DEFAULT_EXT, help="'any' disables filtering")
    p.add_argument("--pdf", action="store_true", help="extract PDF text with pdftotext")
    p.add_argument("--files", action="store_true", help="match filenames only")
    p.add_argument("--case", action="store_true", help="case-sensitive")
    p.add_argument("--any", action="store_true", help="any term, not all")
    p.add_argument("--json", action="store_true")
    p.add_argument("--list", action="store_true", help="paths only")
    # 300s, not the 20s originally specified. MEASURED 2026-08-29: the corpus
    # went from 414MB at design time to 11.6GB, and reading it once is the
    # floor for `--all` -- no amount of tuning removes it. A 20s default made
    # the tool answer `--all` with exit 4 (timeout) on queries whose correct
    # answer is "no matches", which is the one confusion this tool exists to
    # prevent. The timeout is a backstop against a hung child, not a latency
    # budget; the latency budget is `--only`, measured at 0.07s.
    p.add_argument("--timeout", type=float, default=300.0)
    p.add_argument("--engine", choices=("auto", "rg", "grep"), default="auto")
    p.add_argument("--no-demote", action="store_true")
    return p


def choose_engine(requested: str) -> str:
    if requested == "rg":
        if shutil.which("rg") is None:
            # Never fall back silently: a different engine has different
            # defaults (.gitignore, binary handling) and would answer a
            # different question under the same command line.
            raise Fault("ripgrep not found on PATH")
        return "rg"
    if shutil.which("grep") is None:
        raise Fault("grep not found on PATH")
    return "grep"


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    started = time.monotonic()
    try:
        terms = parse_terms(args.query)
        if not args.all and not args.only:
            raise Usage(
                "no scope: pass --only SOURCE[,SOURCE] (routing beats scanning) "
                "or --all to search everything"
            )
        if not KNOWLEDGE.is_dir():
            raise Fault(
                f"{KNOWLEDGE} does not exist. Nothing was searched. "
                "This is NOT a zero-result answer."
            )
        engine_name = choose_engine(args.engine)
        if args.only:
            scope = resolve_scope(args.only, read_sources(MANIFEST), KNOWLEDGE)
            scope_label = ", ".join(lbl for lbl, _ in scope)
        else:
            GROUPS.update(s.split("/")[0] for s in read_sources(MANIFEST) if "/" in s)
            scope = [("knowledge", KNOWLEDGE)]
            scope_label = "all"
        dirs = [p for _, p in scope]
    except Usage as exc:
        print(f"error: {exc}", file=sys.stderr)
        if "unknown source" in str(exc):
            try:
                names = read_sources(MANIFEST)
            except Fault:
                names = []
            print(
                "valid sources: "
                + ", ".join(names + list(OUR_DIRS) + ["TheAlgorithms", "ours"]),
                file=sys.stderr,
            )
        return 2
    except Fault as exc:
        print(f"corpus fault: {exc}", file=sys.stderr)
        return 3

    require_all = not args.any
    demote = not args.no_demote and all(ch.isascii() for ch in "".join(terms))
    exts = (
        []
        if args.ext.strip() == "any"
        else [e.strip().lstrip(".") for e in args.ext.split(",") if e.strip()]
    )

    hits: list[Hit] = []
    timed_out = False
    if not args.files:
        try:
            out, timed_out = collect_matches(
                engine_name, terms, dirs, exts, args.case, started, args.timeout
            )
        except Fault as exc:
            print(f"corpus fault: {exc}", file=sys.stderr)
            return 3
        by_file: dict[str, FileMatches] = {}
        for raw in out.splitlines():
            head, sep, text = raw.partition(":")
            if not sep:
                continue
            lineno_s, sep2, text = text.partition(":")
            if not sep2 or not lineno_s.isdigit():
                continue
            try:
                rel = Path(head).resolve().relative_to(REPO).as_posix()
            except ValueError:
                rel = head
            fm = by_file.setdefault(rel, FileMatches(rel=rel))
            pair = (int(lineno_s), text)
            if pair not in fm.seen:
                fm.seen.add(pair)
                fm.lines.append(pair)
        for fm in by_file.values():
            found = matched_terms(fm, terms, args.case)
            if require_all and len(found) < len(terms):
                continue
            hit = score_file(fm, terms, args.case, demote)
            fill_excerpt(hit, fm, terms, args.case, args.lines, args.chars)
            hits.append(hit)

    pdfs = find_pdfs(dirs)
    if args.pdf:
        pdf_hits, ok = pdf_text_hits(
            pdfs,
            terms,
            args.case,
            require_all,
            args.lines,
            args.chars,
            args.timeout,
        )
        if not ok:
            print(
                "note: pdftotext not found; PDFs matched by filename only",
                file=sys.stderr,
            )
            hits.extend(pdf_filename_hits(pdfs, terms, require_all))
        else:
            hits.extend(pdf_hits)
    else:
        hits.extend(pdf_filename_hits(pdfs, terms, require_all))

    hits = [h for h in hits if h.score > DEMOTE_NOISE / 2]
    suppressed = 0
    if demote:
        kept = [h for h in hits if not h.demoted]
        suppressed = len(hits) - len(kept)
        hits = kept
    hits.sort(key=lambda h: (-h.score, len(h.path), h.path))
    hits = hits[: max(0, args.max)]

    elapsed_ms = int((time.monotonic() - started) * 1000)
    if args.json:
        payload = {
            "query": terms,
            "scope": scope_label,
            "engine": engine_name,
            "elapsed_ms": elapsed_ms,
            "suppressed_translations": suppressed,
            "results": [
                {
                    "path": h.path,
                    "source": h.source,
                    "kind": h.kind,
                    "score": h.score,
                    "line": h.line,
                    "heading": h.heading,
                    "excerpt": h.excerpt,
                }
                for h in hits
            ],
        }
        emit(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    else:
        counts = None if hits else count_by_type(dirs, exts)
        emit(
            render(
                hits,
                terms,
                scope_label,
                engine_name,
                elapsed_ms,
                suppressed,
                counts,
                args.list,
            )
        )

    if hits:
        return 0
    return 4 if timed_out else 1


if __name__ == "__main__":
    sys.exit(main())
