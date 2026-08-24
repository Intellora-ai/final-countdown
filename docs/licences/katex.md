# katex

| # | Point | Value |
|---|---|---|
| 1 | Package | `katex` |
| 2 | Exact version | `0.18.4` |
| 3 | Copyright holder | Khan Academy and other KaTeX contributors |
| 4 | Licence identifier | **MIT** |
| 5 | Official licence source | https://github.com/KaTeX/KaTeX/blob/v0.18.4/LICENSE |
| 6 | Verified licence-file URL | https://raw.githubusercontent.com/KaTeX/KaTeX/v0.18.4/LICENSE |
| 7 | SHA-256 of retrieved licence text | `766ccc1f306c885aa45542a9846bbd0a505b27a0374f146778171c2254ce18e3` (1107 bytes, first line `The MIT License (MIT)`) |
| 8 | Dependency status | direct dependency — **recorded at CS-0, installed at CS-9** |
| 9 | Verified | 2026-08-21 — `npm view katex version license repository.url` (registry metadata, no install) followed by `curl` of the licence file at tag `v0.18.4`; performed by the CS-0 changeset |

**Commercial production use:** permitted.
**Attribution required:** copyright notice and licence text must accompany copies of the software;
satisfied by the licence file inside the installed package.
**Paid production licence:** none.
**Feature restrictions:** none.
**Watermark:** none.
**Mandatory telemetry:** none.
**Genuinely open source, not source-available:** yes. OSI-approved MIT, full text retrieved and
checksummed above.
**Vendor lock-in:** low. Equations live in the semantic model as LaTeX source strings, not as
KaTeX objects and never as bitmaps, so the renderer can be replaced with MathJax or Temml without
touching the model. Test T8 enforces that the semantic layer imports no renderer.

**Why this dependency:** the Gemini reference renders `P ∝ T` and `PV = nRT` in mathematical
italic. That is standard maths typesetting, not the handwriting face — KaTeX produces it natively.
The design contract forbids rendering equations as images, so a real typesetter is required rather
than optional. KaTeX over MathJax for render latency, which is bounded by acceptance test P2
(representation-switch p95 ≤ 150 ms).

**Not installed by CS-0.** `package.json` gains this entry in the CS-9 changeset, which is the
first one that renders an equation. A record without an install is the intended state.
