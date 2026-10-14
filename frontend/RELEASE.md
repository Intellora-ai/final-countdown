# Protected canvas release

This release supports a single-server, password-protected pilot. It is not an
anonymous public service or a cross-device account system. Existing voice uses
browser speech APIs: voice quality, permission and recognition support vary by
browser; automated tests do not establish real microphone quality.

## Configure and deploy

Use Node 24 or newer. Put credentials in server secrets, never in VITE_ variables,
source control, screenshots, or chat. Configure these on the deployed server:

| Setting | Value |
| --- | --- |
| LESSON_API_URL | Full OpenAI-compatible chat completions endpoint |
| LESSON_MODEL | Model available from that provider |
| LESSON_API_KEY | Provider key, when required |
| LESSON_RESPONSE_FORMAT | json_object for Groq; json_schema if supported |
| LESSON_MAX_TOKENS | Output ceiling, default 4096; range 256–8192 |
| CANVAS_ACCESS_PASSWORD | Random password of at least 16 characters |
| CANVAS_DAILY_REQUESTS | Shared daily request ceiling, default 100 |
| CANVAS_STATE_DIR | Writable persistent directory for the budget |

For Groq the endpoint is https://api.groq.com/openai/v1/chat/completions.
On 12 October 2026, `openai/gpt-oss-120b` with `json_object` returned a valid
worked algebra explanation and SVG in a live check. Confirm current model
availability before deployment; this text model does not establish image support.
The browser login username is `canvas`. Production refuses to start without a
sufficient password. Use HTTPS; Basic authentication must not travel over public
HTTP. Terminate TLS at a reverse proxy and forward only to the private server.

From the repository root:

```sh
docker build -t learning-canvas .
docker run -d --name learning-canvas --restart unless-stopped \
  -p 127.0.0.1:8787:8787 --env-file /private/path/canvas.env \
  -v canvas-state:/app/state learning-canvas
```

The image runs as the non-root `node` user. Keep the state volume when replacing
containers. Run one instance: file-backed limits are not distributed across
replicas. Each POST attempt consumes the daily budget, including failures; it
resets at midnight UTC. Limits also allow only two active requests and ten starts
per minute. These bound request counts, not currency: set provider-side spend
limits too. For Node deployment, build in frontend and run `NODE_ENV=production
npm start` with these settings already injected. Restart after changing settings.
Railway's unauthenticated `GET /api/health` probe returns only `{ "ok": true }`;
application and lesson routes still require authentication. Attach a persistent
volume at `CANVAS_STATE_DIR` and explicitly keep the service at one replica.
Health means the process is reachable, not that the provider key or model works.

## Reduce token usage

- Older boards send their question and transcript, without repeating SVG markup.
- Only the most recent board retains geometry, within a 24,000-character history
  budget. Oversized geometry is omitted with an explicit notice to the model.
- JSON-object mode sends a compact contract instead of duplicating the full schema.
- Every call has an output ceiling; truncation produces a clear error.
- There is one model call per request, without automatic retries or repair calls.
- Invalid drawings retain a handwritten transcript instead of triggering another
  generation. Interactivity, zoom and export happen locally without model calls.

Character budgets approximate input size, not exact provider token counts.
Lower output ceilings save tokens but can truncate detailed drawings. This does
not extend a key's expiry or bypass provider quotas. No response cache or extra
summarization calls are introduced; they could reuse private answers incorrectly
or spend tokens while trying to save them.

## Release checks

From frontend run `npm ci`, `npm run test:ci`, `npm run test:strength`, `npm run build`,
`npm run test:production`, `npm run test:e2e`, and `npm audit --audit-level=moderate`.
Install Playwright Chromium first if no system Chromium is available. CI performs
these checks. Production smoke uses a local provider fixture, not real Groq.
Before inviting users, verify one real provider answer, one follow-up diagram,
and microphone interruption in the target browser behind your HTTPS deployment.
Secrets saved in Codex environment settings do not configure a Mac or deployed
container automatically. The unused Python/proof services were retired from this
repository's release scope; their source remains in Git history.

## Files and learner data

Learning notes and saved boards stay in local browser storage. Export backups
before clearing site data. Files stay in the current tab; selected excerpts or
resized photos go to the configured provider when you submit a question. Avoid
sharing sensitive files without considering that provider's data policy. Image
understanding requires a vision-capable model; a text-only model cannot gain
vision through application changes. PDF/EPUB parsers run in the browser, not a
new server upload service. The production server serves PDF worker `.mjs` files
with JavaScript MIME type. CI also exercises upload and memory/backup workflows
behind production authentication and security headers.
