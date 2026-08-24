#!/usr/bin/env python3
"""
SPEC -> TEST: Auto-generate Hypothesis tests from Lean specs.

Example:
  Lean:   theorem add_spec (a b : Int) : add a b = add b a := by sorry
  Python: @given(...) def test_add_spec(a, b): assert add(a, b) == add(b, a)

The claim is translated, not pattern-matched against English words. A property
containing "comm" is not how you detect commutativity — `add a b = add b a`
contains no such substring, which is why matching on it produced
`assert add(a, b) is not None`: a test that passes for any implementation.

===========================================================================
WHY THIS IS A TOKENIZER AND A PARSER, NOT A REGEX
===========================================================================
The dict this module returns feeds five mandatory CI gates: spec_strength,
mutation_gate, check_vacuity, find_counterexample and check_composition (via
spec_strength.evaluate). A MISPARSE is worse than a parse failure: the gates
then score a property that is not the one written, pass, and report green.

A regex has no notion of nesting, precedence or "the rest of the input", so
every unanticipated construct silently produced a partial, plausible-looking
capture. The rule here is the opposite:

    ANY token, construct or shape outside the grammar below raises
    SpecParseError. There is no partial result, no "best effort", and no
    None return. Callers cannot mistake a failure for a skip.

===========================================================================
THE SUPPORTED LEAN SUBSET — everything else is unsupported, by construction
===========================================================================

FILE
    file        ::= decl* theorem_decl decl*      (exactly one theorem_decl)
    decl        ::= def_decl | theorem_decl

    Comments are stripped before tokenizing: `-- to end of line` and nestable
    `/- ... -/` blocks. Stripped text is replaced by spaces of equal length so
    reported offsets still refer to the real file. A comment therefore cannot
    contribute a single token to the parse.

DECLARATIONS
    def_decl    ::= 'def' ident value_binder+ ':' type ':=' expr
    theorem_decl::= 'theorem' ident binder+ ':' expr ':=' 'by' ident

    * The theorem's name MUST end in `_spec`. `function_name` is the name with
      that exact suffix removed (`add_spec` -> `add`).
    * A `def` declaring `function_name` MUST appear BEFORE the theorem.
    * The proof body is `by <single-identifier>` (in practice `by sorry`).
      Tactic blocks are NOT parsed and NOT supported.

BINDERS
    binder        ::= value_binder | hypothesis_binder
    value_binder  ::= '(' ident+ ':' type ')'
    hypothesis_binder ::= '(' ident ':' expr ')'
    type          ::= 'Int' | 'Nat' | 'Bool'

    * A group is a value binder iff its annotation is exactly one `type` token
      followed by `)`. Otherwise it is a hypothesis binder and its annotation
      is parsed as an expression.
    * Every value binder in a theorem must carry the SAME type; that type is
      reported as `arg_type` and picks the Hypothesis strategy.
    * Zero or more hypothesis binders are allowed. Two or more are conjoined
      with `∧` in declaration order.
    * Binder names must be valid Python identifiers (so unicode names such as
      `α` are fine), must not be Python keywords, and must not shadow `min`,
      `max`, `abs` or any `def` in the file.

EXPRESSIONS  (lowest precedence first; all binary operators left-associative
              except comparison, which is non-associative)
    or_expr     ::= and_expr ( '∨' and_expr )*
    and_expr    ::= cmp_expr ( '∧' cmp_expr )*
    cmp_expr    ::= add_expr [ ('=' | '≠' | '≤' | '<' | '≥' | '>') add_expr ]
    add_expr    ::= mul_expr ( ('+' | '-') mul_expr )*
    mul_expr    ::= unary ( '*' unary )*
    unary       ::= '-' unary | app
    app         ::= atom+            (head must be an identifier; juxtaposition)
    atom        ::= ident | integer | '(' or_expr ')'

    * Application binds tighter than every operator: `add a 1 = a + 1` parses
      as `(add a 1) = (a + 1)`.
    * `-` immediately before an integer literal folds into a negative literal:
      `-5` is IntLit(-5), not Neg(IntLit(5)).
    * Application heads are restricted to `min`, `max`, `abs` and names
      declared by a `def` in the same file. Bare identifiers must be bound by
      a value binder.

ACCEPTED TOKENS
    identifiers   any Python identifier (unicode included) that is not a
                  reserved word and does not start with λ/Σ/Π
    integers      one or more ASCII digits (arbitrary size)
    operators     + - * = ≠ ≤ < ≥ > ∧ ∨
    punctuation   ( ) : :=
    keywords      def theorem by  (plus the type names Int Nat Bool)

TOKENIZED SO THE ERROR IS PRECISE, THEN REJECTED
    → ↔ ∀ ∃ λ Σ Π ¬ , { } [ ] ⟨ ⟩ / % | ^ & ! @ $ . _ ' " ; ⊢ × ≡ ∘
    fun match with if then else let do where instance class structure
    example lemma variable open namespace end mutual partial noncomputable
    deriving have show calc

    So: lambdas, `match`, dependent pairs, implicit binders `{x : Int}`,
    typeclass binders `[Foo α]`, `∀`/`∃` quantifiers, `→` implication,
    division and modulo are all UNSUPPORTED and raise
    UnsupportedConstructError carrying the offending text and its position.
    Any other character raises SpecTokenizeError.
"""

