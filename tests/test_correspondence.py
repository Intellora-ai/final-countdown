"""The Python↔Lean correspondence, attacked.

These do not check that the proofs exist. They check that a semantically
different Python program CANNOT keep the claim — which is the only property
that makes the phrase "a theorem about this program" mean anything.

Network-free by default: only the tests marked `axle` call the hosted kernel.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from typing import Any, cast

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import pysem  # noqa: E402


def emit(source: str, func: str = "add") -> pysem.Emitted:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / f"{func}.py"
        p.write_text(source, encoding="utf-8")
        return pysem.emit(p, func)


# --------------------------------------------------------------------------
# Unsupported Python must produce NO correspondence, so it can acquire no claim.
# --------------------------------------------------------------------------
UNSUPPORTED = {
    "floor_division": "def add(a: int, b: int) -> int:\n    return a // b\n",
    "true_division": "def add(a: int, b: int) -> int:\n    return a / b\n",
    "while_loop": "def add(a: int, b: int) -> int:\n    while a > 0:\n        b += 1\n    return b\n",
    "assignment": "def add(a: int, b: int) -> int:\n    c = a + b\n    return c\n",
    "global_name": "def add(a: int, b: int) -> int:\n    return a + K\n",
    "foreign_call": "def add(a: int, b: int) -> int:\n    return abs(a) + b\n",
    "else_branch": "def add(a: int, b: int) -> int:\n    if a > 0:\n        return a\n    else:\n        return b\n",
    "chained_compare": "def add(a: int, b: int) -> int:\n    if 0 < a < b:\n        return a\n    return b\n",
    "float_literal": "def add(a: int, b: int) -> int:\n    return a + 1.5\n",
    "str_return": "def add(a: int, b: int) -> int:\n    return 'x'\n",
    "default_arg": "def add(a: int, b: int = 3) -> int:\n    return a + b\n",
    "varargs": "def add(a: int, *rest: int) -> int:\n    return a\n",
    "decorator": "import functools\n@functools.cache\ndef add(a: int, b: int) -> int:\n    return a + b\n",
    "falls_off_end": "def add(a: int, b: int) -> int:\n    if a > 0:\n        return a\n",
    "try_except": "def add(a: int, b: int) -> int:\n    try:\n        return a + b\n    except Exception:\n        return 0\n",
}


@pytest.mark.parametrize("name", sorted(UNSUPPORTED))
def test_unsupported_construct_fails_closed(name: str) -> None:
    """No approximation, no dropping, no 'close enough'."""
    with pytest.raises(pysem.Unsupported):
        emit(UNSUPPORTED[name])


def test_supported_control_is_accepted() -> None:
    """The rejections above must not be a checker that rejects everything."""
    e = emit("def add(a: int, b: int) -> int:\n    return a + b\n")
    assert e.lean_ast.count(".add") == 1
    assert e.params == ["a", "b"]


# --------------------------------------------------------------------------
# The emitted tree must FOLLOW the source. If it does not, the theorem drifts
# away from the program without anything noticing.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("source,marker", [
    ("def add(a: int, b: int) -> int:\n    return a + b\n", ".add"),
    ("def add(a: int, b: int) -> int:\n    return a - b\n", ".sub"),
    ("def add(a: int, b: int) -> int:\n    return a * b\n", ".mul"),
    ("def add(a: int, b: int) -> int:\n    return 0\n", ".lit (0)"),
    ("def add(a: int, b: int) -> int:\n    return max(a, b)\n", ".pmax"),
    ("def add(a: int, b: int) -> int:\n    return -a\n", ".sub (.lit (0))"),
])
def test_operator_change_changes_the_tree(source: str, marker: str) -> None:
    assert marker in emit(source).lean_ast


def test_argument_order_is_preserved() -> None:
    """`a - b` and `b - a` are different programs and must be different trees."""
    ab = emit("def add(a: int, b: int) -> int:\n    return a - b\n").lean_ast
    ba = emit("def add(a: int, b: int) -> int:\n    return b - a\n").lean_ast
    assert ab != ba


def test_raise_becomes_a_partial_guard() -> None:
    """clamp's ValueError is undefinedness in the semantics, not an ignored line."""
    e = emit("def clamp(lo: int, hi: int, x: int) -> int:\n"
             "    if lo > hi:\n        raise ValueError('bad')\n"
             "    return max(lo, min(hi, x))\n", "clamp")
    assert "none" in e.lean_ast and ".gt" in e.lean_ast
    assert e.guards == 1


