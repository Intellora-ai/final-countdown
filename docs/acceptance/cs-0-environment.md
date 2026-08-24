# CS-0 — build and reproducibility evidence

## GitHub result — the authoritative one

| | |
|---|---|
| Commit | `5af41c857f41c9df17a0551993b9f81596d1c2f8` |
| Pull request | [#37](https://github.com/Intellora-ai/final-countdown/pull/37), merged as `0329d6e` |
| `Learning Canvas Frontend` | run **32481339386** — `success`; every step green: Checkout · Setup Node · Install dependencies · Typecheck · Unit tests · Build · Upload build output |
| `verify` | run 32481339331 — success (17 required Python/Lean contexts, unmodified) |
| `codeql` · `e2e` · `ai-review` | 32481339276 · 32481339414 · 32481339223 — all success |
| Check rollup | **21 / 21 passing**, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN` |

The workflow did not run on the branch push alone: its triggers are `push: branches:[main]` and
`pull_request: branches:[main]`, and a feature-branch push matches neither. `workflow_dispatch`
was not an option either — GitHub's documentation is explicit that *"this event will only trigger
a workflow run if the workflow file exists on the default branch"*, and it did not yet. The PR is
the repository's own path, and this repo's history proves a workflow added on a branch runs there:
`deep-verify.yml` was introduced in `65bf56f` on a feature branch and `deep-verify` completed
`success` on PR #36's head `1d06fda` before that PR merged.

`STATUS: CS-0 PASS · B1 PASS`

---


Everything below was measured on 2026-08-21, not recalled. Local results **prepare** the batch;
the authoritative proof is the `Learning Canvas Frontend` GitHub Actions run on the pushed commit.

## Toolchain

| | Local (this machine) | CI (`ubuntu-latest`) |
|---|---|---|
| OS | macOS, Darwin 25.4.0 | ubuntu-latest |
| Node | **v26.0.0** | **24**, read from `frontend/.nvmrc` |
| npm | 11.12.1 | bundled with Node 24 |

### Why the Node versions differ, and why that is recorded rather than hidden

The repository already has a Node convention: `.github/workflows/e2e.yml:151` pins
`node-version: '24'` on the same SHA-pinned `actions/setup-node` this workflow uses. `.nvmrc`
therefore says `24`, and CI runs 24.

The machine that produced this batch runs Node 26, and `nvm` is not installed on it. Rather than
add a version manager to the host inside a changeset about landing a frontend, the mismatch is
made harmless and stated:

- the lockfile was generated with `npm install --package-lock-only --ignore-scripts`, whose
  dependency resolution does not depend on the running engine;
- `lockfileVersion: 3` is read by npm on both majors;
- CI installs with `npm ci`, which fails outright if `package.json` and `package-lock.json`
  disagree — so a resolution difference cannot pass silently;
- the CI run, not the local run, is the gate.

If a build difference between the two majors ever appears, that is a finding for the error
register, not something to smooth over.

## Dependency versions

`vitest` is pinned to **3.2.7**, not the current 4.1.11. Measured before installing anything:

```
npm view vitest@4.1.11 peerDependencies  ->  vite: '^6.0.0 || ^7.0.0 || ^8.0.0'
npm view vitest@3.2.7 dependencies.vite  ->  '^5.0.0 || ^6.0.0 || ^7.0.0-0'
```

The imported handoff pins `vite: ^5.4.0`. Vitest 4 would have forced a Vite major bump onto the
same commit that vendors the frontend — changing the build the design was ported and reviewed
against, inside the changeset whose whole job is to land it unchanged and prove it compiles. The
relationship was changed instead of the part. Full reasoning: `docs/licences/vitest.md`.

## Results

| Step | Command | Result |
|---|---|---|
| Lockfile | `npm install --package-lock-only --ignore-scripts` | **written** — `lockfileVersion 3`, 156 package entries, 109 audited, 13s |
| Install | `npm install` | **success** |
| Typecheck | `npm run typecheck` (`tsc -b --pretty false`) | **exit 0**, zero TypeScript errors |
| Unit tests | `npm test -- --run` | **5 passed / 5**, 1 file, 248 ms total |
| Build | `npm run build` (`tsc -b && vite build`) | **exit 0**, ~2 s wall, vite 5.4.21, 44 modules transformed |

### Build output

| Artifact | Raw | gzip |
|---|---|---|
| `dist/index.html` | 0.36 kB | 0.26 kB |
| `dist/assets/index-*.css` | 18.40 kB | 4.64 kB |
| `dist/assets/index-*.js` | 213.63 kB | 68.58 kB |
| `dist/` total | 236 kB | — |

**This is the first time this project has ever been built.** The handoff README stated plainly
that its authoring environment had no package manager or Node runtime and that `npm run build` was
never executed there, and asked for the first local build to be treated as a required verification
step rather than a formality. It was, and it passes.

`dist/` is gitignored (`.gitignore`, `frontend/dist/`) and uploaded from CI as a run artifact
instead of committed.

## What CS-0 deliberately did not do

- No file was added to `src/`, `specs/`, `proofs/`, `ci/`, or `scripts/`.
- No existing workflow was modified. `verify.yml`, `codeql.yml`, `e2e.yml`, `deep-verify.yml` and
  `ai-review.yml` are byte-identical to `origin/main`.
- No required context was added, removed, or renamed; `required_checks` stays at seventeen.
- `katex` and `pixi.js` are **licence-recorded but not installed**. They enter `package.json` at
  CS-9 and CS-10, in the changesets that first render an equation and a particle.
- The design was not rewritten during vendor-in. `tsconfig.json` keeps `strict: false` exactly as
  the handoff shipped it — tightening it is a real change with real diff, and it belongs in its
  own changeset with its own evidence, not smuggled into a bootstrap.

## Files excluded from the vendor-in, with the measurement that decided it

Two files in `~/Desktop/FRONTENDS/` were not vendored. The repository's own credential-scan rules
(`scripts/credential_scan.py` patterns plus its `_TOKEN_RUN` mixed-alphabet rule and SRI
exemption) were run over every candidate file first:

| File | Result |
|---|---|
| `Learning OS Dashboard.html` | **10,659 credential-shaped matches** — a 1.0 MB export bundle whose gzip+base64 payloads are exactly the mixed-case runs `_TOKEN_RUN` exists to catch |
| `FRONTEND TECH STACK.zip` | binary, and a zip of files vendored here as files |
| all 32 canonical files (`app/**`, `reference/**`, `README.md`) | **0 matches each** |
| `gemini-learning-canvas.png` | binary — the scanner skips it by design |

Vendoring the export bundle would have turned `preflight` red on the first push for no gain: it
duplicates `frontend/reference/Learning OS Dashboard.dc.html`, which is the prototype the handoff
calls the pixel truth, at 70 kB and 0 matches.

The visual reference image is preserved byte-for-byte; its SHA-256 is recorded in
`docs/acceptance/gemini-reference.sha256` and matches the source.
