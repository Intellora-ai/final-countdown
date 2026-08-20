"""Regression corpus for the Lean spec parser in scripts/spec_to_test.py.

The parser is a correctness boundary: five mandatory gates score whatever it
returns. So this file tests two things and treats them as equally important.

  1. The 10 real specs still parse, and parse to the same record they always
     did. A silent change in what a spec MEANS is the failure that would not
     announce itself.
  2. Everything outside the declared subset RAISES, with the specific exception
     type, and never comes back as a partial or "best effort" record. Tests
     assert the exact class, because `SpecParseError` alone would also be
     satisfied by a tokenizer that gave up on valid input.

`pytest.raises(X)` accepts subclasses, so every "must raise" test also pins the
class explicitly with `type(...) is X` where the distinction carries meaning.
"""

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from spec_to_test import (  # noqa: E402
    App,
    BinOp,
    IntLit,
    SpecFileError,
    SpecParseError,
    SpecSyntaxError,
    SpecTokenizeError,
    UnsupportedConstructError,
    Var,
    expr_to_lean,
    expr_to_python,
    generate_hypothesis_test,
    parse_expression,
    parse_lean_spec,
    parse_spec_text,
    strip_comments,
)

SPECS_DIR = REPO / "specs"
REAL_SPECS = sorted(SPECS_DIR.glob("*_spec.lean"))

ADD_DEF = "def add (a b : Int) : Int := a + b\n"
CLAMP_DEF = "def clamp (lo hi x : Int) : Int := max lo (min hi x)\n"

# What the 10 real specs must keep meaning. Written out rather than computed so
# a change to the parser cannot quietly change the expectation with it.
EXPECTED: dict[str, dict[str, object]] = {
    "add_spec.lean": {
        "function_name": "add",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "add a b = add b a",
    },
    "addid_spec.lean": {
        "function_name": "add",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "add a 0 = a",
    },
    "addsucc_spec.lean": {
        "function_name": "add",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "add a 1 = a + 1",
    },
    "clamp_spec.lean": {
        "function_name": "clamp",
        "args": ["lo", "hi", "x"],
        "arg_type": "Int",
        "hypothesis": "lo ≤ hi",
        "property": "lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi",
    },
    "clampid_spec.lean": {
        "function_name": "clamp",
        "args": ["lo", "hi", "x"],
        "arg_type": "Int",
        "hypothesis": "lo ≤ x ∧ x ≤ hi",
        "property": "clamp lo hi x = x",
    },
    "mulid_spec.lean": {
        "function_name": "multiply",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "multiply a 1 = a",
    },
    "multiply_spec.lean": {
        "function_name": "multiply",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "multiply a b = multiply b a",
    },
    "subpred_spec.lean": {
        "function_name": "subtract",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "subtract a 1 = a - 1",
    },
    "subself_spec.lean": {
        "function_name": "subtract",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "subtract a a = 0",
    },
    "subtract_spec.lean": {
        "function_name": "subtract",
        "args": ["a", "b"],
        "arg_type": "Int",
        "hypothesis": "",
        "property": "subtract a 0 = a",
    },
}

# The Python each real spec must translate to. This is the string the gates
# actually execute, so it is the thing worth pinning.
EXPECTED_PYTHON: dict[str, tuple[str, str]] = {
    "add_spec.lean": ("add(a, b) == add(b, a)", ""),
    "addid_spec.lean": ("add(a, 0) == a", ""),
    "addsucc_spec.lean": ("add(a, 1) == a + 1", ""),
    "clamp_spec.lean": (
        "lo <= clamp(lo, hi, x) and clamp(lo, hi, x) <= hi",
        "lo <= hi",
    ),
    "clampid_spec.lean": ("clamp(lo, hi, x) == x", "lo <= x and x <= hi"),
    "mulid_spec.lean": ("multiply(a, 1) == a", ""),
    "multiply_spec.lean": ("multiply(a, b) == multiply(b, a)", ""),
    "subpred_spec.lean": ("subtract(a, 1) == a - 1", ""),
    "subself_spec.lean": ("subtract(a, a) == 0", ""),
    "subtract_spec.lean": ("subtract(a, 0) == a", ""),
}


