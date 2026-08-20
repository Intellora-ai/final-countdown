"""N defects in, N findings out — for every gate `run_gate.py` wraps.

WHY THIS EXISTS.

A wrapped gate that failed recorded exactly ONE failure: `what="<gate> failed"`
with the last six lines of output as prose. Only pytest escaped that, because
`per_test_failures` had been written for it. Everything else -- ten vacuous
specs, four unresolved bandit findings, thirty pyright errors -- arrived in the
report as one record with no code, no position and no reproduction command.

Measured over the eight gates `run_gate.py` wraps other than `coverage`:
spec-strength, spec-composition, vacuity-check, counterexample-search,
honest-report, pyright, bandit and mutmut. Every one prints its defects one per
line and every one collapsed to a single record.

THE RISK THIS FILE IS BUILT AGAINST.

Parsing prose means a renamed message silently stops matching, and a dead regex
REPORTS NOTHING rather than failing -- which is how `run_gate.py`'s
`equivalent mutants:` SCOPE_PATTERN went dead without anyone noticing. So the
tests below do not feed the extractors a string this file made up and call that
proof. Wherever it is affordable they RUN THE REAL VERIFIER, make it emit a
known number of defects, and assert the extractor recovers that number. Where
running it is not affordable -- mutation scoring and the ten-layer honest
report both cost minutes -- the test asserts the marker text the extractor
depends on is still present in the producing script's source.

Either way a rename turns a test red instead of quietly emptying the report.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable
sys.path.insert(0, str(SCRIPTS))

import run_gate  # noqa: E402


def run(argv: list[str], cwd: Path = REPO) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                          timeout=600)


def combined(result: subprocess.CompletedProcess[str]) -> str:
    """What `run_gate.py` captures: stdout then stderr, in that order."""
    return result.stdout + result.stderr


# ---------------------------------------------------------------------------
# THE REAL VERIFIERS. These are the anti-dead-regex tests: the input is what
# the script actually prints today, not a sample transcribed into this file.
# ---------------------------------------------------------------------------

@pytest.fixture
def two_broken_specs(tmp_path: Path) -> list[str]:
    """Two spec paths that no verifier can parse, so both must be rejected.

    Absent files rather than malformed ones: every spec verifier in this
    repository treats "could not check" as a failure, which is the property
    that makes the count deterministic across all of them.
    """
    return [str(tmp_path / "one_spec.lean"), str(tmp_path / "two_spec.lean")]


def test_check_vacuity_rejecting_two_specs_produces_two_findings(
        two_broken_specs: list[str]) -> None:
    """Ten vacuous specs and one vacuous spec must not be the same record."""
    result = run([PY, str(SCRIPTS / "check_vacuity.py"), *two_broken_specs])
    assert result.returncode == 1, combined(result)

    findings = run_gate.extract_findings(combined(result))
    assert len(findings) == 2, (
        "check_vacuity.py rejected two specs and the extractor recovered "
        f"{len(findings)}; its ❌ line has changed shape:\n{combined(result)}")


def test_find_counterexample_rejecting_two_specs_produces_two_findings(
        two_broken_specs: list[str]) -> None:
    result = run([PY, str(SCRIPTS / "find_counterexample.py"), *two_broken_specs])
    assert result.returncode == 1, combined(result)

    findings = run_gate.extract_findings(combined(result))
    assert len(findings) == 2, combined(result)


def test_enforce_spec_reports_every_failing_check_not_the_first(
        tmp_path: Path) -> None:
    """One spec breaking two rules is two findings.

    enforce_spec.py runs seven independent syntactic checks per spec and
    prints a line for each one that fails. Collapsing them lost the fact that
    a spec can be wrong in more than one way at once.
    """
    spec = tmp_path / "bad_spec.lean"
    spec.write_text("def add (a b : Nat) : Nat := a + b\n"
                    "theorem add_spec : True := trivial\n", encoding="utf-8")
    result = run([PY, str(SCRIPTS / "enforce_spec.py"), str(spec)])
    assert result.returncode == 1, combined(result)

    printed = combined(result).count("❌ Spec ")
    findings = run_gate.extract_findings(combined(result))
    assert printed >= 2, f"fixture no longer breaks two rules:\n{combined(result)}"
    assert len(findings) == printed, combined(result)


def test_the_security_gate_reports_every_unresolved_finding(
        tmp_path: Path) -> None:
    """Four unresolved bandit findings are four findings, each with its code.

    The rule id is the searchable half -- B602 finds the documentation, the
    sentence does not -- and it was discarded with everything else outside the
    last six lines.
    """
    target = tmp_path / "unsafe"
    target.mkdir()
    (target / "a.py").write_text(
        "import subprocess\n"
        "def one(cmd: str) -> None:\n"
        "    subprocess.run(cmd, shell=True)\n"
        "def two(cmd: str) -> None:\n"
        "    subprocess.call(cmd, shell=True)\n", encoding="utf-8")
    result = run([PY, str(SCRIPTS / "security_gate.py"), str(target)])
    if result.returncode == 2 or "bandit" not in combined(result):
        pytest.skip("bandit is not installed in this environment")
    assert result.returncode == 1, combined(result)

    printed = combined(result).count("UNRESOLVED")
    findings = run_gate.extract_findings(combined(result))
    assert printed >= 2, f"fixture no longer trips bandit:\n{combined(result)}"
    assert len(findings) == printed, combined(result)
    assert all(f["code"] and str(f["code"]).startswith("B") for f in findings), \
        "every bandit finding must carry the rule id it was reported under"


def test_the_credential_scanner_reports_every_match_and_never_the_value(
        tmp_path: Path) -> None:
    """Two planted credential shapes are two findings, with no value in either.

    The shapes are assembled at run time for the reason
    tests/test_credential_scan.py documents: this file is tracked, and writing
    one literally would plant a real finding in tracked content.

    Two planted values, but more than two findings: the classic-token shape is
    also long enough to trip the high-entropy rule, and the scanner reports
    both labels for it. The count is asserted against the scanner's own
    printed lines rather than against the number of values planted, so this
    stays a test of extraction instead of a second copy of the scanner's rule
    set.
    """
    secret_a = "gh" + "p_" + "A1b2C3d4E5f6G7h8" + "I9j0K1l2M3n4O5p6Q7r8"
    secret_b = "AKI" + "AIOSFODNN7EXAMPLE"
    work = tmp_path / "r"
    work.mkdir()
    for argv in (["init", "-q", "-b", "main"],
                 ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "t"]):
        run(["git", *argv], cwd=work)
    (work / "a.txt").write_text(f"token = {secret_a}\n", encoding="utf-8")
    (work / "b.txt").write_text(f"key = {secret_b}\n", encoding="utf-8")
    run(["git", "add", "-A"], cwd=work)
    run(["git", "commit", "-qm", "plant"], cwd=work)

    result = run([PY, str(SCRIPTS / "credential_scan.py")], cwd=work)
    assert result.returncode == 1, combined(result)

    printed = combined(result).count("CREDENTIAL SHAPE")
    findings = run_gate.extract_findings(combined(result))
    assert printed >= 2, f"fixture planted nothing detectable:\n{combined(result)}"
    assert len(findings) == printed, combined(result)
    body = json.dumps(findings)
    assert secret_a not in body and secret_b not in body, \
        "the report is a public artifact; a finding must never carry the value"
    assert all(f["severity"] == "CRITICAL" for f in findings)


# ---------------------------------------------------------------------------
# THIRD-PARTY TOOLS. pyright and shellcheck cannot be made to fail from inside
# this suite cheaply and their output is theirs, not this repository's. The
# samples below are verbatim captures; what is asserted is that the extractor
# recovers the code, the position and the count.
# ---------------------------------------------------------------------------

PYRIGHT_OUTPUT = """\
/home/runner/work/final-countdown/final-countdown/scripts/gate.py
  /home/runner/work/final-countdown/final-countdown/scripts/gate.py:2:12 - error: \
