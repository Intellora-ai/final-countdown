"""No `scripts/*.py` identifier may make CodeQL call safe data a secret.

`py/clear-text-logging-sensitive-data` decides that a value is sensitive from
the IDENTIFIER it flows out of, not from the data. This repository has been hit
twice, both HIGH, both false positives on values that are not secrets:

  1. `check_not_a_secret()` in scripts/security_gate.py returned a fixed status
     string; printing it was reported as logging a secret. Renamed
     `check_is_status_literal`.
  2. `scan_for_secrets()` in scripts/generate_evidence.py returned findings that
     carry a pattern label, a length and an offset and never the matched text;
     printing them was reported the same way. Renamed
     `scan_for_disclosure_shapes`.

Both were fixed by renaming, never by suppressing. Nothing stopped a third, so
this file is the stop: it re-derives the alert's own reasoning over the AST and
fails on any name that would reproduce it.

Two things it deliberately does NOT flag, because both are legitimate and
present today:

  * Module-level pattern constants bound to literal data -- the tuple of
    `"github_pat_"`, `"ghp_"` prefixes the scanner searches FOR. They are the
    needle's shape, not a value derived from a secret.
  * Anything under tests/. Only scripts/ is scanned.

Matching is word-aware, never substring: `token_run` and `TOKENS` are names;
`tokenize` and `sortedcontainers` are not. A checker that fires on `tokenize`
is a checker somebody switches off, and a switched-off checker catches nothing.

Reach: taint is tracked through assignments, tuple unpacking, loops, `with`,
comprehensions and list/set mutation inside one scope, plus ONE hop out of a
function that returns a sensitively-named value. See the comment on `producers`
in scan_source() for why the hop is bounded and what that bound gives up.
"""

from __future__ import annotations

import ast
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Final, NamedTuple

REPO: Final = Path(__file__).resolve().parent.parent
SCRIPTS: Final = REPO / "scripts"

# The tokens CodeQL's sensitive-data heuristic keys on, reduced to singular
# stems. Plurals are handled by _singular(), so "secrets" and "TOKENS" match
# without listing them.
SENSITIVE_WORDS: Final[frozenset[str]] = frozenset({
    "secret", "credential", "token", "password", "passwd",
    "apikey", "privatekey",
})

# snake_case, camelCase, PascalCase and SCREAMING_CASE all split here.
# "APIKey" -> API, Key. "TOKENS" -> TOKENS. "tokenize" -> tokenize (one word).
_WORD: Final = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+")

_LOG_METHODS: Final[frozenset[str]] = frozenset({
    "debug", "info", "warning", "warn", "error", "exception", "critical",
    "log", "print",
})
_STREAM_SINKS: Final[frozenset[str]] = frozenset({"sys.stderr", "sys.stdout"})
# print()'s plumbing arguments carry no data.
_META_KWARGS: Final[frozenset[str]] = frozenset({"file", "flush", "sep", "end"})
# `xs.append(v)` puts v into xs just as surely as `xs = [v]` does.
_MUTATORS: Final[frozenset[str]] = frozenset({
    "append", "add", "extend", "update", "insert",
})


class Violation(NamedTuple):
    """One identifier whose value reaches a log under a sensitive name."""

    filename: str
    line: int
    identifier: str
    origin: str

    def describe(self) -> str:
        via = "" if self.origin == self.identifier else f" (value from {self.origin!r})"
        return (f"{self.filename}:{self.line}: {self.identifier!r}{via} reaches a "
                f"print/logging call under a sensitivity-suggesting name")


# ---------------------------------------------------------------------------
# NAME MATCHING
# ---------------------------------------------------------------------------
def _words(identifier: str) -> tuple[str, ...]:
    return tuple(m.group(0).lower() for m in _WORD.finditer(identifier))


