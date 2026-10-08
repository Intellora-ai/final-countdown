# Visual learning canvas

One student question → one model request → a clear answer, with optional visuals.

## Run

Node 24 and npm are the only local runtime requirements.

```sh
cd /workspace/final-countdown/frontend
npm ci --cache /workspace/.npm-cache
npm run dev -- --host 127.0.0.1
```

The development server serves both the canvas and its API. No second process,
database, search service, planner, or Python engine is required.

Set `LESSON_API_URL` to a full OpenAI-compatible chat-completions URL and
`LESSON_MODEL` to an available model. Hosted services also need
`LESSON_API_KEY`. Export these variables or put them in ignored `.env.local`
for development. Restart after configuration changes. The production server
reads process variables, not `.env.local`. The model must support JSON output.
Remote endpoints require HTTPS; local endpoints may use HTTP. Secrets stay on
the server. A missing model leaves the app running with an explicit connection
notice; it does not supply canned lessons.

```sh
npm test
npm run build
npm start
# Browser binaries are installed separately:
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run test:e2e
```

Production defaults to loopback port 8787; set HOST and PORT when needed.
This is a local, single-user development server. Before exposing model access
publicly, add authentication and request quotas.

## Requirements challenged

| Requirement | Source / reason | Decision and removal consequence |
| --- | --- | --- |
| Student chooses any subject | Owner's explicit request; fixed content failed their intended use | Keep. Questions go verbatim to the configured model. |
| Visuals on every question | Initially inferred from the canvas request; explicitly challenged by the owner | Delete the mandate. Plain text is valid; use diagrams, steps, comparisons, or charts only when useful. Remove bespoke 3D simulations and subject-specific renderers. |
| Quiz after every answer | Teaching convention, not a customer requirement | Delete the mandate. Checks are optional and omitted when they do not help. |
| Follow-up questions | Minimum useful learning loop | Keep previous lesson as context. Remove resolver escalation, research pipelines, shadow controllers, and competing decision engines. |
| Keep generated work | Prevent refresh from losing the session | Keep browser-local storage. Remove server database, student identities, migrations, and distributed memory. No account or cross-device sync. Existing legacy data files are left untouched; they are not imported into this format. |
| Validate untrusted output | A malformed model response must not crash or invent connections | Keep one shared schema. Remove overlapping lesson-arc, semantic, assurance, and provenance gates. Schema validity does not prove educational correctness. |
| Multiple vendors and automatic failover | Historical architectural choice, not needed to establish the loop | Delete. One compatible endpoint is selected explicitly. Provider failure is visible. |
| Curriculum planning, dashboard, separate practice/tutor screens | Previous product scope, superseded by the owner's canvas focus | Delete from this app. No generated daily schedule or hardcoded curriculum. |
| Hosted formal proofs and Python engines | Separate repository workflow; no dependency in this canvas | Disconnect from canvas. Other root projects remain untouched. |
| Mandatory live model for server boot | Historical startup choice | Delete. Missing configuration blocks generation, not the UI or saved work. |
| Third-party fonts, graphics frameworks, orchestration scripts | Presentation/implementation preferences | Delete. System fonts, SVG, CSS, React, one API. |

None of these software choices is a physical law. Quantitative visuals must
come from the question or an explicitly stated example; factual accuracy still
depends on the model and student review. Tests use labelled provider fixtures
to verify transport, validation, follow-ups, persistence, and failure behavior;
they do not establish live model quality.

Legacy frontend-specific gates and workflows describe the removed architecture
and are not validation of this replacement. The new checks are the commands
above. The prior tracked frontend source is recoverable from Git and from
`/workspace/canvas-before-simplification.tar` in this machine.

Cloud setup uses Ollama 0.13.5 (image pinned by digest) and qwen2.5:3b as a
small CPU development default, not a claim of best teaching quality. Models
are retained under `/workspace/.ollama`. The model download needs
`registry.ollama.ai` and any storage host it redirects to allowed in environment
settings. A model running on your laptop is not automatically reachable here.
Browser tests can use the installed Chromium with `CHROMIUM_PATH=/usr/bin/chromium`.