import argparse
import keyword
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

# ==========================================================================
# Errors — every failure carries the offending text and where it was found.
# ==========================================================================


class SpecParseError(Exception):
    """Base: the spec is not in the supported subset. Never recoverable."""

    def __init__(
        self,
        message: str,
        text: str,
        position: int,
        line: int,
        column: int,
        spec_file: str | None = None,
    ) -> None:
        self.message = message
        self.text = text
        self.position = position
        self.line = line
        self.column = column
        self.spec_file = spec_file
        where = f"{spec_file}:" if spec_file else ""
        super().__init__(
            f"{where}{line}:{column}: {message}; offending text {text!r} "
            f"at offset {position}"
        )


class SpecFileError(SpecParseError):
    """The spec file could not be read at all."""


class SpecTokenizeError(SpecParseError):
    """A character that is not part of the supported subset's alphabet."""


class UnsupportedConstructError(SpecParseError):
    """A recognised Lean construct that this subset deliberately excludes."""


class SpecSyntaxError(SpecParseError):
    """Supported tokens arranged in a shape the grammar does not accept."""


# ==========================================================================
# AST
# ==========================================================================


@dataclass(frozen=True)
class Expr:
    """Base class for every expression node."""


@dataclass(frozen=True)
class Var(Expr):
    name: str


@dataclass(frozen=True)
class IntLit(Expr):
    value: int


@dataclass(frozen=True)
class App(Expr):
    func: str
    args: tuple[Expr, ...]


@dataclass(frozen=True)
class UnaryOp(Expr):
    op: str
    operand: Expr


@dataclass(frozen=True)
class BinOp(Expr):
    op: str
    left: Expr
    right: Expr


@dataclass(frozen=True)
class Binder:
    names: tuple[str, ...]
    type_name: str


@dataclass(frozen=True)
class DefDecl:
    name: str
    binders: tuple[Binder, ...]
    return_type: str
    body: Expr


@dataclass(frozen=True)
class TheoremDecl:
    name: str
    function_name: str
    binders: tuple[Binder, ...]
    hypotheses: tuple[Expr, ...]
    conclusion: Expr


@dataclass(frozen=True)
class SpecFile:
    defs: tuple[DefDecl, ...]
    theorem: TheoremDecl


# ==========================================================================
# Tokenizer
# ==========================================================================


@dataclass(frozen=True)
class Token:
    kind: str  # IDENT INT OP LPAREN RPAREN COLON ASSIGN KEYWORD
    text: str  # UNSUPPORTED EOF
    position: int
    line: int
    column: int


TYPE_NAMES: frozenset[str] = frozenset({"Int", "Nat", "Bool"})
BUILTIN_CALLS: frozenset[str] = frozenset({"min", "max", "abs"})
STRUCTURAL_KEYWORDS: frozenset[str] = frozenset({"def", "theorem", "by"})

# Recognised Lean words this subset excludes. Tokenized so the rejection can
# name the construct instead of blaming an arbitrary character.
UNSUPPORTED_WORDS: frozenset[str] = frozenset(
    {
        "fun",
        "match",
        "with",
        "if",
        "then",
        "else",
        "let",
        "do",
        "where",
        "instance",
        "class",
        "structure",
        "example",
        "lemma",
        "variable",
        "open",
        "namespace",
        "end",
        "mutual",
        "partial",
        "noncomputable",
        "deriving",
        "have",
        "show",
        "calc",
        "forall",
        "exists",
        "attribute",
        "macro",
        "notation",
        "abbrev",
        "inductive",
        "axiom",
        "section",
        "import",
        "set_option",
    }
)

