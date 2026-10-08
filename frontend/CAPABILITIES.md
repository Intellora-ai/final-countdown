# Capability audit

This file is the subtraction decision record for the canvas. It distinguishes
what a general assistant can do from what this small local product can prove.

## Current capabilities

- Answer one question through an OpenAI-compatible model endpoint.
- Carry the last eight validated browser-local turns into a request.
- Return text with optional diagrams, steps, comparisons, and charts.
- Validate model output before rendering it.
- Render diagrams as safe SVG data, with node selection and edge highlighting.
- Save and reload lessons in the current browser.
- Run as one Vite development process or one Node production process.

## Missing capabilities and the deletion decision

| Capability | Who wants it / why | Is it necessary now? | Decision |
| --- | --- | --- | --- |
| Web search and citations | Useful for current facts and source review | No proof that every question needs the web; adds network, source quality, and privacy costs | Defer until a tested question needs current information |
| File upload and reading | Useful when the student has their own material | Customer-level request only if supplied; no file workflow exists yet | Defer; do not add upload storage without a concrete use case |
| Code execution | Useful for calculations and programming questions | A calculator is a smaller validated requirement | Add a bounded calculator first; reject arbitrary code execution |
| Image/audio understanding | GPT-like expectation, not a physical requirement | Needs upload, storage, model support, and privacy policy | Defer |
| Streaming | UX preference; the answer can arrive as one validated object | Not required for correctness | Defer |
| Cross-device memory/accounts | Convenience requirement | Browser-local memory already proves the core loop | Defer; no database or identity system |
| Automatic provider failover | Historical reliability preference | One configured endpoint is enough to prove the product | Delete; expose failures clearly |
| Unlimited arbitrary SVG | Preference, not a learner requirement | Unsafe and unbounded | Keep bounded schema-driven SVG only |
| Every answer has a visual or quiz | Teaching convention | False for simple questions | Delete the mandate |

The next implementation must be small enough to test. A capability is kept only
when a test can prove its behavior and its failure mode; model intelligence is
not claimed merely because JSON parsed.

