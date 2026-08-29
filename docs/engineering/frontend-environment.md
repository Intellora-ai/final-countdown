# The frontend's environment variables

**Eleven `VITE_*` variables are read by `frontend/src`. Until this file, none
of them was documented anywhere.**

That absence had a specific cost. The root `.env.example` opens with *"Verified
against the source rather than assumed. Anything not shown below was not found
being read"* — a claim that is true of the `scripts/` variables it lists and
was silently false of everything here. An operator's only route to
`VITE_TUTOR_ENDPOINT` was to read the throw string in `httpModel.ts:176-184`
after the feature had already appeared broken.

Every line below cites the file that reads it. Nothing is inferred from a name.

> This is a documentation file rather than `frontend/.env.example` because
> `.env*` paths are permission-protected in this repository. The content is the
> same thing an example file would carry: names, meanings and defaults, never
> values.

---

## The warning that governs all of them

**Anything in a `VITE_*` variable is compiled into the bundle and served to the
browser. A key here is a published key.**

`httpModel.ts:63-72` refuses to send one to a non-local endpoint for exactly
that reason — the only safe use is a placeholder that a model on your own
machine ignores. A hosted provider needs a server-side proxy holding the key.

Every variable is optional, and every one has a working default or a documented
absent-behaviour. A clean checkout needs no `.env` at all. What a clean checkout
does **not** get is the model-backed features, which stay off until an endpoint
is set.

---

## Authoring and tutoring — the model on your own machine

| Variable | Meaning | Read at |
|---|---|---|
| `VITE_TUTOR_ENDPOINT` | A chat-completions URL. **Empty means the model features are off**: "Teach me anything…" on `/canvas` is disabled with a note, and `/tutor` shows a configuration notice. | `agent/ports/httpModel.ts:176`, `canvas/CanvasRoute.tsx:184`, `tutor/TutorView.tsx:60` |
| `VITE_TUTOR_MODEL` | The model name that server serves. Defaults to `local-model` (`httpModel.ts:47`), which most local runners reject — set it to a name the server actually has. | `canvas/CanvasRoute.tsx:185`, `tutor/TutorView.tsx:88` |
| `VITE_TUTOR_KEY` | Only ever a local placeholder. See the warning above. | `canvas/CanvasRoute.tsx:186`, `tutor/TutorView.tsx:92` |

For a local runner the endpoint is usually one of:

```
http://localhost:11434/v1/chat/completions   # Ollama
http://localhost:1234/v1/chat/completions    # LM Studio
```

**A cold model load takes minutes, not seconds.** Measured on this machine: a
40-token request against an unloaded `qwen2.5:3b` did not return inside 60
seconds; the same request against the warm model returned in **1.68s**. A
timeout tuned for the warm case makes a working setup look broken.

## Practice

| Variable | Meaning | Read at |
|---|---|---|
| `VITE_PRACTICE_PROVIDER` | Set to `model` to route practice through a real model instead of the deterministic default. Explicit on purpose — a silent switch between a fake and a real provider is how nobody can tell which one produced a session. | `practice/SessionView.tsx:42` |
| `VITE_PRACTICE_ENDPOINT` | The chat-completions URL practice uses when the switch above is `model`. | `practice/SessionView.tsx:44` |

## Web search — the doubt resolver's last rung

| Variable | Meaning | Read at |
|---|---|---|
| `VITE_SEARCH_ENDPOINT` | A search endpoint. Absent, the web rung is simply not added to the chain, and the canvas answers from the lesson and the engine only. | `tutor/TutorView.tsx:64`, `websearch/index.ts:83` |
| `VITE_SEARCH_KEY` | Same published-key warning as `VITE_TUTOR_KEY`. | `tutor/TutorView.tsx:76` |
| `VITE_SEARCH_DEPTH` | `research` selects the deeper multi-step search; anything else is a single pass. | `tutor/TutorView.tsx:65` |

## API base

| Variable | Meaning | Read at |
|---|---|---|
| `VITE_API_BASE` | Base URL for the engine's HTTP API, normalised by `canvas/api/config.ts`. The dev server mounts `/api/*` itself, so this is for pointing a **build** at an engine running elsewhere. | `canvas/api/config.ts:7` |

## Probes only — not used by the app

| Variable | Meaning | Read at |
|---|---|---|
| `VITE_OLLAMA_MODEL` | Model name for the two Ollama probe scripts. Defaults to `qwen3:8b`. | `practice/ollamaRate.probe.ts:27`, `practice/topicFit.probe.ts:42` |
| `VITE_PROBE_TOPICS` | How many topics those probes sample. Defaults to 12 and 10 respectively. | `practice/ollamaRate.probe.ts:28`, `practice/topicFit.probe.ts:43` |

---

## What is NOT configurable, and is worth knowing

`vite.config.ts` mounts the engine and search routes via `configureServer`, so
**`/api/doubt` and `/api/search` do not exist in a production build.** The
canvas knows this and accepts one wasted round trip per doubt rather than
branching on the build mode. Setting `VITE_API_BASE` is how a build reaches a
real engine instead.
