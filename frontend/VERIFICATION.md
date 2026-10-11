# Blackboard verification

This record describes the rebuilt board and the preceding cancellation/context
fixes. Baseline: commit `9027aa9`. These are observed checks, not a claim of
universal correctness or human-quality voice.

## Failures reproduced before fixing

The initial targeted run of `voice.test.ts` and `requirements.test.tsx` against
the old implementation produced **12 failures out of 12**:

- New topic leaked old lessons into memory; disabling context still sent memory.
- Unmount did not abort the pending request.
- Stopped recognition delivered a late transcript.
- Recognition completion/error callbacks ran repeatedly or after failure.
- Stopping could throw; constructor failure escaped the callback.
- Speech splitting broke `Dr.` and `3.14`.
- Cancellation queued another sentence; replaced speech completed the old turn.
- Empty speech incorrectly started playback.

Those same 12 regression tests pass after the fixes. Further checks cover
preserved drafts, cancelled late results, bounded UTF-8 context, two consecutive
voice turns, synchronous microphone denial, and interruption. Browser audio APIs
are simulated in these lifecycle tests; they do not verify actual hardware sound.

API regression checks exposed duplicate previous-context messages, a mandatory
title for casual conversation, and missing origin checks on helper endpoints.
These have dedicated passing assertions. Scene-bound rejection was deliberately
removed: the browser measures content and expands the viewport instead of losing
old saved drawings or retrying otherwise valid geometry.

## Automated checks

Run from `frontend`:

```sh
npm test
npm run build
npm run test:e2e
```

The completed unit/integration run has **119 passing tests in twelve files**.
The build typechecks and produces browser and Node server bundles.

The **ten passing Chromium browser checks** run the following five workflows
on desktop and phone:

1. Generated lesson, persistence, reload, and context-carrying follow-up.
2. General paths, arrows, computed plot, wrapped text, measured bounds, zoom/fit,
   embedded-font SVG download, full-board revision, and reload.
3. Markup-shaped model text rendered literally without executing scripts.
4. Native MathML equations, exact triangle/hexagon vertices, twelve-node automatic
   connected layout, selection, and phone overflow checks.

Browser responses are explicitly labelled fixtures. They establish application
behavior, not model intelligence. The drawing case takes a screenshot under
`test-results` for visual review. No subject-specific lesson is shipped with
these fixtures in the product.

Production smoke checks returned HTTP 200 for the UI, configuration health,
and locally hosted handwritten font with `Content-Type: font/ttf`.

## Live model check

Tested the actual local Ollama 0.13.5 service with installed `qwen2.5:3b`, through
Vite's real `/api/lesson` endpoint.

An initial drawing request returned HTTP 500. Ollama logs contained:

```text
parse: error parsing grammar: number of repetitions exceeds sane defaults
llama_grammar_init_impl: failed to parse grammar
SIGSEGV: segmentation violation
```

The cause was a large string-length repetition rule in the generated JSON
schema. Length limits are now retained in local validation and omitted only
from the outbound grammar schema. Subsequent requests returned validated
lessons without that crash.

The test model produced scene data, including freeform paths, but made incorrect
geometry for a requested triangle. One earlier successful JSON response also
contained no drawing. The explicit drawing contract improved format compliance;
it does not make a 3B model reliably accurate. These quality failures were not
hidden with hardcoded replacement illustrations.

The drawing renderer uses general geometry and the plot renderer calculates
formula points. A stronger JSON-schema-compatible model can replace this local
model without changing the blackboard. Factual content, choice of shapes, and
layout still require evaluation with that model.

A live plot request returned `expression: "x**2"` and the requested domains
(-3 to 3 and 0 to 10). The parser now accepts both `^` and `**` power notation;
two regression cases cover ordinary and negated powers. The real response was
loaded into Chromium and produced one finite curve with 401 calculated points.

## Subtraction and deterministic drawing pass

1. Question: the model need not estimate graph positions, polygon vertices or
   text widths. Those are calculable browser operations, not learning content.
2. Delete: removed the fixed two-column layout and character-width approximation.
3. Simplify: use small pinned open-source Dagre and KaTeX libraries rather than
   building custom layout and TeX engines. Regular polygon vertices use geometry.
4. Shorten feedback: unit properties cover multiple shapes, orientations, graphs,
   Unicode text and equations; Chromium checks the combined rendered result.
5. Automate verified mechanics: font measurement, graph placement, exact vertices
   and typesetting happen independently of the chosen model.

The first new browser run failed in two projects because its path-count selector
counted the SVG marker definition as an edge. It now counts paths with marker-end;
no product behavior was disabled to pass.

A live qwen2.5:3b drawing request timed out after sixty seconds. Earlier live
requests also produced incorrect geometry despite valid JSON. The application now
returns HTTP 504 for upstream timeout with a specific message. Automated fixture
tests validate rendering, not the model's ability to choose correct content.
These changes do not establish that this model can draw any requested image.

## Focused drawing cleanup

Questioned whether disconnected tool endpoints and six generated block types help
this drawing goal. Removed search-adapter code and the standalone calculator API;
plot arithmetic stays because it computes real geometry. New model output now has
three block kinds: scene, diagram and math. Legacy saved blocks remain readable.
Deleted duplicated schema examples from the prompt and kept concise composition
instructions. Model replacement is tested through the same configurable endpoint
and drawing contract. Server bundle decreased from 19.08 kB to 13.08 kB.
The last two steps are short feedback cycles and automated checks; no extra
orchestrator, subject router or retry engine was added.

## General artwork surface

The earlier three-block generation contract was an unnecessary composition
constraint. Added complete SVG artwork as the general vector representation;
scene, graph layout and equations remain optional conveniences, not subject
routing or fixed templates. SVG artwork is bounded to 40,000 characters and uses
an explicit finite positive viewBox. The model connection is unchanged.

Nine new unit checks cover transformations, gradients, masks, clipping, patterns,
filters, text, malformed SVG and active/external content removal. One failed
initially because DOMPurify removed the browser-global ID 'blur'; namespacing
local IDs and references fixed it without weakening sanitization. Two new browser
checks verify image decoding, zoom, sanitized download, persistence and no
external resource requests on desktop and phone. These are renderer fixtures,
not proof that the existing small model generates high-quality SVG.
