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
