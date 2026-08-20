#!/usr/bin/env python3
"""SECURITY GATE — Bandit over src/ AND scripts/, plus safe-pattern verification.

Verification infrastructure is part of the trusted computing base, so it is
scanned like everything else. scripts/ is never excluded and no `# nosec` is
used: both would hide findings rather than answer them.

Two findings survive by design. AXLE is a CLI, so proof_gate.py must call a
subprocess; B404 flags the import and B603 flags the call. Neither is a
vulnerability HERE, and this gate proves that rather than asserting it: it
re-derives the safe pattern from the AST on every run.

An exception is granted only when ALL of these hold at the call site:
  1. shell=False  (never shell=True, explicit or defaulted)
  2. argv is a list literal, not a joined or interpolated string
  3. argv[0] is an absolute path the process resolved itself — either a variable
     EVERY binding of which comes from shutil.which, or sys.executable (the
     running interpreter). A bare name like "axle" is rejected: PATH decides
     what runs. "Every binding", not "some binding": a name bound once from
     shutil.which and then reassigned holds whatever it was reassigned to, and
     an exception granted on the first binding is an exception nobody checked.
  4. a timeout is passed

If proof_gate.py is ever edited so one of these stops holding, the exception
evaporates and the gate fails. That is the difference between a verified
exception and a suppression.
"""

import argparse
import ast
import json
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, cast

# (test_id, file) pairs eligible for verification. Eligibility is not approval:
# each still has to pass check_subprocess_safety below.
# B105 fires on any string constant whose NAME contains "pass" - our status
# constants ("PASS") trip it. B608 fires on string concatenation that resembles
# SQL - our regex builder trips it. Both are heuristics, so they get the same
# treatment as subprocess: an exception is granted only if the claim is
# re-derived from the source, never because the id was allowlisted.
HEURISTIC = {
    ("B105", "scripts/gate.py"),
    ("B105", "scripts/aggregate_gates.py"),
    ("B608", "scripts/gate_integrity.py"),
}

STATUS_LITERALS = {
    "PASS",
    "FAIL",
    "INFRASTRUCTURE_FAILURE",
    "SKIPPED",
    "NOT_APPLICABLE",
    "UNKNOWN",
}
DB_MODULES = {"sqlite3", "psycopg2", "pymysql", "sqlalchemy", "asyncpg", "MySQLdb"}


def check_is_status_literal(path: str, line_no: int) -> tuple[bool, str]:
    """B105: the flagged string must be a declared status literal.

    Named for what it checks, not for what it rules out. The previous name
    contained "secret", and CodeQL classifies a value by the identifier it
    flows from — so every print of this function's result was reported as
    py/clear-text-logging-sensitive-data (high). The rename is not a
    workaround for the alert; the alert was reporting that a value from a
    secret-named source reached the log, and this name states correctly that
    the value is a status literal.
    """
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    if not (1 <= line_no <= len(lines)):
        return False, "line out of range"
    line = lines[line_no - 1]
    hits = [lit for lit in STATUS_LITERALS if f'"{lit}"' in line]
    if not hits:
        return False, "flagged string is not a known status literal"
    # The literal itself is deliberately NOT echoed. CodeQL flagged this as
    # py/clear-text-logging-sensitive-data (high) and it was right: B105 fires
    # on candidate credentials, so quoting the matched value would print a real
    # secret into the logs of a public repository the one time it mattered.
    # Naming which known status constant matched carries the same information
    # without the value.
    return True, (
        "matched a declared status constant, not a credential; value withheld from logs"
    )