# Two-character symbols must be tried before one-character ones.
_SYMBOLS: tuple[tuple[str, str], ...] = (
    (":=", "ASSIGN"),
    ("(", "LPAREN"),
    (")", "RPAREN"),
    (":", "COLON"),
    ("+", "OP"),
    ("-", "OP"),
    ("*", "OP"),
    ("=", "OP"),
    ("<", "OP"),
    (">", "OP"),
    ("≠", "OP"),
    ("≤", "OP"),
    ("≥", "OP"),
    ("∧", "OP"),
    ("∨", "OP"),
)

UNSUPPORTED_SYMBOLS: frozenset[str] = frozenset(
    {
        "→",
        "↔",
        "∀",
        "∃",
        "λ",
        "Σ",
        "Π",
        "¬",
        ",",
        "{",
        "}",
        "[",
        "]",
        "⟨",
        "⟩",
        "/",
        "%",
        "|",
        "^",
        "&",
        "!",
        "@",
        "$",
        ".",
        "_",
        "'",
        '"',
        ";",
        "⊢",
        "×",
        "≡",
        "∘",
        "⇒",
        "⟹",
        "~",
        "?",
        "`",
        "\\",
        "∈",
        "∉",
        "⊆",
        "∪",
        "∩",
    }
)

_UNSUPPORTED_REASON: dict[str, str] = {
    "λ": "lambda abstraction",
    "fun": "lambda abstraction",
    "match": "pattern match",
    "with": "pattern match",
    "Σ": "dependent pair (Sigma type)",
    "Π": "dependent function (Pi type)",
    "∀": "universal quantifier",
    "∃": "existential quantifier",
    "→": "implication / function arrow",
    "↔": "if-and-only-if",
    "¬": "negation",
    "[": "typeclass or instance binder",
    "]": "typeclass or instance binder",
    "{": "implicit binder",
    "}": "implicit binder",
    "⟨": "anonymous constructor",
    "⟩": "anonymous constructor",
    "/": "division",
    "%": "modulo",
    ",": "comma",
    "_": "placeholder",
    ".": "field access or namespace",
    "if": "conditional",
    "then": "conditional",
    "else": "conditional",
    "let": "let binding",
    "have": "have binding",
    "do": "do notation",
}


def _line_col(text: str, position: int) -> tuple[int, int]:
    """1-based line and column of a character offset."""
    head = text[:position]
    line = head.count("\n") + 1
    column = position - (head.rfind("\n") + 1) + 1
    return line, column


def strip_comments(text: str, spec_file: str | None = None) -> str:
    """Blank out `--` line comments and nestable `/- -/` blocks.

    Replaced characters become spaces and newlines are preserved, so every
    offset in the result still points at the same character of the original
    file. Nothing inside a comment can reach the tokenizer, which is what makes
    a comment containing the word `theorem` inert.
    """
    out = list(text)
    n = len(text)
    i = 0
    depth = 0
    block_start = 0
    while i < n:
        if depth == 0 and text.startswith("--", i):
            end = text.find("\n", i)
            end = n if end < 0 else end
            for k in range(i, end):
                out[k] = " "
            i = end
            continue
        if text.startswith("/-", i):
            if depth == 0:
                block_start = i
            depth += 1
            out[i] = out[i + 1] = " "
            i += 2
            continue
        if depth > 0 and text.startswith("-/", i):
            depth -= 1
            out[i] = out[i + 1] = " "
            i += 2
            continue
        if depth > 0:
            if text[i] != "\n":
                out[i] = " "
            i += 1
            continue
        i += 1
    if depth > 0:
        line, column = _line_col(text, block_start)
        raise SpecTokenizeError(
            "unterminated block comment", "/-", block_start, line, column, spec_file
        )
    return "".join(out)


def tokenize(source: str, spec_file: str | None = None) -> list[Token]:
    """Comment-free Lean text -> tokens. Unknown characters raise."""
    tokens: list[Token] = []
    n = len(source)
    i = 0
    while i < n:
        ch = source[i]
        if ch.isspace():
            i += 1
            continue
        line, column = _line_col(source, i)

        if ch in UNSUPPORTED_SYMBOLS:
            reason = _UNSUPPORTED_REASON.get(ch, "construct")
            raise UnsupportedConstructError(
                f"{reason} is outside the supported Lean subset",
                ch,
                i,
                line,
                column,
                spec_file,
            )

        matched = False
        for symbol, kind in _SYMBOLS:
            if source.startswith(symbol, i):
                tokens.append(Token(kind, symbol, i, line, column))
                i += len(symbol)
                matched = True
                break
        if matched:
            continue

        if ch.isdigit():
            j = i
            while j < n and source[j].isdigit():
                j += 1
            tokens.append(Token("INT", source[i:j], i, line, column))
            i = j
            continue

        # `_` and the alphabetic sigils λ/Σ/Π are rejected above, so an
        # identifier can never start with one.
        if ch.isalpha():
            j = i
            while j < n and (source[j].isalnum() or source[j] == "_"):
                j += 1
            word = source[i:j]
            if word in UNSUPPORTED_WORDS:
                reason = _UNSUPPORTED_REASON.get(word, f"`{word}`")
                raise UnsupportedConstructError(
                    f"{reason} is outside the supported Lean subset",
                    word,
                    i,
                    line,
                    column,
                    spec_file,
                )
            kind = "KEYWORD" if word in STRUCTURAL_KEYWORDS else "IDENT"
            tokens.append(Token(kind, word, i, line, column))
            i = j
            continue

        raise SpecTokenizeError(
            "character is not in the supported alphabet", ch, i, line, column, spec_file
        )

    tokens.append(Token("EOF", "", n, *_line_col(source, n)))
    return tokens


