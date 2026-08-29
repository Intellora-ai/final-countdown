"""The SILENCE law, applied to the tree instead of to one edit.

WHY THIS EXISTS
---------------
`~/.claude/hooks/laws.py` refuses an *edit* that swallows a caught failure. It
is a PreToolUse hook, so it reads one edit from stdin and never sees the
repository. Measured on 2026-08-25: `git ls-files | grep -i laws` returns
nothing, no workflow invokes any gate over the tree, and
`frontend/src/data/store.ts:25` entered in commit 5af41c8 ("bootstrap frontend
CI and imported app") -- imported, never typed under the hook. The law was
real and the code walked straight past it, because nothing ever swept.

Two independent gaps produced one symptom, and neither alone explains it:

    law lives only in ~/.claude   ->  CI can never run it
    no sweep exists              ->  imported code is never judged

Fixing either one alone leaves the repository one import away from the same
blind spot. This module tests the second gap's fix.

THE BAR THESE TESTS SET
-----------------------
A gate asserted only to REFUSE is satisfied by `return REFUSE`, and one
asserted only to ALLOW is satisfied by `return ALLOW`. Every shape below is
therefore paired: must-trip cases AND must-not-trip cases. The false-positive
tests are load bearing -- a gate that cries wolf gets deleted, and then it
enforces nothing at all.

The must-trip set deliberately includes tokens that exist in no framework
(`telemetryBus.whisper`, `owlPost.deliver`). If only the real spellings are
caught, this is a LIST wearing a law's clothes, and it will miss the next
spelling nobody thought of. That is exactly how `catch { /* ignore */ }`
survived `scripts/no_symptom_patch.py`, whose regex `catch\\s*\\{\\s*\\}`
requires whitespace between the braces and so is defeated by a comment.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SWEEP = REPO / "scripts" / "silence_sweep.py"

CLEAN = 0
VIOLATION = 2


def run(root: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SWEEP), "--root", str(root), *extra],
        capture_output=True,
        text=True,
    )


def write(root: Path, rel: str, body: str) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body, encoding="utf-8")
    return p


# --------------------------------------------------------------------------
# MUST TRIP -- a caught failure whose body changes nothing
# --------------------------------------------------------------------------

SWALLOWS = {
    "empty-braces": "try { const d = JSON.parse(v); go(d) } catch {}",
    "empty-braces-param": "try { const d = JSON.parse(v); go(d) } catch (e) {}",
    "comment-only": "try { const d = JSON.parse(v); go(d) } catch { /* ignore */ }",
    "comment-only-param": "try { const d = JSON.parse(v); go(d) } catch (e) { /* nope */ }",
    "log-only": "try { const d = JSON.parse(v); go(d) } catch (e) { console.log(e) }",
    "invented-reporter": "try { const d = JSON.parse(v); go(d) } catch (e) { telemetryBus.whisper(e) }",
    "second-invented": "try { const d = JSON.parse(v); go(d) } catch (e) { owlPost.deliver(e) }",
    "empty-arrow-catch": "await reader.cancel().catch(() => {})",
}


@pytest.mark.parametrize("label", sorted(SWALLOWS))
def test_a_swallowed_failure_is_refused(tmp_path: Path, label: str) -> None:
    write(tmp_path, "src/app.ts", SWALLOWS[label])
    r = run(tmp_path)
    assert r.returncode == VIOLATION, (
        f"[{label}] the sweep did NOT refuse a swallowed failure.\n"
        f"source: {SWALLOWS[label]}\n"
        f"exit={r.returncode}\nstdout:\n{r.stdout}\nstderr:\n{r.stderr}"
    )
    assert "src/app.ts" in r.stdout, (
        f"[{label}] refused, but never named the file. A finding with no "
        f"location cannot be acted on.\nstdout:\n{r.stdout}"
    )


PY_SWALLOWS = {
    "bare-pass": "try:\n    risky()\nexcept OSError:\n    pass\n",
    "comment-and-pass": "try:\n    risky()\nexcept OSError:\n    # best effort\n    pass\n",
    "inline-pass": "try:\n    risky()\nexcept OSError: pass\n",
    "bare-except": "try:\n    risky()\nexcept:\n    pass\n",
}


@pytest.mark.parametrize("label", sorted(PY_SWALLOWS))
def test_python_swallow_is_refused(tmp_path: Path, label: str) -> None:
    write(tmp_path, "scripts/thing.py", PY_SWALLOWS[label])
    r = run(tmp_path)
    assert r.returncode == VIOLATION, (
        f"[{label}] a Python swallow was allowed.\n"
        f"source:\n{PY_SWALLOWS[label]}\nexit={r.returncode}\nstdout:\n{r.stdout}"
    )


# --------------------------------------------------------------------------
# MUST NOT TRIP -- the handler genuinely does something
# --------------------------------------------------------------------------

HANDLED = {
    "rethrow": "try { go() } catch (e) { throw e }",
    "return-fallback": "function f(){ try { return go() } catch { return null } }",
    "assign-fallback": "let v; try { v = go() } catch (e) { v = DEFAULT }",
    "arrow-fallback": "const t = await res.text().catch(() => '')",
    "sets-error-state": "try { go() } catch (e) { this.lastError = e }",
    "py-raise": "try:\n    risky()\nexcept OSError as exc:\n    raise RuntimeError(exc)\n",
    "py-return": "def f():\n    try:\n        return risky()\n    except OSError:\n        return None\n",
    "py-assign": "try:\n    v = risky()\nexcept OSError:\n    v = DEFAULT\n",
    "invented-but-assigns": "try { go() } catch (e) { moonbeam = e }",
}


@pytest.mark.parametrize("label", sorted(HANDLED))
def test_a_handled_failure_is_allowed(tmp_path: Path, label: str) -> None:
    ext = "py" if label.startswith("py-") else "ts"
    write(tmp_path, f"src/ok.{ext}", HANDLED[label])
    r = run(tmp_path)
    assert r.returncode == CLEAN, (
        f"[{label}] FALSE POSITIVE. This handler does change control flow or "
        f"bind a fallback, and the sweep refused it anyway. A gate that cries "
        f"wolf gets switched off.\nsource:\n{HANDLED[label]}\n"
        f"exit={r.returncode}\nstdout:\n{r.stdout}"
    )


# --------------------------------------------------------------------------
# NON-VACUITY -- a sweep that scanned nothing is not a clean tree
# --------------------------------------------------------------------------


def test_an_empty_tree_is_vacuous_not_clean(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir(parents=True)
    r = run(tmp_path)
    assert r.returncode == VIOLATION, (
        "A tree with no source files exited 0. 'I scanned nothing and found "
        "nothing' is indistinguishable from 'I scanned everything and it was "
        f"clean'.\nexit={r.returncode}\nstdout:\n{r.stdout}"
    )
    assert "VACUOUS" in r.stdout, (
        f"refused, but did not say why it was void.\nstdout:\n{r.stdout}"
    )


def test_a_clean_tree_prints_a_countable_receipt(tmp_path: Path) -> None:
    write(tmp_path, "src/ok.ts", HANDLED["rethrow"])
    r = run(tmp_path)
    assert r.returncode == CLEAN, f"clean tree refused:\n{r.stdout}"
    assert "RECEIPT" in r.stdout, f"no receipt printed:\n{r.stdout}"
    assert "handlers" in r.stdout, (
        "the receipt does not report how many handlers were examined. Without "
        f"that number a parser that matched nothing looks identical to a clean "
        f"tree.\nstdout:\n{r.stdout}"
    )


def test_the_receipt_counts_the_handler_it_actually_examined(tmp_path: Path) -> None:
    write(tmp_path, "src/ok.ts", HANDLED["rethrow"])
    r = run(tmp_path)
    assert " 0 handlers" not in r.stdout, (
        "the tree holds exactly one catch block and the sweep reports zero "
        f"handlers examined. The parser is blind.\nstdout:\n{r.stdout}"
    )


# --------------------------------------------------------------------------
# SCOPE -- tests and reference copies are excluded, and the count says so
# --------------------------------------------------------------------------

EXCLUDED = {
    "unit-test-ts": "src/thing.test.ts",
    "spec-ts": "src/thing.spec.ts",
    "python-test": "tests/test_thing.py",
    "reference-copy": "frontend/reference/domain/data-layer.js",
    "node-modules": "node_modules/pkg/index.js",
}


@pytest.mark.parametrize("label", sorted(EXCLUDED))
def test_excluded_paths_do_not_trip_the_sweep(tmp_path: Path, label: str) -> None:
    write(tmp_path, "src/ok.ts", HANDLED["rethrow"])
    write(tmp_path, EXCLUDED[label], SWALLOWS["comment-only"])
    r = run(tmp_path)
    assert r.returncode == CLEAN, (
        f"[{label}] {EXCLUDED[label]} is a fixture or a frozen copy, not "
        f"shipped code, and the sweep refused it.\nstdout:\n{r.stdout}"
    )


def test_exclusions_are_counted_not_silent(tmp_path: Path) -> None:
    write(tmp_path, "src/ok.ts", HANDLED["rethrow"])
    write(tmp_path, "src/thing.test.ts", SWALLOWS["comment-only"])
    r = run(tmp_path)
    assert "excluded" in r.stdout, (
        "files were skipped and the receipt never said so. A silent skip is "
        f"indistinguishable from a file that passed.\nstdout:\n{r.stdout}"
    )


# --------------------------------------------------------------------------
# THE REGRESSION THIS WAS BUILT FOR
# --------------------------------------------------------------------------


def test_the_exact_shape_that_shipped_is_refused(tmp_path: Path) -> None:
    """frontend/src/data/store.ts:25, verbatim.

    Reproduced 2026-08-25: a `storage` event carrying invalid JSON calls the
    subscriber 0 times and emits no console output, no window error event and
    no throw. The tab keeps showing stale data with no signal. This is the
    line that must never be reintroduced.
    """
    write(
        tmp_path,
        "src/data/store.ts",
        "window.addEventListener('storage', (e) => {\n"
        "  try { const db = JSON.parse(e.newValue); this.subs.forEach((cb) => cb(db)) }"
        " catch { /* ignore */ }\n"
        "})\n",
    )
    r = run(tmp_path)
    assert r.returncode == VIOLATION, (
        "the shape that actually shipped was not refused. This test is the "
        f"whole reason the sweep exists.\nexit={r.returncode}\nstdout:\n{r.stdout}"
    )


def test_a_comment_does_not_defeat_the_sweep(tmp_path: Path) -> None:
    """The precise hole in the list-based gate.

    `scripts/no_symptom_patch.py` matches `catch\\s*\\{\\s*\\}`. `\\s` is
    whitespace, a comment is not whitespace, so a comment-only body walks
    through. Measured: that gate ALLOWS `catch { /* ignore */ }` while
    `laws.py` refuses it. The sweep must behave like the law, not the list.
    """
    write(tmp_path, "src/a.ts", SWALLOWS["empty-braces"])
    bare = run(tmp_path)
    write(tmp_path, "src/a.ts", SWALLOWS["comment-only"])
    commented = run(tmp_path)
    assert bare.returncode == commented.returncode == VIOLATION, (
        "the bare and commented forms of one shape got different verdicts. "
        "Judging by spelling instead of by effect is the bug this replaces.\n"
        f"bare exit={bare.returncode}  commented exit={commented.returncode}"
    )