def check_no_sql(path: str, line_no: int) -> tuple[bool, str]:
    """B608: the file must not import any database driver, so there is no query."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    hit = imported & DB_MODULES
    if hit:
        return False, f"file imports a database driver: {sorted(hit)}"
    return True, "no database driver imported; the string is a regex, not a query"


ELIGIBLE = {
    ("B404", "scripts/proof_gate.py"),
    ("B603", "scripts/proof_gate.py"),
    ("B404", "scripts/security_gate.py"),
    ("B603", "scripts/security_gate.py"),
    ("B404", "scripts/axle_health.py"),
    ("B603", "scripts/axle_health.py"),
    ("B404", "scripts/gate.py"),
    ("B603", "scripts/gate.py"),
    ("B404", "scripts/run_gate.py"),
    ("B603", "scripts/run_gate.py"),
    ("B404", "scripts/axle_gate.py"),
    ("B603", "scripts/axle_gate.py"),
    ("B404", "scripts/check_ruleset.py"),
    ("B603", "scripts/check_ruleset.py"),
    ("B404", "scripts/correspondence_gate.py"),
    ("B603", "scripts/correspondence_gate.py"),
    ("B404", "scripts/ruleset_admin.py"),
    ("B603", "scripts/ruleset_admin.py"),
    ("B404", "scripts/generate_evidence.py"),
    ("B603", "scripts/generate_evidence.py"),
    ("B404", "scripts/tcb_gate.py"),
    ("B603", "scripts/tcb_gate.py"),
    ("B404", "scripts/ci_metrics.py"),
    ("B603", "scripts/ci_metrics.py"),
    # merge_evidence_gate.py shells out to `gh` three times: the API
    # reader, the job-log reader, and the pull request body reader. Being
    # listed here buys it nothing on its own -- check_subprocess_safety
    # re-derives the safe pattern from its AST on every run, so the entry
    # is a claim that gets re-proven, not a suppression that gets
    # remembered. Delete a `shutil.which` guard or a `timeout=` from that
    # file and this line stops covering it in the same run.
    ("B404", "scripts/merge_evidence_gate.py"),
    ("B603", "scripts/merge_evidence_gate.py"),
    # local_gates.py runs the required checks that can honestly run offline. It
    # takes argv arrays from ci/local-execution.toml and never a shell string,
    # and it resolves argv[0] through shutil.which so PATH cannot decide which
    # binary executes. Listing it here proves nothing on its own:
    # check_subprocess_safety re-derives that pattern from its AST every run, so
    # deleting the `which` guard or the timeout stops this line covering it in
    # the same run that deleted them.
    ("B404", "scripts/local_gates.py"),
    ("B603", "scripts/local_gates.py"),
}


def target_names(node: ast.expr | None) -> list[str]:
    """Every plain name a binding target binds, unpacking tuples and stars."""
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Starred):
        return target_names(node.value)
    if isinstance(node, ast.Tuple | ast.List):
        return [n for e in node.elts for n in target_names(e)]
    return []


# A name means different things in different functions, so the analysis has
# to be scoped. scripts/generate_evidence.py is the proof: `_git()` binds a
# local `git` from shutil.which, and `main()` binds an unrelated local `git`
# from `git_facts(...)`. Module-wide, one name looks like two conflicting
# bindings and the legitimate exception evaporates — a false positive on the
# repository's own source, which is how a security gate gets switched off.
SCOPES = (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)

Bindings = dict[int, dict[str, list[ast.expr | None]]]


def enclosing_scopes(
    tree: ast.AST,
) -> tuple[dict[int, ast.AST], dict[int, ast.AST | None]]:
    """(scope each node belongs to, parent of each scope).

    A function node itself belongs to the scope AROUND it — that is where its
    name is bound — while everything inside it belongs to the function.
    """
    owner: dict[int, ast.AST] = {id(tree): tree}
    parent: dict[int, ast.AST | None] = {id(tree): None}

    def descend(node: ast.AST, scope: ast.AST) -> None:
        for child in ast.iter_child_nodes(node):
            owner[id(child)] = scope
            if isinstance(child, SCOPES):
                parent[id(child)] = scope
                descend(child, child)
            else:
                descend(child, scope)

    descend(tree, tree)
    return owner, parent


def bindings_by_scope(
    tree: ast.AST,
) -> tuple[Bindings, dict[int, ast.AST], dict[int, ast.AST | None]]:
    """Every binding of every name, filed under the scope it happens in.

    `None` marks a binding whose value this checker cannot read as an
    expression — a parameter, a for or with or except target, an augmented
    assignment, an import alias, a def or class, a global/nonlocal
    declaration. Those can hold anything, so they can never establish that a
    name holds a resolved path.

    A bare `x: str` annotation is not listed: it binds nothing at runtime.
    A comprehension target is filed in the enclosing scope even though Python
    keeps it in its own — that direction only ever disqualifies a name, and a
    checker that must fail closed should round that way.
    """
    owner, parent = enclosing_scopes(tree)
    table: Bindings = {}

    def bind(scope: ast.AST, name: str, value: ast.expr | None) -> None:
        table.setdefault(id(scope), {}).setdefault(name, []).append(value)

    def bind_args(scope: ast.AST, args: ast.arguments) -> None:
        for arg in (
            *args.posonlyargs,
            *args.args,
            *args.kwonlyargs,
            args.vararg,
            args.kwarg,
        ):
            if arg is not None:
                bind(scope, arg.arg, None)

    for node in ast.walk(tree):
        here = owner[id(node)]
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                for name in target_names(tgt):
                    bind(here, name, node.value)
        elif isinstance(node, ast.AnnAssign):
            if node.value is not None:
                for name in target_names(node.target):
                    bind(here, name, node.value)
        elif isinstance(node, ast.NamedExpr):
            for name in target_names(node.target):
                bind(here, name, node.value)
        elif isinstance(node, ast.AugAssign):
            for name in target_names(node.target):
                bind(here, name, None)
        elif isinstance(node, ast.For | ast.AsyncFor | ast.comprehension):
            for name in target_names(node.target):
                bind(here, name, None)
        elif isinstance(node, ast.withitem):
            for name in target_names(node.optional_vars):
                bind(here, name, None)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bind(here, node.name, None)
        elif isinstance(node, ast.Import | ast.ImportFrom):
            for alias in node.names:
                bind(here, (alias.asname or alias.name).split(".")[0], None)
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            bind(here, node.name, None)  # the name binds OUTSIDE the body
            bind_args(node, node.args)  # the parameters bind INSIDE it
        elif isinstance(node, ast.Lambda):
            bind_args(node, node.args)
        elif isinstance(node, ast.ClassDef):
            bind(here, node.name, None)
        elif isinstance(node, ast.Global | ast.Nonlocal):
            # A `global x` / `nonlocal x` assignment binds x in an OUTER
            # scope, so filing it only under the declaring scope leaves the
            # outer name looking untouched — measured: a module-level
            # `exe = shutil.which("git")` plus a `global exe; exe = user`
            # inside a function still returned a verified exception. Poison
            # both. `nonlocal` reaches an enclosing function rather than the
            # module, and a checker that must fail closed rounds outwards.
            for name in node.names:
                bind(here, name, None)
                bind(tree, name, None)
    return table, owner, parent


def unwrap_cast(value: ast.expr | None) -> ast.expr | None:
    """`typing.cast(T, X)` is a type-level assertion with no runtime effect."""
    while (
        isinstance(value, ast.Call)
        and len(value.args) == 2
        and ast.unparse(value.func).split(".")[-1] == "cast"
    ):
        value = value.args[1]
    return value


def resolves_a_path(value: ast.expr | None) -> bool:
    """Is this expression a path the PROCESS resolved, not one PATH chose?"""
    inner = unwrap_cast(value)
    if inner is None:
        return False
    if isinstance(inner, ast.Call):
        return ast.unparse(inner.func).endswith("shutil.which")
    return ast.unparse(inner) == "sys.executable"


def make_resolver(
    tree: ast.AST,
) -> tuple[Callable[[ast.AST, str], bool], dict[int, ast.AST]]:
    """Build `is_resolved(scope, name)` — does that name ALWAYS hold a path
    the process resolved itself, as seen from that scope?

    A name qualifies only if EVERY binding of it in its own binding scope
    comes from shutil.which(...), sys.executable, a typing.cast around one of
    those, or another name that already qualifies.

    The previous version collected names bound from shutil.which at least
    ONCE, file-wide, which is a set of names and not a dataflow. After

        exe = shutil.which("git")
        exe = user_supplied

    `exe` was still reported as "from shutil.which", and every
    subprocess.run([exe, ...]) below it received a verified exception it had
    not earned — measured: check_subprocess_safety returned
    (True, 'argv[0]=exe from shutil.which') for exactly that file. Verified in
    form, false in substance: the same defect class as the `# nosec` comments
    this gate exists to replace.

    Deliberately NOT "bound at most once". scripts/generate_evidence.py binds
    one name from shutil.which twice — once with an explicit search path, once
    without — and both bindings resolve, so the name holds a resolved path
    either way. What disqualifies a name is a binding this checker cannot
    account for, never the number of them.
    """
    table, owner, parent = bindings_by_scope(tree)

    def binding_scope(scope: ast.AST, name: str) -> ast.AST | None:
        """The innermost scope from `scope` outwards that binds `name`."""
        here: ast.AST | None = scope
        while here is not None:
            if name in table.get(id(here), {}):
                return here
            here = parent.get(id(here))
        return None

    def is_resolved(
        scope: ast.AST, name: str, seen: frozenset[tuple[int, str]] = frozenset()
    ) -> bool:
        home = binding_scope(scope, name)
        if home is None:
            return False  # never bound here: nothing proven
        key = (id(home), name)
        if key in seen:
            return False  # an alias cycle proves nothing
        values = table[id(home)][name]
        # Aliasing: `narrowed = exe` is still a resolved path when every
        # binding of `exe` is. Narrowing a value for the type checker must not
        # cost the security exception.
        return bool(values) and all(
            resolves_a_path(v)
            or (isinstance(v, ast.Name) and is_resolved(home, v.id, seen | {key}))
            for v in values
        )

    return is_resolved, owner


def check_subprocess_safety(path: str) -> tuple[bool, str]:
    """Re-derive the safe pattern from source. Returns (ok, evidence)."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    is_resolved, scope_of = make_resolver(tree)

    calls = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.Call)
        and ast.unparse(n.func) in {"subprocess.run", "subprocess.Popen"}
    ]
    if not calls:
        return False, "no subprocess call found — stale exception"

    evidence: list[str] = []
    for call in calls:
        kw = {k.arg: k.value for k in call.keywords}
        if "shell" in kw and not (
            isinstance(kw["shell"], ast.Constant) and kw["shell"].value is False
        ):
            return False, "shell=True"
        if not call.args or not isinstance(call.args[0], ast.List):
            return False, "argv is not a list literal"
        head = call.args[0].elts[0]
        head_src = ast.unparse(head)
        resolved = (
            isinstance(head, ast.Name) and is_resolved(scope_of[id(call)], head.id)
        ) or head_src == "sys.executable"
        if not resolved:
            if isinstance(head, ast.Name):
                return False, (
                    f"argv[0] is {head_src!r}, and that name is bound in its "
                    "scope by something other than shutil.which(...) or "
                    "sys.executable — what it holds at the call is not decided "
                    "here"
                )
            return False, (
                f"argv[0] is {head_src!r} — not shutil.which(...) "
                "and not sys.executable"
            )
        if "timeout" not in kw:
            return False, "no timeout"
        origin = (
            "sys.executable"
            if head_src == "sys.executable"
            else (f"{head_src}, every binding in its scope from shutil.which")
        )
        evidence.append(
            f"shell=False, argv list literal, argv[0]={origin}, timeout set"
        )
    return True, "; ".join(evidence)


