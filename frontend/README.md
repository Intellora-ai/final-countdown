# Blackboard

Ask a question. The model explains it and can draw directly on a blackboard.
Ask a follow-up to revise the drawing; earlier versions remain in saved lessons.

## Run locally

Install Node 24 or newer. In your existing checkout:

```sh
cd ~/final-countdown/frontend
npm ci
npm run dev
```

Open the localhost URL printed by Vite. The same process serves the UI and API.
Model settings go in the ignored `frontend/.env.local` for development. For an
already-running Ollama with an installed model, for example:

```dotenv
LESSON_API_URL=http://127.0.0.1:11434/v1/chat/completions
LESSON_MODEL=qwen2.5:3b
```

Restart Vite after changing settings. The endpoint is a full OpenAI-compatible
chat-completions URL supporting `response_format: json_schema` or `json_object`; the renderer
has no dependency on a particular vendor or model name. Hosted endpoints can
use `LESSON_API_KEY`, kept on the server. Production reads process environment
variables. A model is not needed to open saved work.

```sh
npm test
npm run build
npm start
# Install Playwright's browser once, then run browser checks:
npx playwright install chromium
npm run test:e2e
```

Production defaults to `http://127.0.0.1:8787`. The cloud test environment can
use `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`; that Linux path is not
needed on a Mac. This server is intended for local, single-user use.

## Replace the model

Keep the same UI and drawing contract. Change only the endpoint, model name and
server-side key. For an OpenAI-compatible provider using JSON mode:

```dotenv
LESSON_API_URL=https://api.groq.com/openai/v1/chat/completions
LESSON_MODEL=<a model supporting JSON mode>
LESSON_API_KEY=<your key>
LESSON_RESPONSE_FORMAT=json_object
```

Gemini's OpenAI-compatible endpoint is
`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
use a supported Gemini model name and its API key. Model IDs and supported
response modes vary: check the provider's current documentation. There is no
provider-specific routing or automatic failover. Restart after changing settings.
Provider billing/free quotas are separate from this open-source application.

## What the board does

- Native vector writing: multiline labels, shapes, arrows, arbitrary SVG paths.
- Earlier saved scenes include formula plots calculated by the browser, with gaps at undefined points. Supported
  expressions use `x`, `+ - * / ^ **`, parentheses, `sin`, `cos`, `tan`, `abs`,
  `sqrt`, `exp`, `log`/`ln`, `pi`, and `e`. Multiplication is explicit (`2*x`).
- Fit-to-content viewport, zoom, scroll/pan, and self-contained SVG downloads
  including the locally bundled, open-licensed handwritten font. Generated
  SVG images embed that font for matching on-screen and downloaded labels.
- The initial board is empty; the question/file/voice composer remains available.
- Written explanations use measured, responsive handwritten SVG text on the board.
  Optional model SVGs add illustrations and labels, including
  declarative interactive controls. The model decides when to draw; there is no
  lesson detector, subject router, forced quiz or mandatory teaching sequence.
- General SVG supports freeform paths, text, gradients, transforms, masks,
  clipping, patterns and filters, rather than a diagram or mind-map catalog.
  Function curves can declare `data-plot`, `data-box` and `data-domain`; an
  optional matching `data-axes="true"` group places zero axes numerically.
  Parameter changes and exported geometry are calculated locally without another
  model request. Numerical curves use bounded sampling, not a symbolic proof.
- Earlier scene/diagram/math/template formats remain readable in saved boards.
- Follow-ups receive their own ancestor conversation, up to eight turns within
  the request byte budget. Oldest turns are removed first. If one drawing is
  too large, its textual explanation is retained without the geometry.
- Saved versions persist in this browser, including earlier scene formats.
- Browser voice input and output, repeat turns, explicit interruption, and stop.
  Recognition support and voice quality depend on the browser/OS. Recognition
  may use a browser vendor's service; offline or human-level audio is not promised.

Vector drawings have no paid image-generation quota. They are not photo generation,
video, arbitrary executable HTML, or a substitute for a capable model. Response
sizes and browser storage remain finite. Layout and factual correctness still
need review: validation proves safe structure, not that a model's explanation
or illustration is correct.

## Requirements questioned

| Proposed requirement | Decision and reason |
| --- | --- |
| Every message needs a visual/title/quiz | Removed. Let the question determine the presentation. |
| Ask the model to position every paragraph in SVG | Removed. The existing handwritten text renderer measures and wraps prose; SVG artwork carries figures and annotations. |
| Every subject needs a custom visual engine | Removed. General vector geometry handles diagrams and illustrations; a small expression parser handles numerical plots. |
| Drawings must stay inside a fixed page | Removed. The viewport expands around actual rendered bounds, including text. |
| Sentence-by-sentence speech queue | Removed. One utterance prevents cancelled audio from restarting and preserves punctuation/decimals. |
| All saved lessons go into every question | Removed. Only ancestors of the selected answer belong to that conversation. |
| Permanent sidebar and dark/light style mixture | Removed. History is collapsible; the board uses a warm paper-and-ink palette. |
| Duplicate generic tool route | Removed. Disconnected calculator/search endpoints were also removed. |
| Large string-length grammar constraints upstream | Removed from the wire schema after reproducing an Ollama grammar compiler crash. Local validation still limits content. |
| Thousands of renamed happy-path tests prove quality | Removed. Keep focused assertions about real rendering, transport, persistence, cancellation, calculation, and failure behavior. |

The browser tests use clearly identified model fixtures to cover UI behavior.
They do not prove model intelligence, microphone capture, or audible playback.
`VERIFICATION.md` records the checks and live model evidence from this change.

Caveat font and its SIL Open Font License are bundled under `public/fonts`;
no external font request is required. Common inline SVG paint and typography
styles become sanitized presentation attributes; scripts, outside resources
and model-provided CSS stylesheets remain blocked. The unused Python/proof engines were
retired; their earlier source remains available in Git history.

Protected deployment and token budgets: [release instructions](RELEASE.md).

## Personalized learning and files

Open Saved lessons → Learning memory to review or correct the teacher's notes.
The model can update this compact memory in the same answer, without another API
call. Relevant older saved answers can be retrieved even after starting a new
topic. Disable memory to stop sending/updating learner notes and older retrieval;
recent conversation is controlled separately. Erase memory or all learning, and
export/restore a JSON backup to preserve learning or transfer it manually.
Storage is local to this browser; no account or cloud memory sync is added.

Attach PDF, EPUB, UTF-8 text (including CSV, JSON, Markdown and source files),
HTML or browser-decodable photos using the composer. Documents are parsed locally
and relevant text excerpts are sent with your question. Photos are resized locally
and sent to the configured model, which must support image input. Files stay in
this tab until removed; they are not retained in learning backups. Scanned PDFs
need OCR that is not included: attach page photos instead. Unsupported binary
formats, such as native office documents, need export to PDF or text. See
[design decisions and processing limits](DESIGN.md).

PDF.js and fflate are open-source parsers loaded on demand. General SVG drawings
remain subject-independent, with optional local controls and no drawing-service
charge. Model inference may have provider costs. Context improves the evidence
available to the model; it does not promise perfect recall, reasoning or artwork.
