# Local natural voice — 14 October 2026

The canvas now synthesizes English speech with Kokoro-82M locally on the server. It adds no hosted voice API key, per-character invoice, custom TTS architecture, audio database, or new recognition service. The existing model endpoint still supplies teaching answers independently of the voice engine. Other languages can use the Browser voice option.

## Minimum requirements and implementation

A spoken conversation needs microphone transcription, a teaching answer, audio playback and cancellation. Existing browser transcription and the teaching request remain. Kokoro replaces only the robotic output voice. One adapter caches the public model; one HTTP handler accepts bounded short text; one browser player plays native Web Audio. Every sentence is read, with bounded pieces and only one upcoming piece prefetched. Progress follows piece onset, not phoneme-aligned word timing.

Unnecessary ONNX Runtime telemetry is disabled automatically before the library loads, using its upstream `ORT_DISABLE_TELEMETRY` control. No user configuration is needed. A regression failed before this removal and now passes.

The model is `onnx-community/Kokoro-82M-v1.0-ONNX`, pinned to `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, full-precision CPU inference with four threads, voice `af_heart`. The initial download is roughly 326 MB; subsequent turns reuse model/cache. Cache is beneath `CANVAS_STATE_DIR/voice`, or `.canvas-state/voice` locally. Student text and generated audio remain in memory. Speech uses the same production authentication and origin protection as the existing API. Two admitted synthesis requests and one actual model inference bound CPU concurrency. HTTP requests release admission on disconnect; cancelled queued turns never enter inference. Already-running native inference may finish, but its audio is discarded.

The original Start voice gesture unlocks one AudioContext for the entire conversation. End voice, failure and unmount close it. Standalone Read aloud closes its context when finished. Stop/Interrupt abort requests, stop audible nodes, and reject stale playback. Interrupt then opens the microphone; automatic acoustic barge-in/echo cancellation is not implemented.

## Reuse and provenance

Superpowers TDD, verification and independent review guided this change. REA's actual `analyze_javascript_application` MCP tool inspected the shipped `kokoro-js@1.2.1` package without executing it: [retained MCP evidence](evidence/natural-voice/rea-kokoro-mcp.json), evidence `ev_a415db907e0d1306cc2745a807a28420612ffce176e343d724a14d1316e28622`. Its initial sandbox worker failed; the permitted local subprocess analysis succeeded. This is a real MCP call through a subprocess bridge; no claim of globally registered MCP tools. Superpowers is a skill framework, not an MCP server.

Public Studdy's inspected landing demo had no audio track. Its authenticated private tutor was not available, so this implementation does not claim Studdy's private voice/model, backend, or an exact clone. A licensed Kokoro synthetic voice is used.

## Earlier baseline: verified behavior

- Genuine regression failures reproduced cancelled admission staying full and gesture-unlocked context being cleared through Canvas. Both now pass; retained failure logs accompany this document.
- Full suite: 576 tests, 32 files, none skipped. Coverage: lines 99.56%, statements 98.07%, functions 96.84%, branches 95.71%; all four existing 95% floors retained.
- Actual `/api/speech` with the pinned cached model generated a 24 kHz, 4.825-second waveform. [Listen to its output](evidence/natural-voice/teacher-sample.mp3). This sample is real synthesis, not a prerecorded provider fixture.
- Browser tests use that generated waveform and genuine Web Audio without mocking playback or disabling autoplay. Model/recognition transport in conversation tests is explicitly a fixture; physical microphones and speakers are not certified by them.
- The final authenticated non-root read-only container also generated real 24 kHz speech through `/api/speech`: HTTP 200, finite waveform, 3.125 seconds of audio, no telemetry warnings. This is additional real-model evidence beyond the fixture container checks.
- A live Groq `openai/gpt-oss-120b` teaching request returned HTTP 200 in 0.727 seconds, explained changing shadows clearly, and produced zero visual blocks as requested.
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

## Follow-up: measured bottlenecks and 2,000 generated cases

The public MIT-licensed `@elevenlabs/client@1.28.0` shipped audio processor queues PCM on the audio thread. Actual REA MCP evidence is retained in [the SDK analysis](evidence/natural-voice/rea-elevenlabs-mcp.json), evidence `ev_d784ac8fc3e579c20ef445801a2693d65293301ca70020f2fc9481f918cd9145`. We reuse that timing principle through existing AudioBufferSource scheduling, without adding its hosted SDK or a custom worklet. One upcoming sentence can start on the sample clock before a delayed UI completion callback.

Removed arbitrary 120-character speech cuts. Sentence context, embedded and punctuation-wrapped abbreviations, and Unicode boundaries are preserved within the existing 512-character service limit. The abbreviation lexicon is reused from Apache-2.0 Kokoro.js. The canvas displays Preparing voice before audio is ready.

On this CPU, the same context passage took 8.892 seconds with q8 and 3.849 seconds with full precision (four threads), producing 10.525 and 10.475 seconds of finite audio respectively. The shorter sample took 4.160 versus 2.044 seconds. Full precision was faster here, so quantization was removed. These two measured samples do not predict every machine or establish subjective ElevenLabs equivalence. [Full precision](evidence/natural-voice/fp32-benchmark.json), [q8 baseline](evidence/natural-voice/q8-benchmark.json).

2,000 permanent seeded property cases cover Unicode token normalization, bounded memory, measured text layout, and replaceable provider transport. They are generated cases, not 2,000 independent product features or exhaustive coverage. Before the fix, 500 failed because memory truncation split a surrogate pair; 1,500 passed. The minimal fix preserves a complete final character. [Red evidence](evidence/natural-voice/universal-2000-red.txt).

The complete current unit suite passes 2,590 cases in 33 files, none skipped: statements 98.24%, branches 95.60%, functions 96.82%, lines 99.68%. All existing 95% floors remain enforced. [Current coverage](evidence/natural-voice/universal-coverage.txt). A real local teaching request returned HTTP 200 with `Hello!`; cloud model settings are connected. Local Mac settings are separate and must be loaded by the local app.

Current browser validation: 44 production Chromium journeys passed, including the native audio-clock/UI-stall regression on desktop and phone. Current production container synthesis returned HTTP 200, finite 24 kHz audio lasting 3.075 seconds in a 2.211-second request, running nonroot with a read-only filesystem and telemetry disabled. These are real inference and playback-mechanics checks, not physical microphone certification.

The first current mutation run honestly failed: 199 rejected, one survived, zero timeouts, 58 invalid excluded. Added an audio-device synchronous-pause failure assertion; it demonstrably fails with that surviving source mutation. No application behavior was weakened to make the test pass. The previous GitHub run had 199 rejected and one worker timeout; the bounded worker deadline is now 30 seconds instead of 15, with timeouts still failing release. The final full mutation rerun is recorded separately below.

[Listen to the current production FP32 sample](evidence/natural-voice/teacher-fp32-sample.mp3). The dependency audit found zero vulnerabilities; all 86 release-infrastructure tests pass after the runner change.

Final mutation rerun: 200 valid source mutations rejected, zero survivors, zero timeouts; 58 invalid mutations excluded. [Runner output](evidence/natural-voice/mutations-current-passed.txt), [per-mutation evidence](evidence/natural-voice/mutations-current-passed.json). Independent review found no critical or important issues in the final source, regression, or runner changes.
