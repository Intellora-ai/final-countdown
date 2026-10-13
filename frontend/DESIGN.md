# Minimal personalized teacher

The learner's requirements are personalization, continuity, files and a clear
visual board. These are product goals, not guarantees of perfect model reasoning.
Finite context, memory, processing time and untrusted input are real constraints.

| Requirement questioned | Decision and reason |
| --- | --- |
| A new teaching engine per subject | Delete the assumption. The configured model handles the request; the renderer accepts general SVG. |
| Always force a lesson or diagram | No. Conversation and plain handwritten answers remain supported. |
| A vector database for long-term memory | Not needed for this browser-local pilot. Retrieve relevant saved transcripts by vocabulary. |
| Send every saved board every time | No. Keep recent conversation, retrieve up to three relevant older answers, and send compact learner notes. |
| Run another model to summarize memory | No. Optional memory replacement travels with the normal answer. |
| Hide personalization from the learner | No. Notes are editable, disableable and erasable. |
| Keep only eight turns forever | Removed as the only source of context. Older saved lessons can now be retrieved across topics. |
| Parse files on a separate backend | No. PDF, EPUB and text are read locally; only selected excerpts are sent. |
| Install PDF native dependencies on the production server | No. Parsers are build dependencies, loaded on demand in the browser. |
| Send original full-size photos | No. Resize locally to at most 1024 pixels per side before sending. |
| Accept unlimited bytes or pretend to read arbitrary binary formats | No. Bound resource use and report unsupported files. |
| Separate text, diagram and photo model services | No. One configurable chat-completions endpoint; photos require its vision support. |
| Make the model place every paragraph on the board | No. Native measured text renders the explanation; optional general SVG supplies figures and short labels. |
| Add a second font asset or external typography service | No. Embed the existing bundled Caveat font into isolated SVG images and exports; keep its open license. |
| Add SVG templates for every topic | No. Retain the general sanitized SVG renderer and local parameter controls. |
| Ask the model to calculate graph coordinates and zero-axis placement | No. Optional SVG declarations reuse the existing numeric plotter; the model supplies expressions, ranges and composition. |
| Install an entire drawing editor to improve teacher-generated artwork | No. An editor adds learner drawing and object manipulation; it does not improve the model's subject knowledge or arbitrary SVG composition. |
| Retrain model weights for every learner | No. Personalization comes from supplied context; this app does not train the model. |
| Add accounts now | No. Shared access password and per-browser learning storage remain a protected pilot. |
| Trust browser storage forever | No. Export and restore learning backups, plus explicit storage failure notices. |

Development and production use the same request schema and model configuration.
Production keeps authentication, request budgets, output caps, security headers
and non-root execution. File-reading workflows are tested behind those headers,
not merely under Vite. CI repeats the meaningful checks; no extra orchestrator,
repair loop, semantic classifier or subject-specific engine was introduced.

Limits are explicit: three files at once, 20 MB per local file, 500 PDF pages,
up to 500,000 extracted characters, 40 MB expanded EPUB content, 6,000 characters
per document excerpt and 2,000 learner-memory characters. Recent history has its
own 64 KB transport budget; the full request can include resized images up to
1.8 MB. These limits protect the browser and provider budget. Excerpts are not
a claim that the entire book was sent or comprehensively analyzed.

The five-step execution order is: question requirements; remove unnecessary
processing and repeated data; simplify the surviving path; measure and fix
failures; automate the verified checks in CI. "100% coverage" and perfect answers
are not asserted: tests prove the listed behaviors, not every possible book,
browser, model output or educational judgment.
