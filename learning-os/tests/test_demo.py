"""The demo fixtures are an assertion, so they are tested like one.

A pair of JSON files checked in beside a README claiming "look, the engine
adapts" is worth nothing: nobody regenerates them, the engine changes, and the
files go on describing a system that no longer exists. Worse, they keep looking
persuasive while doing it.

So the demo is held to three things -- the files are what the engine produces
TODAY, the two learners genuinely got different instruction, and the difference
traces to memory rather than to the inputs having quietly diverged.
"""

from __future__ import annotations

import json

from learning_os.api import demo
from learning_os.memory.store import MemoryStore
from learning_os.policy import choose_strategy
from learning_os.spec_root import REPO_ROOT


def _on_disk(name: str) -> str:
    return (REPO_ROOT / demo.OUT_DIR / f"{name}.json").read_text(encoding="utf-8")


def test_the_committed_fixtures_are_what_the_engine_produces_now() -> None:
    """`--check` is the whole reason these files can be trusted.

    Without it the fixtures drift from the engine silently, and the first person
    to notice is whoever is being shown the demo.
    """
    assert demo.main(["--check"]) == 0, "fixtures are stale; run python -m learning_os.api.demo"


def test_every_fixture_the_generator_writes_is_committed() -> None:
    """A generator that writes a file nobody committed produces a demo that
    works only on the machine that ran it."""
    for name, (_, payload) in demo.build().items():
        assert _on_disk(name) == demo.render(payload)


# --------------------------------------------------------------------------
# The claim itself
# --------------------------------------------------------------------------


def test_the_two_learners_get_different_mechanisms() -> None:
    """THE CLAIM. Same knowledge, different history, different instruction.

    If this fails the engine is templating, and every other test in the suite
    can still be green while the product does not exist.
    """
    strategies = {name: s for name, (s, _) in demo.build().items()}
    assert len(set(strategies.values())) == 2, strategies


def test_the_difference_reaches_the_rendered_lesson() -> None:
    """A different decision that renders to identical bytes is a decision the
    emitter threw away -- which would be invisible if only the strategy were
    checked."""
    rendered = {demo.render(p) for _, p in demo.build().values()}
    assert len(rendered) == 2


def test_the_lessons_differ_in_shape_and_not_only_in_wording() -> None:
    """Adaptation that only swaps adjectives is not adaptation.

    The fallback strategy carries a different block composition, and that is
    what a reader actually sees.
    """
    kinds = {
        name: tuple(b["kind"] for b in payload["blocks"])
        for name, (_, payload) in demo.build().items()
    }
    assert len(set(kinds.values())) == 2, kinds


# --------------------------------------------------------------------------
# The difference must come from memory, not from the setup
# --------------------------------------------------------------------------


def test_both_learners_are_asked_the_same_question_about_the_same_skill() -> None:
    """The demonstration is worthless if the inputs differ.

    Two learners with different diagnoses getting different lessons proves
    nothing -- an earlier version of this demo did exactly that and looked
    convincing.
    """
    for _, payload in demo.build().values():
        assert payload["question"] == demo.QUESTION
        assert payload["id"] == demo.SKILL.replace(".", "-").replace("_", "-")


def test_learner_b_burns_the_mechanism_the_engine_would_have_chosen() -> None:
    """Otherwise exclusion has nothing to exclude.

    This is the bug the first version of the demo had: it burned a strategy
    outside this diagnosis's preference list, so both learners got the engine's
    first choice and the demo silently proved nothing.
    """
    first_choice, _, _ = choose_strategy(demo.DIAGNOSIS, MemoryStore(), demo.SKILL)
    assert first_choice.value in demo._learner_b().failed_mechanisms(demo.SKILL)


def test_learner_a_receives_the_engines_first_choice() -> None:
    """The control. If learner A were also being steered, the comparison would
    not isolate memory."""
    first_choice, _, _ = choose_strategy(demo.DIAGNOSIS, MemoryStore(), demo.SKILL)
    strategy, _ = demo.build()["learner-a-first-attempt"]
    assert strategy == first_choice.value


def test_the_fixtures_are_byte_stable_across_runs() -> None:
    """No clock, no randomness. Otherwise `git diff` on a fixture shows the hour
    it ran rather than a change in what the engine emits."""
    assert demo.build() == demo.build()


def test_the_payloads_are_json_the_canvas_could_read() -> None:
    """`render` is what lands on disk; if it is not parseable the frontend
    import fails at build time rather than here."""
    for _, payload in demo.build().values():
        assert json.loads(demo.render(payload)) == payload