# ==========================================================================
# Parser
# ==========================================================================

_CMP_OPS: frozenset[str] = frozenset({"=", "≠", "≤", "<", "≥", ">"})


class _Parser:
    """Recursive descent over the grammar in the module docstring."""

    def __init__(self, tokens: list[Token], spec_file: str | None) -> None:
        self._tokens = tokens
        self._index = 0
        self._spec_file = spec_file
        self._bound: frozenset[str] = frozenset()
        self._calls: frozenset[str] = frozenset(BUILTIN_CALLS)

    # -- token access ------------------------------------------------------
    def _peek(self, ahead: int = 0) -> Token:
        index = min(self._index + ahead, len(self._tokens) - 1)
        return self._tokens[index]

    def _advance(self) -> Token:
        token = self._tokens[self._index]
        if token.kind != "EOF":
            self._index += 1
        return token

    def _fail(self, token: Token, message: str) -> SpecSyntaxError:
        return SpecSyntaxError(
            message,
            token.text or "<end of input>",
            token.position,
            token.line,
            token.column,
            self._spec_file,
        )

    def _expect(self, kind: str, message: str, text: str | None = None) -> Token:
        token = self._peek()
        if token.kind != kind or (text is not None and token.text != text):
            raise self._fail(token, message)
        return self._advance()

    # -- names -------------------------------------------------------------
    def _check_name(self, token: Token, role: str) -> str:
        name = token.text
        if not name.isidentifier():
            raise self._fail(token, f"{role} is not a valid identifier")
        if keyword.iskeyword(name) or keyword.issoftkeyword(name):
            raise self._fail(
                token,
                f"{role} {name!r} is a Python keyword and cannot be "
                "translated into an executable claim",
            )
        return name

    # -- declarations ------------------------------------------------------
    def parse_file(self) -> SpecFile:
        defs: list[DefDecl] = []
        theorem: TheoremDecl | None = None
        while self._peek().kind != "EOF":
            token = self._peek()
            if token.kind == "KEYWORD" and token.text == "def":
                defs.append(self._parse_def(tuple(d.name for d in defs)))
            elif token.kind == "KEYWORD" and token.text == "theorem":
                if theorem is not None:
                    raise self._fail(
                        token,
                        "a spec file declares exactly one theorem; "
                        "a second one is ambiguous about what is scored",
                    )
                theorem = self._parse_theorem(tuple(d.name for d in defs))
            else:
                raise self._fail(token, "expected a `def` or `theorem` declaration")
        if theorem is None:
            end = self._tokens[-1]
            raise SpecSyntaxError(
                "no `theorem <name>_spec ... := by ...` declaration found",
                end.text or "<end of input>",
                end.position,
                end.line,
                end.column,
                self._spec_file,
            )
        return SpecFile(tuple(defs), theorem)

    def _parse_def(self, known_defs: tuple[str, ...]) -> DefDecl:
        self._expect("KEYWORD", "expected `def`", "def")
        name_token = self._expect("IDENT", "expected a name after `def`")
        name = self._check_name(name_token, "def name")
        if name in BUILTIN_CALLS:
            raise self._fail(
                name_token, f"def name {name!r} shadows a builtin function"
            )
        binders, hypotheses = self._parse_binders(known_defs + (name,))
        if hypotheses:
            raise self._fail(self._peek(), "a `def` cannot take a hypothesis binder")
        if not binders:
            raise self._fail(
                self._peek(), "a `def` must take at least one value binder"
            )
        self._expect("COLON", "expected `:` before the def's return type")
        return_type = self._parse_type()
        self._expect("ASSIGN", "expected `:=` before the def's body")
        bound = frozenset(n for b in binders for n in b.names)
        body = self._parse_expression(
            bound, frozenset(BUILTIN_CALLS) | set(known_defs) | {name}
        )
        return DefDecl(name, tuple(binders), return_type, body)

    def _parse_theorem(self, known_defs: tuple[str, ...]) -> TheoremDecl:
        self._expect("KEYWORD", "expected `theorem`", "theorem")
        name_token = self._expect("IDENT", "expected a name after `theorem`")
        name = name_token.text
        if not name.endswith("_spec"):
            raise self._fail(
                name_token,
                "theorem name must end in `_spec`; the function under test is "
                "the name with that suffix removed",
            )
        function_name = name[: -len("_spec")]
        if not function_name:
            raise self._fail(name_token, "theorem name is only the `_spec` suffix")
        if function_name not in known_defs:
            raise self._fail(
                name_token,
                f"no `def {function_name}` appears before this theorem, so the "
                "claim is not about a function this file defines",
            )

        binders, hypotheses = self._parse_binders(known_defs)
        if not binders:
            raise self._fail(
                self._peek(), "theorem must declare at least one value binder"
            )
        types = {b.type_name for b in binders}
        if len(types) != 1:
            raise self._fail(
                self._peek(),
                f"value binders mix types {sorted(types)}; one input strategy "
                "cannot cover both",
            )

        self._expect("COLON", "expected `:` before the theorem's claim")
        bound = frozenset(n for b in binders for n in b.names)
        calls = frozenset(BUILTIN_CALLS) | set(known_defs)
        conclusion = self._parse_expression(bound, calls)
        self._expect("ASSIGN", "expected `:=` before the proof body")
        self._expect("KEYWORD", "expected `by` after `:=`", "by")
        self._expect(
            "IDENT",
            "expected a single tactic identifier after `by`; "
            "tactic blocks are not supported",
        )
        return TheoremDecl(
            name, function_name, tuple(binders), tuple(hypotheses), conclusion
        )

    def _parse_type(self) -> str:
        token = self._peek()
        if token.kind != "IDENT" or token.text not in TYPE_NAMES:
            raise self._fail(token, f"expected one of {sorted(TYPE_NAMES)} as the type")
        self._advance()
        return token.text

    def _looks_like_value_binder(self) -> bool:
        """`(a b : Int)` vs `(h : lo ≤ hi)` — decided by the annotation.

        A bare identifier annotation means a value binder; `_parse_type` then
        rejects anything that is not Int/Nat/Bool and names it. A hypothesis
        annotation is a proposition, so it always carries a comparison or a
        connective and can never be a lone identifier.
        """
        ahead = 1
        while self._peek(ahead).kind == "IDENT":
            ahead += 1
        if self._peek(ahead).kind != "COLON":
            return False
        return (
            self._peek(ahead + 1).kind == "IDENT"
            and self._peek(ahead + 2).kind == "RPAREN"
        )

    def _parse_binders(
        self, known_defs: tuple[str, ...]
    ) -> tuple[list[Binder], list[Expr]]:
        binders: list[Binder] = []
        hypotheses: list[Expr] = []
        while self._peek().kind == "LPAREN":
            if self._looks_like_value_binder():
                binders.append(self._parse_value_binder(known_defs))
            else:
                hypotheses.append(self._parse_hypothesis_binder(binders, known_defs))
        return binders, hypotheses

    def _parse_value_binder(self, known_defs: tuple[str, ...]) -> Binder:
        self._expect("LPAREN", "expected `(` to open a binder group")
        names: list[str] = []
        while self._peek().kind == "IDENT":
            token = self._advance()
            name = self._check_name(token, "binder name")
            if name in BUILTIN_CALLS or name in known_defs:
                raise self._fail(
                    token,
                    f"binder {name!r} shadows a function name; the claim would "
                    "be ambiguous about which one it means",
                )
            if name in names:
                raise self._fail(token, f"binder {name!r} is declared twice")
            names.append(name)
        if not names:
            raise self._fail(self._peek(), "binder group declares no names")
        self._expect("COLON", "expected `:` in the binder group")
        type_name = self._parse_type()
        self._expect("RPAREN", "expected `)` to close the binder group")
        return Binder(tuple(names), type_name)

    def _parse_hypothesis_binder(
        self, binders: list[Binder], known_defs: tuple[str, ...]
    ) -> Expr:
        self._expect("LPAREN", "expected `(` to open a hypothesis binder")
        name_token = self._expect(
            "IDENT", "a hypothesis binder names exactly one proof term"
        )
        self._check_name(name_token, "hypothesis name")
        self._expect("COLON", "expected `:` in the hypothesis binder")
        bound = frozenset(n for b in binders for n in b.names)
        calls = frozenset(BUILTIN_CALLS) | set(known_defs)
        condition = self._parse_expression(bound, calls)
        self._expect("RPAREN", "expected `)` to close the hypothesis binder")
        return condition

    # -- expressions -------------------------------------------------------
    def parse_standalone_expression(
        self, bound: frozenset[str], calls: frozenset[str]
    ) -> Expr:
        """One expression and nothing else. Trailing input is a failure."""
        node = self._parse_expression(bound, calls)
        trailing = self._peek()
        if trailing.kind != "EOF":
            raise self._fail(trailing, "trailing input after the expression")
        return node

    def _parse_expression(self, bound: frozenset[str], calls: frozenset[str]) -> Expr:
        previous = (self._bound, self._calls)
        self._bound, self._calls = bound, calls
        try:
            return self._or_expr()
        finally:
            self._bound, self._calls = previous

    def _or_expr(self) -> Expr:
        node = self._and_expr()
        while self._peek().kind == "OP" and self._peek().text == "∨":
            self._advance()
            node = BinOp("∨", node, self._and_expr())
        return node

    def _and_expr(self) -> Expr:
        node = self._cmp_expr()
        while self._peek().kind == "OP" and self._peek().text == "∧":
            self._advance()
            node = BinOp("∧", node, self._cmp_expr())
        return node

    def _cmp_expr(self) -> Expr:
        node = self._add_expr()
        token = self._peek()
        if token.kind == "OP" and token.text in _CMP_OPS:
            self._advance()
            right = self._add_expr()
            after = self._peek()
            if after.kind == "OP" and after.text in _CMP_OPS:
                raise self._fail(
                    after,
                    "comparison operators do not chain in this subset; "
                    "write the conjunction with `∧`",
                )
            return BinOp(token.text, node, right)
        return node

    def _add_expr(self) -> Expr:
        node = self._mul_expr()
        while self._peek().kind == "OP" and self._peek().text in {"+", "-"}:
            op = self._advance().text
            node = BinOp(op, node, self._mul_expr())
        return node

    def _mul_expr(self) -> Expr:
        node = self._unary()
        while self._peek().kind == "OP" and self._peek().text == "*":
            self._advance()
            node = BinOp("*", node, self._unary())
        return node

    def _unary(self) -> Expr:
        token = self._peek()
        if token.kind == "OP" and token.text == "-":
            self._advance()
            operand = self._unary()
            # `-5` is a negative literal, not a negation node; folding here
            # keeps `IntLit(-5)` the single representation of that value.
            if isinstance(operand, IntLit):
                return IntLit(-operand.value)
            return UnaryOp("-", operand)
        return self._app()

    def _starts_atom(self, token: Token) -> bool:
        return token.kind in {"IDENT", "INT", "LPAREN"}

    def _app(self) -> Expr:
        head_token = self._peek()
        node = self._atom()
        if not self._starts_atom(self._peek()):
            # A function name standing alone is not a value in this subset.
            if (
                isinstance(node, Var)
                and node.name not in self._bound
                and node.name in self._calls
            ):
                raise self._fail(
                    head_token,
                    f"{node.name!r} is a function and must be applied to "
                    "arguments; it is not a value",
                )
            return node
        # Juxtaposition: only a named function can be applied.
        if (
            not isinstance(node, Var)
            or node.name in self._bound
            or node.name not in self._calls
        ):
            raise self._fail(
                head_token,
                "only `min`, `max`, `abs` and functions defined by a `def` in "
                "this file can be applied to arguments",
            )
        args: list[Expr] = []
        while self._starts_atom(self._peek()):
            args.append(self._atom())
        return App(node.name, tuple(args))

    def _atom(self) -> Expr:
        token = self._peek()
        if token.kind == "INT":
            self._advance()
            return IntLit(int(token.text))
        if token.kind == "IDENT":
            self._advance()
            if token.text in TYPE_NAMES:
                raise self._fail(token, "a type name cannot appear in an expression")
            if token.text in self._bound:
                return Var(token.text)
            if token.text in self._calls:
                # A function name with no arguments is not a value here.
                return Var(token.text)
            raise self._fail(
                token,
                f"{token.text!r} is not bound by any binder and is not a "
                "function this file defines",
            )
        if token.kind == "LPAREN":
            self._advance()
            inner = self._or_expr()
            self._expect("RPAREN", "expected `)` to close a parenthesised expression")
            return inner
        raise self._fail(token, "expected an identifier, an integer or `(`")


