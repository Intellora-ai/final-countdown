"""The Python↔Lean correspondence, attacked.

These do not check that the proofs exist. They check that a semantically
different Python program CANNOT keep the claim — which is the only property
that makes the phrase "a theorem about this program" mean anything.

There are four places a bad claim can be stopped, and each test below names the
one that actually fired:

  UNSUPPORTED       scripts/pysem.py refuses to give the program semantics
  FRESHNESS         the committed pair describes different Python than src/
  KERNEL-DENOTATION `evalFunc <n>_ast args = <closed form>` fails, i.e. the
                    renderer and the interpreter disagree
  KERNEL-PROPERTY   the hand-written mathematical claim is false of the program

The honest reading of the measurements below: a DERIVED obligation cannot fail
once it has been regenerated from the mutated source, because it moves with the
program. That is true of the denotation and of the recorded CPython outputs
alike. After a regeneration the layer that refutes is KERNEL-PROPERTY — and
what the denotation bought is the strength of that refutation, which now runs
against a closed form covering every integer instead of twelve sampled points.

Network-free by default: only the tests marked `axle` call the hosted kernel.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, cast

import pytest

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
    # A conditional expression is the shortest way to write a function that
    # agrees with addition everywhere the 12-point sample looks and is a
    # different function. It has no semantics here, so it gets no claim.
    "conditional_expression": "def add(a: int, b: int) -> int:\n    return a + b if a != 99991 else 0\n",
    # A parameter becomes a BINDER in the denotation theorem. These four would
    # each capture something the statement or its tactic depends on, silently
    # changing what the theorem says while it still reads correctly.
    "parameter_is_a_lean_keyword": "def add(fun: int, b: int) -> int:\n    return fun + b\n",
    "parameter_shadows_max": "def add(max: int, b: int) -> int:\n    return max + b\n",
    "parameter_shadows_guard_hypothesis": "def add(hguard0: int, b: int) -> int:\n    return hguard0 + b\n",
    "parameter_shadows_the_tree": "def add(add_ast: int, b: int) -> int:\n    return add_ast + b\n",
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
@pytest.mark.parametrize(
    "source,marker",
    [
        ("def add(a: int, b: int) -> int:\n    return a + b\n", ".add"),
        ("def add(a: int, b: int) -> int:\n    return a - b\n", ".sub"),
        ("def add(a: int, b: int) -> int:\n    return a * b\n", ".mul"),
        ("def add(a: int, b: int) -> int:\n    return 0\n", ".lit (0)"),
        ("def add(a: int, b: int) -> int:\n    return max(a, b)\n", ".pmax"),
        ("def add(a: int, b: int) -> int:\n    return -a\n", ".sub (.lit (0))"),
    ],
)
def test_operator_change_changes_the_tree(source: str, marker: str) -> None:
    assert marker in emit(source).lean_ast


def test_argument_order_is_preserved() -> None:
    """`a - b` and `b - a` are different programs and must be different trees."""
    ab = emit("def add(a: int, b: int) -> int:\n    return a - b\n").lean_ast
    ba = emit("def add(a: int, b: int) -> int:\n    return b - a\n").lean_ast
    assert ab != ba


def test_raise_becomes_a_partial_guard() -> None:
    """clamp's ValueError is undefinedness in the semantics, not an ignored line."""
    e = emit(
        "def clamp(lo: int, hi: int, x: int) -> int:\n"
        "    if lo > hi:\n        raise ValueError('bad')\n"
        "    return max(lo, min(hi, x))\n",
        "clamp",
    )
    assert "none" in e.lean_ast and ".gt" in e.lean_ast
    assert e.guards == 1


# --------------------------------------------------------------------------
# The denotation: the closed form is a SECOND walk over the SAME tree.
#
# These are pure renderer tests. They say nothing about whether the closed form
# agrees with `eval` — only the Lean kernel decides that, and
# test_a_renderer_that_lies_is_caught_by_the_kernel is where it is measured.
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "source,closed_form",
    [
        ("def add(a: int, b: int) -> int:\n    return a + b\n", "some (a + b)"),
        ("def add(a: int, b: int) -> int:\n    return a - b\n", "some (a - b)"),
        ("def add(a: int, b: int) -> int:\n    return a * b\n", "some (a * b)"),
        ("def add(a: int, b: int) -> int:\n    return max(a, b)\n", "some (max a b)"),
        ("def add(a: int, b: int) -> int:\n    return min(a, b)\n", "some (min a b)"),
        ("def add(a: int, b: int) -> int:\n    return 0\n", "some (0 : Int)"),
        ("def add(a: int, b: int) -> int:\n    return -a\n", "some ((0 : Int) - a)"),
        (
            "def add(a: int, b: int) -> int:\n    return a + b * a\n",
            "some (a + (b * a))",
        ),
    ],
)
def test_the_closed_form_follows_the_tree(source: str, closed_form: str) -> None:
    assert emit(source).denotation == closed_form


