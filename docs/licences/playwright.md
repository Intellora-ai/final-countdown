# @playwright/test

| # | Point | Value |
|---|---|---|
| 1 | Package | `@playwright/test` |
| 2 | Exact version | `1.62.1` |
| 3 | Copyright holder | Microsoft Corporation |
| 4 | Licence identifier | **Apache-2.0** |
| 5 | Official licence source | https://github.com/microsoft/playwright/blob/v1.62.1/LICENSE |
| 6 | Verified licence-file URL | https://raw.githubusercontent.com/microsoft/playwright/v1.62.1/LICENSE |
| 7 | SHA-256 of retrieved licence text | `45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb` (11601 bytes, first line `Apache License`, `Version 2.0, January 2004`) |
| 8 | Dependency status | direct `devDependency` of the **repository root** `package.json` |
| 9 | Verified | 2026-08-22 — `node -e "require('@playwright/test/package.json').version"` against the already-installed package, then `curl` of the licence file at tag `v1.62.1`; the retrieved text's SHA-256 matches the installed `node_modules/@playwright/test/LICENSE` byte-for-byte. No `npm install` was run for this record. |

**Commercial production use:** permitted.
**Attribution required:** the licence text and any NOTICE contents must accompany copies of the
software — satisfied by the licence file shipping inside the installed package. Nothing is
required in the product UI.
**Paid production licence:** none.
**Feature restrictions:** none.
**Watermark:** none.
**Mandatory telemetry:** none. (Browser downloads fetch from Microsoft's CDN at
`npx playwright install` time; that is a build-time asset fetch, not runtime telemetry.)
**Genuinely open source, not source-available:** yes. OSI-approved Apache-2.0; the full text was
retrieved and checksummed above rather than inferred from a badge.
**Vendor lock-in:** low-to-moderate. Specs use the standard `test`/`expect` surface; the
canvas harness additionally uses CDP (`Emulation.setCPUThrottlingRate`), which is a
Chromium-protocol standard rather than a Playwright invention.

## Why this record exists although the package was already installed

`@playwright/test` was installed at the repository root before the canvas work began — it drives
`tests/e2e/smoke.spec.ts`, which serves the **Python coverage report**, not the frontend. No
licence record was written at that time. The Phases 4–7 canvas milestone adopts the same
installed package for the frontend browser harness (`frontend/playwright.config.ts`), which makes
the canvas frontend a consumer of the dependency for the first time; per this directory's rule,
the record is written **before** any harness changeset uses it. No new installation occurs — the
record documents and authorises the adoption of the existing root install.

## Why this dependency at all

The Phases 4–7 gates require real-browser evidence: frame intervals, camera input-to-paint,
container-query mobile layout, reduced-motion behaviour, keyboard-only navigation, synthetic
touch, and 4× CPU throttling. None of those are measurable in jsdom (which performs no layout and
implements no container queries), so the alternative was a second browser-automation stack —
rejected because a capable one is already installed at the root. jsdom and
`@testing-library/react` are deliberately **not** added for the same reason vitest's record
excludes them: everything not needing a real browser is a pure-function vitest test.