# ==========================================================================
# Rendering — one precedence table, two spellings.
# ==========================================================================

_PRECEDENCE: dict[str, int] = {
    "∨": 1,
    "∧": 2,
    "=": 3,
    "≠": 3,
    "≤": 3,
    "<": 3,
    "≥": 3,
    ">": 3,
    "+": 4,
    "-": 4,
    "*": 5,
}
_ATOM_PRECEDENCE = 7
_UNARY_PRECEDENCE = 6

_PYTHON_OPS: dict[str, str] = {
    "∨": "or",
    "∧": "and",
    "=": "==",
    "≠": "!=",
    "≤": "<=",
    "≥": ">=",
    "<": "<",
    ">": ">",
    "+": "+",
    "-": "-",
    "*": "*",
}


def _render(node: Expr, min_precedence: int, python: bool) -> str:
    if isinstance(node, Var):
        return node.name
    if isinstance(node, IntLit):
        text = str(node.value)
        return (
            f"({text})"
            if node.value < 0 and min_precedence > _UNARY_PRECEDENCE
            else text
        )
    if isinstance(node, App):
        if python:
            inner = ", ".join(_render(a, 0, python) for a in node.args)
            return f"{node.func}({inner})"
        parts = " ".join(_render(a, _ATOM_PRECEDENCE, python) for a in node.args)
        text = f"{node.func} {parts}"
        return f"({text})" if min_precedence > _ATOM_PRECEDENCE else text
    if isinstance(node, UnaryOp):
        text = f"-{_render(node.operand, _UNARY_PRECEDENCE, python)}"
        return f"({text})" if min_precedence > _UNARY_PRECEDENCE else text
    if isinstance(node, BinOp):
        precedence = _PRECEDENCE[node.op]
        symbol = _PYTHON_OPS[node.op] if python else node.op
        # Comparison is non-associative: both sides bind tighter than it.
        right_precedence = precedence + 1
        left_precedence = precedence + 1 if precedence == 3 else precedence
        left = _render(node.left, left_precedence, python)
        right = _render(node.right, right_precedence, python)
        text = f"{left} {symbol} {right}"
        return f"({text})" if min_precedence > precedence else text
    raise TypeError(f"unrenderable node {type(node).__name__}")


