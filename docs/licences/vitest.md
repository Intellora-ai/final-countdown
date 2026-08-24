# vitest

| # | Point | Value |
|---|---|---|
| 1 | Package | `vitest` |
| 2 | Exact version | `3.2.7` |
| 3 | Copyright holder | Vitest team (Anthony Fu and contributors) |
| 4 | Licence identifier | **MIT** |
| 5 | Official licence source | https://github.com/vitest-dev/vitest/blob/v3.2.7/LICENSE |
| 6 | Verified licence-file URL | https://raw.githubusercontent.com/vitest-dev/vitest/v3.2.7/LICENSE |
| 7 | SHA-256 of retrieved licence text | `ddc110f3b89cc397cee99d3d64c4f746928b7a3bac02fed15101eb4d367079f6` (1076 bytes, first line `MIT License`) |
| 8 | Dependency status | direct `devDependency` |
| 9 | Verified | 2026-08-21 — `npm view vitest@3.2.7 version license` (registry metadata, no install) followed by `curl` of the licence file at tag `v3.2.7`; performed by the CS-0 changeset before any `npm install` ran |

**Commercial production use:** permitted.
**Attribution required:** the copyright notice and licence text must accompany copies of the
software — satisfied by the licence file shipping inside the installed package. Nothing is
required in the product UI.
**Paid production licence:** none.
**Feature restrictions:** none.
**Watermark:** none.
**Mandatory telemetry:** none.
**Genuinely open source, not source-available:** yes. OSI-approved MIT; the full text was
retrieved and checksummed above rather than inferred from a badge.
**Vendor lock-in:** low. A test runner is replaceable. The tests use the standard
`describe` / `it` / `expect` surface that Jest and `node:test` also provide, so migration is a
config change rather than a rewrite.

## Why 3.2.7 and not the current 4.1.11

`4.1.11` is the version `npm view vitest` returns, and it **cannot be installed here.** Measured,
before installing anything:

```
npm view vitest@4.1.11 peerDependencies
  vite: '^6.0.0 || ^7.0.0 || ^8.0.0'

npm view vitest@3.2.7 dependencies.vite
  '^5.0.0 || ^6.0.0 || ^7.0.0-0'
```

The imported design handoff pins `vite: ^5.4.0`. Vitest 4 would have forced a Vite major bump on
the same commit that vendors the frontend — changing the build the handoff was ported and reviewed
against, inside a changeset whose whole job is to land it unchanged and prove it builds.

So the relationship changed rather than the part: pin the test runner to the major that supports
the Vite already in use. Vite is bumped, if ever, in its own changeset with its own evidence.

`engines` for 3.2.7 is `^18.0.0 || ^20.0.0 || >=22.0.0`; CI runs Node 24 per `frontend/.nvmrc`,
which satisfies `>=22`.

## Why this dependency at all

The frontend workflow runs `npm test -- --run`, and CS-0 requires a genuine smoke test rather than
a skipped step. Vitest over Jest because the project already builds with Vite — it reuses the same
transform pipeline and `vite.config.ts`, so no second toolchain, no Babel config, no extra
transitive build stack. jsdom is deliberately **not** added: the CS-0 smoke test exercises pure
data functions (`CURRICULUM`, `layout`), which need no DOM.
