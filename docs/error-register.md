# Error register — learning canvas

Append-only. Nothing is ever deleted, renamed, or hidden.

A row is marked `fixed` only after the GitHub run for its repair commit proves it. If the same
error recurs, the original row keeps its id, gains the new run, and the repair is marked
unsuccessful — a recurrence is never filed as a new error.

`open` here does not mean "ignored". It means the finding is real, recorded, out of the current
changeset's scope, and carries a named next action.

| ID | Commit | Run | Job | Step | Root cause | Repair commit | Status |
|----|--------|-----|-----|------|------------|----------------|--------|
| E-001 | CS-0 (pre-push) | — | — | `npm audit` | `vite <= 6.4.2` — `server.fs.deny` bypass on Windows alternate paths, GHSA-fx2h-pf6j-xcff, CVSS 7.5 **high** | — | open |
| E-002 | CS-0 (pre-push) | — | — | `npm audit` | `vite <= 6.4.2` — path traversal in optimized-deps `.map` handling, GHSA-4w7w-66w2-5vf9, moderate | — | open |
| E-003 | CS-0 (pre-push) | — | — | `npm audit` | `esbuild <= 0.24.2` via vite — dev server answers cross-origin requests, GHSA-67mh-4wv8-2f99, CVSS 5.3 moderate | — | open |
| E-004 | CS-0 (pre-push) | — | — | `npm audit` | `react-router 6.0.0 – 7.17.0` — open redirect via backslash in `<Link>`/`useNavigate`, GHSA-wrjc-x8rr-h8h6, moderate | — | open |
| E-005 | CS-0 (pre-push) | — | — | `npm audit` | `react-router 6.0.0 – 7.17.0` — arbitrary constructor injection in `deserializeErrors()` during SSR hydration, GHSA-337j-9hxr-rhxg, CVSS 6.1 moderate | — | open |
| E-006 | CS-0 (pre-push) | — | — | `npm audit` | `launch-editor` via vite — NTLMv2 hash disclosure through UNC path handling on Windows, GHSA-v6wh-96g9-6wx3, moderate | — | open |

## E-001 … E-006 — why they are open rather than fixed in CS-0

All six arrived with the imported handoff's pinned dependency versions. None was introduced by
this changeset, and `npm audit fix --force` resolves them only by installing **vite@8.2.2** and
**react-router-dom@7.18.2** — two breaking major bumps.

CS-0's stated job is to land the design handoff **unchanged** and prove it builds. Rewriting the
build tool and the router inside that same commit would destroy the thing the commit exists to
demonstrate, and the handoff explicitly asks that the imported design not be silently rewritten
during vendor-in.

Scope, measured rather than assumed:

- **E-001, E-002, E-003, E-006 reach the Vite dev server only.** The CI workflow runs `npm ci`,
  `typecheck`, `test` and `build`. It never runs `vite dev`. E-001 and E-006 are additionally
  Windows-specific; CI is `ubuntu-latest`. No production artifact is affected — `vite build`
  emits static assets and ships no server.
- **E-005 requires SSR hydration.** `frontend/src/main.tsx` mounts a client-side `HashRouter`
  with `ReactDOM.createRoot`. There is no server renderer, so `deserializeErrors()` is never
  reached.
- **E-004 is the one with a live path.** An open redirect needs attacker-influenced input to
  reach a `<Link to>` or `navigate()` argument. Today every route target in the app is a literal
  or an id drawn from the local curriculum. That changes the moment the canvas accepts a learner
  question, so it is tracked, not dismissed.

**Next action, owned:** one changeset dedicated to the dependency bump — vite 5 → 8 and
react-router 6 → 7 together, with its own licence records, its own before/after build evidence,
and a re-run of the CS-0 checks. It is deliberately not bundled with feature work: a major bump
that breaks the build must be diagnosable on its own commit.

**Blocking status:** E-004 must be closed before any route target can be derived from learner
input. E-001, E-002, E-003, E-005 and E-006 do not block CS-1 through CS-15, because no gate in
those changesets depends on the dev server, on Windows, or on server-side rendering.

**Not done, and not to be done:** none of these is silenced with an audit exception, an ignore
file, or a threshold change. They stay visible in `npm audit` until a real bump closes them.