def _singular(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") else word


def is_sensitive_name(identifier: str) -> bool:
    """True when a WORD of `identifier` is a sensitivity-suggesting token.

    Word-aware on purpose. Substring matching would flag `tokenize` and
    `sortedcontainers`, which is how a naming rule earns its own suppression.
    Adjacent words are also joined once, so `api_key` and `private_key` match
    as the two-word names they are.
    """
    words = _words(identifier)
    for i, word in enumerate(words):
        if _singular(word) in SENSITIVE_WORDS:
            return True
        if i + 1 < len(words) and word + _singular(words[i + 1]) in SENSITIVE_WORDS:
            return True
    return False


# ---------------------------------------------------------------------------
# AST HELPERS
# ---------------------------------------------------------------------------
def _dotted(node: ast.expr) -> str:
    parts: list[str] = []
    cur: ast.expr = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if not isinstance(cur, ast.Name):
        return ""
    parts.append(cur.id)
    return ".".join(reversed(parts))


def _identifiers(node: ast.expr) -> set[str]:
    """Every name and attribute label mentioned anywhere inside `node`."""
    out: set[str] = set()
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name):
            out.add(sub.id)
        elif isinstance(sub, ast.Attribute):
            out.add(sub.attr)
    return out


def _bound_names(target: ast.expr) -> list[str]:
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, ast.Starred):
        return _bound_names(target.value)
    if isinstance(target, (ast.Tuple, ast.List)):
        return [n for elt in target.elts for n in _bound_names(elt)]
    return []


def _is_literal_data(node: ast.expr) -> bool:
    """True for a pattern constant: literal strings, or containers of them.

    `re.compile("...")` counts -- a compiled search pattern is still the shape
    being hunted for, not a value derived from a secret.
    """
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        return all(_is_literal_data(e) for e in node.elts)
    if isinstance(node, ast.Dict):
        return all(k is not None and _is_literal_data(k) for k in node.keys) and \
            all(_is_literal_data(v) for v in node.values)
    if isinstance(node, ast.BinOp):
        return _is_literal_data(node.left) and _is_literal_data(node.right)
    if isinstance(node, ast.Call):
        return (_dotted(node.func) == "re.compile"
                and all(_is_literal_data(a) for a in node.args))
    return False


def _pattern_constants(tree: ast.Module) -> set[str]:
    """Module-level names bound to literal data, exempt from the rule."""
    exempt: set[str] = set()
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and _is_literal_data(stmt.value):
            for t in stmt.targets:
                exempt.update(_bound_names(t))
        elif isinstance(stmt, ast.AnnAssign) and stmt.value is not None \
                and _is_literal_data(stmt.value):
            exempt.update(_bound_names(stmt.target))
    return exempt


def _is_scope(node: ast.AST) -> bool:
    return isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef,
                             ast.ClassDef, ast.Lambda))


def _own_nodes(scope: ast.AST) -> list[ast.AST]:
    """Nodes belonging to `scope`, not descending into nested scopes."""
    stack: list[ast.AST] = []
    if isinstance(scope, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef,
                          ast.ClassDef)):
        # A nested def is its own scope and is visited separately; pulling its
        # body in here would merge every function's locals into the module and
        # make one bad name taint the whole file.
        stack.extend(s for s in scope.body if not _is_scope(s))
    elif isinstance(scope, ast.Lambda):
        stack.append(scope.body)
    out: list[ast.AST] = []
    while stack:
        node = stack.pop()
        out.append(node)
        for child in ast.iter_child_nodes(node):
            if _is_scope(child):
                continue
            stack.append(child)
    return out


def _log_sink_args(call: ast.Call) -> list[ast.expr] | None:
    """The data-bearing arguments of `call`, or None if it is not a log sink."""
    func = call.func
    sink = False
    if isinstance(func, ast.Name) and func.id == "print":
        sink = True
    elif isinstance(func, ast.Attribute):
        base = _dotted(func.value)
        if func.attr in _LOG_METHODS and "log" in base.lower():
            sink = True
        elif func.attr == "write" and base in _STREAM_SINKS:
            sink = True
    if not sink:
        return None
    return [*call.args,
            *(k.value for k in call.keywords if k.arg not in _META_KWARGS)]


