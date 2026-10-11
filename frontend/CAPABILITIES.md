# Capability audit

## Implemented

- Model-independent UI with one configurable OpenAI-compatible JSON-schema endpoint.
- Blackboard writing, wrapped text, arrows, shapes, freeform vector paths, and computed math plots.
- Zoom, scroll/pan, fit, and font-embedded SVG download.
- Full-board revisions with previous versions retained in browser-local lessons.
- Optional plain replies, diagrams, steps, comparisons, charts, and practice checks.
- Conversation ancestry, bounded recent memory, cancellation, timeout, and preserved drafts.
- Browser microphone and speech synthesis, automatic next turns, and explicit interruption.
- Standalone bounded calculator and optional custom search-adapter endpoints.

## Not implemented

- Model-driven web search, citations, or tool calling. Existing helper endpoints
  are not connected to the model conversation.
- File upload, image/audio understanding, raster image generation, or video.
- Streaming, cross-device accounts/memory, or offline recognition guarantees.
- Automatic model failover, arbitrary code execution, or executable generated HTML.
- Guaranteed correct educational content, optimal layout, or human-quality voice.

The board is reusable across subjects. Its primitives are implementation tools,
not subject-specific lessons or fixed illustrations. A better model can use the
same drawing contract later; the model still needs JSON-schema support.
