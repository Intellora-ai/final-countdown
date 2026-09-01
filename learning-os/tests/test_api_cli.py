"""The fixture that crosses the language boundary, kept honest on this side.

The canvas half lives in `frontend/src/canvas/spec/engineBridge.test.ts`, which
feeds this fixture to the real `validateLesson`. This half asserts the fixture is
still what the emitter produces.

Both are needed and neither is sufficient. If only the canvas tested it, the
fixture could drift from the emitter and the canvas would keep happily accepting
a document the engine no longer emits — a green test proving two things agree
when one of them is a museum piece.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from learning_os.api import cli
from learning_os.api.cli import FIXTURE, build, main, render
from learning_os.spec_root import REPO_ROOT

TARGET = REPO_ROOT / FIXTURE


def test_the_committed_fixture_matches_what_the_emitter_produces() -> None:
    """THE WHOLE POINT. A stale fixture makes the cross-language test a museum
    piece: the canvas keeps accepting a document the engine stopped emitting."""
    assert TARGET.exists(), f"{FIXTURE} is missing; run `python -m learning_os.api.cli`"
    assert TARGET.read_text(encoding="utf-8") == render(), (
        f"{FIXTURE} is stale. Regenerate with `python -m learning_os.api.cli`."
    )


def test_check_mode_agrees() -> None:
    """The mode CI runs. Regenerating in CI would make the fixture agree with
    itself by construction and detect nothing."""
    assert main(["--check"]) == 0


def test_check_mode_fails_on_a_stale_fixture() -> None:
    """The negative control. Without it, `--check` could be a function that
    returns 0 unconditionally and nothing would notice."""
    original = TARGET.read_text(encoding="utf-8")
    try:
        TARGET.write_text(original.replace('"question"', '"questionX"'), encoding="utf-8")
        assert main(["--check"]) == 1
    finally:
        TARGET.write_text(original, encoding="utf-8")


def test_the_output_is_deterministic() -> None:
    """No clock, no randomness, no learner state. A `git diff` on the fixture has
    to mean the engine's output changed, not that the hour did."""
    assert render() == render()


def test_the_fixture_is_valid_json_with_the_schemas_top_level_keys() -> None:
    payload = json.loads(TARGET.read_text(encoding="utf-8"))
    assert set(payload) <= {"id", "question", "blocks", "relations", "subject"}
    assert payload["blocks"]
    assert payload == build()


def test_the_fixture_would_split_into_more_than_one_beat() -> None:
    """Checked here as well as in TypeScript, because this is the property the
    engine controls.

    Beats come from `emphasis` and `relations`. A lesson whose blocks are all
    `supporting` with no relations renders as one long beat — a lecture, which is
    exactly what the step-by-step system exists to prevent. The canvas cannot fix
    that; only the emitter can.
    """
    payload = json.loads(TARGET.read_text(encoding="utf-8"))
    emphases = {b["emphasis"] for b in payload["blocks"]}
    assert "primary" in emphases, "no block is primary, so every beat looks equal"
    assert payload["relations"], "no relations, so the canvas has nothing to split on"


# --------------------------------------------------------------------------
# The three modes the command actually has
#
# WHY THESE WERE MISSING AND WHY THAT MATTERED. `main` had three exits --
# `--check`, `--stdout`, and write -- and only the first was ever run. So the
# command a reader is told to type ("Regenerate with: python -m
# learning_os.api.cli") had never been executed by anything, and neither had the
# branch that reports a fixture that is not there at all. Measured before these
# were written: `api/cli.py` at 69%, the lowest file in the package.
#
# REPO_ROOT IS REDIRECTED, NOT THE WRITE SUPPRESSED. The write is the behaviour
# under test; pointing it at tmp_path is what lets it happen for real without
# the suite editing the repository it is testing.
# --------------------------------------------------------------------------
def test_check_mode_says_which_file_is_missing_rather_than_raising(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """A fresh checkout with the fixture deleted must READ as a missing file."""
    monkeypatch.setattr(cli, "REPO_ROOT", tmp_path)

    code = main(["--check"])

    assert code == 1
    err = capsys.readouterr().err
    assert "missing fixture" in err
    assert str(tmp_path / FIXTURE) in err, "the message did not name the path it looked at"


def test_stdout_mode_writes_the_document_and_touches_no_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "REPO_ROOT", tmp_path)

    code = main(["--stdout"])

    assert code == 0
    assert capsys.readouterr().out == render()
    assert not (tmp_path / FIXTURE).exists(), "--stdout wrote a file as well as printing"


def test_the_regenerate_command_the_error_message_names_actually_regenerates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """`--check` tells the reader to run this. Nothing had ever run it.

    Including the directory it has to create: the fixture lives under
    `frontend/src/canvas/lessons/generated/`, so a checkout without those
    directories must not fail with a FileNotFoundError.
    """
    monkeypatch.setattr(cli, "REPO_ROOT", tmp_path)

    assert main([]) == 0

    written = tmp_path / FIXTURE
    assert written.read_text(encoding="utf-8") == render()
    assert "wrote" in capsys.readouterr().out

    # And the file it just wrote satisfies the check it was written for.
    assert main(["--check"]) == 0