# ---------------------------------------------------------------------------
# THE RULE
# ---------------------------------------------------------------------------
def _edges(nodes: Sequence[ast.AST]) -> dict[str, set[str]]:
    """name -> identifiers its value was built from, within one scope."""
    edges: dict[str, set[str]] = {}

    def link(names: Sequence[str], value: ast.expr) -> None:
        srcs = _identifiers(value)
        for name in names:
            edges.setdefault(name, set()).update(srcs)

    for node in nodes:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                link(_bound_names(t), node.value)
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            link(_bound_names(node.target), node.value)
        elif isinstance(node, ast.AugAssign):
            link(_bound_names(node.target), node.value)
        elif isinstance(node, ast.NamedExpr):
            link(_bound_names(node.target), node.value)
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            link(_bound_names(node.target), node.iter)
        elif isinstance(node, ast.comprehension):
            link(_bound_names(node.target), node.iter)
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if item.optional_vars is not None:
                    link(_bound_names(item.optional_vars), item.context_expr)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and node.func.attr in _MUTATORS \
                and isinstance(node.func.value, ast.Name):
            for arg in node.args:
                link([node.func.value.id], arg)
    return edges


def _origins(edges: dict[str, set[str]], extra: set[str], exempt: set[str],
             seeds: dict[str, str]) -> dict[str, str]:
    """name -> the sensitive name its value ultimately came from.

    `seeds` carries names that are tainted for a reason other than their own
    spelling -- a function whose innocuous name returns a sensitively-named
    value. Without it the rule stops at the function boundary and CodeQL, which
    does not, still fires.
    """
    names = set(edges) | extra | set(seeds)
    for srcs in edges.values():
        names |= srcs
    origin: dict[str, str] = {
        n: n for n in names if n not in exempt and is_sensitive_name(n)}
    for name, src in seeds.items():
        if name not in exempt:
            origin.setdefault(name, src)
    changed = True
    while changed:
        changed = False
        for name, srcs in edges.items():
            if name in exempt or name in origin:
                continue
            hit = next((origin[s] for s in sorted(srcs) if s in origin), None)
            if hit is not None:
                origin[name] = hit
                changed = True
    return origin


def _log_calls(nodes: Sequence[ast.AST]) -> list[tuple[ast.Call, list[ast.expr]]]:
    return [(n, args) for n in nodes if isinstance(n, ast.Call)
            for args in [_log_sink_args(n)] if args is not None]


def scan_source(source: str, filename: str) -> list[Violation]:
    """Every identifier in `source` whose value reaches a log under a bad name."""
    tree = ast.parse(source, filename=filename)
    exempt = _pattern_constants(tree)

    scopes = [s for s in ast.walk(tree) if _is_scope(s)]
    facts = [(s, nodes, _edges(nodes)) for s in scopes for nodes in [_own_nodes(s)]]
    top_level = {s.name for s in tree.body
                 if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef))}

    # ONE HOP out of the function that names the value, and no further.
    #
    # `scan_for_secrets` was caught at its own call site (zero hops). A helper
    # that merely RETURNS such a value needs one hop, and _TOKEN_RUN -> a
    # findings list -> the caller's print is exactly that shape, so one hop is
    # required. Chaining producers into producers without a bound is NOT: at
    # unbounded depth this reaches scripts/spec_to_test.py, where a lexer's
    # `tokens` list travels through five functions into
    # `print(f"...{output_file}")`. CodeQL runs on every push and pull request
    # here with security_alerts_threshold "all" and has never reported that
    # chain, so following it would make this rule stricter than the analyzer it
    # models -- and a rule that demands renames the tool does not ask for is a
    # rule somebody switches off. The bound is on DEPTH, uniformly; no name is
    # exempted, and any one-hop `tokens` still fails.
    producers: dict[str, str] = {}
    for scope, nodes, edges in facts:
        if not isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if scope.name not in top_level:
            continue
        returned: set[str] = set()
        for n in nodes:
            if isinstance(n, ast.Return) and n.value is not None:
                returned |= _identifiers(n.value)
        origin = _origins(edges, returned, exempt, {})
        hit = next((origin[r] for r in sorted(returned) if r in origin), None)
        if hit is not None:
            producers[scope.name] = hit
    seeds = producers

    found: list[Violation] = []
    for _, nodes, edges in facts:
        calls = _log_calls(nodes)
        logged: set[str] = set()
        for _, args in calls:
            for arg in args:
                logged |= _identifiers(arg)
        origin = _origins(edges, logged, exempt, seeds)
        for call, args in calls:
            hits: set[str] = set()
            for arg in args:
                hits |= _identifiers(arg)
            for name in sorted(hits):
                if name in exempt or name not in origin:
                    continue
                found.append(Violation(filename, call.lineno, name, origin[name]))
    return sorted(set(found))


