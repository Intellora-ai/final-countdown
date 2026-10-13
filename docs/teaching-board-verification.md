# Teaching board verification — 14 October 2026

The board now keeps one handwritten answer surface, general safe SVG artwork, persistent controls, optional teacher-follow scrolling, captions and native speech-boundary highlighting. Model selection stays configurable. No runtime dependency was added. This reconstructs observed public Studdy teaching-board behavior; it does not claim its private backend, accounts or prompt implementation.

## Subtraction and observed repairs

Plain written answers no longer pass through the legacy scene wrapper. Captions derive from the existing utterance transcript instead of duplicating state. Completion no longer resets hidden pause state redundantly; every new utterance already resets it. Unmount retains the callback generation guard and native cancellation without resetting an unmounted preference ref. Handwriting row selection uses original text offsets without an unnecessary trim operation.

Tests reproduced incorrect paragraph/highlight positioning, physical-width zoom cancellation, saved check tracking and a composer extending 98px below a 320px-high phone viewport. Repairs use absolute row baselines, layout width, an offset-aware check target and a bounded scrollable composer. Whole-suite browser checks additionally caught a zero-height blank board.

## Verified checks

- Full unit suite: 541 tests across 29 files, none skipped. All four coverage floors remain 95%; measured lines 100%, statements 99.23%, functions 98.58%, branches 96.16%.
- Production build and production API checks pass. Provider behavior in deployment checks is a local fixture.
- Full production Chromium suite: 36 desktop/phone journeys pass. These cover general SVG, computed mathematics, file input, memory, zoom, export, safe text, speech cancellation, follow, pause/resume, reduced motion and the short phone viewport. Speech playback is simulated, using native Chromium utterance/boundary objects; actual audible output is unverified.
- Workflow contract and 86 integrity tests pass.
- Production container passes non-root, read-only filesystem, authentication, static assets/PDF worker, persistent quota and restart checks.
- Application npm audit reported zero known vulnerabilities. This is advisory evidence, not proof that all vulnerabilities are absent.
- Genuine Groq gpt-oss-120b teaching request: HTTP 200 in 2.805 seconds, one 334-byte SVG with two computed plot declarations; no SVG alerts or browser errors. Completed screenshots replay that captured response without a second model request. Other model answers can still be wrong.

Independent Superpowers review findings were repaired. CodeRabbit CLI was unavailable (command not found); it was not claimed as a completed review.

## Mutation evidence

The first fresh campaign failed: 197 kills, one survivor, two timeouts; 52 compiler-invalid candidates excluded. Its report is retained separately. The survivor changed a redundant playback-completion pause reset; that operation was removed, with a behavior test retaining pause/completion/restart coverage. A subsequent campaign failed with 198 kills and two survivors, without timeouts. One was the unreachable microphone-end reset, which was removed; the other inverted the saved-history selection marker. An exact replay of the latter now fails the new selection regression. An independent empty/populated-history regression also rejects an inverted empty-history condition. Final fresh official campaign passed: 200 kills, zero survivors, zero timeouts; 56 compiler-invalid candidates excluded. Baseline 541/541; independent source/test fingerprint validator passed. Raw report SHA-256: `e017c480efe867da531ebb7b171ca7f7282bb31c0b42ec1f95e8454cb353ded1`. Earlier failed reports remain historical diagnostics and do not substitute for this result.

## Release boundary

GitHub PR #220 remains the protected release branch. The known native GitHub coverage-upload HTTP 404 is not bypassed. No release-ready or merge-success claim is made until mandatory remote gates pass.

Tool provenance and public REA MCP evidence IDs are documented in [the design record](superpowers/specs/2026-10-13-teaching-board.md).

## Reviewable screenshots

[Completed handwriting](evidence/teaching-board/writing.png), [computed artwork](evidence/teaching-board/drawing.png), and [phone board](evidence/teaching-board/phone.png) show the captured actual Groq answer rendered by this application. The artwork view is panned to the drawing; the writing view preserves the complete response. These are reconstruction evidence, not Studdy screenshots.

## Remaining-item verification — 14 October

The pushed commit `acfc5d5472eb3e4163c3d141b4ad0cf0051ffebc` completed GitHub run 38468907911. Browser, core, container, integrity and all three CodeQL language jobs passed. Coverage upload failed with HTTP 404; release-gate correctly failed. Downloaded GitHub artifacts independently confirmed 541 passing tests across 29 files, all four 95% floors, 801/801 covered lines and matching per-source Cobertura counts. The independent mutation validator confirmed 200 kills, zero survivors/timeouts, 56 compiler-invalid exclusions and matching current source/test fingerprints. Remote mutation report SHA-256: `a60dc48d4e11b56183bf3897f5cd63d4ae1a51e5ad558cbc5b519e5ab7acd95b`.

Actual Chromium APIs, without fake devices or mocked speech, reported no audio devices, `getUserMedia` NotFoundError, no synthesis voices and synthesis-failed. Real application controls recovered from both failures: no lingering Speaking/Listening status, Read aloud and Start voice became available again. This verifies native error handling, not audible output or a successful real microphone turn on a Mac. Evidence is in `docs/evidence/release-access/native-audio.json` and `native-audio-ui.json`.

The integration received HTTP 403 `Resource not accessible by integration` for reading/patching Code Quality setup and updating the ruleset. Repository role metadata reports admin, but that does not grant the integration Administration write access. The official setup API requires Administration repository permission (write); official coverage documentation lists GitHub Team/Enterprise Cloud availability. The present responses do not independently establish this account's entitlement.

A reviewed payload for the previously approved legacy Bandit/code-quality removals is retained in `docs/evidence/release-access/approved-ruleset-repair.json`. It preserves active enforcement, no bypass actors, mandatory release-gate, PR protection, CodeQL and native 95% coverage. GitHub rejected its application; no rule was changed. The supported setup PATCH (`state=configured`, JavaScript/TypeScript and Python, standard runner, AI findings disabled) was also rejected with 403. No thresholds, fatal upload errors or protections were weakened.

To finish the two external items requires an actual audio-capable Mac/browser environment and a GitHub connection with Administration write access plus eligible/enabled Code Quality. Repeating tests or installing more analysis skills cannot grant either capability.

Official references: https://docs.github.com/en/code-security/how-tos/maintain-quality-code/set-up-code-coverage and https://docs.github.com/en/rest/code-quality/code-quality#update-a-code-quality-setup-configuration .