Type "int" is not assignable to return type "str"
    "int" is not assignable to "str" (reportReturnType)
  /home/runner/work/final-countdown/final-countdown/scripts/gate.py:6:5 - error: \
"x" is not a known attribute of module (reportAttributeAccessIssue)
  /home/runner/work/final-countdown/final-countdown/scripts/gate.py:9:1 - \
information: this is not an error
2 errors, 0 warnings, 1 information
"""


def test_pyright_errors_become_one_finding_each_with_the_rule_name(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The rule name is what makes a type error searchable.

    Built against a temporary tree that reproduces a runner's checkout path.
    This repository lives at a path containing a space, and the position
    pattern deliberately cannot cross one; a GitHub runner checks out to
    /home/runner/work/<repo>/<repo>, which has none.
    """
    root = tmp_path / "home" / "runner" / "work" / "final-countdown" / "final-countdown"
    (root / "scripts").mkdir(parents=True)
    (root / "scripts" / "gate.py").write_text("x = 1\n" * 20, encoding="utf-8")
    monkeypatch.setattr(run_gate, "REPO", root)
    text = PYRIGHT_OUTPUT.replace("/home/runner/work", str(tmp_path / "home" / "runner" / "work"))

    findings = run_gate.pyright_diagnostics(text)

    assert [f["code"] for f in findings] == ["reportReturnType",
                                             "reportAttributeAccessIssue"]
    assert [f["line"] for f in findings] == [2, 6]
    assert [f["column"] for f in findings] == [12, 5]
    assert all(f["file"] == "scripts/gate.py" for f in findings)


