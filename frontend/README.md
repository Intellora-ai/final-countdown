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
  including the locally bundled, open-licensed handwritten font.
- New responses are text plus optional general SVG canvases, including
  declarative interactive controls. The model decides when to draw; there is no
  lesson detector, subject router, forced quiz or mandatory teaching sequence.
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
no external font request is required. Other repository projects and legacy
student data are outside this canvas and remain untouched.

Protected deployment and token budgets: [release instructions](RELEASE.md).