def expr_to_python(node: Expr) -> str:
    """AST -> an executable Python expression."""
    return _render(node, 0, python=True)


def expr_to_lean(node: Expr) -> str:
    """AST -> canonical Lean source. Round-trips through `parse_expression`."""
    return _render(node, 0, python=False)


# ==========================================================================
# Public API
# ==========================================================================


def parse_expression(
    text: str,
    *,
    bound: Sequence[str],
    calls: Sequence[str] = (),
    spec_file: str | None = None,
) -> Expr:
    """Parse a standalone Lean expression. Raises on anything unsupported."""
    tokens = tokenize(strip_comments(text, spec_file), spec_file)
    return _Parser(tokens, spec_file).parse_standalone_expression(
        frozenset(bound), frozenset(BUILTIN_CALLS) | set(calls)
    )


def parse_spec_text(text: str, spec_file: str | None = None) -> SpecFile:
    """Full Lean spec text -> typed AST. Raises SpecParseError on anything else."""
    return _Parser(
        tokenize(strip_comments(text, spec_file), spec_file), spec_file
    ).parse_file()


def parse_lean_spec(spec_file: str) -> dict[str, Any]:
    """Parse a spec file into the record every gate scores.

    RAISES `SpecParseError` on any failure — it never returns None and never
    returns a partial record. A gate that cannot parse a spec has not verified
    it, and must fail rather than skip.
    """
    try:
        with open(spec_file, "r", encoding="utf-8") as handle:
            content = handle.read()
    except OSError as exc:
        raise SpecFileError(
            f"cannot read spec file ({exc.strerror})", spec_file, 0, 1, 1, spec_file
        ) from exc

    parsed = parse_spec_text(content, spec_file)
    theorem = parsed.theorem

    hypothesis_ast: Expr | None = None
    for condition in theorem.hypotheses:
        hypothesis_ast = (
            condition
            if hypothesis_ast is None
            else BinOp("∧", hypothesis_ast, condition)
        )

    return {
        "function_name": theorem.function_name,
        "args": [name for binder in theorem.binders for name in binder.names],
        "arg_type": theorem.binders[0].type_name,
        "hypothesis": expr_to_lean(hypothesis_ast) if hypothesis_ast else "",
        "hypothesis_ast": hypothesis_ast,
        "property": expr_to_lean(theorem.conclusion),
        "property_ast": theorem.conclusion,
        "has_def": any(d.name == theorem.function_name for d in parsed.defs),
        "ast": parsed,
    }