def test_a_pyright_information_is_not_recorded_as_a_blocking_finding(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """It does not fail the run, so recording it as merge-blocking is false."""
    root = tmp_path / "r"
    (root / "scripts").mkdir(parents=True)
    (root / "scripts" / "gate.py").write_text("x = 1\n", encoding="utf-8")
    monkeypatch.setattr(run_gate, "REPO", root)

    text = "  scripts/gate.py:1:1 - information: consider annotating this\n"
    assert run_gate.pyright_diagnostics(text) == []


def test_a_diagnostic_without_a_rule_name_does_not_borrow_the_next_one(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """`code` is what a reader searches the documentation with.

    pyright puts the rule name at the end of a diagnostic, which for a long
    message is on a wrapped continuation line rather than the line carrying
    the position. Scanning forward for it must stop at the next diagnostic, or
    an unnamed one silently inherits its neighbour's name -- a false statement
    in exactly the field that gets acted on.
    """
    root = tmp_path / "r"
    (root / "scripts").mkdir(parents=True)
    (root / "scripts" / "gate.py").write_text("x = 1\n" * 20, encoding="utf-8")
    monkeypatch.setattr(run_gate, "REPO", root)

    text = ("  scripts/gate.py:1:1 - error: a syntax error has no rule name\n"
            "  scripts/gate.py:2:1 - error: this one does\n"
            "    and it is named here (reportGeneralTypeIssues)\n")
    findings = run_gate.pyright_diagnostics(text)

    assert [f["code"] for f in findings] == [None, "reportGeneralTypeIssues"]


SHELLCHECK_GCC_OUTPUT = """\
scripts/verify_per_function.sh:3:6: warning: bar is referenced but not assigned. [SC2154]
scripts/verify_per_function.sh:7:1: error: Use 'cd ... || exit' in case cd fails. [SC2164]
"""


def test_shellcheck_findings_carry_their_sc_code() -> None:
    """SC codes are the searchable half: each one has a wiki page keyed on it."""
    findings = run_gate.shellcheck_diagnostics(SHELLCHECK_GCC_OUTPUT)

    assert [f["code"] for f in findings] == ["SC2154", "SC2164"]
    assert [f["severity"] for f in findings] == ["WARNING", "ERROR"]
    assert all(f["file"] == "scripts/verify_per_function.sh" for f in findings)
    assert all("shellcheck.net/wiki/SC" in str(f["fix"]) for f in findings)


def test_the_workflow_asks_shellcheck_for_the_format_this_parses() -> None:
    """The parser and the invocation have to agree, or the parser is dead.

    shellcheck's default rendering is three lines per finding with a caret
    ruler; `gcc` format is one line per finding and is a format the tool
    itself guarantees. If the workflow stops asking for it, every shell
    finding silently collapses back into one record.
    """
    workflow = (REPO / ".github" / "workflows" / "verify.yml").read_text(
        encoding="utf-8")
    assert "shellcheck -f gcc" in workflow, \
        "run_gate.shellcheck_diagnostics parses gcc format; verify.yml must ask for it"


# ---------------------------------------------------------------------------
# THE EXPENSIVE VERIFIERS. Mutation scoring and the ten-layer honest report
# both cost minutes, so what is asserted here is that the marker text the
# extractor keys on is still present in the script that prints it. A rename
# fails this instead of emptying the report.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(("script", "marker"), [
    ("mutation_gate.py", 'f"  survivors: '),
    ("mutation_gate.py", 'f"  ZERO DENOMINATOR — '),
    ("check_composition.py", 'f"survives the whole set: '),
    ("security_gate.py", 'f"  UNRESOLVED  '),
    ("credential_scan.py", 'f"  CREDENTIAL SHAPE  '),
    ("enforce_spec.py", 'f"❌ Spec {spec_file} failed: '),
])
def test_the_line_each_extractor_keys_on_is_still_the_line_that_is_printed(
        script: str, marker: str) -> None:
    """A dead regex reports nothing rather than failing. This is what fails."""
    source = (SCRIPTS / script).read_text(encoding="utf-8")
    assert marker in source, (
        f"scripts/{script} no longer prints {marker!r}; the matching extractor "
        "in run_gate.py is now dead and would report zero findings")