def test_a_guard_makes_the_denotation_conditional() -> None:
    """`raise` is `none` in the closed form: partiality is in the formula."""
    e = emit(
        "def clamp(lo: int, hi: int, x: int) -> int:\n"
        "    if lo > hi:\n        raise ValueError('bad')\n"
        "    return max(lo, min(hi, x))\n",
        "clamp",
    )
    assert e.denotation == ("(if lo > hi then none else some (max lo (min hi x)))")
    assert e.guard_props == ["lo > hi"]


def test_guards_nest_in_source_order() -> None:
    """Python short-circuits top to bottom; so must the closed form."""
    e = emit(
        "def f(a: int, b: int) -> int:\n"
        "    if a > 0:\n        return a\n"
        "    if b == 3:\n        raise ValueError('x')\n"
        "    return a + b\n",
        "f",
    )
    assert e.denotation == (
        "(if a > (0 : Int) then some a "
        "else (if b = (3 : Int) then none else some (a + b)))"
    )
    assert e.guard_props == ["a > (0 : Int)", "b = (3 : Int)"]


def test_truthiness_of_a_non_comparison_guard_is_not_zero() -> None:
    """Python's rule for ints, written as the Prop it actually is."""
    e = emit(
        "def f(a: int, b: int) -> int:\n    if a:\n        return b\n    return a\n",
        "f",
    )
    assert e.guard_props == ["a ≠ (0 : Int)"]


def test_every_proof_carries_a_universally_quantified_denotation() -> None:
    """Dropping the denotation from the generator would leave freshness green."""
    for name in ("add", "multiply", "subtract", "clamp"):
        text = (REPO / f"semantics/proofs/{name}_semantics_proof.lean").read_text(
            encoding="utf-8"
        )
        assert f"theorem {name}_ast_denotes" in text, name
        assert f"#print axioms {name}_ast_denotes" in text, name


def test_the_four_real_denotations_are_the_expected_mathematics() -> None:
    """A reader must be able to check the closed form against the source."""
    expected = {
        "add": "some (a + b)",
        "multiply": "some (a * b)",
        "subtract": "some (a - b)",
        "clamp": "(if lo > hi then none else some (max lo (min hi x)))",
    }
    for name, closed_form in expected.items():
        assert pysem.emit(REPO / f"src/{name}.py", name).denotation == closed_form


# --------------------------------------------------------------------------
# Observations come from RUNNING the real function.
# --------------------------------------------------------------------------
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
        p.write_text(
            "def clamp(lo: int, hi: int, x: int) -> int:\n"
            "    if lo > hi:\n        raise ValueError('bad')\n"
            "    return max(lo, min(hi, x))\n"
        )
        e = pysem.emit(p, "clamp")
        observed = pysem.observe(p, "clamp", e.params)
        assert any(r is None for _, r in observed), "no sampled point raised"
        for args, r in observed:
            assert (r is None) == (args[0] > args[1])


# --------------------------------------------------------------------------
# The gate: editing Python must break the claim. This is the whole point.
# --------------------------------------------------------------------------
# GENERATED DIRECTORIES THE COPIED TREE DOES NOT NEED.
#
# `worktree` copies the repository so a test can edit src/ inside it and run
# the real gate against the result. correspondence_gate.py reads exactly three
# places -- SRC = Path("src"), SPECS = Path("semantics/specs"), PROOFS =
# Path("semantics/proofs") (correspondence_gate.py:92-94) -- so everything
# below is verifiably unread by the subprocess under test.
#
# MEASURED locally, one copytree of this repository:
#
#   before   0.40s   63.9 MB   1594 files
#   after    0.03s    6.7 MB    198 files
#
# WHAT THIS DOES NOT DO, because the first draft of this change claimed it did:
# it has no effect in CI. A fresh checkout is 194 tracked files, and
# node_modules/, htmlcov/, .claude/ and the Playwright directories do not exist
# in the correspondence job at all -- `npm ci` runs only in the e2e workflow.
# So this cannot protect a GitHub benchmark from copy noise; there is no copy
# noise there to protect it from. The gain is local: three call sites, ~1.1s.
#
# `.venv` was already here and shutil.ignore_patterns applies at EVERY level of
# the walk, so the nested virtualenvs under technology-universe/runtimes/ were
# never copied either. The tree is 7.3 GB on disk and 63.9 MB of it reached the
# copy; assuming otherwise is what made the first draft of this comment wrong.
#
# `technology-universe` is deliberately NOT excluded. It is tracked repository
# content (64 files), and excluding tracked content is the one change here that
# could alter what the gate sees.
IGNORE = shutil.ignore_patterns(
    ".git",
    ".venv",
    "reports",
    "evidence",
    "__pycache__",
    ".hypothesis",
    ".pytest_cache",
    "node_modules",
    "htmlcov",
    "playwright-report",
    "test-results",
    ".claude",
)


