"""Inside one gate, a check that never ran is not a check that passed.

WHY THIS EXISTS.

Three gates wrap a CHAIN of verifications in a single `run_gate.py`
invocation, under `set -e`:

    bandit          security_gate.py · sarif_suppress.py · shellcheck ·
                    credential_scan.py                            (4 steps)
    correspondence  correspondence_gate.py · pytest -m axle       (2 steps)
    spec-composition / honest-report / mutmut
                    verify_per_function.sh, one verifier call per source file

`set -e` is what makes the gate's exit code the chain's exit code, and it is
also what stops the chain at the first non-zero exit. Every later step NEVER
RAN, and the report said nothing about them. Three findings from step 1 read
as "three problems" when the truth was "three problems and three unknowns".

That is the distinction this repository draws everywhere else and had not
drawn here. registry_gate.py: "'could not check' is not 'checked and fine'".
check_ruleset.py: "could not compare" is not "aligned". aggregate_gates.py
turns a missing report into a blocking UNKNOWN for the same reason.

It also silently rewarded stopping early. Findings are counted across runs, so
a chain that died at step 1 with three findings looked BETTER than one that
ran all four and found four -- when the first one checked less.

ACROSS gates the relation genuinely does not exist, and blocker_report.py
proves it: no gate job declares `needs:` on another, so five red gates are
five problems. These tests assert the within-gate case without weakening that
claim, which tests/test_blocker_report.py owns.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import blocker_report  # noqa: E402
import gate as gate_mod  # noqa: E402
import run_gate  # noqa: E402

BANDIT_CHAIN_STOPPED_AT_ONE = """\
== bandit gate 1/4: security gate
  bandit: 2 findings over src scripts
  UNRESOLVED  B602 scripts/gate.py:3  subprocess with shell
  UNRESOLVED  B605 scripts/gate.py:9  start process with a shell

  FAIL — 2 finding(s) not covered by a verified safe pattern