def test_surviving_mutants_are_counted_one_by_one() -> None:
    """Three survivors and one survivor are different amounts of work."""
    findings = run_gate.surviving_mutants(
        "  survivors: add_to_sub, plus_to_minus, const_zero\n")

    assert [f["code"] for f in findings] == ["add_to_sub", "plus_to_minus",
                                             "const_zero"]
    assert all(f["where"] == "specs/" for f in findings), \
        "a surviving mutant is a defect in the specs, not at a file position"


def test_a_zero_denominator_is_its_own_critical_finding() -> None:
    findings = run_gate.surviving_mutants(
        "  ZERO DENOMINATOR — no mutant was generated for src/add.py.\n")

    assert len(findings) == 1
    assert findings[0]["severity"] == "CRITICAL"
    assert findings[0]["code"] == "ZERO_DENOMINATOR"


HONEST_REPORT_OUTPUT = """\
  Truth:                    FAIL
  Vacuity:                  PASS
  Formal proof:             UNVERIFIED  (120ms)
  Runtime property test:    FAIL
  Overall:                  FAIL
"""


def test_each_failing_honest_report_dimension_is_its_own_finding() -> None:
    """The gate exists to refuse to collapse these; the report collapsed them."""
    findings = run_gate.failed_dimensions(HONEST_REPORT_OUTPUT)

    assert [f["what"] for f in findings] == [
        "Truth is FAIL", "Formal proof is UNVERIFIED",
        "Runtime property test is FAIL"]


def test_the_overall_verdict_is_not_counted_as_a_further_defect() -> None:
    """honest_report.py DEFINES Overall as a function of the dimensions above.

    Recording it too would count one defect twice and inflate every failing
    run of this gate by exactly one.
    """
    findings = run_gate.failed_dimensions(HONEST_REPORT_OUTPUT)
    assert not any("Overall" in str(f["what"]) for f in findings)


def test_a_passing_dimension_is_not_a_finding() -> None:
    """The control: extraction must key on the verdict, not on the label."""
    assert run_gate.failed_dimensions("  Vacuity:                  PASS\n") == []


# ---------------------------------------------------------------------------
# THE COMPOSITION RULES
# ---------------------------------------------------------------------------

def test_output_with_no_recognised_defect_yields_no_findings() -> None:
    """Silence is the correct answer; `main` then keeps its single record.

    A failure must never be recorded as zero failures, and that guarantee
    lives in `main`. This asserts the half it depends on: the extractors do
    not invent a finding out of prose that names none.
    """
    assert run_gate.extract_findings(
        "Traceback (most recent call last):\n  MemoryError\n") == []