def scan_path(path: Path) -> list[Violation]:
    rel = path.relative_to(REPO).as_posix()
    return scan_source(path.read_text(encoding="utf-8"), rel)


def script_files() -> list[Path]:
    return sorted(p for p in SCRIPTS.glob("*.py") if p.name != "__init__.py")


def _defined_callables(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=path.name)
    return {n.name for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}


# ---------------------------------------------------------------------------
# THE MATCHER ITSELF
# ---------------------------------------------------------------------------
def test_sensitive_tokens_match_word_aware() -> None:
    for name in ("secret", "get_secret_value", "SECRETS", "the_credential",
                 "credentials", "token_run", "TOKENS", "authToken", "password",
                 "passwd", "apikey", "api_key", "API_KEY", "apiKey",
                 "private_key", "privateKey", "PRIVATE_KEYS"):
        assert is_sensitive_name(name), f"{name!r} should match"


def test_lookalike_names_do_not_match() -> None:
    # Substring matching flags every one of these. That is the failure mode
    # that gets a naming rule deleted, so it is pinned here.
    for name in ("tokenize", "tokenizer", "detokenize", "sortedcontainers",
                 "container", "keyword", "keys", "private", "credentialise",
                 "passwd_", "tokens_"):
        expected = name in {"passwd_", "tokens_"}
        assert is_sensitive_name(name) is expected, f"{name!r} misjudged"


# ---------------------------------------------------------------------------
# POSITIVE CONTROL -- a guard that has never fired is not known to work
# ---------------------------------------------------------------------------
VIOLATING_SOURCE: Final = '''
def get_secret_value() -> str:
    return "status"


def report() -> None:
    print(f"  value: {get_secret_value()}")
'''

VIOLATING_INDIRECT: Final = '''
def scan_for_secrets(text: str) -> list[str]:
    return [text]


def report(text: str) -> None:
    findings = scan_for_secrets(text)
    for line in findings:
        print(line)
'''

CLEAN_SOURCE: Final = '''
import re

_LITERAL_PREFIXES = ("github_pat_", "ghp_", "AKIA")
_SK_KEY = re.compile(r"sk-[A-Za-z0-9]{16,}")


def tokenize(text: str) -> list[str]:
    return text.split()


def scan_for_disclosure_shapes(text: str) -> list[str]:
    findings = []
    for prefix in _LITERAL_PREFIXES:
        if prefix in text:
            findings.append(f"prefix {prefix!r} at {text.find(prefix)}")
    return findings


def report(text: str) -> None:
    for finding in scan_for_disclosure_shapes(text):
        print(finding)
    print(f"searched {len(tokenize(text))} words for {_LITERAL_PREFIXES}")
'''


def test_positive_control_direct_call_is_flagged() -> None:
    hits = scan_source(VIOLATING_SOURCE, "<positive-control>")
    assert [h.identifier for h in hits] == ["get_secret_value"], hits


def test_positive_control_through_a_variable_is_flagged() -> None:
    # The 2024 defect's exact shape: the sensitive name is a function, and the
    # printed value has already passed through two locals.
    hits = scan_source(VIOLATING_INDIRECT, "<positive-control>")
    assert [h.identifier for h in hits] == ["line"], hits
    assert hits[0].origin == "scan_for_secrets", hits