def scope_to(w: Path, func: str) -> list[str]:
    """Reduce the worktree to the one function this test mutates.

    THE DUPLICATE THIS REMOVES. A mutation test edits exactly one file --
    `src/<func>.py` -- and then runs the full gate, which verifies EVERY source
    in the tree. correspondence_gate.py:99-102 globs `src/*.py`, and each one
    costs a kernel call to the hosted AXLE service
    (correspondence_gate.py:312).

    COUNTED, NOT ESTIMATED. Two tests in this file build a worktree and run the
    gate; a third calls `axle()` once directly and is unaffected. Four sources
    per gate run gives 2*4 + 1 = 9 calls, and scoping to one gives 2*1 + 1 = 3.
    Six calls removed -- every one of them a re-verification of a committed
    pair the test did not touch and the `correspondence` gate had already
    verified once, in the same job, before pytest ran.

    An earlier note here read "42 calls, of which 29" -- it assumed thirteen
    worktree-building tests when there are two. The GitHub measurement is what
    caught it: the axle suite went 22.27s -> 14.17s (runs 32371336445 and
    32374048401, `13 passed` in both), and 8.10s over six calls is 1.35s each
    against an 863ms AXLE health round trip. Twenty-nine removed calls could
    not have cost eight seconds.

    Re-verifying an unchanged committed pair proves nothing the gate has not
    already proven, and it does it on someone else's server.

    WHY REMOVAL RATHER THAN A CACHE. Reuse would need every identity field to
    match -- source hash, configuration, exact command, tool version, mutation
    identity, schema version -- and a cache that is wrong about any one of them
    reports a verification that never happened. Not running the redundant
    verification has no such failure mode: there is no stored result to be
    stale, mismatched, or forged.

    COMPLETENESS STAYS SATISFIED because both sides go together.
    correspondence_gate.py:192-193 compares the set of `src/*.py` stems against
    the set of `semantics/specs/*_semantics_spec.lean` stems and fails on any
    difference in either direction. Removing a source without its pair would
    trip `missing`; removing a pair without its source would trip `orphans`.
    They are removed as pairs, so the sets stay equal and the check still runs
    for real.

    Returns the names removed, so a caller can assert what was scoped away.
    """
    removed: list[str] = []
    for src in sorted((w / "src").glob("*.py")):
        if src.stem.startswith("_") or src.stem == func:
            continue
        spec = w / "semantics" / "specs" / f"{src.stem}_semantics_spec.lean"
        proof = w / "semantics" / "proofs" / f"{src.stem}_semantics_proof.lean"
        # FAIL CLOSED. Scope away a source only when its whole pair is present
        # and removable. A half-removed set would fail COMPLETENESS for a
        # reason that has nothing to do with the mutation under test, and a
        # test that fails for the wrong reason is worse than a slow one.
        if not (spec.is_file() and proof.is_file()):
            continue
        src.unlink()
        spec.unlink()
        proof.unlink()
        removed.append(src.stem)
    return removed


