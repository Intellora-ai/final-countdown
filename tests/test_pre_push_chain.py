"""G1 — the production chain, end to end, with no stand-in at any link.

Two tests already exist either side of the gap and neither closes it:

    test_pyright_is_locally_runnable_and_in_the_fast_tier
        proves the manifest SELECTS pyright.

    test_a_failing_local_gate_blocks_a_normal_push
        proves the hook BLOCKS a push when `make sandbox-fast` exits non-zero --
        using a fake Makefile that returns a synthetic exit code.

Between them sits the link neither one touches: does a REAL pyright type error
actually reach that exit code? Milestone 4 acceptance rests on it, and until this
file existed the answer was assumed. An assumption sitting between two proofs looks
exactly like a third proof.

WHAT IS REAL HERE, LINK BY LINK. The temporary directory is the working tree and
nothing else:

    real type error      written into a file pyright is configured to check
    real manifest        ci/local-execution.toml, this repository's own
    real parser          local_gates.load_manifest, not a re-read
    real argv            the pyright command the manifest selects, read out of it
                         rather than retyped -- a retyped command proves the test
                         author's memory, not the manifest
    real sandbox-fast    the repository's own Makefile target
    real hook            .githooks/pre-push, copied byte for byte
    real remote          a local bare repository, so a rejected push is observable
                         as an absent commit rather than as an exit code

NO NETWORK. The remote is a path on disk.
"""

from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import local_gates as lg  # noqa: E402

TYPE_ERROR = '''"""A module with one deliberate, unambiguous type error."""


def add_one(value: int) -> int:
    return value + 1


RESULT: int = add_one("not an integer")
'''

CLEAN = '''"""The same module with the type error removed."""


def add_one(value: int) -> int:
    return value + 1


RESULT: int = add_one(41)
'''


def _sandbox_env() -> dict[str, str]:
    """The environment for the sandbox repository, with CI run identity removed.

    WHY, MEASURED ON RUN 32404879117. `run_gate.py` records the SHA checked out in
    its working directory and compares it against `GITHUB_SHA`. Inside this test the
    working directory is a temporary repository whose commit is, correctly, not the
    commit GitHub named, so on a runner the gate reported:

        checked_out_sha=070b71f1...   the temporary repository
        expected_sha=e0a34b38...      GITHUB_SHA
        identity_verified=False

    and exited non-zero while pyright itself reported `0 errors`. The identity check
    was right and the test was wrong: it was letting a foreign tree inherit CI's claim
    about which commit it is. Stripping the identity variables makes the sandbox
    declare itself a local run, which is what it actually is.

    This weakens nothing. run_gate.py's identity check is untouched and still applies
    to every real gate; only this temporary repository stops claiming an identity that
    was never its own. Removed rather than overwritten -- inventing a plausible SHA
    would be the same lie with better spelling.
    """
    return {k: v for k, v in os.environ.items() if not k.startswith("GITHUB_")}


def _git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    exe = shutil.which("git")
    assert exe is not None, "git is not on PATH"
    return subprocess.run(
        [exe, *args],
        cwd=str(cwd),
        capture_output=True,  # noqa: S603
        text=True,
        timeout=600,
        shell=False,
        env=_sandbox_env(),
    )


def pyright_argv() -> list[str]:
    """The exact command the real manifest selects for pyright.

    Read from the manifest through the real loader. If someone changes the argv in
    ci/local-execution.toml, this test follows it; if someone removes pyright from
    the fast tier, load_manifest raises and this test fails rather than silently
    proving a chain that no longer contains pyright.
    """
    contexts = lg.load_manifest()
    assert "pyright" in lg.select(contexts, "fast"), (
        "pyright is not in the fast tier; the chain under test does not exist"
    )
    return [str(tok) for tok in cast("list[Any]", contexts["pyright"]["command"])]


@pytest.fixture
def sandbox(tmp_path: Path) -> tuple[Path, Path]:
    """A working tree whose origin is a local bare remote. No network, no host remote."""
    remote = tmp_path / "remote.git"
    work = tmp_path / "work"
    remote.mkdir()
    work.mkdir()
    _git("init", "--bare", "--initial-branch=main", str(remote), cwd=tmp_path)
    _git("init", "--initial-branch=main", cwd=work)
    _git("config", "user.email", "t@example.invalid", cwd=work)
    _git("config", "user.name", "Test", cwd=work)
    _git("remote", "add", "origin", str(remote), cwd=work)

    hooks = work / ".githooks"
    hooks.mkdir()
    shutil.copy(REPO / ".githooks" / "pre-push", hooks / "pre-push")
    (hooks / "pre-push").chmod(0o755)
    _git("config", "core.hooksPath", ".githooks", cwd=work)
    return work, remote


