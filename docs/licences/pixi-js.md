# pixi.js

| # | Point | Value |
|---|---|---|
| 1 | Package | `pixi.js` |
| 2 | Exact version | `8.20.0` |
| 3 | Copyright holder | Mat Groves and the PixiJS contributors |
| 4 | Licence identifier | **MIT** |
| 5 | Official licence source | https://github.com/pixijs/pixijs/blob/v8.20.0/LICENSE |
| 6 | Verified licence-file URL | https://raw.githubusercontent.com/pixijs/pixijs/v8.20.0/LICENSE |
| 7 | SHA-256 of retrieved licence text | `5ce7447bc57f7349ffc48338782fbcabe613696e00712b20d66bc58e780f9473` (1092 bytes, first line `The MIT License`) |
| 8 | Dependency status | direct dependency — **recorded at CS-0, installed at CS-10** |
| 9 | Verified | 2026-08-21 — `npm view pixi.js version license repository.url` (registry metadata, no install) followed by `curl` of the licence file at tag `v8.20.0`; performed by the CS-0 changeset |

**Commercial production use:** permitted.
**Attribution required:** copyright notice and licence text must accompany copies of the software;
satisfied by the licence file inside the installed package.
**Paid production licence:** none.
**Feature restrictions:** none.
**Watermark:** none.
**Mandatory telemetry:** none.
**Genuinely open source, not source-available:** yes. OSI-approved MIT, full text retrieved and
checksummed above.
**Vendor lock-in:** low. Particles read their state from `VariableStore` and draw through a
renderer adapter; `canvas-core` imports no renderer, which acceptance test T8 enforces at **0**
violations. Replacing PixiJS means rewriting one adapter, not the simulation.

**Why this dependency:** measured from the reference image, the particle field is the only region
that both moves and glows, and glow is the classic way to lose 60 fps. The design contract
therefore requires **one shared blurred sprite texture** rather than a per-particle CSS filter —
that is a GPU-batched draw, which is what a WebGL 2D renderer exists to do. Plain SVG or DOM nodes
cannot hold acceptance test P1 (p95 frame time ≤ 16.7 ms) at the particle counts in the reference.

**Not installed by CS-0.** `package.json` gains this entry in the CS-10 changeset, which is the
first one that renders a particle. A record without an install is the intended state.
