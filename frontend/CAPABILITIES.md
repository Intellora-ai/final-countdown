# Capability audit

## Implemented

- Model-independent UI with one configurable OpenAI-compatible JSON-schema endpoint.
- Blackboard writing, wrapped text, arrows, shapes, freeform vector paths, and computed math plots.
- Exact regular polygons, native MathML equation typesetting, and automatic graph layout.
- Locally measured handwritten text instead of estimated character widths.
- Zoom, scroll/pan, fit, and font-embedded SVG download.
- Full-board revisions with previous versions retained in browser-local lessons.
- Optional plain replies, diagrams, steps, comparisons, charts, and practice checks.
- Conversation ancestry, bounded recent memory, cancellation, timeout, and preserved drafts.
- Browser microphone and speech synthesis, automatic next turns, and explicit interruption.
- General SVG artwork: arbitrary vector composition with groups/transforms, curves,
  gradients, patterns, clipping, masks, filters, and text; zoom/pan and SVG export.
- One generation contract with optional scene/layout/equation conveniences.
- Older saved step/comparison/chart lessons remain readable.

## Not implemented

- Model-driven web search, citations, or tool calling. Disconnected helper endpoints were removed.
- File upload, image/audio understanding, raster image generation, or video.
- Streaming, cross-device accounts/memory, or offline recognition guarantees.
- Automatic model failover, arbitrary code execution, or executable generated HTML.
- Guaranteed correct educational content, optimal layout, or human-quality voice.

The board is reusable across subjects. Its primitives are implementation tools,
not subject-specific lessons or fixed illustrations. A better model can use the
same drawing contract later; the model still needs JSON-schema support.

Dagre (MIT) handles graph placement; KaTeX (MIT) parses equations into safe
MathML and loads only when needed. No image-generation subscription is required
for these vector drawings. This is not unlimited computation: scene elements,
text lengths and graph sizes remain bounded to keep the browser responsive.
Native MathML in exported SVG requires a viewer supporting foreignObject/MathML.

General SVG is rendered as an image, not inserted as executable page markup.
DOMPurify sanitizes displayed and exported artwork; external resources, HTML,
CSS stylesheets and animation are excluded. SVG presentation attributes and local
definitions remain available. This expands composition freedom without promising
photorealistic raster generation or guaranteed model accuracy.

## Interactive vector exploration

SVG blocks may define up to twelve named slider parameters with labels, bounds,
defaults and steps. Numeric {{expressions}} in SVG attributes/text are evaluated
with the shared arithmetic parser, without eval or generated JavaScript. This
works across subjects: the model defines the variables and relationships.
Sliders update locally, reset to defaults, and SVG export captures current values.
Changing a slider does not make another model request. Defaults are saved with
lessons; temporary slider positions reset when the drawing changes or reloads.
Invalid arithmetic is reported while controls remain available for recovery.
Duplicate IDs and missing local SVG definitions are detected before display.
These controls require no paid API, new package or subject-specific engine.

Object editing, streaming and file/image understanding remain future work.