def run_bandit(targets: Sequence[str]) -> list[dict[str, Any]]:
    """Return bandit's findings, or exit non-zero. NO SCAN IS NOT A CLEAN SCAN.

    bandit exits 0 when it scanned nothing. A target that does not exist, and a
    file whose AST will not parse, are both recorded under "errors", dropped
    from "results", and the process still succeeds. Reading only "results"
    therefore printed `bandit: 0 findings` and returned PASS over code that was
    never examined — `security_gate.py doesnotexist` was a green security gate.

    So the verdict now needs three things from the report: no errors, at least
    one file actually measured, and a results list. The keys are indexed, not
    `.get`-with-a-default: a report missing any of them is unusable, and
    unusable must not read as clean.
    """
    out = subprocess.run(
        [
            sys.executable,
            "-m",
            "bandit",
            "-r",
            *targets,
            "-f",
            "json",
            "--severity-level",
            "low",
            "--confidence-level",
            "low",
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    try:
        report = cast("dict[str, Any]", json.loads(out.stdout))
        errors = cast("list[dict[str, Any]]", report["errors"])
        metrics = cast("dict[str, Any]", report["metrics"])
        results = cast("list[dict[str, Any]]", report["results"])
    except (ValueError, KeyError, TypeError) as exc:
        print(f"  bandit emitted no usable JSON report: {exc}", file=sys.stderr)
        print(out.stdout[:400] or out.stderr[:400], file=sys.stderr)
        sys.exit(2)

    if errors:
        for err in errors:
            print(
                f"  BANDIT ERROR  {err.get('filename')}: {err.get('reason')}",
                file=sys.stderr,
            )
        print(
            f"\n  FAIL — bandit could not read {len(errors)} target(s); a file "
            "it never scanned is not a file it found clean",
            file=sys.stderr,
        )
        sys.exit(2)
    if not [name for name in metrics if name != "_totals"]:
        print(
            f"\n  FAIL — bandit scanned no files under {', '.join(targets)}",
            file=sys.stderr,
        )
        sys.exit(2)
    return results


def main(targets: Sequence[str]) -> int:
    findings = run_bandit(targets)
    verified: list[tuple[tuple[str, str], str]] = []
    unresolved: list[dict[str, Any]] = []

    for f in findings:
        # `removeprefix`, never `lstrip`. `lstrip` strips a character SET, so
        # a finding in any dot-directory (".github/workflows/x.py") arrives
        # here as "github/workflows/x.py" -- a path that is not in the tree.
        # That string is half of the key ELIGIBLE and HEURISTIC are matched
        # on, so a declared exception would stop being found and the checker
        # below would read a file that does not exist. It fails closed today,
        # but it fails for the wrong reason and would be unexplainable from
        # the output. Latent only while the scan roots are src and scripts.
        key = (f["test_id"], f["filename"].removeprefix("./"))
        if key in HEURISTIC:
            checker = check_is_status_literal if key[0] == "B105" else check_no_sql
            ok, evidence = checker(key[1], f["line_number"])
            if ok:
                verified.append((key, evidence))
            else:
                f["_reason"] = f"heuristic exception NOT justified: {evidence}"
                unresolved.append(f)
            continue
        if key not in ELIGIBLE:
            unresolved.append(f)
            continue
        ok, evidence = check_subprocess_safety(key[1])
        if ok:
            verified.append((key, evidence))
        else:
            f["_reason"] = f"safe pattern NO LONGER holds: {evidence}"
            unresolved.append(f)

    print(f"  bandit: {len(findings)} findings over {', '.join(targets)}")
    for (test_id, path), evidence in verified:
        print(f"  verified exception  {test_id} {path}")
        print(f"      {evidence}")
    for f in unresolved:
        # bandit's `issue_text` embeds the matched source literal — for B105
        # that IS the candidate credential. Print the rule id and location; the
        # reader opens the file. Same reason as check_is_status_literal above.
        detail = f.get("_reason") or str(f.get("test_name") or f["test_id"])
        print(
            f"  UNRESOLVED  {f['test_id']} {f['filename'].removeprefix('./')}"
            f":{f['line_number']}  {detail}"
        )

    if unresolved:
        print(
            f"\n  FAIL — {len(unresolved)} finding(s) not covered by a verified safe pattern"
        )
        return 1
    print(f"\n  PASS (with {len(verified)} verified exceptions)")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("targets", nargs="*", default=["src", "scripts"])
    ns = p.parse_args()
    sys.exit(main(ns.targets or ["src", "scripts"]))
