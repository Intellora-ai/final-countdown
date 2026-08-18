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
     assigned from shutil.which, or sys.executable (the running interpreter).
     A bare name like "axle" is rejected: PATH decides what runs.
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
from pathlib import Path
from collections.abc import Sequence
from typing import Any

# (test_id, file) pairs eligible for verification. Eligibility is not approval:
# each still has to pass check_subprocess_safety below.
# B105 fires on any string constant whose NAME contains "pass" - our status
# constants ("PASS") trip it. B608 fires on string concatenation that resembles
# SQL - our regex builder trips it. Both are heuristics, so they get the same
# treatment as subprocess: an exception is granted only if the claim is
# re-derived from the source, never because the id was allowlisted.
HEURISTIC = {("B105", "scripts/gate.py"), ("B105", "scripts/aggregate_gates.py"),
             ("B608", "scripts/gate_integrity.py")}

STATUS_LITERALS = {"PASS", "FAIL", "INFRASTRUCTURE_FAILURE", "SKIPPED",
                   "NOT_APPLICABLE", "UNKNOWN"}
DB_MODULES = {"sqlite3", "psycopg2", "pymysql", "sqlalchemy", "asyncpg", "MySQLdb"}


def check_not_a_secret(path: str, line_no: int) -> tuple[bool, str]:
    """B105: the flagged string must be a known status literal, not a credential."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    if not (1 <= line_no <= len(lines)):
        return False, "line out of range"
    line = lines[line_no - 1]
    hits = [lit for lit in STATUS_LITERALS if f'"{lit}"' in line]
    if not hits:
        return False, "flagged string is not a known status literal"
    return True, f"status constant {hits[0]!r}, not a credential; no secret material"


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


ELIGIBLE = {("B404", "scripts/proof_gate.py"), ("B603", "scripts/proof_gate.py"),
            ("B404", "scripts/security_gate.py"), ("B603", "scripts/security_gate.py"),
            ("B404", "scripts/axle_health.py"), ("B603", "scripts/axle_health.py"),
            ("B404", "scripts/gate.py"), ("B603", "scripts/gate.py"),
            ("B404", "scripts/run_gate.py"), ("B603", "scripts/run_gate.py")}


def check_subprocess_safety(path: str) -> tuple[bool, str]:
    """Re-derive the safe pattern from source. Returns (ok, evidence)."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    # Both `x = shutil.which(..)` and `x: str | None = shutil.which(..)` count;
    # an annotation does not make the call less resolved.
    which_vars: set[str] = set()
    for node in ast.walk(tree):
        value = getattr(node, "value", None)
        # typing.cast(T, shutil.which(..)) is a type-level assertion with no
        # runtime effect, so unwrap it: the value is still a resolved path.
        if (isinstance(value, ast.Call)
                and ast.unparse(value.func) == "cast" and len(value.args) == 2):
            value = value.args[1]
        if not (isinstance(value, ast.Call)
                and ast.unparse(value.func).endswith("shutil.which")):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else (
            [node.target] if isinstance(node, ast.AnnAssign) else [])
        which_vars.update(t.id for t in targets if isinstance(t, ast.Name))

    # Follow one level of aliasing: `resolved = exe` where exe came from
    # shutil.which is still a resolved absolute path. Narrowing a value for the
    # type checker must not cost the security exception.
    for node in ast.walk(tree):
        value = getattr(node, "value", None)
        if not (isinstance(value, ast.Name) and value.id in which_vars):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else (
            [node.target] if isinstance(node, ast.AnnAssign) else [])
        which_vars.update(t.id for t in targets if isinstance(t, ast.Name))

    calls = [
        n for n in ast.walk(tree)
        if isinstance(n, ast.Call) and ast.unparse(n.func) in {"subprocess.run", "subprocess.Popen"}
    ]
    if not calls:
        return False, "no subprocess call found — stale exception"

    evidence: list[str] = []
    for call in calls:
        kw = {k.arg: k.value for k in call.keywords}
        if "shell" in kw and not (isinstance(kw["shell"], ast.Constant) and kw["shell"].value is False):
            return False, "shell=True"
        if not call.args or not isinstance(call.args[0], ast.List):
            return False, "argv is not a list literal"
        head = call.args[0].elts[0]
        head_src = ast.unparse(head)
        resolved = (isinstance(head, ast.Name) and head.id in which_vars) or \
                   head_src == "sys.executable"
        if not resolved:
            return False, (f"argv[0] is {head_src!r} — not shutil.which(...) "
                           "and not sys.executable")
        if "timeout" not in kw:
            return False, "no timeout"
        origin = "sys.executable" if head_src == "sys.executable" else f"{head_src} from shutil.which"
        evidence.append(
            f"shell=False, argv list literal, argv[0]={origin}, timeout set")
    return True, "; ".join(evidence)


def run_bandit(targets: Sequence[str]) -> list[dict[str, Any]]:
    out = subprocess.run(
        [sys.executable, "-m", "bandit", "-r", *targets, "-f", "json",
         "--severity-level", "low", "--confidence-level", "low"],
        capture_output=True, text=True, timeout=300,
    )
    try:
        return json.loads(out.stdout).get("results", [])
    except ValueError:
        print(out.stdout[:400] or out.stderr[:400], file=sys.stderr)
        sys.exit(2)


def main(targets: Sequence[str]) -> int:
    findings = run_bandit(targets)
    verified: list[tuple[tuple[str, str], str]] = []
    unresolved: list[dict[str, Any]] = []

    for f in findings:
        key = (f["test_id"], f["filename"].lstrip("./"))
        if key in HEURISTIC:
            checker = check_not_a_secret if key[0] == "B105" else check_no_sql
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
        print(f"  UNRESOLVED  {f['test_id']} {f['filename'].lstrip('./')}:{f['line_number']}"
              f"  {f.get('_reason', f['issue_text'][:80])}")

    if unresolved:
        print(f"\n  FAIL — {len(unresolved)} finding(s) not covered by a verified safe pattern")
        return 1
    print(f"\n  PASS (with {len(verified)} verified exceptions)")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("targets", nargs="*", default=["src", "scripts"])
    ns = p.parse_args()
    sys.exit(main(ns.targets or ["src", "scripts"]))