def lean_expr_to_python(expr: str, func: str, args: Sequence[str]) -> str:
    """`add a b = add b a`  ->  `add(a, b) == add(b, a)`

    Kept as a string-in/string-out helper because callers hold the Lean text.
    It parses with the same grammar as the file parser — no pattern matching —
    and raises SpecParseError rather than emitting a partial translation.
    """
    return expr_to_python(parse_expression(expr, bound=args, calls=(func,)))


def generate_hypothesis_test(spec_info: dict[str, Any]) -> str:
    func: str = spec_info["function_name"]
    args: list[str] = spec_info["args"]
    strategy = {"Nat": "st.integers(min_value=0)", "Bool": "st.booleans()"}.get(
        spec_info["arg_type"], "st.integers(min_value=-10**6, max_value=10**6)"
    )

    # Rendered from the AST, not from the Lean string: the string is for
    # humans, the tree is what was actually parsed.
    assertion = expr_to_python(spec_info["property_ast"])
    guard = ""
    hypothesis_ast: Expr | None = spec_info["hypothesis_ast"]
    if hypothesis_ast is not None:
        guard = f"    assume({expr_to_python(hypothesis_ast)})\n"

    # A GUARDED TEST REJECTS MOST OF WHAT IT DRAWS, AND THAT IS ARITHMETIC.
    #
    # `assume` discards an example rather than failing it, so a precondition
    # over independent draws has an acceptance rate fixed by the shape of the
    # constraint. clamp's `lo <= x and x <= hi` needs x to be the middle of
    # three uniform draws: exactly one of the 3! orderings qualifies, so 1 in 6
    # is kept. Hypothesis's `filter_too_much` health check reads that as a test
    # that might be exercising nothing and raises FailedHealthCheck.
    #
    # It is not exercising nothing -- it finds its 100 examples -- but it does
    # so on most seeds and not on all. MEASURED on this repository:
    # tests/generated/test_clamp_spec.py failed 1 run in 20 in isolation, and
    # it runs inside the mandatory `coverage` gate, so that was a 5% chance per
    # push of a red required check with nothing wrong with the code.
    #
    # A random red is worse than no check: the first response to one is to
    # re-run, and the second is to stop reading them.
    #
    # ONLY `filter_too_much` IS SUPPRESSED, and only on a test that has a
    # guard. Every other health check still fires. Suppressing the whole list
    # would take `too_slow` and `data_too_large` with it, which are about the
    # test being wrong rather than about a constant this file can compute.
    #
    # `max_examples` is raised to 500 so the discard budget is not the binding
    # constraint either: at 1-in-6 acceptance the engine needs roughly 600
    # draws to reach 100 kept examples, and the default budget leaves no room.
    # This makes the guarded test do MORE work, not less -- the opposite of
    # what silencing a warning usually buys.
    settings = ""
    if guard:
        settings = (
            "@settings(max_examples=500,\n"
            "          suppress_health_check=[HealthCheck.filter_too_much])\n"
        )

    # Parameters are annotated and `assume` is imported only when a
    # precondition exists: pyright strict rejects untyped params and unused
    # imports, and generated files are checked like any other source.
    imports = "HealthCheck, assume, given, settings" if guard else "given"
    params = ", ".join(f"{a}: int" for a in args)
    return f'''"""Auto-generated from specs/{func}_spec.lean by scripts/spec_to_test.py.

Do not edit: regenerate instead. The assertion mirrors the Lean claim exactly.
"""

from hypothesis import {imports}, strategies as st

from src.{func} import {func}


{settings}@given({", ".join(strategy for _ in args)})
def test_{func}_spec({params}) -> None:
{guard}    assert {assertion}
'''


def spec_to_test(spec_file: str, output_file: str | None = None) -> bool:
    try:
        spec_info = parse_lean_spec(spec_file)
    except SpecParseError as exc:
        print(f"❌ Failed to parse {spec_file}: {exc}")
        return False
    # `has_def` is no longer checked here: the parser refuses a theorem whose
    # function has no `def` in the same file, so reaching this point already
    # means the claim is about a function this file defines. The key is kept in
    # the record because callers read it.

    if output_file is None:
        os.makedirs("tests/generated", exist_ok=True)
        output_file = f"tests/generated/test_{spec_info['function_name']}_spec.py"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(generate_hypothesis_test(spec_info))

    print(f"✓ Generated {output_file}")
    return True


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("spec_file")
    p.add_argument("output_file", nargs="?")
    ns = p.parse_args()
    sys.exit(0 if spec_to_test(ns.spec_file, ns.output_file) else 1)