def worktree(
    tmp_path: Path,
    source: str,
    regenerate: bool,
    func: str = "add",
    scoped: bool = True,
) -> subprocess.CompletedProcess[str]:
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True, ignore=IGNORE)
    (w / f"src/{func}.py").write_text(source, encoding="utf-8")

    # `scoped=False` runs the gate over the whole tree, which is what every
    # caller did before. Kept as the escape hatch and as the control the
    # equivalence test below compares against.
    if scoped:
        # FAIL CLOSED on the mutated function itself: if its own pair is not
        # there, scope nothing and let the full gate run. Its absence is
        # exactly what some of these tests are checking for.
        own_spec = w / "semantics" / "specs" / f"{func}_semantics_spec.lean"
        own_proof = w / "semantics" / "proofs" / f"{func}_semantics_proof.lean"
        if own_spec.is_file() and own_proof.is_file():
            scope_to(w, func)

    (w / "reports").mkdir(exist_ok=True)
    if regenerate:
        subprocess.run(
            [PY, "scripts/gen_correspondence.py", "--function", func],
            cwd=w,
            capture_output=True,
            text=True,
            timeout=120,
        )
    return subprocess.run(
        [PY, "scripts/correspondence_gate.py"],
        cwd=w,
        capture_output=True,
        text=True,
        timeout=900,
    )


def layer(result: subprocess.CompletedProcess[str]) -> str:
    """Which defence stopped this, read off the gate's own report."""
    out = result.stdout + result.stderr
    if "outside the supported subset" in out:
        return "UNSUPPORTED"
    if "describes different Python" in out:
        return "FRESHNESS"
    if "kernel rejected" in out:
        return "KERNEL"
    if result.returncode == 0:
        return "ACCEPTED"
    return f"OTHER(rc={result.returncode})"


def mutate(text: str, old: str, new: str) -> str:
    """A replacement that silently matched nothing would test nothing."""
    assert old in text, f"clamp source no longer contains {old!r}"
    return text.replace(old, new)


CLAMP = (REPO / "src/clamp.py").read_text(encoding="utf-8")

# Six mutations, each in a different category, with the layer that was measured
# to catch it once the pair has been REGENERATED from the mutant. Without
# regenerating, every one of them is caught by FRESHNESS instead — that case is
# checked separately below.
NEGATIVE: dict[str, tuple[str, str, str]] = {
    # 1. THE MINIMUM ACCEPTANCE TEST, in the form the brief states it. Agrees
    #    with addition at all 12 sampled points and is a different function.
    #    Caught before any theorem exists: `IfExp` has no semantics here.
    "1a_min_acceptance_conditional_expression": (
        "add",
        "def add(a: int, b: int) -> int:\n    return a + b if a != 99991 else 0\n",
        "UNSUPPORTED",
    ),
    # 1b. The same mathematics, written INSIDE the subset so that a full pair is
    #     generated and the kernel is the thing that has to refuse it. All 12
    #     ground-truth points still hold; the property does not.
    "1b_min_acceptance_inside_the_subset": (
        "add",
        "def add(a: int, b: int) -> int:\n"
        "    if a == 99991:\n        return 0\n"
        "    return a + b\n",
        "KERNEL",
    ),
    # 2. Arithmetic mutation, both directions asked for.
    "2a_arithmetic_add_to_sub": (
        "add",
        "def add(a: int, b: int) -> int:\n    return a - b\n",
        "KERNEL",
    ),
    "2b_arithmetic_mul_to_add": (
        "multiply",
        "def multiply(a: int, b: int) -> int:\n    return a + b\n",
        "KERNEL",
    ),
    # 3. Comparison mutation in clamp's guard: `>` to `>=`.
    "3_comparison_gt_to_ge_in_guard": (
        "clamp",
        mutate(CLAMP, "if lo > hi:", "if lo >= hi:"),
        "KERNEL",
    ),
    # 4. Constant mutation.
    "4_constant_off_by_one": (
        "add",
        "def add(a: int, b: int) -> int:\n    return a + b + 1\n",
        "KERNEL",
    ),
    # 5. Nested branch: a SECOND guard, chosen so that it too agrees at all 12
    #    sampled points. The denotation is what makes the change legible — the
    #    residual goal carries `x = 99991`.
    "5_nested_second_guard": (
        "clamp",
        mutate(
            CLAMP,
            "    return max(lo, min(hi, x))",
            "    if x == 99991:\n        return lo\n    return max(lo, min(hi, x))",
        ),
        "KERNEL",
    ),
    # 6. Comparison direction swapped: the guard now fires on the valid range.
    "6_comparison_direction_swapped": (
        "clamp",
        mutate(CLAMP, "if lo > hi:", "if lo < hi:"),
        "KERNEL",
    ),
}


