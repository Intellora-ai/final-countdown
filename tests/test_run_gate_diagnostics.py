"""THE COMPLETE OUTPUT OF EVERY GATE COMMAND, ON DISK, UNTRUNCATED.

WHY THIS EXISTS.

`run_gate.py` captures a wrapped command's stdout and stderr, prints the
combined text, extracts findings from it, and then lets it go. The only
surviving copies are the GitHub Actions log -- which the UI truncates, and
which nobody can grep from a laptop -- and the last six lines glued into
`failures[].why`.

So the report answers "what failed" and the log answers "what did it say", and
the second one expires. Reading a red run therefore means opening the job,
scrolling a collapsed group, and hoping the interesting line is inside the
window the UI kept. On a gate that emitted thirty pyright errors the six-line
tail is not a summary, it is a sample.

WHAT IS ASSERTED HERE, AND WHY EACH ONE.

  * the file EXISTS after a failing command -- the case that matters, because
    a green run's output is the one nobody needs
  * EVERY line survives, first and last included, with no elision marker --
    a "complete" log that drops the middle is worse than none, since a reader
    trusts it
  * the lines are NUMBERED, so a finding can cite a range and a human can find
    it without counting
  * stdout ORDER is preserved -- these are two streams and the join is already
    load-bearing elsewhere in run_gate.py
  * a PASSING command writes one too. A report that only exists on red cannot
    prove a green run produced no findings; absence and cleanliness must be
    distinguishable.

NOT ASSERTED: any particular directory layout beyond "under diagnostics/".
The workflow uploads the tree, and pinning the exact shape here would make a
harmless reorganisation look like a regression.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RUN_GATE = REPO / "scripts" / "run_gate.py"
PY = sys.executable

# Enough lines that a truncating implementation cannot pass by accident, and
# distinctive enough that a partial write is obvious in the assertion message.
LINES = 500


def _noisy_program(exit_code: int) -> str:
    """Prints LINES numbered lines to stdout, three to stderr, then exits."""
    return (
        "import sys\n"
        f"for i in range({LINES}):\n"
        "    print(f'stdout-line-{i:04d}')\n"
        "print('stderr-alpha', file=sys.stderr)\n"
        "print('stderr-beta', file=sys.stderr)\n"
        "print('stderr-gamma', file=sys.stderr)\n"
        f"sys.exit({exit_code})\n"
    )


def _run(tmp_path: Path, gate: str, exit_code: int) -> subprocess.CompletedProcess[str]:
    prog = tmp_path / "noisy.py"
    prog.write_text(_noisy_program(exit_code), encoding="utf-8")
    return subprocess.run(
        [PY, str(RUN_GATE), "--name", gate, "--", PY, str(prog)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=300,
    )


def _diagnostics_logs(tmp_path: Path) -> list[Path]:
    root = tmp_path / "diagnostics"
    if not root.is_dir():
        return []
    return sorted(p for p in root.rglob("*.log") if p.is_file())


def test_a_failing_command_leaves_its_complete_output_on_disk(tmp_path: Path) -> None:
    """The red case. This is the one a human opens."""
    result = _run(tmp_path, "diagprobe", exit_code=1)
    assert result.returncode != 0, "the wrapped command was supposed to fail"

    logs = _diagnostics_logs(tmp_path)
    assert logs, (
        "no log was written under diagnostics/; the wrapped command's output "
        "survives only in the Actions log, which truncates"
    )

    combined = next((p for p in logs if "combined" in p.name), None)
    assert combined is not None, f"no combined log among {[p.name for p in logs]}"
    body = combined.read_text(encoding="utf-8")

    # Every line, not most of them.
    assert "stdout-line-0000" in body, "the first line is missing"
    assert f"stdout-line-{LINES - 1:04d}" in body, "the last line is missing"
    missing = [
        i for i in range(LINES) if f"stdout-line-{i:04d}" not in body
    ]
    assert not missing, (
        f"{len(missing)} of {LINES} stdout lines are absent from the log "
        f"(first missing: {missing[0]}); a truncated 'complete' log is worse "
        "than none, because a reader trusts it"
    )
    for marker in ("stderr-alpha", "stderr-beta", "stderr-gamma"):
        assert marker in body, f"stderr line {marker!r} did not reach the log"


def test_the_log_lines_are_numbered(tmp_path: Path) -> None:
    """A finding can only cite a line range if the lines have numbers.

    Without this the artifact is a wall of text and 'which exact lines prove
    it' has no answer that does not involve counting by hand.
    """
    _run(tmp_path, "diagprobe", exit_code=1)
    combined = next(
        p for p in _diagnostics_logs(tmp_path) if "combined" in p.name
    )
    first = combined.read_text(encoding="utf-8").splitlines()[0]
    assert first.split("\t")[0].strip().isdigit(), (
        f"the first log line is not numbered: {first!r}"
    )


def test_stdout_order_is_preserved(tmp_path: Path) -> None:
    """Two captured streams, joined. Order is information."""
    _run(tmp_path, "diagprobe", exit_code=1)
    combined = next(
        p for p in _diagnostics_logs(tmp_path) if "combined" in p.name
    )
    body = combined.read_text(encoding="utf-8")
    assert body.index("stdout-line-0000") < body.index("stdout-line-0001")
    assert body.index("stdout-line-0001") < body.index(f"stdout-line-{LINES - 1:04d}")


def test_a_passing_command_writes_one_too(tmp_path: Path) -> None:
    """THE PAIR. Without this, writing the log only on failure satisfies the
    tests above -- and then a green run's count of zero findings would be
    indistinguishable from a run whose output was never captured.
    """
    result = _run(tmp_path, "diagprobe", exit_code=0)
    assert result.returncode == 0, result.stdout + result.stderr
    logs = _diagnostics_logs(tmp_path)
    assert logs, (
        "a passing command wrote no log; 'produced no findings' and 'was never "
        "captured' must not look the same"
    )
