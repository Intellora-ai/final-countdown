# Canvas visual verification — 13 October 2026

The core requirement is a readable learning board with optional general artwork.
The model chooses what to explain and draw. The app measures prose, supplies the
handwriting font, calculates numerical curves and axes, and retains the answer
when a drawing fails. No subject classifier, fixed artwork catalog, extra model
call, drawing editor or new runtime dependency was added.

## Actual defects and changes

- Isolated SVG images could not inherit the page font. The existing open-licensed
  Caveat font is embedded locally in images and exports containing text.
- Dark surface overrides hid dark ink in transparent drawings. Removed those
  overrides and redundant welcome decoration; new topics start with empty paper.
- Complete explanations could disappear whenever a response included SVG. The
  existing responsive handwritten-text renderer now always displays the prose.
- Safe inline paint and typography were discarded. A narrow presentation-attribute
  conversion retains them before the existing sanitizer and resource checks.
- A real Groq answer drew `abs(x)` upside down. Optional `data-plot` declarations
  now reuse the math parser and curve renderer. A later response placed manual
  axes incorrectly; optional matching `data-axes` groups calculate zero axes too.
- Review reproduced stripped declaration markers silently preserving old paths,
  invisible point-only output and missed thin windows. Declarations validate
  before sanitization; bounded numerical refinement and clipping preserve visible
  segments and discontinuity gaps. This is numerical approximation, not symbolic
  verification. Each plot is limited to 4,096 evaluations and eight refinement
  levels; exhaustion produces a drawing error rather than a partial curve.

Ordinary SVG remains available for freeform paths, text, transforms, gradients,
masks, filters, clipping and patterns. Parameter controls recompute locally and
exports contain current geometry. Scripts, external resources and active HTML
remain blocked. The embedded font and computed point coordinates consume no
provider tokens. The font adds about 538 KB of base64 data to a text-containing
export; persisted model artwork retains its compact original source.

## Verification and limits

New typography and prose regressions failed before their fixes. The mathematical
declaration regressions also failed before implementation. Independent review's
13 failing curve/axis regressions became 108 passing SVG/drawing unit tests.
The new browser checks compare actual pixels and exported coordinates against
independent fonts and analytic mathematics. The existing exploration journey
checks calculated axes and both parameter changes on desktop and phone.

The complete suite has 514 passing cases in 28 files, none skipped. Coverage is
100% lines, 99.43% statements, 98.88% functions and 96.54% branches, with unchanged
95% floors and all executable application files included. The protected
production browser suite has 32 passing checks; two additional development
checks cover uploads, memory, backup and restoration. Build, production API,
container and 86 CI integrity tests passed.

A fresh mutation diagnostic killed 199 faults and missed one: inverted attachment
guidance. The correct source already used the proper condition. Assertions were
added to the existing upload journey for empty, attached and removed states; the
exact mutation then failed before restoring the correct source. Diagnostic
evidence is not relabeled as a successful campaign. Final mutation evidence is
validated against exact source/test hashes in the release artifact.
The subsequent fresh campaign passed: 200 assertion kills, zero survivors,
zero timeouts and 51 compiler-invalid candidates excluded. Its baseline was
514/514; the exact former guidance survivor was killed. No production source
was changed merely to make this surviving test case pass.

Live Groq `openai/gpt-oss-120b` returned a correctly oriented `x`/`abs(x)` board
with calculated zero axes in 3.298 seconds. Raw artwork was 381 bytes; the browser
generated its curves and font locally. Another live response over-escaped XML
quotes and was rejected while its written explanation remained visible. These
observations demonstrate both a working sample and a remaining provider failure;
they do not establish perfect model output or teaching accuracy.

The JSON-mode system instructions remain 2,316 characters, below the existing
2,500-character regression budget. No output limit, automatic-retry restriction,
coverage threshold or failing CI verdict was weakened. Physical audio and model
knowledge still require evaluation; tests do not certify them.

## Studdy and open-source investigation

The reference is [Studdy AI](https://studdyai.com/). Its
[public demonstration](https://studdyai.com/videos/landing-en-hero-v2.mp4) shows
progressive handwriting, colored drawings, equations and voice controls. The
referenced tutor session redirects to sign-in; private backend behavior was not
inspected. Our board is not claimed to reproduce its full tutor, synchronized
writing/captions or account system.

[Excalidraw](https://github.com/excalidraw/excalidraw) is MIT and maintained, but
adds editable learner drawing rather than better model explanations.
[Rough.js](https://github.com/rough-stuff/rough) supplies optional sketch styling.
[tldraw](https://github.com/tldraw/tldraw) requires a production SDK license.
None was added to the app merely for popularity.

The requested [REA — Reverse Engineer Anything](https://github.com/morluto/rea)
was downloaded separately into the cloud workspace at upstream commit
`40e94aeb9d127f61f554efdc7ab69c666fbf2c37`. Its MIT skill and reference guides are
preserved unchanged. The isolated published CLI reports version 6.4.0 and was
used for passive inspection of Studdy's public page. Observation evidence ID:
`ev_cb0e60abf78c9c1a165746452dadcef12e7a098b9313f34eb550a0854c7c2cef`.
The skill does not register an MCP server automatically; the CLI works separately.
No proprietary code or Studdy artwork was copied into the application.

GitHub's native coverage publisher previously returned HTTP 404. The integration
still receives HTTP 403 when reading its administrative setup. The 95% rule and
fatal upload behavior remain intact, so this is not an accepted production release.