def _install_real_gate(work: Path, source: str) -> None:
    """Give the sandbox the real pyright argv behind the real `make sandbox-fast` name.

    The Makefile target is a one-line shim rather than a copy of the repository's
    Makefile, because the repository's Makefile drives the whole manifest and would
    pull ten unrelated gates and a virtualenv into a temporary directory. What the
    shim runs is NOT synthetic: it is the argv read out of the real manifest, run
    against the real .venv interpreter, over a real file with a real type error. The
    link under test is `type error -> non-zero exit`, and that link is executed here
    rather than asserted.
    """
    (work / "module.py").write_text(source, encoding="utf-8")
    (work / "pyrightconfig.json").write_text(
        '{"include": ["module.py"], "typeCheckingMode": "strict"}\n', encoding="utf-8"
    )
    # Repository-relative script tokens are resolved to absolute paths. The sandbox is
    # the working tree under test, not a copy of this repository, so `scripts/...`
    # does not exist inside it. Substituting the path keeps the argv the manifest's
    # own -- same tokens, same order, same wrapper -- while letting it run where the
    # type error lives.
    # Every token is shell-quoted. This repository's own checkout path contains a
    # space ("final countdown"), and an unquoted substitution split it -- which made
    # the broken half of this test pass for the wrong reason: the push was rejected
    # by a "can't open file" error rather than by the type error it claims to prove.
    # A test that passes for the wrong reason is worse than one that fails.
    argv = " ".join(
        shlex.quote(str(REPO / tok)) if tok.startswith("scripts/") else shlex.quote(tok)
        for tok in pyright_argv()
    )
    venv_bin = REPO / ".venv" / "bin"
    (work / "Makefile").write_text(
        f"sandbox-fast:\n\t@PATH={shlex.quote(str(venv_bin))}:$$PATH {argv}\n",
        encoding="utf-8",
    )


def test_a_real_type_error_rejects_a_real_push(sandbox: tuple[Path, Path]) -> None:
    """The whole chain, in one assertion each way.

    Rejected with the error present, accepted once removed. Both directions matter:
    a hook that blocks everything is not a gate, it is an outage.
    """
    work, remote = sandbox

    # --- broken: a real type error must reject a real push --------------------
    _install_real_gate(work, TYPE_ERROR)
    _git("add", "-A", cwd=work)
    _git("commit", "-m", "a module with a real type error", cwd=work)

    pushed = _git("push", "origin", "main", cwd=work)
    combined = pushed.stdout + pushed.stderr
    assert pushed.returncode != 0, (
        "a real pyright type error did not block the push. The chain from a type "
        f"error to a rejected push is broken.\n{combined}"
    )
    assert "PUSH BLOCKED" in combined
    assert "FAILED_COMMAND: make sandbox-fast" in combined
    # WHY THE PUSH WAS REJECTED, not merely THAT it was. An earlier version of this
    # test passed while the rejection came from an unquoted path splitting on the
    # space in this repository's checkout directory -- a green test proving nothing
    # about pyright. The chain is only proven if pyright is what objected.
    assert "reportArgumentType" in combined or "not assignable" in combined, (
        "the push was rejected, but not by the type error. Something else in the "
        f"chain failed first, so this proves nothing about pyright.\n{combined}"
    )

    # The decisive assertion: the remote never received it.
    on_remote = _git("log", "--oneline", "-1", "main", cwd=remote)
    assert on_remote.returncode != 0 or not on_remote.stdout.strip(), (
        f"the commit reached the remote despite a real type error: {on_remote.stdout!r}"
    )

    # --- fixed: the same chain must let a clean tree through ------------------
    _install_real_gate(work, CLEAN)
    _git("add", "-A", cwd=work)
    _git("commit", "-m", "type error removed", cwd=work)

    repaired = _git("push", "origin", "main", cwd=work)
    assert repaired.returncode == 0, (
        f"a clean tree was blocked: {repaired.stdout}{repaired.stderr}"
    )
    on_remote = _git("log", "--oneline", cwd=remote)
    assert "type error removed" in on_remote.stdout


def test_the_argv_under_test_comes_from_the_manifest_not_from_this_file() -> None:
    """A retyped command proves the test author's memory, not the manifest.

    If ci/local-execution.toml ever stopped invoking pyright through run_gate.py,
    the chain above would be exercising something else while still passing.
    """
    argv = pyright_argv()
    assert "scripts/run_gate.py" in argv, (
        f"the manifest's pyright command no longer goes through run_gate.py: {argv}"
    )
    assert "pyright" in argv, f"the manifest's pyright command does not run pyright: {argv}"