@pytest.mark.parametrize("name", sorted(NEGATIVE))
def test_mutant_without_regenerating_is_caught(tmp_path: Path, name: str) -> None:
    """The committed pair is self-consistent, so only a source comparison sees it.

    Not marked `axle`: the gate stops at freshness (or at the subset check) for
    the mutated function, so the assertion does not depend on the kernel.
    """
    func, source, _ = NEGATIVE[name]
    result = worktree(tmp_path, source, regenerate=False, func=func)
    caught = layer(result)
    print(f"\n{name} (not regenerated) -> {caught}")
    assert result.returncode != 0, f"{name} kept the claim without regenerating"
    expected = "UNSUPPORTED" if "conditional_expression" in name else "FRESHNESS"
    assert caught == expected, result.stdout[-2000:]


@pytest.mark.axle
@pytest.mark.parametrize("name", sorted(NEGATIVE))
def test_mutant_after_regenerating_is_still_refused(tmp_path: Path, name: str) -> None:
    """Regenerating is not an escape, and the layer that refuses is recorded."""
    func, source, expected = NEGATIVE[name]
    result = worktree(tmp_path, source, regenerate=True, func=func)
    caught = layer(result)
    print(f"\n{name} (regenerated) -> {caught}")
    assert result.returncode != 0, (
        f"{name} regenerated into an accepted proof — the theorem would be "
        "claimed of a program that does not satisfy it"
    )
    assert caught == expected, result.stdout[-2000:]


# --------------------------------------------------------------------------
# Attribution: WHICH kernel obligation refused, and which ones could not.
# --------------------------------------------------------------------------
def theorem_containing(proof: str, line: int) -> str:
    """The last `theorem` declared at or before `line`."""
    name = "<none>"
    for i, text in enumerate(proof.splitlines(), start=1):
        if i > line:
            break
        m = re.match(r"theorem (\S+)", text)
        if m:
            name = m.group(1)
    return name