def write_spec(tmp_path: Path, text: str, name: str = "add_spec.lean") -> str:
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return str(path)


# ==========================================================================
# 1. The 10 real specs
# ==========================================================================


def test_there_are_ten_real_specs() -> None:
    """A parametrised test over an empty glob passes having checked nothing."""
    assert len(REAL_SPECS) == 10, [p.name for p in REAL_SPECS]
    assert {p.name for p in REAL_SPECS} == set(EXPECTED)


@pytest.mark.parametrize("spec", REAL_SPECS, ids=lambda p: p.name)
def test_real_spec_parses(spec: Path) -> None:
    info = parse_lean_spec(str(spec))
    expected = EXPECTED[spec.name]
    for key, value in expected.items():
        assert info[key] == value, f"{spec.name}: {key}"
    assert info["has_def"] is True
    assert info["property_ast"] is not None


@pytest.mark.parametrize("spec", REAL_SPECS, ids=lambda p: p.name)
def test_real_spec_translates_to_the_same_python(spec: Path) -> None:
    """The executed claim, not the human-readable Lean, is what gates score."""
    info = parse_lean_spec(str(spec))
    claim, guard = EXPECTED_PYTHON[spec.name]
    assert expr_to_python(info["property_ast"]) == claim
    if guard:
        assert expr_to_python(info["hypothesis_ast"]) == guard
    else:
        assert info["hypothesis_ast"] is None


@pytest.mark.parametrize("spec", REAL_SPECS, ids=lambda p: p.name)
def test_real_spec_round_trips_through_lean(spec: Path) -> None:
    """Rendered Lean must re-parse to the identical tree, or the string the
    record shows a human is not the tree the gate scored."""
    info = parse_lean_spec(str(spec))
    again = parse_expression(
        info["property"], bound=info["args"], calls=(info["function_name"],)
    )
    assert again == info["property_ast"]


@pytest.mark.parametrize("spec", REAL_SPECS, ids=lambda p: p.name)
def test_generated_test_is_valid_python(spec: Path) -> None:
    import ast

    ast.parse(generate_hypothesis_test(parse_lean_spec(str(spec))))


# ==========================================================================
# 2. Malformed syntax
# ==========================================================================


def test_unbalanced_open_paren_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : (add a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert "expected `)`" in caught.value.message


def test_unbalanced_close_paren_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a b) = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(path)


def test_unbalanced_binder_paren_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(path)


def test_missing_assign_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a b = add b a by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert ":=" in caught.value.message


def test_truncated_theorem_raises(tmp_path: Path) -> None:
    path = write_spec(tmp_path, ADD_DEF + "theorem add_spec (a b : Int) :\n")
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert caught.value.text == "<end of input>"


def test_theorem_without_spec_suffix_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_comm (a b : Int) : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "_spec" in caught.value.message