RETURNING_SOURCE: Final = '''
import re

_TOKEN_RUN = re.compile(r"[A-Za-z0-9]{32,}")


def find_runs(text: str) -> list[str]:
    hits = []
    for m in _TOKEN_RUN.finditer(text):
        hits.append(f"run of {len(m.group(0))} chars at {m.start()}")
    return hits


def main(text: str) -> None:
    for hit in find_runs(text):
        print(hit)
'''


def test_negative_control_pattern_constants_are_not_flagged() -> None:
    assert scan_source(CLEAN_SOURCE, "<negative-control>") == []


def test_the_pattern_constant_carve_out_is_load_bearing() -> None:
    """Without the carve-out this exact shape false-alarms, so pin both halves.

    `_TOKEN_RUN` is a compiled search pattern whose matches reach a print one
    hop away. That is a real flow; what makes it safe is that the constant is
    literal data, not a value derived from a secret.
    """
    assert scan_source(RETURNING_SOURCE, "<carve-out>") == []
    stripped = RETURNING_SOURCE.replace("_TOKEN_RUN = re.compile", "_TOKEN_RUN = _make")
    hits = scan_source(stripped, "<carve-out>")
    assert [h.origin for h in hits] == ["_TOKEN_RUN"], hits


def test_one_hop_is_followed_and_two_are_not() -> None:
    """The rule's stated limit, pinned so it cannot drift by accident.

    One hop is needed (the carve-out case above). Unbounded chaining is
    stricter than CodeQL, which has never reported the five-function
    lexer chain in scripts/spec_to_test.py.
    """
    one_hop = ('def make() -> str:\n'
               '    token = "x"\n'
               '    return token\n'
               'def show() -> None:\n'
               '    print(make())\n')
    assert [h.origin for h in scan_source(one_hop, "<one-hop>")] == ["token"]

    two_hops = ('def make() -> str:\n'
                '    token = "x"\n'
                '    return token\n'
                'def relay() -> str:\n'
                '    return make()\n'
                'def show() -> None:\n'
                '    print(relay())\n')
    assert scan_source(two_hops, "<two-hops>") == []


def test_a_comment_mentioning_secret_is_not_an_identifier() -> None:
    src = ('def f(v: str) -> None:\n'
           '    # the secret must never reach this log\n'
           '    print("no secret here", v)\n')
    assert scan_source(src, "<comment>") == []


# ---------------------------------------------------------------------------
# THE SWEEP
# ---------------------------------------------------------------------------
def test_no_script_logs_a_sensitively_named_value() -> None:
    files = script_files()
    assert files, f"no scripts found under {SCRIPTS}"
    hits: list[Violation] = []
    for path in files:
        hits.extend(scan_path(path))
    assert not hits, (
        "CodeQL py/clear-text-logging-sensitive-data will fire on these. Rename "
        "the identifier to describe what it does, do not suppress the alert:\n"
        + "\n".join("  " + h.describe() for h in hits))


# ---------------------------------------------------------------------------
# THE TWO KNOWN FIXES STAY FIXED
# ---------------------------------------------------------------------------
def test_security_gate_defines_no_secret_named_callable() -> None:
    names = _defined_callables(SCRIPTS / "security_gate.py")
    assert not [n for n in names if "secret" in n.lower()], sorted(names)


def test_generate_evidence_defines_no_secret_named_callable() -> None:
    names = _defined_callables(SCRIPTS / "generate_evidence.py")
    assert not [n for n in names if "secret" in n.lower()], sorted(names)


def test_the_renamed_replacements_still_exist() -> None:
    # Without this, deleting the function passes the two tests above.
    assert "check_is_status_literal" in _defined_callables(
        SCRIPTS / "security_gate.py")
    assert "scan_for_disclosure_shapes" in _defined_callables(
        SCRIPTS / "generate_evidence.py")