"""

CORRESPONDENCE_CHAIN_STOPPED_AT_ONE = """\
== correspondence gate 1/2: correspondence
❌ specs/add_spec.lean: the kernel rejected the file
"""

LOOP_STOPPED_AT_THE_SECOND_SOURCE = """\
verifying 4 source file(s)
── src/add.py ← specs/add_spec.lean
── src/clamp.py ← specs/clamp_spec.lean
❌ specs/clamp_spec.lean: vacuous — precondition holds for 0.00% of inputs
"""


# ---------------------------------------------------------------------------
# WHAT DID NOT RUN
# ---------------------------------------------------------------------------


def test_the_three_bandit_steps_that_never_ran_are_each_recorded() -> None:
    """Stopping at 1 of 4 leaves three verifications unexamined, not passing."""
    missed = run_gate.unreached("", BANDIT_CHAIN_STOPPED_AT_ONE)

    assert len(missed) == 3
    assert [f["where"] for f in missed] == ["step 2/4", "step 3/4", "step 4/4"]
    assert all(f["is_root_cause"] is False for f in missed)
    assert all(f["code"] == "NOT_RUN" for f in missed)


def test_an_unrun_step_is_unknown_and_not_an_error() -> None:
    """Nothing was found wrong in it. Nothing was looked at.

    Recording it as an ERROR would assert a defect that was never observed,
    which is the same overclaim the honest-report layer exists to refuse.
    """
    missed = run_gate.unreached("", BANDIT_CHAIN_STOPPED_AT_ONE)
    assert all(f["severity"] == "UNKNOWN" for f in missed)


def test_the_step_that_stopped_the_chain_is_named_in_every_consequence() -> None:
    """Its `echo` DID run, so its label is known and is not a guess."""
    missed = run_gate.unreached("", BANDIT_CHAIN_STOPPED_AT_ONE)
    assert all("security gate" in str(f["why"]) for f in missed)


def test_no_label_is_invented_for_a_step_that_never_printed_one() -> None:
    """Its `echo` never executed, so its name exists only in verify.yml.

    Reading the workflow from inside the gate would put a second copy of the
    step names here -- the duplicate declaration ci/gates.toml exists to
    prevent -- and a stale copy would name the WRONG step, which is worse than
    naming none. Index, total and the step that stopped are all recorded and
    all three are true.
    """
    missed = run_gate.unreached("", BANDIT_CHAIN_STOPPED_AT_ONE)
    for label in ("SARIF suppression", "shell analysis", "credential scan"):
        assert not any(label in json.dumps(f) for f in missed)


def test_a_chain_that_ran_to_its_last_step_reports_nothing_unreached() -> None:
    """The control. A gate that failed on its final check missed nothing."""
    assert (
        run_gate.unreached(
            "  CREDENTIAL SHAPE  aws-key-id  a.txt:1  (20 chars, value withheld)\n",
            "== bandit gate 4/4: credential scan\n",
        )
        == []
    )


def test_a_gate_that_is_not_a_chain_reports_nothing_unreached() -> None:
    """pyright and coverage are one command; there is no later step to miss."""
    assert run_gate.unreached("  scripts/gate.py:1:1 - error: bad\n", "") == []


def test_the_per_function_loop_records_the_sources_it_never_reached() -> None:
    """A gate whose verdict covers 2 of 4 functions has not covered 4."""
    missed = run_gate.unreached(LOOP_STOPPED_AT_THE_SECOND_SOURCE, "")

    assert len(missed) == 2
    assert [f["where"] for f in missed] == ["source 3/4", "source 4/4"]
    assert all("src/clamp.py" in str(f["why"]) for f in missed)


def test_a_loop_that_completed_reports_nothing_unreached() -> None:
    """The control: two sources announced, two reached."""
    assert (
        run_gate.unreached(
            "verifying 2 source file(s)\n"
            "── src/add.py ← specs/add_spec.lean\n"
            "── src/clamp.py ← specs/clamp_spec.lean\n"
            "  JOINT strength: 0.80\n",
            "",
        )
        == []
    )


def test_the_two_lines_the_loop_detector_keys_on_are_still_printed() -> None:
    """A dead regex reports nothing rather than failing.

    Both markers live in scripts/verify_per_function.sh and nowhere else. If
    either is reworded, `unreached` silently stops noticing that a gate
    covered two of four source files, and the gate goes back to reporting
    partial coverage as though it were full coverage.
    """
    source = (SCRIPTS / "verify_per_function.sh").read_text(encoding="utf-8")

    assert 'source file(s)"' in source, (
        "verify_per_function.sh no longer announces the size of its loop"
    )
    assert 'echo "── $src ← $specs"' in source, (
        "verify_per_function.sh no longer names each source as it reaches it"
    )


def test_the_chain_marker_the_step_detector_keys_on_is_still_printed() -> None:
    """Same guard for the two gates whose chain lives in the workflow."""
    workflow = (REPO / ".github" / "workflows" / "verify.yml").read_text(
        encoding="utf-8"
    )

    for marker in (
        "== bandit gate 1/4:",
        "== bandit gate 4/4:",
        "== correspondence gate 1/2:",
        "== correspondence gate 2/2:",
    ):
        assert marker in workflow, (
            f"verify.yml no longer prints {marker!r}; run_gate.unreached can "
            "no longer tell which verifications this gate skipped"
        )


# ---------------------------------------------------------------------------
# THE ROOT THEY POINT AT
# ---------------------------------------------------------------------------


def test_the_id_a_gate_will_derive_can_be_asked_for_in_advance() -> None:
    """`dependent_on` must name a handle that another `fail` really produces.

    A caller that cannot derive the id in advance can only guess, and a
    dependency pointing at a handle nothing carries is worse than none.
    """
    g = gate_mod.Gate("bandit")
    predicted = g.finding_id_for("B602 not covered", "scripts/gate.py:3")
    g.fail(what="B602 not covered", where="scripts/gate.py:3")

    assert g.failures[0]["finding_id"] == predicted


def test_the_predicted_id_matches_the_one_the_finalizer_prints() -> None:
    """Two ids for one defect is two defects to anyone comparing runs."""
    failure = {"what": "B602 not covered", "where": "scripts/gate.py:3"}
    assert gate_mod.finding_id(
        "bandit", failure["what"], failure["where"]
    ) == blocker_report.failure_id("bandit", failure)


def test_every_consequence_points_at_the_first_defect_the_chain_hit(
    tmp_path: Path,
) -> None:
    """End to end, through the wrapper, on a real report."""
    work = tmp_path / "run"
    (work / "reports").mkdir(parents=True)
    script = tmp_path / "chain.sh"
    script.write_text(
        "set -e\n"
        'echo "== bandit gate 1/4: security gate" >&2\n'
        'echo "  UNRESOLVED  B602 scripts/gate.py:3  shell is true"\n'
        'echo "  UNRESOLVED  B605 scripts/gate.py:9  a shell again"\n'
        "exit 1\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            PY,
            str(SCRIPTS / "run_gate.py"),
            "--name",
            "bandit",
            "--",
            "bash",
            str(script),
        ],
        cwd=work,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert result.returncode != 0, result.stdout + result.stderr

    report = json.loads((work / "reports" / "bandit.json").read_text(encoding="utf-8"))
    failures = report["failures"]
    roots = [f for f in failures if f["is_root_cause"]]
    consequences = [f for f in failures if not f["is_root_cause"]]

    assert len(roots) == 2, json.dumps(failures, indent=2)
    assert len(consequences) == 3, json.dumps(failures, indent=2)
    assert {f["dependent_on"] for f in consequences} == {roots[0]["finding_id"]}
    assert all(f["dependent_on"] is None for f in roots)


def test_a_failure_no_extractor_recognises_still_carries_its_consequences(
    tmp_path: Path,
) -> None:
    """The case the first draft of this got wrong.

    When no extractor matches, the single fallback record is written -- and
    that is exactly the case where the rest of the chain also did not run. If
    the dependency is computed only when findings were extracted, an opaque
    crash at step 1 of 4 silently reports the other three as nothing at all.
    """
    work = tmp_path / "run"
    (work / "reports").mkdir(parents=True)
    script = tmp_path / "chain.sh"
    script.write_text(
        "set -e\n"
        'echo "== correspondence gate 1/2: correspondence" >&2\n'
        'echo "Segmentation fault"\n'
        "exit 139\n",
        encoding="utf-8",
    )

    subprocess.run(
        [
            PY,
            str(SCRIPTS / "run_gate.py"),
            "--name",
            "correspondence",
            "--",
            "bash",
            str(script),
        ],
        cwd=work,
        capture_output=True,
        text=True,
        timeout=600,
    )

    report = json.loads(
        (work / "reports" / "correspondence.json").read_text(encoding="utf-8")
    )
    failures = report["failures"]
    assert len(failures) == 2, json.dumps(failures, indent=2)
    assert failures[0]["is_root_cause"] is True
    assert failures[1]["is_root_cause"] is False
    assert failures[1]["dependent_on"] == failures[0]["finding_id"]


# ---------------------------------------------------------------------------
# WHAT THE READER ACTUALLY SEES
# ---------------------------------------------------------------------------


def manifest(failures: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """The shape aggregate_gates.py hands the renderer.

    `Sequence[Mapping[...]]` rather than `list[dict[...]]` because dict is
    invariant in its value type: a fixture holding only strings would not be
    assignable to one declared over `object`, and widening every fixture to
    silence that would mean annotating test data instead of writing it.
    """
    return {
        "run_identity": {
            "commit": "abc123def456",
            "run_id": "1",
            "run_attempt": "1",
            "workflow": "verify",
        },
        "overall": "BLOCKED",
        "mergeable": False,
        "blocking": ["bandit"],
        "gates": {
            "bandit": {"status": "FAIL", "duration_ms": 10, "failures": failures}
        },
    }


ROOT = {
    "what": "B602 not covered by a safe pattern",
    "where": "scripts/gate.py:3",
    "why": "shell is true",
    "requirement": "Every bandit finding is fixed or covered.",
    "how_to_fix": "Fix the code.",
    "severity": "ERROR",
    "code": "B602",
    "reproduction_command": "python3 scripts/security_gate.py src scripts",
    "is_root_cause": True,
    "dependent_on": None,
}

# Derived, not written down. The renderer recomputes the handle it prints from
# (gate, what, where), so a fixture that invents one would let DEPENDS ON name
# a handle that appears nowhere in the output and the test would still pass --
# which is the one thing this pairing has to rule out.
ROOT_ID = gate_mod.finding_id("bandit", str(ROOT["what"]), str(ROOT["where"]))

CONSEQUENCE = {
    "what": "verification 2 of 4 did not run",
    "where": "step 2/4",
    "why": "the chain stopped at step 1/4.",
    "requirement": "Every verification must run.",
    "how_to_fix": "Fix the failure above.",
    "severity": "UNKNOWN",
    "code": "NOT_RUN",
    "is_root_cause": False,
    "dependent_on": ROOT_ID,
}


def test_the_report_says_which_findings_are_consequences() -> None:
    """Schema 1.3 has carried these fields since 5a; nothing read them."""
    text, _ = blocker_report.render(manifest([ROOT, CONSEQUENCE]), set())

    assert "(consequence)" in text
    assert "1 of 2 findings are root causes" in text
    assert "The other one is marked" in text, "one consequence is not 'are'"


def test_a_consequence_names_the_handle_the_report_prints_for_its_root() -> None:
    """The whole point of the relation: it has to be followable by eye.

    `DEPENDS ON` is useless if the id it names is not the id printed on the
    blocker above it -- the reader would be sent looking for a finding that,
    as far as the log is concerned, does not exist.
    """
    text, _ = blocker_report.render(manifest([ROOT, CONSEQUENCE]), set())

    assert f"[1] {ROOT_ID}  bandit" in text
    assert f"DEPENDS ON   {ROOT_ID}" in text


def test_the_root_is_not_labelled_a_consequence() -> None:
    """The control for the marker: it must key on the field, not on position."""
    text, _ = blocker_report.render(manifest([ROOT]), set())

    assert "(consequence)" not in text
    assert "root causes" not in text, (
        "with nothing to distinguish, the split is noise and is not printed"
    )


def test_the_rule_id_and_the_reproduction_command_reach_the_log() -> None:
    """A field that exists only in an artifact nobody downloads is discarded.

    The log is what a human opens after a push, and `code` and
    `reproduction_command` are the two fields that turn a finding into an
    action: one is what you search the documentation with, the other is what
    you type.
    """
    text, _ = blocker_report.render(manifest([ROOT]), set())

    assert "B602" in text
    assert "python3 scripts/security_gate.py src scripts" in text


def test_a_default_severity_is_not_printed_as_though_it_were_measured() -> None:
    """ERROR is what a recorded failure has always meant here.

    Printing it on every finding would present a field nobody set as a
    judgement somebody made.
    """
    text, _ = blocker_report.render(manifest([ROOT]), set())
    assert "SEVERITY" not in text

    louder, _ = blocker_report.render(
        manifest([{**ROOT, "severity": "CRITICAL"}]), set()
    )
    assert "SEVERITY     CRITICAL" in louder


def test_a_finding_recorded_before_schema_1_3_still_renders() -> None:
    """Reports outlive the schema that wrote them.

    A 1.2 report has none of these keys, and the renderer must treat their
    absence as "not recorded" rather than as "False".
    """
    old = {
        "what": "coverage failed",
        "where": "scripts/x.py:1",
        "why": "below threshold",
        "requirement": "95%",
        "how_to_fix": "test",
    }
    text, _ = blocker_report.render(manifest([old]), set())

    assert "coverage failed" in text
    assert "(consequence)" not in text, (
        "a finding that never declared is_root_cause is not a consequence"
    )


# ---------------------------------------------------------------------------
# THE STREAMS THE DETECTORS READ
#
# Both marker patterns match plain text at column 0. Run against a combined
# capture they fire on any gate whose OUTPUT merely contains a marker, and
# they also lose the first marker whenever stdout has no trailing newline and
# glues itself onto stderr's first line. Both defects are one root cause --
# matching two separately captured streams as though they were one -- and
# these tests hold the split in place.
# ---------------------------------------------------------------------------


def test_chain_markers_echoed_on_stdout_fabricate_nothing() -> None:
    """The contamination case, and it is not hypothetical.

    This very file holds `== bandit gate 1/4: security gate` at column 0 as a
    module-level literal. A pytest failure that echoed it -- or any gate whose
    output quotes a log -- would invent NOT_RUN findings for a gate that has
    no chain at all. Measured before the streams were split: 4 fabricated.
    """
    echoed = (
        "  scripts/gate.py:1:1 - error: bad\n"
        "== bandit gate 1/4: security gate\n"
        "verifying 4 source file(s)\n"
    )
    steps = [
        f for f in run_gate.unreached(echoed, "") if str(f["where"]).startswith("step ")
    ]
    assert steps == [], "a chain marker on stdout must not fabricate a step"


def test_loop_markers_echoed_on_stderr_fabricate_nothing() -> None:
    """The mirror case. verify_per_function.sh writes its markers to stdout."""
    assert run_gate.unreached("", "verifying 4 source file(s)\n") == []


def test_the_wrapper_does_not_glue_stderr_onto_an_unterminated_stdout(
    tmp_path: Path,
) -> None:
    """The defect that silently disabled this entire mechanism.

    Every pattern here is anchored with `^` under re.MULTILINE. A tool whose
    last stdout line has no trailing newline glued that line onto stderr's
    first line, so the FIRST chain marker stopped matching -- and when a chain
    stops at step 1 that is the only marker there is. The gate then reported
    that nothing had been skipped for the run where three of four checks never
    executed. Measured: glued -> 0 steps and 0 unreached; separated -> 1 and 3.

    Driven through the real subprocess path rather than by calling `unreached`
    directly, because the bug lived in how `main` combined the two streams and
    a unit test on the detector alone could never have seen it.
    """
    work = tmp_path / "run"
    (work / "reports").mkdir(parents=True)
    script = tmp_path / "chain.sh"
    # `printf` with no trailing newline, then the marker on stderr.
    script.write_text(
        'printf "  FAIL - 2 finding(s) not covered"\n'
        'echo "== bandit gate 1/4: security gate" >&2\n'
        'echo "  UNRESOLVED  B602 scripts/gate.py:3  shell is true"\n'
        "exit 1\n",
        encoding="utf-8",
    )

    subprocess.run(
        [
            PY,
            str(SCRIPTS / "run_gate.py"),
            "--name",
            "bandit",
            "--",
            "bash",
            str(script),
        ],
        cwd=work,
        capture_output=True,
        text=True,
        timeout=600,
    )

    failures = json.loads(
        (work / "reports" / "bandit.json").read_text(encoding="utf-8")
    )["failures"]
    skipped = [f for f in failures if f["code"] == "NOT_RUN"]
    assert len(skipped) == 3, (
        "the three checks after the failing one were not recorded; the first "
        f"marker was probably glued onto stdout. Got: {json.dumps(failures, indent=2)}"
    )


def test_the_chain_markers_are_written_to_stderr() -> None:
    """The split above is a fact about verify.yml, not a guess.

    If a marker is ever emitted without `>&2` it lands on stdout, where the
    chain detector no longer looks, and every consequence silently stops being
    recorded. That is the dead-regex failure mode again, so it fails here.
    """
    workflow = (REPO / ".github" / "workflows" / "verify.yml").read_text(
        encoding="utf-8"
    )

    for line in workflow.splitlines():
        if "gate " in line and "/" in line and line.strip().startswith('echo "=='):
            assert line.rstrip().endswith(">&2"), (
                f"chain marker not written to stderr: {line.strip()!r}"
            )


def test_the_loop_markers_are_written_to_stdout() -> None:
    """The mirror fact, about verify_per_function.sh."""
    source = (SCRIPTS / "verify_per_function.sh").read_text(encoding="utf-8")

    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith('echo "──') or "source file(s)" in stripped:
            assert not stripped.endswith(">&2"), (
                f"loop marker moved to stderr: {stripped!r}"
            )


# ---------------------------------------------------------------------------
# WHICH FINDING IS THE ROOT
# ---------------------------------------------------------------------------


def test_the_root_is_the_first_defect_in_the_OUTPUT_not_in_the_table() -> None:
    """`main` calls findings[0] "the first defect the chain hit".

    That was false while extract_findings returned extractor order: with two
    extractors matching one capture the root was whichever of them sat earlier
    in EXTRACTORS, and every consequence inherited the mis-attribution. Here
    the mutant is printed FIRST and pyright second, while pyright_diagnostics
    sits earlier in EXTRACTORS than surviving_mutants.
    """
    text = (
        "  survivors: add_to_sub\n"
        "  scripts/gate.py:1:1 - error: later (reportGeneralTypeIssues)\n"
    )
    findings = run_gate.extract_findings(text)

    assert findings[0]["what"].startswith("mutant add_to_sub"), (
        f"root came from EXTRACTORS order, not text order: {findings[0]['what']}"
    )


def test_the_ordering_key_never_reaches_the_report() -> None:
    """`_at` is bookkeeping. Gate.fail would reject it and a reader cannot use it."""
    findings = run_gate.extract_findings(
        "  scripts/gate.py:1:1 - error: bad (reportGeneralTypeIssues)\n"
    )
    assert findings
    assert all("_at" not in f for f in findings)


# ---------------------------------------------------------------------------
# THE FIELDS CARRY BITS
# ---------------------------------------------------------------------------


def test_a_consequence_does_not_claim_to_block_on_its_own_account() -> None:
    """`merge_blocking` was a hardcoded True, so it carried no information.

    A root cause blocks. A verification that never ran does not: it disappears
    when the root is fixed, without anybody doing separate work for it, and
    counting it as blocking tells a reader there is more to fix than there is.
    """
    missed = run_gate.unreached("", BANDIT_CHAIN_STOPPED_AT_ONE)
    assert missed and all(f["merge_blocking"] is False for f in missed)


def test_a_consequence_states_the_mechanism_not_just_the_event() -> None:
    """`root_cause` was written as null on every finding ever recorded.

    `why` says which step stopped the chain. `root_cause` says why that stops
    anything at all -- `set -e` -- and they are not the same sentence.
    """
    missed = run_gate.unreached("", BANDIT_CHAIN_STOPPED_AT_ONE)
    assert all("set -e" in str(f["root_cause"]) for f in missed)


def test_a_root_cause_still_blocks() -> None:
    """The control. Only consequences are non-blocking."""
    g = gate_mod.Gate("bandit")
    g.fail(what="B602 not covered", where="scripts/gate.py:3")
    assert g.failures[0]["merge_blocking"] is True


def test_a_mistyped_severity_is_refused_rather_than_invented() -> None:
    """`severity` was free-form, so a typo created a class silently.

    A filter looking for CRITICAL skips CRTICAL forever, and a finding nobody
    sees is a finding the system discarded.
    """
    g = gate_mod.Gate("bandit")
    try:
        g.fail(what="x", severity="CRTICAL")
    except ValueError as exc:
        assert "CRTICAL" in str(exc)
    else:
        raise AssertionError("a mistyped severity was accepted")


def test_every_severity_the_gates_produce_is_in_the_vocabulary() -> None:
    """The set is closed, so it has to actually contain what is written.

    Otherwise the check above turns a real failing gate into a crash.

    PARSED, NOT GREPPED, and that is not a stylistic preference. The first
    version of this test searched for `"severity": "..."` and reported that the
    repository produced exactly three values. It produces four: pyright and
    shellcheck both write `"ERROR" if kind == "error" else "WARNING"`, and a
    regex over the source text cannot see inside a conditional expression. The
    vocabulary was built from that survey, so it refused a severity its own
    wrapper emits -- which would have turned the first real failing pyright run
    into an INFRASTRUCTURE_FAILURE instead of a FAIL.

    So this walks the AST and collects every string constant that reaches a
    `severity` key or keyword, following both branches of a conditional.
    """
    import ast as _ast

    def severity_values(node: _ast.expr) -> set[str]:
        """Every literal this expression can evaluate to."""
        if isinstance(node, _ast.Constant) and isinstance(node.value, str):
            return {node.value}
        if isinstance(node, _ast.IfExp):
            return severity_values(node.body) | severity_values(node.orelse)
        return set()

    used: set[str] = set()
    for path in SCRIPTS.glob("*.py"):
        tree = _ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in _ast.walk(tree):
            if isinstance(node, _ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, _ast.Constant) and key.value == "severity":
                        used |= severity_values(value)
            elif isinstance(node, _ast.Call):
                for kw in node.keywords:
                    if kw.arg == "severity":
                        used |= severity_values(kw.value)

    assert used, "no severity value found; this test has gone blind"
    assert "WARNING" in used, (
        "the conditional-expression producers are no longer being seen; this "
        "test has regressed to the blind spot it was written for"
    )
    assert used <= gate_mod.SEVERITIES, (
        f"gates produce severities the vocabulary refuses: {used - gate_mod.SEVERITIES}"
    )


# ---------------------------------------------------------------------------
# PATHS UNDER DOT-DIRECTORIES
# ---------------------------------------------------------------------------


def test_a_path_under_a_dot_directory_survives_normalisation() -> None:
    """`lstrip("./")` strips a character SET, not a prefix.

    ".github/workflows/verify.yml" came back as "github/workflows/..." -- a
    path that is not in the tree -- so repo_relative rejected a file that
    exists and the annotation this repository could have placed was dropped.
    The same call appeared in six places across four files, including the key
    security_gate.py matches a verified exception on.
    """
    assert (
        run_gate.repo_relative(".github/workflows/verify.yml")
        == ".github/workflows/verify.yml"
    )
    assert run_gate.repo_relative("./scripts/gate.py") == "scripts/gate.py"
    assert run_gate.repo_relative("scripts/gate.py") == "scripts/gate.py"


def test_no_script_normalises_a_path_with_lstrip() -> None:
    """The whole class, not the six instances.

    Every one of these is a path being made repository-relative, and every one
    of them silently mangles any path under a dot-directory. A new one would
    reintroduce the bug in a new place, so the pattern is banned outright.

    PARSED, NOT GREPPED. The first version of this test searched the source
    text and flagged the docstring in repo_relative that QUOTES the bad call
    in order to explain it. A ban that cannot tell code from prose about code
    either fails on its own explanation or gets loosened until it misses the
    real thing, and this repository has no shortage of regexes that went
    quietly dead. `ast` sees calls only.
    """
    import ast as _ast

    offenders: list[str] = []
    for path in sorted(SCRIPTS.glob("*.py")):
        tree = _ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in _ast.walk(tree):
            if (
                isinstance(node, _ast.Call)
                and isinstance(node.func, _ast.Attribute)
                and node.func.attr == "lstrip"
                and len(node.args) == 1
                and isinstance(node.args[0], _ast.Constant)
                and node.args[0].value == "./"
            ):
                offenders.append(f"{path.name}:{node.lineno}")
    assert not offenders, (
        "use .removeprefix('./') -- .lstrip('./') strips a character set and "
        f"mangles dot-directories: {offenders}"
    )
