"""A LINTER WITH AN UNPINNED RULE SET CHECKS A DIFFERENT THING EVERY RELEASE.

WHY THIS EXISTS.

`learning-os` has run ruff since it was created. The root project never had a
linter at all, so `scripts/` (19,499 lines) and `tests/` (19,237 lines) --- the
code every merge decision rests on --- were unchecked by anything.

Wiring ruff in is one line. Wiring it in so that it keeps meaning the same
thing is what this gate and this file are about. Measured 2026-08-25, same ruff
(0.16.3), same tree:

    no `select` in pyproject.toml     258 findings
    select = E4, E7, E9, F             12 findings

Both are "ruff passing". A gate whose scope is whatever the installed version
decided to check reports a different thing after every upgrade, and the first
time it reports MORE it fails a pull request that changed nothing --- which is
how a check gets switched off rather than fixed.

That is the same defect the coverage gate carried for its whole existence: the
threshold pinned, the scope not. Writing it twice in one repository would be
careless, so `scripts/ruff_gate.py` refuses to run at all when `select` is
absent, and the tests below prove that refusal is real rather than decorative.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GATE = REPO / "scripts" / "ruff_gate.py"
PY = sys.executable

#: Text only this gate prints. Asserted on every refusal so that a crash, a
#: missing interpreter or a mistyped path cannot satisfy a test that is
#: supposed to be observing a REFUSAL. CLAUDE.md records the version of this
#: mistake that shipped: eleven tests asserting `exit == 2` that passed against
#: a hook nobody had installed.
BANNER = "ruff-gate:"

PINNED = '[tool.ruff.lint]\nselect = ["E4", "E7", "E9", "F"]\n'
CLEAN = "VALUE = 1\n"


def run(root: Path, *paths: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PY, str(GATE), "--root", str(root), *paths],
        capture_output=True, text=True, timeout=600,
    )


def _tree(tmp: Path, pyproject: str, source: str = CLEAN) -> Path:
    root = tmp / "repo"
    (root / "pkg").mkdir(parents=True)
    (root / "pyproject.toml").write_text(pyproject, encoding="utf-8")
    (root / "pkg" / "thing.py").write_text(source, encoding="utf-8")
    return root


def refused(result: subprocess.CompletedProcess[str], saying: str) -> None:
    """Assert the gate itself refused, and said something usable about why."""
    assert result.returncode != 0, f"the gate accepted this; stdout={result.stdout!r}"
    assert BANNER in result.stdout, (
        "non-zero exit with no refusal banner, so this is indistinguishable "
        f"from a crash.\nstdout={result.stdout!r}\nstderr={result.stderr!r}"
    )
    assert saying in result.stdout, (
        f"the refusal never mentioned {saying!r}: {result.stdout!r}"
    )


def test_an_unpinned_rule_set_is_refused(tmp_path: Path) -> None:
    """THE POINT OF THE WRAPPER.

    Without `select`, ruff runs its own default. That default moved between
    releases and produced 258 findings on this tree where the pinned set
    produces 12. A gate that inherits it is measuring the tool's opinion of the
    week, not a standard this repository chose.
    """
    root = _tree(tmp_path, "[tool.ruff.lint]\n")
    refused(run(root, "pkg"), "not pinned")


def test_a_pinned_rule_set_over_clean_code_passes(tmp_path: Path) -> None:
    """THE PAIR. Without it, `return 1` satisfies every other test here.

    A gate that refuses everything is not a gate; it is an outage nobody has
    noticed yet.
    """
    root = _tree(tmp_path, PINNED)
    result = run(root, "pkg")
    assert result.returncode == 0, f"clean code was refused: {result.stdout!r}"
    assert BANNER in result.stdout, (
        "exit 0 with no banner: a gate that printed nothing and a gate that "
        f"never ran are the same green tick. stdout={result.stdout!r}"
    )


def test_ruff_itself_still_runs_beside_this_gate() -> None:
    """THE GATE CHECKS THE PIN; RUFF DOES THE LINTING. Both must be wired.

    This gate deliberately does not shell out to ruff --- security_gate.py
    refused the subprocess call (B404/B603) and a wrapper that adds no safety
    is not worth an allowlist entry. The cost of that decision is that this
    file could pass while nothing ever linted anything, so the pairing is
    asserted here rather than assumed.
    """
    import tomllib

    manifest = tomllib.loads((REPO / "ci" / "gates.toml").read_text(encoding="utf-8"))
    pinned = manifest["gates"]["pyright"]["must_contain"]
    assert any("ruff_gate.py" in tok for tok in pinned), (
        "ci/gates.toml no longer pins the scope gate into the chain"
    )
    assert any(tok.startswith("ruff check ") for tok in pinned), (
        "ci/gates.toml pins the scope gate but not ruff itself, so the chain "
        f"could check the pin and lint nothing: {pinned}"
    )

    workflow = (REPO / ".github" / "workflows" / "verify.yml").read_text(encoding="utf-8")
    assert "scripts/ruff_gate.py src scripts tests" in workflow
    assert "ruff check src scripts tests" in workflow, (
        "verify.yml runs the scope gate but never ruff"
    )


def test_a_path_that_does_not_exist_is_refused(tmp_path: Path) -> None:
    """A typo'd path is not a clean lint.

    `ruff check srcc` finds no files and exits 0. Silently linting nothing is
    the exact failure ESLint's flat config produced four times in this
    repository's frontend.
    """
    root = _tree(tmp_path, PINNED)
    refused(run(root, "pkg", "nope"), "nope")


def test_this_repository_passes() -> None:
    """The real tree. If this fails, the finding is in the repository."""
    result = subprocess.run(
        [PY, str(GATE)], cwd=REPO, capture_output=True, text=True, timeout=600
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_the_repository_actually_pins_its_rule_set() -> None:
    """The condition the gate refuses on must be true HERE, not just checkable.

    Without this, `select` could be deleted from pyproject.toml and the only
    thing that would notice is a gate nobody had run yet.
    """
    import tomllib

    parsed = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    select = parsed["tool"]["ruff"]["lint"].get("select")
    assert select, (
        "pyproject.toml no longer pins [tool.ruff.lint] select, so ruff would "
        "run whatever its installed default is."
    )