def test_theorem_without_matching_def_raises(tmp_path: Path) -> None:
    """`def add` + `theorem clamp_spec` used to parse and be scored against
    src/add.py — a claim about one function checked against another."""
    path = write_spec(
        tmp_path, ADD_DEF + ("theorem clamp_spec (a b : Int) : a = b := by sorry\n")
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "def clamp" in caught.value.message


def test_two_theorems_raise(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + (
            "theorem add_spec (a b : Int) : add a b = add b a := by sorry\n"
            "theorem add_spec (a b : Int) : add a 0 = a := by sorry\n"
        ),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "exactly one theorem" in caught.value.message


def test_chained_comparison_raises(tmp_path: Path) -> None:
    """`lo ≤ x ≤ hi` is Lean-invalid and Python-legal-but-different."""
    path = write_spec(
        tmp_path,
        CLAMP_DEF + ("theorem clamp_spec (lo hi x : Int) : lo ≤ x ≤ hi := by sorry\n"),
        "clamp_spec.lean",
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "chain" in caught.value.message


def test_unbound_variable_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a b = add b c := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert caught.value.text == "c"


def test_junk_before_the_theorem_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "hello world\n"
        + ADD_DEF
        + ("theorem add_spec (a b : Int) : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(path)


def test_missing_file_raises_spec_file_error(tmp_path: Path) -> None:
    with pytest.raises(SpecFileError) as caught:
        parse_lean_spec(str(tmp_path / "does_not_exist_spec.lean"))
    assert type(caught.value) is SpecFileError
    assert isinstance(caught.value, SpecParseError)


# ==========================================================================
# 3. Nested expressions with parentheses
# ==========================================================================


def test_nested_parentheses_in_def_body(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        CLAMP_DEF
        + (
            "theorem clamp_spec (lo hi x : Int) : "
            "clamp lo hi x = max lo (min hi x) := by sorry\n"
        ),
        "clamp_spec.lean",
    )
    info = parse_lean_spec(path)
    assert info["property_ast"] == BinOp(
        "=",
        App("clamp", (Var("lo"), Var("hi"), Var("x"))),
        App("max", (Var("lo"), App("min", (Var("hi"), Var("x"))))),
    )
    assert expr_to_python(info["property_ast"]) == (
        "clamp(lo, hi, x) == max(lo, min(hi, x))"
    )


def test_deeply_nested_parentheses(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + (
            "theorem add_spec (a b : Int) : "
            "add (add a (add b a)) b = add b (add (add a b) a) := by sorry\n"
        ),
    )
    info = parse_lean_spec(path)
    assert expr_to_python(info["property_ast"]) == (
        "add(add(a, add(b, a)), b) == add(b, add(add(a, b), a))"
    )


def test_redundant_parentheses_do_not_change_the_tree() -> None:
    bare = parse_expression("a + b * c", bound=["a", "b", "c"])
    parenthesised = parse_expression("(a + (b * c))", bound=["a", "b", "c"])
    assert bare == parenthesised


# ==========================================================================
# 4. Multiple hypotheses
# ==========================================================================


def test_two_hypothesis_binders_are_conjoined(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        CLAMP_DEF
        + (
            "theorem clamp_spec (lo hi x : Int) (h1 : lo ≤ x) (h2 : x ≤ hi) : "
            "clamp lo hi x = x := by sorry\n"
        ),
        "clamp_spec.lean",
    )
    info = parse_lean_spec(path)
    assert info["hypothesis"] == "lo ≤ x ∧ x ≤ hi"
    assert expr_to_python(info["hypothesis_ast"]) == "lo <= x and x <= hi"


def test_three_hypothesis_binders_are_conjoined(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        CLAMP_DEF
        + (
            "theorem clamp_spec (lo hi x : Int) (h1 : lo ≤ x) (h2 : x ≤ hi) "
            "(h3 : lo ≤ hi) : clamp lo hi x = x := by sorry\n"
        ),
        "clamp_spec.lean",
    )
    info = parse_lean_spec(path)
    assert info["hypothesis"] == "lo ≤ x ∧ x ≤ hi ∧ lo ≤ hi"


def test_hypothesis_with_conjunction_inside_it(tmp_path: Path) -> None:
    info = parse_lean_spec(str(SPECS_DIR / "clampid_spec.lean"))
    assert info["hypothesis_ast"] == BinOp(
        "∧", BinOp("≤", Var("lo"), Var("x")), BinOp("≤", Var("x"), Var("hi"))
    )


def test_no_hypothesis_is_empty_not_missing(tmp_path: Path) -> None:
    info = parse_lean_spec(str(SPECS_DIR / "add_spec.lean"))
    assert info["hypothesis"] == ""
    assert info["hypothesis_ast"] is None


# ==========================================================================
# 5. Unsupported constructs — must RAISE, never parse
# ==========================================================================

UNSUPPORTED_CLAIMS: list[tuple[str, str]] = [
    ("lambda-fun", "add a b = (fun x => x) a"),
    ("lambda-sigil", "add a b = (λ x, x) a"),
    ("match", "add a b = match a with | _ => b"),
    ("sigma", "add a b = Σ x : Int, x"),
    ("forall", "∀ c : Int, add a b = add b a"),
    ("exists", "∃ c : Int, add a b = c"),
    ("arrow", "a ≤ b → add a b = add b a"),
    ("iff", "a ≤ b ↔ add a b = add b a"),
    ("negation", "¬ (add a b = add b a)"),
    ("division", "add a b = a / b"),
    ("modulo", "add a b = a % b"),
    ("anonymous-constructor", "add a b = ⟨a, b⟩"),
    ("if-then-else", "add a b = if a ≤ b then a else b"),
    ("let-binding", "add a b = let c := a; c"),
    ("placeholder", "add a b = _"),
    ("field-access", "add a b = a.succ"),
]


@pytest.mark.parametrize(
    "label,claim", UNSUPPORTED_CLAIMS, ids=[label for label, _ in UNSUPPORTED_CLAIMS]
)
def test_unsupported_construct_in_claim_raises(
    label: str, claim: str, tmp_path: Path
) -> None:
    path = write_spec(
        tmp_path, ADD_DEF + (f"theorem add_spec (a b : Int) : {claim} := by sorry\n")
    )
    with pytest.raises(UnsupportedConstructError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is UnsupportedConstructError
    assert caught.value.text
    assert caught.value.position > 0
    assert "supported Lean subset" in caught.value.message


def test_typeclass_binder_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + ("theorem add_spec [Foo α] (a b : Int) : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(UnsupportedConstructError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is UnsupportedConstructError
    assert caught.value.text == "["
    assert "typeclass" in caught.value.message


def test_implicit_binder_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + ("theorem add_spec {x : Int} (a b : Int) : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(UnsupportedConstructError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is UnsupportedConstructError
    assert caught.value.text == "{"
    assert "implicit" in caught.value.message


def test_instance_binder_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + (
            "theorem add_spec (a b : Int) [Inhabited Int] : add a b = add b a "
            ":= by sorry\n"
        ),
    )
    with pytest.raises(UnsupportedConstructError):
        parse_lean_spec(path)


def test_unsupported_type_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Float) : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert caught.value.text == "Float"


def test_mixed_binder_types_raise(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + ("theorem add_spec (a : Int) (b : Nat) : add a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "mix types" in caught.value.message


def test_tactic_block_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + (
            "theorem add_spec (a b : Int) : add a b = add b a := by\n"
            "  simp [Int.add_comm]\n"
        ),
    )
    with pytest.raises(SpecParseError):
        parse_lean_spec(path)


def test_unknown_character_raises_tokenize_error(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a b # add b a := by sorry\n"),
    )
    with pytest.raises(SpecTokenizeError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecTokenizeError
    assert caught.value.text == "#"


def test_applying_something_that_is_not_a_function_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : a b = add b a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "applied to arguments" in caught.value.message


def test_bare_function_reference_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path, ADD_DEF + ("theorem add_spec (a b : Int) : add = add := by sorry\n")
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "must be applied" in caught.value.message


# ==========================================================================
# 6. Confusing formatting
# ==========================================================================


def test_extra_whitespace_everywhere(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "def   add   (  a   b   :   Int  )  :  Int  :=  a  +  b\n"
        "theorem    add_spec   (   a   b   :   Int   )   :   \n"
        "     add    a    b    =    add    b    a    :=   by   sorry\n",
    )
    info = parse_lean_spec(path)
    assert info["property"] == "add a b = add b a"
    assert info["args"] == ["a", "b"]


def test_newlines_mid_expression(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + (
            "theorem add_spec (a b : Int) :\n"
            "    add\n"
            "      a\n"
            "      b\n"
            "  =\n"
            "    add\n"
            "      b\n"
            "      a\n"
            "  := by sorry\n"
        ),
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_tabs_are_whitespace(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "def\tadd\t(a\tb\t:\tInt)\t:\tInt\t:=\ta\t+\tb\n"
        "theorem\tadd_spec\t(a\tb\t:\tInt)\t:\t"
        "add\ta\tb\t=\tadd\tb\ta\t:=\tby\tsorry\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_everything_on_one_line(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        (
            "def add (a b : Int) : Int := a + b "
            "theorem add_spec (a b : Int) : add a b = add b a := by sorry"
        ),
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_crlf_line_endings(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF.replace("\n", "\r\n")
        + ("theorem add_spec (a b : Int) :\r\n    add a b = add b a := by sorry\r\n"),
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


# ==========================================================================
# 7. Comments
# ==========================================================================


def test_line_comment_is_ignored(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "-- a leading note\n" + ADD_DEF + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry  -- trailing note\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_block_comment_is_ignored(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "/- a block\n   over lines -/\n" + ADD_DEF + "theorem add_spec (a b : Int) : "
        "add /- inline -/ a b = add b a := by sorry\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_nested_block_comments(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "/- outer /- inner -/ still outer -/\n"
        + ADD_DEF
        + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_comment_containing_a_theorem_cannot_be_parsed(tmp_path: Path) -> None:
    """The whole point: commented-out text must contribute zero tokens.

    A `--`-scanner that only ran after tokenizing would see two theorems here
    and either fail or pick the wrong one.
    """
    path = write_spec(
        tmp_path,
        "-- theorem add_spec (a b : Int) : add a b = 0 := by sorry\n"
        "/- theorem add_spec (a b : Int) : add a b = 1 := by sorry -/\n"
        + ADD_DEF
        + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry\n",
    )
    info = parse_lean_spec(path)
    assert info["property"] == "add a b = add b a"


def test_comment_containing_unsupported_constructs_is_inert(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "-- λ x, match x with | Σ → ¬ [Foo α] {y : Int}\n"
        "/- fun z => z / 0 ∀ ∃ ⟨⟩ -/\n" + ADD_DEF + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_block_comment_start_inside_a_line_comment_is_inert(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "-- /- not a real block open\n" + ADD_DEF + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_line_comment_marker_inside_a_block_comment_is_inert(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "/- -- still inside the block\n-/\n"
        + ADD_DEF
        + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry\n",
    )
    assert parse_lean_spec(path)["property"] == "add a b = add b a"


def test_unterminated_block_comment_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "/- never closed\n" + ADD_DEF + "theorem add_spec (a b : Int) : "
        "add a b = add b a := by sorry\n",
    )
    with pytest.raises(SpecTokenizeError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecTokenizeError
    assert "unterminated" in caught.value.message


def test_stripping_preserves_offsets_and_lines() -> None:
    """Reported positions must point at the real file, not a rewritten copy."""
    text = "-- xx\n/- yy -/\nabc\n"
    stripped = strip_comments(text)
    assert len(stripped) == len(text)
    assert stripped.count("\n") == text.count("\n")
    assert stripped.index("abc") == text.index("abc")
    assert stripped == "     \n        \nabc\n"


def test_position_in_error_points_at_the_real_line(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "-- padding comment line\n"
        + ADD_DEF
        + "theorem add_spec (a b : Int) : add a b = a # b "
        ":= by sorry\n",
    )
    with pytest.raises(SpecTokenizeError) as caught:
        parse_lean_spec(path)
    assert caught.value.line == 3
    assert Path(path).read_text(encoding="utf-8")[caught.value.position] == "#"


# ==========================================================================
# 8. Identifiers: shadowing and unicode
# ==========================================================================


def test_unicode_binder_names_parse(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "def add (α β : Int) : Int := α + β\n"
        "theorem add_spec (α β : Int) : add α β = add β α "
        ":= by sorry\n",
    )
    info = parse_lean_spec(path)
    assert info["args"] == ["α", "β"]
    assert expr_to_python(info["property_ast"]) == "add(α, β) == add(β, α)"


def test_unicode_function_name_parses(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        "def sumá (a b : Int) : Int := a + b\n"
        "theorem sumá_spec (a b : Int) : sumá a b = sumá b a "
        ":= by sorry\n",
        "suma_spec.lean",
    )
    assert parse_lean_spec(path)["function_name"] == "sumá"


def test_binder_shadowing_a_builtin_call_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + ("theorem add_spec (a max : Int) : add a max = add max a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert "shadows" in caught.value.message


def test_binder_shadowing_the_function_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a add : Int) : add a add = a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "shadows" in caught.value.message


def test_binder_named_like_a_python_operator_keyword_raises(tmp_path: Path) -> None:
    """`and` is a legal Lean identifier and a Python keyword. Translating it
    would emit `add(and, b)`, which is not Python at all."""
    path = write_spec(
        tmp_path,
        ADD_DEF
        + ("theorem add_spec (a and : Int) : add a and = add and a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert "Python keyword" in caught.value.message


def test_binder_named_not_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF
        + ("theorem add_spec (a not : Int) : add a not = add not a := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(path)


def test_duplicate_binder_name_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path, ADD_DEF + ("theorem add_spec (a a : Int) : add a a = a := by sorry\n")
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert "twice" in caught.value.message


def test_identifier_prefixed_with_a_type_name_is_not_a_type(tmp_path: Path) -> None:
    """`Intx` must tokenize as one identifier, not as `Int` followed by `x`."""
    path = write_spec(
        tmp_path,
        "def add (Intx b : Int) : Int := Intx + b\n"
        "theorem add_spec (Intx b : Int) : "
        "add Intx b = add b Intx := by sorry\n",
    )
    assert parse_lean_spec(path)["args"] == ["Intx", "b"]


def test_a_type_name_used_as_a_value_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a Int = b := by sorry\n"),
    )
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert caught.value.text == "Int"


# ==========================================================================
# 9. Integer literals
# ==========================================================================


def test_zero_literal(tmp_path: Path) -> None:
    info = parse_lean_spec(str(SPECS_DIR / "addid_spec.lean"))
    assert info["property_ast"] == BinOp(
        "=", App("add", (Var("a"), IntLit(0))), Var("a")
    )


def test_negative_literal_folds_into_the_literal(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a (-1) = a - 1 := by sorry\n"),
    )
    info = parse_lean_spec(path)
    assert info["property_ast"] == BinOp(
        "=", App("add", (Var("a"), IntLit(-1))), BinOp("-", Var("a"), IntLit(1))
    )
    assert expr_to_python(info["property_ast"]) == "add(a, -1) == a - 1"


def test_negative_literal_round_trips_through_lean(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a (-1) = a - 1 := by sorry\n"),
    )
    info = parse_lean_spec(path)
    assert info["property"] == "add a (-1) = a - 1"
    assert (
        parse_expression(info["property"], bound=["a", "b"], calls=("add",))
        == info["property_ast"]
    )


def test_large_literal_keeps_full_precision(tmp_path: Path) -> None:
    big = 10**30 + 7
    path = write_spec(
        tmp_path,
        ADD_DEF
        + (f"theorem add_spec (a b : Int) : add a {big} = a + {big} := by sorry\n"),
    )
    info = parse_lean_spec(path)
    assert info["property_ast"] == BinOp(
        "=", App("add", (Var("a"), IntLit(big))), BinOp("+", Var("a"), IntLit(big))
    )


def test_double_negation_is_not_folded(tmp_path: Path) -> None:
    node = parse_expression("- (-3)", bound=[])
    assert node == IntLit(3)


def test_unary_minus_on_a_variable_is_a_unary_node() -> None:
    from spec_to_test import UnaryOp

    assert parse_expression("-a", bound=["a"]) == UnaryOp("-", Var("a"))
    assert expr_to_python(parse_expression("-a", bound=["a"])) == "-a"


# ==========================================================================
# 10. Empty and comment-only files
# ==========================================================================


def test_empty_file_raises(tmp_path: Path) -> None:
    path = write_spec(tmp_path, "")
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert "no `theorem" in caught.value.message


def test_whitespace_only_file_raises(tmp_path: Path) -> None:
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(write_spec(tmp_path, "   \n\t\n  \n"))


def test_comment_only_file_raises(tmp_path: Path) -> None:
    path = write_spec(tmp_path, "-- nothing here\n/- nor here -/\n")
    with pytest.raises(SpecSyntaxError) as caught:
        parse_lean_spec(path)
    assert type(caught.value) is SpecSyntaxError
    assert "no `theorem" in caught.value.message


def test_def_without_theorem_raises(tmp_path: Path) -> None:
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(write_spec(tmp_path, ADD_DEF))


def test_theorem_without_any_def_raises(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path, "theorem add_spec (a b : Int) : add a b = add b a := by sorry\n"
    )
    with pytest.raises(SpecSyntaxError):
        parse_lean_spec(path)


# ==========================================================================
# 11. Operator precedence and associativity
# ==========================================================================


def test_multiplication_binds_tighter_than_addition() -> None:
    node = parse_expression("a + b * c", bound=["a", "b", "c"])
    assert node == BinOp("+", Var("a"), BinOp("*", Var("b"), Var("c")))
    assert node != BinOp("*", BinOp("+", Var("a"), Var("b")), Var("c"))


def test_multiplication_binds_tighter_on_the_left_too() -> None:
    node = parse_expression("a * b + c", bound=["a", "b", "c"])
    assert node == BinOp("+", BinOp("*", Var("a"), Var("b")), Var("c"))


def test_subtraction_is_left_associative() -> None:
    node = parse_expression("a - b - c", bound=["a", "b", "c"])
    assert node == BinOp("-", BinOp("-", Var("a"), Var("b")), Var("c"))
    assert node != BinOp("-", Var("a"), BinOp("-", Var("b"), Var("c")))


def test_addition_is_left_associative() -> None:
    node = parse_expression("a + b + c", bound=["a", "b", "c"])
    assert node == BinOp("+", BinOp("+", Var("a"), Var("b")), Var("c"))


def test_parentheses_override_precedence() -> None:
    node = parse_expression("(a + b) * c", bound=["a", "b", "c"])
    assert node == BinOp("*", BinOp("+", Var("a"), Var("b")), Var("c"))
    assert expr_to_python(node) == "(a + b) * c"
    assert expr_to_lean(node) == "(a + b) * c"


def test_parentheses_override_associativity() -> None:
    node = parse_expression("a - (b - c)", bound=["a", "b", "c"])
    assert node == BinOp("-", Var("a"), BinOp("-", Var("b"), Var("c")))
    assert expr_to_python(node) == "a - (b - c)"


def test_comparison_binds_looser_than_arithmetic() -> None:
    node = parse_expression("a + b ≤ c * a", bound=["a", "b", "c"])
    assert node == BinOp(
        "≤", BinOp("+", Var("a"), Var("b")), BinOp("*", Var("c"), Var("a"))
    )


def test_conjunction_binds_looser_than_comparison() -> None:
    node = parse_expression("a ≤ b ∧ b ≤ c", bound=["a", "b", "c"])
    assert node == BinOp(
        "∧", BinOp("≤", Var("a"), Var("b")), BinOp("≤", Var("b"), Var("c"))
    )


def test_disjunction_binds_looser_than_conjunction() -> None:
    node = parse_expression("a < b ∧ b < c ∨ a < c", bound=["a", "b", "c"])
    assert node == BinOp(
        "∨",
        BinOp("∧", BinOp("<", Var("a"), Var("b")), BinOp("<", Var("b"), Var("c"))),
        BinOp("<", Var("a"), Var("c")),
    )


def test_conjunction_is_left_associative() -> None:
    node = parse_expression("a < b ∧ b < c ∧ c < a", bound=["a", "b", "c"])
    assert node == BinOp(
        "∧",
        BinOp("∧", BinOp("<", Var("a"), Var("b")), BinOp("<", Var("b"), Var("c"))),
        BinOp("<", Var("c"), Var("a")),
    )


def test_application_binds_tighter_than_every_operator() -> None:
    node = parse_expression("add a 1 = a + 1", bound=["a"], calls=("add",))
    assert node == BinOp(
        "=", App("add", (Var("a"), IntLit(1))), BinOp("+", Var("a"), IntLit(1))
    )


def test_rendered_python_reparses_to_the_same_grouping() -> None:
    import ast

    for text in ("a + b * c", "a - b - c", "(a + b) * c", "a - (b - c)"):
        node = parse_expression(text, bound=["a", "b", "c"])
        rendered = expr_to_python(node)
        assert ast.dump(ast.parse(rendered, mode="eval")) == ast.dump(
            ast.parse(text.replace("−", "-"), mode="eval")
        )


# ==========================================================================
# 12. Fail closed — the callers, not just the parser
# ==========================================================================

BROKEN_SPEC = (
    "def add (a b : Int) : Int := a + b\n"
    "theorem add_spec (a b : Int) : add a b = λ x, x := by sorry\n"
)

FAIL_CLOSED_GATES: list[list[str]] = [
    ["scripts/check_vacuity.py"],
    ["scripts/find_counterexample.py"],
    ["scripts/check_composition.py", "--min-strength", "0.9"],
    ["scripts/mutation_gate.py", "--min-score", "0.95"],
    ["scripts/truth_gate.py"],
    ["scripts/contract_strength.py"],
    ["scripts/sufficiency_loop.py"],
]


@pytest.mark.parametrize(
    "gate", FAIL_CLOSED_GATES, ids=[Path(g[0]).stem for g in FAIL_CLOSED_GATES]
)
def test_gate_fails_closed_on_an_unparsable_spec(
    gate: list[str], tmp_path: Path
) -> None:
    """An unparsable spec must FAIL the gate, never be skipped over.

    The spec is placed alongside a real, passing one so the gate has something
    it could have scored: exiting 0 here would mean the broken spec silently
    dropped out of the set.
    """
    broken = tmp_path / "add_spec.lean"
    broken.write_text(BROKEN_SPEC, encoding="utf-8")
    result = subprocess.run(
        [sys.executable, *gate[:1], "specs/add_spec.lean", str(broken), *gate[1:]],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert result.returncode != 0, (
        f"{gate[0]} exited 0 with an unparsable spec in the set:\n"
        f"{result.stdout}\n{result.stderr}"
    )


def test_spec_to_test_cli_fails_closed(tmp_path: Path) -> None:
    broken = tmp_path / "add_spec.lean"
    broken.write_text(BROKEN_SPEC, encoding="utf-8")
    result = subprocess.run(
        [
            sys.executable,
            "scripts/spec_to_test.py",
            str(broken),
            str(tmp_path / "out.py"),
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 1
    assert not (tmp_path / "out.py").exists()


def test_parse_lean_spec_never_returns_none() -> None:
    """The old contract was `dict | None` and three callers treated None as
    "skip". The type is now total: failure is an exception."""
    import inspect

    signature = inspect.signature(parse_lean_spec)
    assert "None" not in str(signature.return_annotation)


def test_every_parser_error_is_a_spec_parse_error() -> None:
    for cls in (
        SpecFileError,
        SpecTokenizeError,
        UnsupportedConstructError,
        SpecSyntaxError,
    ):
        assert issubclass(cls, SpecParseError)


def test_errors_carry_text_and_position(tmp_path: Path) -> None:
    path = write_spec(
        tmp_path,
        ADD_DEF + ("theorem add_spec (a b : Int) : add a b = a ∀ b := by sorry\n"),
    )
    with pytest.raises(SpecParseError) as caught:
        parse_lean_spec(path)
    error = caught.value
    assert error.text == "∀"
    assert error.spec_file == path
    assert error.line == 2
    assert error.column > 0
    assert Path(path).read_text(encoding="utf-8")[error.position] == "∀"


def test_parse_spec_text_accepts_text_without_a_file(tmp_path: Path) -> None:
    parsed = parse_spec_text(
        ADD_DEF + "theorem add_spec (a b : Int) : add a b = add b a := by sorry\n"
    )
    assert parsed.theorem.function_name == "add"
    assert [d.name for d in parsed.defs] == ["add"]


def test_lean_expr_to_python_raises_instead_of_guessing() -> None:
    from spec_to_test import lean_expr_to_python

    assert lean_expr_to_python("add a b = add b a", "add", ["a", "b"]) == (
        "add(a, b) == add(b, a)"
    )
    with pytest.raises(SpecParseError):
        lean_expr_to_python("add a b = λ x, x", "add", ["a", "b"])
    with pytest.raises(SpecSyntaxError):
        lean_expr_to_python("add a b = add b a )", "add", ["a", "b"])
