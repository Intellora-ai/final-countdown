"""Figure blocks: naming a representation and supplying data in its shape.

THE ONE RULE, AND WHY IT IS EASY TO BREAK
-----------------------------------------
`checkFigure` in the canvas rejects a block whose `data.shape` does not match
`shapeOf(block.as)`. It refuses rather than coercing, and a rejection takes the
WHOLE lesson down because the schema is strict.

It is easy to break because of what an emitter is thinking about. The
representation name is the interesting decision -- "draw this as a sankey" -- and
the shape is a consequence of it that nobody holds in mind. So the natural
mistake is to pick a name and attach whatever data was already to hand. That
produces a well-formed block, a valid name, real data, and a refused lesson.

So the binding is enforced HERE, where the engine is still in the stack and can
say which contract produced it, rather than in a browser where the payload is all
anyone can see.

WHY THIS TABLE IS SMALL WHEN THE REGISTRY HAS 137 ENTRIES
---------------------------------------------------------
Copying 137 name->shape pairs into Python would be 137 chances to mistype one,
and the mistyped one would be found by a learner. This holds only the
representations the engine actually emits, and `test_api_figure.py` PARSES
`frontend/src/canvas/spec/representations.ts` and asserts every entry here agrees
with it. Drift is therefore not prevented by discipline; it fails a test.

Adding a representation is one line here plus whatever data-builder it needs. The
test will refuse it immediately if the shape is wrong.

WHAT THIS DELIBERATELY DOES NOT DO
----------------------------------
It does not CHOOSE the representation. The canvas owner's rule is that the spec
may not state anything the canvas can derive, and picking between a bar and a
lollipop for the same series is a rendering decision. The engine names a
representation only because the schema requires one and the choice is not
derivable from the data alone -- and when in doubt it should pick the plainest
member of the shape rather than the most expressive.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

#: The twelve data shapes. Every representation reduces to one of these, which is
#: the insight the canvas registry is built on: ~150 ways to draw, ~12 things to
#: draw. Invariants live on the shape, not the name -- "a pie cannot show
#: negative parts" is a fact about parts-of-a-whole, not about pies.
SHAPES = frozenset(
    {
        "series",
        "distribution",
        "parts",
        "matrix",
        "graph",
        "hierarchy",
        "flowWeighted",
        "intervals",
        "process",
        "logic",
        "tabular",
        "geometry",
    }
)

#: The representations this engine emits, and the shape each requires.
#:
#: Deliberately the plain members of each shape. A `bar` and a `lollipop` render
#: the same data; choosing the second is a presentation decision the engine has
#: no basis for, and the canvas is better placed to make it.
#:
#: Verified against the TypeScript registry by test, not by review.
REPRESENTATION_SHAPE: dict[str, str] = {
    "bar": "series",
    "line": "series",
    "pie": "parts",
    "histogram": "distribution",
    "heatMap": "matrix",
    "nodeLink": "graph",
    "treemap": "hierarchy",
    "sankey": "flowWeighted",
    "gantt": "intervals",
    "flowchart": "process",
    "truthTable": "logic",
    "table": "tabular",
}

#: Three representations the canvas registers with no renderer behind them.
#: Naming one produces a valid lesson that draws nothing, which is worse than a
#: rejection because it fails silently.
NO_RENDERER = frozenset({"circuitSchematic", "logicCircuit", "experimentalSetup"})


class FigureError(ValueError):
    """A figure block the canvas would refuse.

    Raised, not returned. `.strict()` plus a `reject`-level shape issue means the
    whole lesson is refused, so there is no partially-usable outcome to hand back.
    """


@dataclass(frozen=True, slots=True)
class Figure:
    """One `figure` block, with its representation and its data agreeing."""

    id: str
    representation: str
    data: dict[str, Any]
    title: str | None = None
    emphasis: str = "supporting"

    def as_block(self) -> dict[str, Any]:
        block: dict[str, Any] = {
            "id": self.id,
            "kind": "figure",
            "emphasis": self.emphasis,
            "as": self.representation,
            "data": self.data,
        }
        if self.title is not None:
            block["title"] = self.title
        return block


def figure(
    *,
    block_id: str,
    representation: str,
    data: dict[str, Any],
    title: str | None = None,
    emphasis: str = "supporting",
) -> Figure:
    """Build a figure block, refusing every mismatch the canvas would refuse.

    Four checks, in the order a mistake actually gets made:

      1. the representation is one this engine emits at all;
      2. it has a renderer behind it -- three registered names do not, and
         naming one draws nothing rather than failing;
      3. the data carries a shape;
      4. that shape is the one the representation requires.

    Check 4 is the one `checkFigure` performs. Checks 1-3 exist because failing
    them produces the same outcome -- a refused lesson -- with a much less
    obvious error message.
    """
    required = REPRESENTATION_SHAPE.get(representation)
    if required is None:
        raise FigureError(
            f"representation {representation!r} is not one this engine emits; "
            f"known: {sorted(REPRESENTATION_SHAPE)}"
        )
    if representation in NO_RENDERER:
        raise FigureError(
            f"representation {representation!r} is registered but has no renderer; "
            f"it would produce a valid lesson that draws nothing"
        )

    shape = data.get("shape")
    if shape is None:
        raise FigureError(f"figure data carries no `shape`; {required!r} was required")
    if shape != required:
        # The exact failure `checkFigure` reports, raised here instead — where
        # the contract that produced it is still available.
        raise FigureError(
            f'"{representation}" needs {required} data, but {shape} was supplied'
        )

    return Figure(
        id=block_id,
        representation=representation,
        data=data,
        title=title,
        emphasis=emphasis,
    )