def axle(spec: Path, proof: Path) -> dict[str, Any]:
    out = subprocess.run(
        ["axle", "verify-proof", "--environment", "lean-4.33.0", str(spec), str(proof)],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return cast("dict[str, Any]", json.loads(out.stdout))


def failing_theorems(payload: dict[str, Any], proof: str) -> set[str]:
    messages = payload.get("lean_messages")
    errors: list[Any] = []
    if isinstance(messages, dict):
        raw = cast("dict[str, Any]", messages).get("errors")
        if isinstance(raw, list):
            errors = cast("list[Any]", raw)
    found: set[str] = set()
    for e in errors:
        m = re.search(r"-:(\d+):", str(e))
        if m:
            found.add(theorem_containing(proof, int(m.group(1))))
    return found


@pytest.mark.axle
def test_the_min_acceptance_mutant_is_refused_by_the_property(tmp_path: Path) -> None:
    """Which obligation refuses `if a == 99991: return 0`, measured not assumed.

    The derived obligations cannot refuse it: regenerating rebuilt both the
    closed form and the recorded CPython outputs from the mutant, so both are
    true of the mutant. The hand-written property is what survives regeneration
    and it is what refuses. The denotation still did work — it is why the
    residual goal reads `if a = 99991 then some 0 else some (a + b)` instead of
    an unfolded interpreter.
    """
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True, ignore=IGNORE)
    (w / "src/add.py").write_text(
        "def add(a: int, b: int) -> int:\n"
        "    if a == 99991:\n        return 0\n    return a + b\n",
        encoding="utf-8",
    )
    gen = subprocess.run(
        [PY, "scripts/gen_correspondence.py", "--function", "add"],
        cwd=w,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert gen.returncode == 0, gen.stderr

    spec = w / "semantics/specs/add_semantics_spec.lean"
    proof = w / "semantics/proofs/add_semantics_proof.lean"
    text = proof.read_text(encoding="utf-8")
    # Compare the mathematics, not the elaboration. Lean needs `(99991 : Int)`
    # to fix the literal's type, so the rendered denotation carries ascriptions
    # the idealised form does not:
    #
    #   rendered  = (if a = (99991 : Int) then some (0 : Int) else some (a + b))
    #   idealised =  if a = 99991 then some 0 else some (a + b)
    #
    # Pinning the exact rendering would fail this test on a cosmetic change to
    # the generator while a real change to the mathematics slipped past, which
    # inverts what the test is for. Strip the ascriptions and collapse
    # whitespace, then assert the shape.
    idealised = re.sub(r"\((-?\w+) : Int\)", r"\1", text)
    idealised = re.sub(r"\s+", " ", idealised)
    assert "if a = 99991 then some 0 else some (a + b)" in idealised, (
        "the denotation must show the mutation as readable mathematics; "
        f"rendered form was: {text[text.find('add_ast_denotes') :][:200]!r}"
    )

    payload = axle(spec, proof)
    assert payload.get("okay") is not True, "the kernel accepted the mutant"
    failed = failing_theorems(payload, text)
    assert failed == {"add_ast_is_addition"}, failed
    assert "add_ast_denotes" not in failed, (
        "a derived obligation cannot refute a program it was derived from"
    )
    assert "add_ast_matches_cpython" not in failed, (
        "the mutant agrees with CPython at all 12 sampled points, which is "
        "exactly why point sampling could not be the primary link"
    )


@pytest.mark.axle
def test_a_renderer_that_lies_is_caught_by_the_kernel(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The denotation layer is load-bearing, and this is where it bears.

    Nothing in Python checks that `render_value` agrees with Lean's `eval`.
    Make it disagree — render `.sub` as `+` — and the kernel refuses the
    denotation theorem, while the 12-point correspondence, which never mentions
    the closed form, still holds. Two layers, independently.
    """
    import gen_correspondence as gen

    monkeypatch.setitem(pysem.VALUE_INFIX, "sub", "+")
    src = REPO / "src/subtract.py"
    e = pysem.emit(src, "subtract")
    e.ground_truth = pysem.observe(src, "subtract", e.params)
    assert e.denotation == "some (a + b)", "the sabotage did not take"

    spec_text, proof_text = gen.render(e)
    spec = tmp_path / "spec.lean"
    proof = tmp_path / "proof.lean"
    spec.write_text(spec_text, encoding="utf-8")
    proof.write_text(proof_text, encoding="utf-8")

    payload = axle(spec, proof)
    assert payload.get("okay") is not True, (
        "the kernel accepted a closed form that disagrees with `eval`"
    )
    failed = failing_theorems(payload, proof_text)
    assert failed == {"subtract_ast_denotes"}, failed


# --------------------------------------------------------------------------
# The gate must track MEANING, not bytes.
# --------------------------------------------------------------------------
@pytest.mark.axle
@pytest.mark.parametrize(
    "func,source",
    [
        ("add", "def add(a: int, b: int) -> int:\n    return b + a\n"),
        # The same guard, written the other way round. The closed form changes text
        # (`hi < lo` instead of `lo > hi`) and the kernel still accepts, because the
        # denotation is checked against `eval`, not against a stored string.
        ("clamp", mutate(CLAMP, "if lo > hi:", "if hi < lo:")),
    ],
)
def test_semantically_identical_rewrite_is_accepted(
    tmp_path: Path, func: str, source: str
) -> None:
    """Rejecting these would mean the gate tracks bytes, not meaning."""
    result = worktree(tmp_path, source, regenerate=True, func=func)
    assert result.returncode == 0, result.stdout[-2000:]


def test_a_source_with_no_correspondence_pair_is_caught(tmp_path: Path) -> None:
    """A new function must not slip outside the proof system unnoticed."""
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True, ignore=IGNORE)
    (w / "src/negate.py").write_text(
        "def negate(a: int) -> int:\n    return -a\n", encoding="utf-8"
    )
    (w / "reports").mkdir(exist_ok=True)
    result = subprocess.run(
        [PY, "scripts/correspondence_gate.py"],
        cwd=w,
        capture_output=True,
        text=True,
        timeout=900,
    )
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


def test_every_proof_requests_an_axiom_report_for_every_theorem() -> None:
    """Without `#print axioms` the audit silently stops running."""
    for p in sorted((REPO / "semantics/proofs").glob("*.lean")):
        text = p.read_text(encoding="utf-8")
        declared = re.findall(r"^theorem (\S+)", text, flags=re.MULTILINE)
        assert declared, p.name
        for name in declared:
            assert f"#print axioms {name}" in text, f"{p.name}: {name}"


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
    spec = REPO / "semantics/specs/add_semantics_spec.lean"
    proof = (REPO / "semantics/proofs/add_semantics_proof.lean").read_text(
        encoding="utf-8"
    )
    i = proof.index("theorem add_ast_is_addition")
    j = proof.index("#print axioms add_ast_denotes")
    sabotaged = (
        proof[:i] + "theorem add_ast_is_addition (a b : Int) :\n"
        "    evalFunc add_ast [a, b] = evalFunc add_ast [b, a]\n"
        "    ∧ evalFunc add_ast [a, (0 : Int)] = some a := by\n  sorry\n\n" + proof[j:]
    )
    bad = tmp_path / "sorry_proof.lean"
    bad.write_text(sabotaged, encoding="utf-8")

    payload = axle(spec, bad)
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
        "catch one that AXLE wrongly accepted"
    )

    sys.path.insert(0, str(SCRIPTS))
    import correspondence_gate as cg

    assert not cg.FOUNDATIONAL >= axioms, "sorryAx must not be foundational"


# --------------------------------------------------------------------------
# The excluded directories cannot change the verdict
#
# IGNORE exists to keep the copy small, and a copy that is smaller than the
# thing it stands in for is only safe while the gate never reads what was left
# out. That is a property of correspondence_gate.py, not of this test file, so
# it is asserted against the gate's own source rather than assumed.
# --------------------------------------------------------------------------
def test_the_gate_reads_nothing_this_copy_excludes() -> None:
    """correspondence_gate.py must not name any excluded directory.

    It declares its inputs at module level -- SRC, SPECS, PROOFS -- and reads
    nothing else from the tree. If a future edit taught it to read, say,
    node_modules, the copied worktree would silently stop containing what the
    gate needs and the test would fail for a reason nobody could see from the
    output.
    """
    source = (REPO / "scripts" / "correspondence_gate.py").read_text(encoding="utf-8")

    for excluded in (
        "node_modules",
        "htmlcov",
        "playwright-report",
        "test-results",
        ".hypothesis",
        ".pytest_cache",
    ):
        assert excluded not in source, (
            f"correspondence_gate.py now references {excluded!r}, which "
            "tests/test_correspondence.py excludes from the worktree copy. "
            "Either stop reading it or stop excluding it -- the copy must "
            "contain everything the gate reads."
        )


def test_excluded_directories_do_not_change_the_verdict(tmp_path: Path) -> None:
    """Plant every excluded directory, then prove the gate's answer is identical.

    The structural check above catches a gate that starts NAMING an excluded
    path. This catches the same class behaviourally: two runs over the same
    source, one with the directories present and one without, must agree on
    both exit code and stdout.
    """

    def verdict(extra: bool) -> tuple[int, str]:
        root = tmp_path / ("with" if extra else "without")
        w = root / "w"
        root.mkdir()
        shutil.copytree(REPO, w, symlinks=True, ignore=IGNORE)
        if extra:
            for name in (
                "node_modules",
                "htmlcov",
                "playwright-report",
                "test-results",
            ):
                planted = w / name
                planted.mkdir(parents=True, exist_ok=True)
                (planted / "planted.txt").write_text(
                    "content the gate must not read", encoding="utf-8"
                )
        (w / "reports").mkdir(exist_ok=True)
        out = subprocess.run(
            [PY, "scripts/correspondence_gate.py"],
            cwd=w,
            capture_output=True,
            text=True,
            timeout=900,
        )
        return out.returncode, out.stdout

    bare_code, bare_out = verdict(extra=False)
    planted_code, planted_out = verdict(extra=True)

    assert bare_code == planted_code, (
        "planting the excluded directories changed the gate's exit code; the "
        "copy is not independent of what IGNORE removes"
    )

    # The two run-varying fields are normalised out before comparing. The gate
    # stamps its report with the wall clock and its own elapsed time, so two
    # sequential runs over an identical tree differ in exactly those and in
    # nothing else. Comparing raw stdout would assert that both runs started at
    # the same instant and took the same number of milliseconds, which is not
    # the property under test and never holds.
    def stable(text: str) -> str:
        text = re.sub(r"\d{4}-\d{2}-\d{2}T[\d:.]+\+\d{2}:\d{2}", "<ts>", text)
        return re.sub(r"\b\d+ms\b", "<ms>", text)

    assert stable(bare_out) == stable(planted_out), (
        "planting the excluded directories changed the gate's output"
    )


# --------------------------------------------------------------------------
# Scoping the worktree to the mutated function
#
# Each kernel check costs one call to the hosted AXLE service, one per source
# in the tree. A mutation test edits one file, so verifying the other three
# re-proves committed pairs the `correspondence` gate already verified in the
# same job. These assert the scoping is correct WITHOUT calling AXLE: the call
# count is exactly the source count, so counting sources counts calls.
# --------------------------------------------------------------------------
def _scoped_tree(tmp_path: Path, func: str = "clamp") -> Path:
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True, ignore=IGNORE)
    scope_to(w, func)
    return w


def test_scoping_leaves_exactly_the_mutated_function(tmp_path: Path) -> None:
    """One source in, one kernel call out. This is the whole saving."""
    w = _scoped_tree(tmp_path, "clamp")

    sources = sorted(
        p.stem for p in (w / "src").glob("*.py") if not p.stem.startswith("_")
    )
    assert sources == ["clamp"], f"expected only clamp, got {sources}"

    specs = sorted(
        p.stem.removesuffix("_semantics_spec")
        for p in (w / "semantics" / "specs").glob("*_semantics_spec.lean")
    )
    assert specs == ["clamp"], f"pairs not scoped with their sources: {specs}"


def test_scoping_keeps_the_completeness_sets_equal(tmp_path: Path) -> None:
    """The check that would catch a half-removed set, asserted directly.

    correspondence_gate.py:192-193 fails on any difference in either
    direction. Removing a source without its pair trips `missing`; removing a
    pair without its source trips `orphans`. This is the invariant that makes
    scoping safe rather than merely smaller.
    """
    w = _scoped_tree(tmp_path, "add")

    srcs = {p.stem for p in (w / "src").glob("*.py") if not p.stem.startswith("_")}
    specs = {
        p.stem.removesuffix("_semantics_spec")
        for p in (w / "semantics" / "specs").glob("*_semantics_spec.lean")
    }
    proofs = {
        p.stem.removesuffix("_semantics_proof")
        for p in (w / "semantics" / "proofs").glob("*_semantics_proof.lean")
    }

    assert srcs == specs == proofs, (
        f"scoping left the sets unequal: sources={srcs} specs={specs} proofs={proofs}; "
        "the gate would fail COMPLETENESS for a reason unrelated to the mutation"
    )
    assert srcs, "scoping emptied the tree; the gate would fail 'nothing to verify'"


def test_a_source_whose_pair_is_missing_is_never_scoped_away(tmp_path: Path) -> None:
    """Fail closed. A half-present pair is left alone rather than half-removed.

    Removing a source but not its proof, or the reverse, would trip
    COMPLETENESS and fail the test for a reason that has nothing to do with the
    mutation under test.
    """
    w = tmp_path / "w"
    shutil.copytree(REPO, w, symlinks=True, ignore=IGNORE)
    victim = w / "semantics" / "proofs" / "multiply_semantics_proof.lean"
    assert victim.is_file(), "fixture assumption: multiply has a committed proof"
    victim.unlink()

    removed = scope_to(w, "add")

    assert "multiply" not in removed, (
        "a source with an incomplete pair was scoped away; the remaining half "
        "would trip COMPLETENESS"
    )
    assert (w / "src" / "multiply.py").is_file(), "multiply.py was removed anyway"


def test_the_mutated_function_is_always_verified(tmp_path: Path) -> None:
    """The saving must never come from skipping the thing under test."""
    for func in ("add", "clamp", "multiply", "subtract"):
        w = _scoped_tree(tmp_path / func, func)
        assert (w / "src" / f"{func}.py").is_file(), f"{func} was scoped away"
        assert (w / "semantics" / "specs" / f"{func}_semantics_spec.lean").is_file()
        assert (w / "semantics" / "proofs" / f"{func}_semantics_proof.lean").is_file()


def test_scoped_and_unscoped_reach_the_same_verdict(tmp_path: Path) -> None:
    """Equivalence, on a mutation that is refused before the kernel is reached.

    Uses an UNSUPPORTED construct so the gate returns its verdict from
    pysem.emit without a single AXLE call -- the property under test is that
    scoping does not change the answer, and proving that costs nothing on
    someone else's server.
    """
    bad = "def clamp(lo: int, hi: int, x: int) -> int:\n    return lo / hi\n"

    scoped = worktree(
        tmp_path / "scoped", bad, regenerate=False, func="clamp", scoped=True
    )
    whole = worktree(
        tmp_path / "whole", bad, regenerate=False, func="clamp", scoped=False
    )

    assert layer(scoped) == layer(whole), (
        f"scoping changed the verdict: scoped={layer(scoped)} whole={layer(whole)}"
    )
    assert scoped.returncode == whole.returncode, (
        f"scoping changed the exit code: {scoped.returncode} vs {whole.returncode}"
    )
