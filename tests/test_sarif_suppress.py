"""The SARIF the repo publishes must agree with the gate that judged it.

Two sources of truth for one set of findings is what put 17 machine-authored
threads on a pull request and blocked it. These pin the two properties that
make one-source-of-truth safe: only PROVED findings are marked, and a failing
gate marks nothing.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
PY = sys.executable


def bandit_sarif(cwd: Path, out: Path) -> None:
    """Produce SARIF, and fail loudly if the toolchain cannot.

    SARIF output needs the `bandit[sarif]` extra. When only plain `bandit` was
    installed this wrote nothing and the tests died on FileNotFoundError three
    frames later, which named the symptom and hid the cause.
    """
    r = subprocess.run([PY, "-m", "bandit", "-r", "src", "scripts", "-f", "sarif",
                        "-o", str(out), "--severity-level", "low",
                        "--confidence-level", "low"],
                       cwd=cwd, capture_output=True, text=True, timeout=300)
    assert out.is_file(), (
        f"bandit produced no SARIF (exit {r.returncode}). Install "
        f"bandit[sarif].\n{(r.stderr or r.stdout)[:400]}")


def suppress(cwd: Path, sarif: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([PY, str(SCRIPTS / "sarif_suppress.py"),
                           "--sarif", str(sarif), "src", "scripts"],
                          cwd=cwd, capture_output=True, text=True, timeout=300)


def results(sarif: Path) -> list[dict[str, Any]]:
    doc = json.loads(sarif.read_text(encoding="utf-8"))
    return list(doc["runs"][0]["results"])


def workspace(tmp_path: Path) -> Path:
    import shutil
    w = tmp_path / "w"
    w.mkdir()
    for d in ("scripts", "src"):
        shutil.copytree(REPO / d, w / d)
    return w


def test_verified_findings_are_marked_and_none_are_deleted(tmp_path: Path) -> None:
    w = workspace(tmp_path)
    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    before = len(results(sarif))
    assert before > 0, "bandit produced no findings; this test proves nothing"

    assert suppress(w, sarif).returncode == 0
    after = results(sarif)
    assert len(after) < before, "the gate verifies findings but none were withheld"
    # What is omitted must be stated in the file itself, not silently dropped.
    doc = json.loads(sarif.read_text(encoding="utf-8"))
    props = doc["runs"][0]["properties"]
    assert props["gateVerifiedRemovedCount"] == before - len(after)
    assert props["gateVerifiedBy"] == "scripts/security_gate.py"
    assert props["gateVerifiedRemoved"], "the omitted findings must be listed"


def test_a_failing_gate_marks_nothing(tmp_path: Path) -> None:
    """A red gate publishes everything — that is when a human needs it most."""
    w = workspace(tmp_path)
    target = w / "scripts" / "axle_health.py"
    text = target.read_text(encoding="utf-8")
    broken = text.replace(", timeout=timeout)", ")", 1)
    assert broken != text, "could not break the safe pattern"
    target.write_text(broken, encoding="utf-8")

    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    before = len(results(sarif))
    result = suppress(w, sarif)
    assert result.returncode == 0
    assert "suppressing nothing" in result.stdout
    assert len(results(sarif)) == before, "a red gate must publish every finding"


def test_an_unverified_finding_is_never_marked(tmp_path: Path) -> None:
    """Add a genuinely unsafe call; it must stay visible."""
    w = workspace(tmp_path)
    (w / "scripts" / "danger.py").write_text(
        "import subprocess\n"
        "def go(cmd: str) -> None:\n"
        "    subprocess.run(cmd, shell=True)\n", encoding="utf-8")
    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    suppress(w, sarif)
    assert any("danger.py" in json.dumps(r) for r in results(sarif)), (
        "a shell=True call was hidden from code scanning")


def test_a_multiline_call_is_marked_despite_the_two_line_numbers(
        tmp_path: Path) -> None:
    """The two bandit emitters disagree on which line a multi-line call is on.

    `bandit -f json` reports `line_number` as the line the call node is
    attributed to; `bandit -f sarif` reports `region.startLine` as the FIRST
    line of the statement. `sarif_suppress` reads the first and matches against
    the second, so an exact single-line match silently failed on every call
    written across more than one line -- publishing findings the gate had
    already PROVED safe, which is the exact disagreement this module removes.

    It stayed invisible because single-line calls match by coincidence. This
    pins the multi-line case directly: a call the gate verifies must be
    withheld no matter how it is formatted.
    """
    w = workspace(tmp_path)
    target = w / "scripts" / "ci_metrics.py"
    source = target.read_text(encoding="utf-8")
    assert "subprocess.run(\n" in source, (
        "this test is only meaningful while the call spans several lines")

    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    raw = [r for r in results(sarif) if "ci_metrics.py" in json.dumps(r)]
    assert raw, "bandit reported nothing for ci_metrics.py; test proves nothing"

    assert suppress(w, sarif).returncode == 0
    left = [r for r in results(sarif) if "ci_metrics.py" in json.dumps(r)]
    assert not left, (
        "a gate-verified multi-line subprocess call was published anyway: "
        f"{[r.get('ruleId') for r in left]}")


# --------------------------------------------------------------------------
# The value bandit names is the one thing that must not be republished.
#
# bandit's SARIF formatter embeds the offending source line as
# `region.snippet.text` and its neighbours as `contextRegion.snippet.text`,
# AND repeats the value inside `message.text`. Measured against a file holding
# a fake password, before any of this existed:
#
#     results: 1  ruleId: B105
#     region.snippet   : '    password = "hunter2-not-a-real-one"\n'
#     contextRegion    : present
#     message.text     : "Possible hardcoded password: 'hunter2-not-a-real-one'"
#
# `bandit -n 0` does not change it; no bandit flag does.
#
# WHY IT MATTERS HERE RATHER THAN BEING SOMEONE ELSE'S PROBLEM. The same job
# runs scripts/credential_scan.py, which records (label, path, line, length)
# and prints "(N chars, value withheld)" -- the matched text is deliberately
# not a field on the finding, so no print site can leak it. Publishing the
# whole line to code scanning from that same job is the same value through a
# different door, into a store with its own retention: deleting the branch
# does not purge the alert.
#
# And the leak fires on the path that skips suppression. `Upload to code
# scanning` in verify.yml carries `if: always()`, and this script returns 0
# without rewriting anything when the gate failed -- so a run where the
# credential scan went RED published the full unfiltered document. That is why
# the redaction happens before the gate verdict is read.
# --------------------------------------------------------------------------

def _b105_doc(value: str) -> dict[str, Any]:
    """A SARIF result shaped exactly like the one bandit emits for B105."""
    return {"runs": [{"results": [{
        "ruleId": "B105",
        "message": {"text": f"Possible hardcoded password: '{value}'"},
        "locations": [{"physicalLocation": {
            "artifactLocation": {"uri": "src/thing.py"},
            "region": {"startLine": 3, "endLine": 3,
                       "snippet": {"text": f'    password = "{value}"\n'}},
            "contextRegion": {"startLine": 2, "endLine": 4,
                              "snippet": {"text": f'x = 1\n    password = "{value}"\n'}},
        }}],
    }]}]}


def _first(doc: dict[str, Any]) -> dict[str, Any]:
    """The first result. A typed accessor because the fixtures are plain dicts
    and pyright cannot narrow six levels of literal indexing on its own."""
    runs = cast("list[dict[str, Any]]", doc["runs"])
    return cast("list[dict[str, Any]]", runs[0]["results"])[0]


def _region(doc: dict[str, Any]) -> dict[str, Any]:
    locations = cast("list[dict[str, Any]]", _first(doc)["locations"])
    physical = cast("dict[str, Any]", locations[0]["physicalLocation"])
    return cast("dict[str, Any]", physical["region"])


def test_the_value_is_withheld_from_every_field_that_carried_it() -> None:
    sys.path.insert(0, str(SCRIPTS))
    from sarif_suppress import strip_value_bearing_fields

    planted = "correct-horse-battery-staple"
    doc = _b105_doc(planted)
    assert planted in json.dumps(doc), "the fixture did not plant the value"

    stripped = strip_value_bearing_fields(doc)

    assert stripped == 3, f"expected message + snippet + contextRegion, got {stripped}"
    assert planted not in json.dumps(doc), (
        "the value survives somewhere in the document. Checking only the "
        "snippet is how the first version of this passed while still "
        "publishing the value in message.text")


def test_the_finding_and_its_exact_position_still_publish() -> None:
    """Withholding the value is not suppressing the finding.

    A reader must still see that B105 fired, and where. If this redaction cost
    the position it would be worse than the leak: an alert nobody can act on.
    """
    sys.path.insert(0, str(SCRIPTS))
    from sarif_suppress import strip_value_bearing_fields

    doc = _b105_doc("s3cr3t-value-here")
    strip_value_bearing_fields(doc)
    result = _first(doc)
    region = _region(doc)

    assert result["ruleId"] == "B105"
    assert region["startLine"] == 3
    assert region["endLine"] == 3
    assert "Possible hardcoded password" in result["message"]["text"]
    assert "17 chars, value withheld" in result["message"]["text"]


def test_a_finding_that_is_not_about_a_secret_keeps_its_snippet() -> None:
    """The control, and the reason this is not a blanket strip.

    The snippet is what makes an alert triageable at a glance. For B404, B603
    and the subprocess family the line is not sensitive, and stripping every
    snippet would pay for one leak with the usefulness of every other alert.
    """
    sys.path.insert(0, str(SCRIPTS))
    from sarif_suppress import strip_value_bearing_fields

    doc = {"runs": [{"results": [{
        "ruleId": "B404",
        "message": {"text": "Consider possible security implications"},
        "locations": [{"physicalLocation": {
            "artifactLocation": {"uri": "scripts/x.py"},
            "region": {"startLine": 1,
                       "snippet": {"text": "import subprocess\n"}},
        }}],
    }]}]}
    assert strip_value_bearing_fields(doc) == 0
    assert _region(doc)["snippet"]["text"] == "import subprocess\n"


def test_real_bandit_output_survives_the_redaction(tmp_path: Path) -> None:
    """Against the actual tool, not a fixture, because the shape is bandit's.

    A hand-written fixture proves the function; only real output proves the
    function still matches what bandit emits after a version bump.
    """
    sys.path.insert(0, str(SCRIPTS))
    from sarif_suppress import strip_value_bearing_fields

    w = workspace(tmp_path)
    sarif = w / "b.sarif"
    bandit_sarif(w, sarif)
    doc = cast("dict[str, Any]", json.loads(sarif.read_text(encoding="utf-8")))
    runs = cast("list[dict[str, Any]]", doc["runs"])
    before = len(cast("list[Any]", runs[0]["results"]))

    strip_value_bearing_fields(doc)

    after = cast("list[dict[str, Any]]", runs[0]["results"])
    assert len(after) == before, (
        "redaction deleted findings; it must only remove value-bearing fields")
    for result in after:
        locations = cast("list[dict[str, Any]]", result["locations"])
        physical = cast("dict[str, Any]", locations[0]["physicalLocation"])
        assert "startLine" in cast("dict[str, Any]", physical["region"]), (
            "a finding lost its position")