def test_observed_ground_truth_comes_from_running_the_real_function() -> None:
    """The obligations the kernel discharges are CPython's actual outputs."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "add.py"
        p.write_text("def add(a: int, b: int) -> int:\n    return a + b\n")
        e = pysem.emit(p, "add")
        for args, result in pysem.observe(p, "add", e.params):
            assert result == args[0] + args[1]


def test_a_raising_function_records_undefined_not_a_value() -> None:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "clamp.py"
        p.write_text("def clamp(lo: int, hi: int, x: int) -> int:\n"
                     "    if lo > hi:\n        raise ValueError('bad')\n"
                     "    return max(lo, min(hi, x))\n")
        e = pysem.emit(p, "clamp")
        observed = pysem.observe(p, "clamp", e.params)
        assert any(r is None for _, r in observed), "no sampled point raised"
        for args, r in observed:
            assert (r is None) == (args[0] > args[1])


# --------------------------------------------------------------------------
# The gate: editing Python must break the claim. This is the whole point.
# --------------------------------------------------------------------------
def worktree(tmp_path: Path, source: str, regenerate: bool) -> subprocess.CompletedProcess[str]:
    import shutil
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True,
                    ignore=shutil.ignore_patterns(".git", ".venv", "reports",
                                                  "evidence", "__pycache__",
                                                  ".hypothesis", ".pytest_cache"))
    (w / "src/add.py").write_text(source, encoding="utf-8")
    (w / "reports").mkdir(exist_ok=True)
    if regenerate:
        subprocess.run([PY, "scripts/gen_correspondence.py", "--function", "add"],
                       cwd=w, capture_output=True, text=True, timeout=120)
    return subprocess.run([PY, "scripts/correspondence_gate.py"], cwd=w,
                          capture_output=True, text=True, timeout=600)


SEMANTIC_MUTANTS = {
    "subtraction": "def add(a: int, b: int) -> int:\n    return a - b\n",
    "multiplication": "def add(a: int, b: int) -> int:\n    return a * b\n",
    "off_by_one": "def add(a: int, b: int) -> int:\n    return a + 1\n",
    "constant": "def add(a: int, b: int) -> int:\n    return 0\n",
    "branch": "def add(a: int, b: int) -> int:\n    if a > 0:\n        return a + b\n    return a - b\n",
}


@pytest.mark.parametrize("name", sorted(SEMANTIC_MUTANTS))
def test_edited_python_without_regenerating_is_caught(tmp_path: Path,
                                                      name: str) -> None:
    """The committed pair is self-consistent, so only a source comparison sees it."""
    result = worktree(tmp_path, SEMANTIC_MUTANTS[name], regenerate=False)
    assert result.returncode != 0, f"{name} kept the claim without regenerating"
    assert "describes different Python" in result.stdout


@pytest.mark.axle
@pytest.mark.parametrize("name", sorted(SEMANTIC_MUTANTS))
def test_edited_python_after_regenerating_is_rejected_by_the_kernel(
        tmp_path: Path, name: str) -> None:
    """Regenerating is not an escape: the property is then false of the program."""
    result = worktree(tmp_path, SEMANTIC_MUTANTS[name], regenerate=True)
    assert result.returncode != 0, (
        f"{name} regenerated into an accepted proof — the theorem would be "
        "claimed of a program that does not satisfy it")


@pytest.mark.axle
def test_semantically_identical_rewrite_is_accepted(tmp_path: Path) -> None:
    """`b + a` IS addition. Rejecting it would mean the gate tracks bytes, not meaning."""
    result = worktree(tmp_path, "def add(a: int, b: int) -> int:\n    return b + a\n",
                      regenerate=True)
    assert result.returncode == 0, result.stdout[-2000:]


def test_a_source_with_no_correspondence_pair_is_caught(tmp_path: Path) -> None:
    """A new function must not slip outside the proof system unnoticed."""
    import shutil
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True,
                    ignore=shutil.ignore_patterns(".git", ".venv", "reports",
                                                  "evidence", "__pycache__",
                                                  ".hypothesis", ".pytest_cache"))
    (w / "src/negate.py").write_text(
        "def negate(a: int) -> int:\n    return -a\n", encoding="utf-8")
    (w / "reports").mkdir(exist_ok=True)
    result = subprocess.run([PY, "scripts/correspondence_gate.py"], cwd=w,
                            capture_output=True, text=True, timeout=600)
    assert result.returncode != 0, "an uncovered function was allowed"
    assert "no correspondence pair" in result.stdout


# --------------------------------------------------------------------------
# The audit that keeps the proofs honest.
# --------------------------------------------------------------------------
def test_no_proof_contains_sorry_or_native_decide() -> None:
    """A spec states with `sorry`; a PROOF that does has proved nothing."""
    for p in sorted((REPO / "semantics/proofs").glob("*.lean")):
        text = p.read_text(encoding="utf-8")
        for forbidden in ("sorry", "admit", "native_decide", "\naxiom "):
            assert forbidden not in text, f"{p.name} contains {forbidden!r}"


def test_every_proof_requests_its_axiom_report() -> None:
    """Without `#print axioms` the audit silently stops running."""
    for p in sorted((REPO / "semantics/proofs").glob("*.lean")):
        assert "#print axioms" in p.read_text(encoding="utf-8"), p.name


def test_the_semantics_text_is_identical_in_every_generated_file() -> None:
    """One interpreter, or the theorems are about different semantics."""
    from pysem_lean import SEMANTICS
    for d in ("semantics/specs", "semantics/proofs"):
        for p in sorted((REPO / d).glob("*.lean")):
            assert p.read_text(encoding="utf-8").startswith(SEMANTICS), p


@pytest.mark.axle
def test_a_sorry_in_a_proof_is_caught_twice(tmp_path: Path) -> None:
    """Two independent defences, and the second does not trust the first.

    AXLE returns okay=false for a proof containing `sorry`. Independently, the
    axiom report lists `sorryAx`. So an AXLE that wrongly reported okay=true
    would still not get an incomplete proof past the gate — measured, not
    assumed.
    """
    import json
    import re

    spec = REPO / "semantics/specs/add_semantics_spec.lean"
    proof = (REPO / "semantics/proofs/add_semantics_proof.lean").read_text(
        encoding="utf-8")
    i = proof.index("theorem add_ast_is_addition")
    j = proof.index("#print axioms add_ast_matches_cpython")
    sabotaged = (
        proof[:i]
        + "theorem add_ast_is_addition (a b : Int) :\n"
          "    evalFunc add_ast [a, b] = evalFunc add_ast [b, a]\n"
          "    ∧ evalFunc add_ast [a, (0 : Int)] = some a := by\n  sorry\n\n"
        + proof[j:])
    bad = tmp_path / "sorry_proof.lean"
    bad.write_text(sabotaged, encoding="utf-8")

    out = subprocess.run(
        ["axle", "verify-proof", "--environment", "lean-4.33.0",
         str(spec), str(bad)], capture_output=True, text=True, timeout=300)
    payload = cast("dict[str, Any]", json.loads(out.stdout))

    assert payload.get("okay") is not True, "AXLE accepted a proof with `sorry`"

    messages = payload.get("lean_messages")
    info_list: list[Any] = []
    if isinstance(messages, dict):
        raw_infos = cast("dict[str, Any]", messages).get("infos")
        if isinstance(raw_infos, list):
            info_list = cast("list[Any]", raw_infos)
    infos = " ".join(str(x) for x in info_list)
    axioms: set[str] = set()
    for m in re.finditer(r"depends on axioms: \[([^\]]*)\]", infos):
        axioms |= {a.strip() for a in m.group(1).split(",") if a.strip()}
    assert "sorryAx" in axioms, (
        "the axiom audit did not see the incomplete proof, so it would not "
        "catch one that AXLE wrongly accepted")

    sys.path.insert(0, str(SCRIPTS))
    import correspondence_gate as cg
    assert not cg.FOUNDATIONAL >= axioms, "sorryAx must not be foundational"