def test_a_passing_run_produces_no_findings() -> None:
    """Extraction must key on defect lines, not merely on the tool having run."""
    text = ("✓ specs/add_spec.lean: no precondition to be vacuous about\n"
            "  PASS (with 31 verified exceptions)\n"
            "  credential scan: 189 tracked text file(s) scanned\n"
            "  PASS -- no credential material in tracked content\n"
            "0 errors, 0 warnings, 0 informations\n")
    assert run_gate.extract_findings(text) == []


def test_one_defect_recognised_by_two_extractors_stays_one_finding() -> None:
    """A reader comparing runs counts findings, so a duplicate is a defect.

    Deduplicated on (what, where) -- two thirds of the basis gate.py derives
    `finding_id` from, so two records that would collide there collide here.
    """
    line = "  survivors: add_to_sub\n"
    assert len(run_gate.extract_findings(line + line)) == 1


def test_every_finding_is_accepted_by_the_recorder_it_is_written_for() -> None:
    """The extractors emit `Gate.fail` keyword arguments, so prove they fit.

    A field this file spells differently from `gate.py` would raise TypeError
    in CI, inside the failure path, where nothing else would catch it.
    """
    import gate  # noqa: PLC0415

    text = (SHELLCHECK_GCC_OUTPUT + HONEST_REPORT_OUTPUT
            + "  survivors: add_to_sub\n"
            + "  ZERO DENOMINATOR — nothing was generated.\n"
            + "❌ specs/x_spec.lean: vacuous — holds for 0.00% of inputs\n"
            + "❌ Spec specs/x_spec.lean failed: Not vacuous\n"
            + "  UNRESOLVED  B602 scripts/gate.py:3  subprocess with shell\n"
            + "  CREDENTIAL SHAPE  aws-key-id  scripts/gate.py:4  (20 chars, "
              "value withheld)\n")
    findings = run_gate.extract_findings(text)
    assert findings, "the fixture must exercise every extractor"

    recorder = gate.Gate("composition-check")
    for finding in findings:
        recorder.fail(**finding)

    assert len(recorder.failures) == len(findings)
    assert all(f["finding_id"] for f in recorder.failures)
    assert len({f["finding_id"] for f in recorder.failures}) == len(findings), \
        "two defects must not share one handle"


# ---------------------------------------------------------------------------
# END TO END, through the wrapper itself
# ---------------------------------------------------------------------------

def test_the_wrapper_writes_one_report_entry_per_defect(tmp_path: Path) -> None:
    """The property the whole file is about, asserted on the real artifact."""
    specs = [str(tmp_path / f"{n}_spec.lean") for n in ("a", "b", "c")]
    work = tmp_path / "run"
    (work / "reports").mkdir(parents=True)

    result = subprocess.run(
        [PY, str(SCRIPTS / "run_gate.py"), "--name", "vacuity-check", "--",
         PY, str(SCRIPTS / "check_vacuity.py"), *specs],
        cwd=work, capture_output=True, text=True, timeout=600)
    assert result.returncode != 0, result.stdout + result.stderr

    report = json.loads((work / "reports" / "vacuity-check.json").read_text(
        encoding="utf-8"))
    assert report["status"] == "FAIL"
    assert len(report["failures"]) == 3, (
        "three unusable specs must be three findings, not one:\n"
        + json.dumps(report["failures"], indent=2))
    assert len({f["finding_id"] for f in report["failures"]}) == 3


def test_a_failure_no_extractor_recognises_is_still_recorded(
        tmp_path: Path) -> None:
    """The fail-closed control. Zero findings must never mean zero failures."""
    work = tmp_path / "run"
    (work / "reports").mkdir(parents=True)

    result = subprocess.run(
        [PY, str(SCRIPTS / "run_gate.py"), "--name", "opaque", "--",
         PY, "-c", "raise SystemExit(3)"],
        cwd=work, capture_output=True, text=True, timeout=600)
    assert result.returncode != 0, result.stdout + result.stderr

    report = json.loads((work / "reports" / "opaque.json").read_text(
        encoding="utf-8"))
    assert report["status"] == "FAIL"
    assert len(report["failures"]) == 1
    assert report["failures"][0]["what"] == "opaque failed"
    assert report["failures"][0]["reproduction_command"], \
        "the fallback record must still say what to type to see this again"
