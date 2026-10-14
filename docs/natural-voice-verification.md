# Local natural voice — 14 October 2026

The canvas now synthesizes English speech with Kokoro-82M locally on the server. It adds no hosted voice API key, per-character invoice, custom TTS architecture, audio database, or new recognition service. The existing model endpoint still supplies teaching answers independently of the voice engine. Other languages can use the Browser voice option.

## Minimum requirements and implementation

A spoken conversation needs microphone transcription, a teaching answer, audio playback and cancellation. Existing browser transcription and the teaching request remain. Kokoro replaces only the robotic output voice. One adapter caches the public model; one HTTP handler accepts bounded short text; one browser player plays native Web Audio. Every sentence is read, with bounded pieces and only one upcoming piece prefetched. Progress follows piece onset, not phoneme-aligned word timing.

The model is `onnx-community/Kokoro-82M-v1.0-ONNX`, pinned to `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, q8 CPU inference, voice `af_heart`. The initial download is roughly 90 MB; subsequent turns reuse model/cache. Cache is beneath `CANVAS_STATE_DIR/voice`, or `.canvas-state/voice` locally. Student text and generated audio remain in memory. Speech uses the same production authentication and origin protection as the existing API. Two admitted synthesis requests and one actual model inference bound CPU concurrency. HTTP requests release admission on disconnect; cancelled queued turns never enter inference. Already-running native inference may finish, but its audio is discarded.

The original Start voice gesture unlocks one AudioContext for the entire conversation. End voice, failure and unmount close it. Standalone Read aloud closes its context when finished. Stop/Interrupt abort requests, stop audible nodes, and reject stale playback. Interrupt then opens the microphone; automatic acoustic barge-in/echo cancellation is not implemented.

## Reuse and provenance

Superpowers TDD, verification and independent review guided this change. REA's actual `analyze_javascript_application` MCP tool inspected the shipped `kokoro-js@1.2.1` package without executing it: [retained MCP evidence](evidence/natural-voice/rea-kokoro-mcp.json), evidence `ev_a415db907e0d1306cc2745a807a28420612ffce176e343d724a14d1316e28622`. Its initial sandbox worker failed; the permitted local subprocess analysis succeeded. This is a real MCP call through a subprocess bridge; no claim of globally registered MCP tools. Superpowers is a skill framework, not an MCP server.

Public Studdy's inspected landing demo had no audio track. Its authenticated private tutor was not available, so this implementation does not claim Studdy's private voice/model, backend, or an exact clone. A licensed Kokoro synthetic voice is used.

## Verified behavior

- Genuine regression failures reproduced cancelled admission staying full and gesture-unlocked context being cleared through Canvas. Both now pass; retained failure logs accompany this document.
- Full suite: 575 tests, 32 files, none skipped. Coverage: lines 99.56%, statements 98.07%, functions 96.84%, branches 95.71%; all four existing 95% floors retained.
- Actual `/api/speech` with the pinned cached model generated a 24 kHz, 4.825-second waveform. [Listen to its output](evidence/natural-voice/teacher-sample.mp3). This sample is real synthesis, not a prerecorded provider fixture.
- Browser tests use that generated waveform and genuine Web Audio without mocking playback or disabling autoplay. Model/recognition transport in conversation tests is explicitly a fixture; physical microphones and speakers are not certified by them.
- Typecheck, production build, production runtime checks, 86 integrity tests, and the non-root read-only authenticated production container pass.
- Patched `sharp@0.35.5` and `onnxruntime-node@1.30.0` replace vulnerable transitive versions; application audit reports zero known advisories. CPU libraries are bundled; Docker and CI skip unused CUDA downloads.
- Fresh source mutation gate: 200 valid mutations killed, zero survivors/timeouts; 57 compiler-invalid candidates excluded. The first run exposed a response-deadline test weakness and an equivalent redundant abort-listener option; failure evidence is retained. Tests now assert the deadline rather than hitting Vitest timeout, and the redundant option was deleted.
- All 42 production Chromium journeys pass, including real waveform playback, two automatic conversation replies, interruption, pause/resume and short-screen controls.
- Independent review found and rechecked the two important lifecycle defects; no critical/important finding remains. CodeRabbit CLI is unavailable in this environment, so it was not claimed as executed.

This is free of voice-service charges; local compute/electricity and deployment hosting still have costs. English Kokoro quality is model-dependent. No subjective equivalence to ElevenLabs or physical Safari/iPhone certification is claimed. Existing GitHub coverage-upload/ruleset permissions blockers remain documented in the release audit; this change does not weaken those protections.

## Expressive alternative tested, not assumed

Downloaded the official MIT-licensed Chatterbox repository at `5de7a54aa4e5e2baadb0182dde554908b48b85c2` and public Nano weights at `71ccd1d0081b430592cea481f4307e764e07bc64`. Ten required artifacts total 1,942,108,236 bytes; published LFS hashes were verified. The unused duplicate decoder and Gradio UI were omitted. The isolated evaluator uses CPU-only PyTorch 2.6.0, patched Transformers 5.10.0, Diffusers 0.38.0, stable Safetensors 0.8.0, setuptools 83.0.0 and pip 26.2.1. Official Perth watermark code is pinned to `ff1c8ac55a976971245cdd53c18d6131ca00d993`; generated speech retains its watermark. Dependency compatibility and audit pass. These evaluation dependencies are not added to the product.

| Measured output | Audio duration | Warm generation/request time | Real-time factor |
|---|---:|---:|---:|
| Actual authenticated production Kokoro endpoint | 4.825 s | 3.987 s | 0.83 |
| Nano, same words, four CPU threads | 4.24 s | 6.164 s | 1.45 |
| Nano with a native chuckle tag | 5.00 s | 7.853 s | 1.57 |

The first production Kokoro request including initialization took 4.976 s with cached public weights. Cold Nano initialization took 4.1 s; its first two-thread generation took 17.8 s. The cloud has four CPU cores of quota. These are measurements on this machine, not predictions for an Apple GPU.

[Hear the real expressive Nano sample](evidence/natural-voice/expressive-nano-sample.mp3). A separately pinned local Whisper-tiny.en model (`87c7102498dcde7456f24cfd30239ca606ed9063`, Apache-2.0) recovered every spoken word in these three short comparison samples: [transcripts](evidence/natural-voice/intelligibility.json). This limited intelligibility check does not measure human preference, emotional realism, or general accuracy. Hosted transcription attempts returned HTTP 403, so local open-source inference replaced that external dependency instead of blocking verification.

The product keeps Kokoro as its working default: it is smaller and generates this sample faster than playback. Nano proves a free expressive path exists, but its measured CPU delay would currently worsen the conversation. Replacing the single model adapter later does not change the canvas, conversation, interruption or playback code. No unverified second speech service is introduced into production.
