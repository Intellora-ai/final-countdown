# Teaching board reconstruction

Goal: a clean handwritten learning board inspired by observed public Studdy behavior, with a replaceable model and general SVG artwork. Private Studdy prompts, services and authenticated features are unknown; this implementation does not claim backend parity.

Keep one answer surface, the existing native speech utterance, existing memory and attachment pipeline, and existing safe SVG renderer. Delete the separate scene wrapper for plain written answers and redundant caption state. Do not add a diagram catalog, subject router, speech queue or framework dependency.

Implement responsive handwriting, fresh-answer reveal with reduced-motion support, native word-boundary highlighting and captions, optional teacher-follow scrolling, pause/resume and board zoom. Saved answers remain complete and do not replay. Cancellation must reject late microphone and speech callbacks.

Verification: write failing regressions for observed defects, run full unit coverage with all four 95% floors unchanged, measure actual browser text/highlight geometry on desktop and phone, exercise real production build and deployment checks, run mutation tests, and obtain independent review. Simulated audio playback proves callback behavior, not physical microphone/speaker quality.

## Tool provenance

Superpowers: official obra/superpowers, commit bb92a77741419a4ab5f06e711a283343f1ada0c3, MIT, version 7.0.0. Applied test-driven-development, systematic-debugging, verification-before-completion and requesting-code-review. Skills inspected; hooks and optional companion not executed. Superpowers is not an MCP server.

REA: official morluto/rea, commit 40e94aeb9d127f61f554efdc7ab69c666fbf2c37, MIT. Published CLI/MCP 6.4.0 installed in an isolated tools directory with lifecycle scripts disabled. Public browser bundle inspection and an actual stdio MCP initialize/tools-list/list-browser-targets exchange were completed. No private-account access or global client configuration changes.

Security review and pinned provenance reduce risk; they cannot establish the absence of all vulnerabilities. The existing GitHub native coverage upload failure remains a release blocker; protection is not bypassed.

## Public contract investigation

Observed public navigation and ordinary network responses on 14 October 2026 (India time): landing-page app entry links to `/sign-in`; sign-in offers Google and email login. Observed same-origin requests are page documents, Next.js page fetches and public assets. No public teaching API contract was established by these observations. No login was submitted or authentication boundary bypassed.

Actual REA MCP evidence: landing observation ev_e1a19f1045ff90ecb28e86ceef3db7e72d0de5c9551c0da37a35bbec603a4cbb; sign-in observation ev_66ad21ba44a2bac600427656a2b3429b7a05c0253f817a7dbefb0e46087b30c7. Browser capture starts at attachment and intentionally excludes raw headers, cookies and payload values. Public bundle evidence ev_915f80b06661822ae931f1c5d914a35b79e198560d65320c018c361d3b8c5e56 supports frontend inspection, not server-source access.

Independent review identified three concrete defects: zoom using physical instead of layout width; saved question speech tracking; and short-height composer clipping. Regressions were observed failing before repair. Native Chromium verified writing magnification; the short phone composer initially extended 98px outside its viewport. Full-production browser execution additionally exposed a zero-height empty board and ambiguous old zoom locators. These are corrected without adding runtime dependencies.

Further actual REA MCP sign-in bundle inspection (ev_e97a7319f67f46987c4439d9e537b49bba71c53445a324508e9c05efabd7d8c4) observed fetch references to `/api/auth/complete-sign-in` and `/api/session/feedback`, with script positions. These references establish frontend endpoint names, not request/response contracts or server implementations. No account operation or feedback write was submitted. No page-declared WebMCP tools were observed.

Public email sign-in UI was opened without submission: it requests an email and sends a verification code, rather than displaying a password form. REA MCP DOM/accessibility evidence ev_f8000f46b6f3fdbdeda7acdc380972351c8538620f9d4d6e44a0a39fdef43b18 records that screen. This establishes the visible login flow only. The current canvas retains its explicitly documented single-instance password protection; cross-device account parity is not implemented by this board reconstruction.
