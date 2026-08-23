"""The figure binding, checked against the canvas's own registry.

WHY THIS TEST READS TYPESCRIPT
------------------------------
`REPRESENTATION_SHAPE` in `api/figure.py` duplicates a fact that lives in
`frontend/src/canvas/spec/representations.ts`. Duplication across a language
boundary is the thing that drifts, and the drift is silent: a wrong shape here
produces a well-formed block, a valid representation name, real data, and a
lesson the canvas refuses in a browser.

So the check is not "did somebody remember to update both". It parses the real
registry and compares. There is nothing to remember.

WHY IT FAILS RATHER THAN SKIPS WHEN THE FILE IS MISSING
-------------------------------------------------------
A cross-language check that quietly skips when it cannot find the other language
is a test that reports success for having done nothing — the same shape as the
sandbox test that was green only in the environment where the escape was
impossible. If the registry cannot be found, the verification did not happen, and
that is a failure.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from learning_os.api.figure import (
    NO_RENDERER,
    REPRESENTATION_SHAPE,
    SHAPES,
    FigureError,
    figure,
)

#: `learning-os/tests/` -> repo root -> the canvas registry.
REGISTRY = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "canvas"
    / "spec"
    / "representations.ts"
)

#: Matches `  bar: { shape: 'series', ...` in the registry literal. Anchored on
#: `shape:` immediately after the brace so a nested object elsewhere in the file
#: cannot be mistaken for an entry.
_ENTRY = re.compile(r"^\s{2}(\w+):\s*\{\s*shape:\s*'(\w+)'", re.MULTILINE)


def _registry() -> dict[str, str]:
    if not REGISTRY.exists():
        pytest.fail(
            f"the canvas registry is not at {REGISTRY}. This check compares Python "
            f"against TypeScript; without the TypeScript half it verifies nothing, "
            f"so it fails rather than skipping."
        )
    found = dict(_ENTRY.findall(REGISTRY.read_text(encoding="utf-8")))
    if len(found) < 100:
        pytest.fail(
            f"parsed only {len(found)} representations from the registry, which "
            f"should hold ~137. The literal's formatting has changed and this "
            f"parser is now checking a fraction of it — a partial check that "
            f"passes is worse than none."
        )
    return found


# --------------------------------------------------------------------------
# The Python table must agree with the TypeScript one
# --------------------------------------------------------------------------


def test_every_representation_we_emit_exists_in_the_canvas_registry() -> None:
    """A name the canvas does not know is refused outright."""
    registry = _registry()
    unknown = sorted(set(REPRESENTATION_SHAPE) - set(registry))
    assert not unknown, f"representations the canvas does not define: {unknown}"


def test_every_shape_we_claim_matches_the_canvas() -> None:
    """THE TEST THIS FILE EXISTS FOR.

    A wrong shape here is silent: valid name, real data, well-formed block, and a
    lesson refused in a browser where the engine is no longer in the stack.
    """
    registry = _registry()
    wrong = {
        name: (ours, registry[name])
        for name, ours in REPRESENTATION_SHAPE.items()
        if name in registry and registry[name] != ours
    }
    assert not wrong, f"shape disagreements (ours, canvas): {wrong}"


def test_the_twelve_shapes_match_the_canvas() -> None:
    """If the canvas gains or loses a shape, this fails rather than letting the
    Python side quietly describe a taxonomy that no longer exists."""
    assert {s for s in _registry().values()} == SHAPES


def test_the_renderer_less_representations_are_still_renderer_less() -> None:
    """Three names are registered with nothing behind them. If a renderer is
    added later this test fails, which is the correct way to find out that the
    engine may now emit one."""
    registry = _registry()
    for name in NO_RENDERER:
        assert name in registry, f"{name} is no longer registered at all"


# --------------------------------------------------------------------------
# The binding itself
# --------------------------------------------------------------------------


def test_matching_data_produces_a_block() -> None:
    """The positive control. Without it, "rejects mismatches" could be satisfied
    by rejecting everything."""
    f = figure(
        block_id="chart-0",
        representation="bar",
        data={"shape": "series", "series": []},
        title="Calls per frame",
    )
    block = f.as_block()
    assert block["kind"] == "figure"
    assert block["as"] == "bar"
    assert block["data"]["shape"] == "series"
    assert block["title"] == "Calls per frame"


def test_a_mismatched_shape_is_refused_with_the_canvas_wording() -> None:
    """Deliberately the same sentence `checkFigure` produces, so a Python failure
    and a browser failure are recognisably the same defect."""
    with pytest.raises(FigureError, match='"bar" needs series data, but parts was supplied'):
        figure(block_id="c", representation="bar", data={"shape": "parts", "parts": []})


def test_data_with_no_shape_is_refused() -> None:
    """The likelier mistake than a wrong shape: forgetting it entirely, because
    the representation name is what the emitter is thinking about."""
    with pytest.raises(FigureError, match="carries no `shape`"):
        figure(block_id="c", representation="bar", data={"series": []})


def test_an_unknown_representation_is_refused() -> None:
    with pytest.raises(FigureError, match="not one this engine emits"):
        figure(block_id="c", representation="sunburst", data={"shape": "hierarchy"})


def test_a_representation_with_no_renderer_is_refused() -> None:
    """It would produce a VALID lesson that draws nothing — worse than a
    rejection, because it fails silently in front of a learner."""
    # Reachable only if such a name is added to the emit table; asserted directly
    # so the guard is tested rather than assumed unreachable.
    from learning_os.api import figure as figure_module

    original = dict(figure_module.REPRESENTATION_SHAPE)
    figure_module.REPRESENTATION_SHAPE["logicCircuit"] = "logic"
    try:
        with pytest.raises(FigureError, match="no renderer"):
            figure(block_id="c", representation="logicCircuit", data={"shape": "logic"})
    finally:
        figure_module.REPRESENTATION_SHAPE.clear()
        figure_module.REPRESENTATION_SHAPE.update(original)


def test_every_emitted_representation_has_a_known_shape() -> None:
    """A shape outside the twelve would pass the binding check and fail the
    canvas, because the discriminated union has no arm for it."""
    for name, shape in REPRESENTATION_SHAPE.items():
        assert shape in SHAPES, f"{name} claims unknown shape {shape!r}"


def test_no_emitted_representation_lacks_a_renderer() -> None:
    """The table and the exclusion list must not contradict each other. If they
    did, `figure()` would refuse a name the table invites."""
    overlap = set(REPRESENTATION_SHAPE) & NO_RENDERER
    assert not overlap, f"emit table offers representations with no renderer: {sorted(overlap)}"


def test_the_block_carries_no_geometry_or_style() -> None:
    """Laws 2 and 3 at the figure boundary, where a `width` would be most
    tempting because a chart has one."""
    block = figure(
        block_id="c", representation="bar", data={"shape": "series", "series": []}
    ).as_block()
    for banned in ("x", "y", "width", "height", "color", "colour", "fontSize", "padding"):
        assert banned not in block, f"{banned} reached a figure block"
