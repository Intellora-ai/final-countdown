"""What must be TRUE for `scripts/knowledge_search.py` to be worth using.

The tool exists so that an agent searching a 414MB corpus gets an ANSWER, not
a wall of text, and so that "0 results" is a claim backed by evidence rather
than a silent failure. Two bugs in the corpus make a naive `grep -r` actively
misleading, and both are pinned here:

  N3  knowledge/TheAlgorithms/Python/strings/words.txt is an English
      dictionary. It matches every single-word query in the language, so a
      naive grep answers "flibbertigibbet" with two confident hits.
  N4  knowledge/papers-we-love/nautilus.db is a 1MB binary. Without `grep -I`
      it is returned as a "result" for "distributed cache", and the run takes
      5.8s instead of 1.2s.

Both were watched failing against a naive implementation before the fixes
existed.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts" / "knowledge_search.py"


def run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        cwd=str(cwd or REPO),
        timeout=180,
    )


def run_json(
    *args: str,
) -> tuple[subprocess.CompletedProcess[str], list[dict[str, Any]]]:
    proc = run(*args, "--json")
    payload: dict[str, Any] = (
        json.loads(proc.stdout) if proc.stdout.strip() else {"results": []}
    )
    results: list[dict[str, Any]] = list(payload["results"])
    return proc, results


def paths(results: list[dict[str, Any]]) -> list[str]:
    return [str(r["path"]) for r in results]


# --------------------------------------------------------------------------
# POSITIVE — every one of these is a document that exists in the corpus today.
# --------------------------------------------------------------------------


def test_p1_cache_invalidation_ranks_the_english_readme_first() -> None:
    proc, results = run_json("cache", "invalidation", "--only", "system-design-primer")
    assert proc.returncode == 0, proc.stderr
    assert paths(results)[0] == "knowledge/system-design-primer/README.md"


def test_p1b_a_precise_query_returns_the_exact_line_and_text() -> None:
    """README.md line 1311 carries the sentence. The three-word query pins it;
    the two-word query cannot, because line 1162 also holds both terms and
    comes first."""
    proc, results = run_json(
        "cache", "invalidation", "difficult", "--only", "system-design-primer"
    )
    assert proc.returncode == 0, proc.stderr
    hit = [
        r for r in results if r["path"] == "knowledge/system-design-primer/README.md"
    ]
    assert hit, paths(results)
    assert hit[0]["line"] == 1311
    excerpt: list[str] = [str(x) for x in hit[0]["excerpt"]]
    assert "Cache invalidation is a difficult problem" in "\n".join(excerpt)


def test_p2_consistent_hashing_finds_the_exact_line() -> None:
    proc, results = run_json("consistent", "hashing", "--only", "system-design-primer")
    assert proc.returncode == 0, proc.stderr
    hit = [
        r for r in results if r["path"] == "knowledge/system-design-primer/README.md"
    ]
    assert hit, paths(results)
    assert hit[0]["line"] == 913


def test_p3_dijkstra_reaches_the_python_implementation() -> None:
    """TheAlgorithms carries ~15 files whose name contains `dijkstra`, so the
    bare term cannot rank one above the others. What must be true is that the
    file is REACHABLE -- routing to the source returns it."""
    proc, results = run_json("dijkstra", "--only", "TheAlgorithms", "--max", "30")
    assert proc.returncode == 0, proc.stderr
    assert "knowledge/TheAlgorithms/Python/graphs/bi_directional_dijkstra.py" in paths(
        results
    )


def test_p3b_a_precise_query_ranks_the_exact_file_first() -> None:
    proc, results = run_json("bi", "directional", "dijkstra", "--only", "TheAlgorithms")
    assert proc.returncode == 0, proc.stderr
    assert paths(results)[0] == (
        "knowledge/TheAlgorithms/Python/graphs/bi_directional_dijkstra.py"
    )


def test_p4_pdf_found_by_filename_without_extraction() -> None:
    proc, results = run_json("consensus", "algorithm", "--only", "papers-we-love")
    assert proc.returncode == 0, proc.stderr
    target = (
        "knowledge/papers-we-love/distributed_systems/"
        "in-search-of-an-understandable-consensus-algorithm.pdf"
    )
    hit = [r for r in results if r["path"] == target]
    assert hit, paths(results)
    assert hit[0]["kind"] == "filename"


@pytest.mark.skipif(shutil.which("pdftotext") is None, reason="pdftotext not installed")
def test_p5_pdf_text_extraction_finds_raft_inside_the_paper() -> None:
    proc, results = run_json(
        "raft", "consensus", "--only", "papers-we-love", "--pdf", "--max", "8"
    )
    assert proc.returncode == 0, proc.stderr
    target = (
        "knowledge/papers-we-love/distributed_systems/"
        "in-search-of-an-understandable-consensus-algorithm.pdf"
    )
    hit = [r for r in results if r["path"] == target]
    assert hit, paths(results)
    assert hit[0]["kind"] == "pdf"


def test_p6_rst_files_are_searched_not_silently_dropped() -> None:
    """what-happens-when/README.rst is .rst. An extension whitelist without
    .rst deletes this entire source without saying so."""
    proc, results = run_json("cache", "--only", "what-happens-when")
    assert proc.returncode == 0, proc.stderr
    assert "knowledge/what-happens-when/README.rst" in paths(results)


# --------------------------------------------------------------------------
# NEGATIVE — exit 1 means "ran correctly, found nothing".
# --------------------------------------------------------------------------


def test_p7_openstax_cnxml_is_searched_not_silently_dropped() -> None:
    """openstax ships 55 books as .cnxml -- 371.7MB across 9,883 files, 61% of
    all searchable text in the corpus. An extension whitelist without `cnxml`
    returns zero for every one of them and says nothing about it."""
    proc, results = run_json("photosynthesis", "--only", "openstax", "--max", "8")
    assert proc.returncode == 0, proc.stderr
    cnxml = [p for p in paths(results) if p.endswith(".cnxml")]
    assert cnxml, paths(results)
    assert all(p.startswith("knowledge/openstax/") for p in cnxml)


def test_p8_regex_metacharacters_in_a_term_are_literal() -> None:
    """A query term is text, not a pattern. `c++` reached grep unescaped on the
    single-term path and `+` is a regex quantifier there, so the term was
    silently searched as something else."""
    proc, results = run_json("c++", "--only", "TheAlgorithms/C-Plus-Plus", "--max", "3")
    assert proc.returncode == 0, proc.stderr
    assert results
    joined = "\n".join(str(x) for r in results for x in r["excerpt"]).lower()
    assert "c++" in joined


def test_n1_nonexistent_token_exits_one_with_no_results() -> None:
    proc, results = run_json("zzqx-nonexistent-token-9f3a", "--all")
    assert proc.returncode == 1
    assert results == []


def test_n2_nonsense_phrase_exits_one() -> None:
    proc, results = run_json("quantum", "flibbertigibbet", "protocol", "--all")
    assert proc.returncode == 1
    assert results == []


def test_n3_wordlist_noise_is_suppressed() -> None:
    """A naive grep answers this with words.txt and dictionary.txt. Both are
    English dictionaries; neither is an answer to anything."""
    proc, results = run_json("flibbertigibbet", "--all")
    assert results == [], paths(results)
    assert proc.returncode == 1


def test_n4_binary_files_are_never_returned() -> None:
    proc, results = run_json("distributed", "cache", "--all")
    assert proc.returncode == 0, proc.stderr
    assert not [p for p in paths(results) if p.endswith(".db")], paths(results)
    assert "nautilus.db" not in proc.stdout


def test_n5_all_terms_must_be_present() -> None:
    proc, results = run_json(
        "xylophone", "consensus", "raft", "--only", "papers-we-love"
    )
    assert proc.returncode == 1
    assert results == []


# --------------------------------------------------------------------------
# FAILURE MODES — the exit codes are the whole point of the tool.
# --------------------------------------------------------------------------


def test_f1_unknown_source_exits_two_and_prints_nothing_to_stdout() -> None:
    proc = run("cache", "--only", "nonexistent-repo")
    assert proc.returncode == 2
    assert proc.stdout == ""
    assert "nonexistent-repo" in proc.stderr
    assert "system-design-primer" in proc.stderr


def test_f2_neither_only_nor_all_exits_two() -> None:
    proc = run("cache")
    assert proc.returncode == 2
    assert "--only" in proc.stderr


def test_f3_more_than_five_sources_exits_two() -> None:
    proc = run(
        "cache",
        "--only",
        "system-design-primer,what-happens-when,papers-we-love,awesome,ossu,public-apis",
    )
    assert proc.returncode == 2
    assert "at most 5 sources" in proc.stderr


def test_f4_engine_rg_never_falls_back_silently() -> None:
    if shutil.which("rg") is not None:  # pragma: no cover - rg is absent here
        pytest.skip("ripgrep is installed on this machine")
    proc = run("cache", "--all", "--engine", "rg")
    assert proc.returncode == 3
    assert "ripgrep not found on PATH" in proc.stderr


def test_f5_empty_source_directory_is_a_fault_not_a_zero_result(tmp_path: Path) -> None:
    """An uninitialised submodule looks exactly like a source with no matches.
    Answering 'no results' there is a lie."""
    fake = tmp_path / "repo"
    (fake / "scripts").mkdir(parents=True)
    (fake / "knowledge" / "system-design-primer").mkdir(parents=True)
    shutil.copy(SCRIPT, fake / "scripts" / "knowledge_search.py")
    shutil.copy(REPO / "knowledge" / "README.md", fake / "knowledge" / "README.md")
    proc = subprocess.run(
        [
            sys.executable,
            str(fake / "scripts" / "knowledge_search.py"),
            "cache",
            "--only",
            "system-design-primer",
        ],
        capture_output=True,
        text=True,
        cwd=str(fake),
        timeout=120,
    )
    assert proc.returncode == 3
    assert "submodule not initialised" in proc.stderr
    assert "NOT a zero-result answer" in proc.stderr


def test_f6_query_of_only_stopwords_exits_two() -> None:
    proc = run("how", "to", "the", "--all")
    assert proc.returncode == 2
    assert "stopword" in proc.stderr.lower()


def test_f7_stdout_is_capped_at_64kb() -> None:
    proc = run("cache", "--all", "--max", "500", "--chars", "99999")
    assert len(proc.stdout.encode()) <= 65536
    assert "truncated" in proc.stderr.lower()


def test_f8_translated_readmes_are_suppressed() -> None:
    proc, results = run_json("cache", "invalidation", "--only", "system-design-primer")
    assert proc.returncode == 0, proc.stderr
    top = paths(results)[:8]
    assert "knowledge/system-design-primer/README.md" in top
    assert "knowledge/system-design-primer/README-ja.md" not in top
    assert "knowledge/system-design-primer/README-zh-TW.md" not in top


def test_f9_no_demote_proves_f8_tests_demotion_not_search_failure() -> None:
    proc, results = run_json(
        "cache", "invalidation", "--only", "system-design-primer", "--no-demote"
    )
    assert proc.returncode == 0, proc.stderr
    found = paths(results)
    assert "knowledge/system-design-primer/README-ja.md" in found
    assert "knowledge/system-design-primer/README-zh-TW.md" in found


def test_f10_non_ascii_query_skips_demotion() -> None:
    proc, results = run_json("キャッシュ", "--only", "system-design-primer")
    assert proc.returncode == 0, proc.stderr
    assert "knowledge/system-design-primer/README-ja.md" in paths(results)


def test_f11_no_git_object_stores_live_in_the_corpus() -> None:
    """Submodule .git entries are FILES. A directory here would mean the tool
    must exclude it, and would add hundreds of MB of unsearchable objects."""
    out = subprocess.run(
        ["find", "knowledge", "-maxdepth", "3", "-name", ".git", "-type", "d"],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=120,
    )
    assert out.stdout.strip() == "", out.stdout


# --------------------------------------------------------------------------
# PERFORMANCE — excluded from the default run.
# --------------------------------------------------------------------------


@pytest.mark.slow
def test_perf_routed_query_under_one_second() -> None:
    import time

    start = time.monotonic()
    run("cache", "invalidation", "--only", "system-design-primer", "--json")
    assert time.monotonic() - start < 1.0 + float(os.environ.get("PERF_SLACK", "1.5"))


@pytest.mark.slow
def test_perf_unscoped_query_stays_within_the_measured_ceiling() -> None:
    """The design budgeted 8s for `--all`. MEASURED 2026-08-29: the corpus is
    now 11.6GB, and reading it once is the floor -- a three-term `--all` costs
    48.6s wall on this machine, almost all of it the single `grep -l` pass.
    8s is not reachable and no tuning makes it so. The budget below is the
    measured cost plus headroom. The point of this tool is `--only`, covered
    above at well under a second."""
    import time

    start = time.monotonic()
    proc = run("distributed", "cache", "--all", "--json")
    assert proc.returncode == 0, proc.stderr
    assert time.monotonic() - start < 120.0


@pytest.mark.slow
@pytest.mark.skipif(shutil.which("pdftotext") is None, reason="pdftotext not installed")
def test_perf_pdf_extraction_stays_within_the_measured_ceiling() -> None:
    """The design budgeted 6s from a 2.03s measurement of `pdftotext` alone at
    -P 8. MEASURED 2026-08-29 end to end -- 203 PDFs extracted, plus the text
    pass and interpreter startup -- three runs: 6.92s, 10.14s, 8.51s. 6s was
    a floor for one stage quoted as a budget for the whole command."""
    import time

    start = time.monotonic()
    proc = run("raft", "consensus", "--only", "papers-we-love", "--pdf", "--json")
    assert proc.returncode == 0, proc.stderr
    assert time.monotonic() - start < 20.0
