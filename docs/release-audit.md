# Canvas release audit — 13 October 2026

The release remains a single-instance, password-protected canvas behind HTTPS,
with persistent quota storage. Model providers remain configurable. This audit
records observed checks; it does not certify every model answer or microphone.

## Requirements, deletion and repair

The retained requirements are a readable answer on the board, optional general
SVG artwork, useful learner context, document/photo input and browser voice.
No subject-specific diagram catalog, extra teaching engine, repair-model call or
new runtime dependency was added.

Removed an unreachable path-command guard, SVG whitespace normalization already
performed by the pinned sanitizer, and redundant font-only unmount flags. The
cancellation that protects changing scene geometry remains. Existing browser
speech failure handling also replaces a duplicate capability guard.

Actual failures reproduced and repaired include:

- Deployment health checks returned 401; public GET/HEAD health now exposes only
  process availability, while application routes retain authentication.
- Malformed provider envelopes produced misleading connection errors, and
  oversized provider streams were unbounded; both now fail with explicit errors.
- Restored boards lost spoken follow-up context; restore now retains it.
- Voice could race with file reading or leave an old error after a new question.
- Transparent uploaded diagrams lost dark ink during JPEG conversion.
- Document table boundaries joined distinct values, PDF output exceeded its text
  budget, and EPUB extension assumptions rejected valid packages.
- Single-character and Unicode queries missed relevant notes and document text.
- Valid local SVG definitions were discarded; resource references now retain
  local definitions, while scripts and external resources stay restricted.

The EPUB parser already had a 40 MB expansion guard. This release shares the
20 MB local-processing budget and checks declared expansion before allocation;
it does not describe the previous implementation as unbounded.

## Measured validation

| Check | Observed result |
| --- | --- |
| Unit/integration | 270 passed in 21 files; no skipped/pending tests |
| Unit coverage | 85.46% lines, 80.35% statements, 79.92% functions, 77.46% branches |
| Production Chromium | 20 passed across desktop and phone |
| Development upload/memory | 2 passed across desktop and phone |
| CI evidence/integrity | 54 passed; actionlint passed |
| Typecheck/build | Passed; browser and server bundles generated |
| Production smoke | Authentication, UTF-8, output cap, headers, quota persistence and shutdown passed |
| Container | Non-root, read-only, dropped capabilities, health, PDF worker and restart checks passed |
| Dependency audit | Zero advisories reported |

Every executable src/server TypeScript file remains in the unit coverage scope.
Subprocess and Chromium execution are separate evidence, not added to the unit
percentage. The Docker base is pinned to the digest actually built and checked.

One live call through the actual `generateLesson` implementation returned HTTP
200 in 3.115 seconds using Groq `openai/gpt-oss-120b`. It correctly solved
`2x + 3 = 17`, checked `x = 7`, and returned complete parseable SVG. Usage was
660 prompt and 1,109 completion tokens. This is one sample, not a teaching-quality
benchmark or proof of image understanding.

## Mutation evidence and release enforcement

The strength gate generates 200 distinct, type-valid source mutations across
voice, visuals, memory, uploads and server code. It runs isolated copies with two
workers and prioritizes related tests, stopping after a genuine assertion
failure. Survivors must run every selected assertion. Invalid candidates,
process/test timeouts and collected-but-unrun cases cannot become assertion kills.

The latest diagnostic campaign actually failed: 198 killed, 2 survived, zero
timeouts and 50 compiler-invalid candidates excluded. The surviving incoming
learner-budget and legacy chart-limit changes exposed missing boundary coverage.
Permanent regressions now cover both incoming/outgoing learner context and every
retained list-block contract. A fresh campaign and GitHub execution determine
the release verdict; the diagnostic report is not relabeled as successful.

CI retains the final mutation JSON as an artifact. Its independent validator
checks exact source/test/runner hashes, evidence counts, assertion failures and
unresolved outcomes. Adversarial tests reproduced an underlying npm-command
bypass and a validator CLI that accepted survivors; both now fail closed.

CodeRabbit CLI was unavailable (`command not found`); independent agent review
was completed. No automated review result is invented.

Ruleset `final countdown protection` is active and requires `release-gate`,
with no bypass actors. Its additional legacy Bandit/code-quality/95%-coverage
requirements still need administrator reconciliation. The connected integration
cannot update that endpoint. The workflow does not bypass protected main.

Physical voice quality, HTTPS hosting, persistent deployment storage, real
provider quotas and further teaching-quality evaluation remain release operations.
See [release instructions](../frontend/RELEASE.md) for the exact deployment scope.
