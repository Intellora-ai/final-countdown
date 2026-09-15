# Project instructions

## Goal
Keep this repository small, understandable, and independently verifiable.

## Engineering rules
- Read the existing implementation before changing it.
- Prefer the smallest root-cause fix over a workaround.
- Do not add hard-coded behavior to simulate general product behavior.
- Do not weaken, delete, skip, or condition away a test merely to make CI green.
- Tests must assert product behavior or an explicit invariant, not merely mirror implementation details.
- Browser-only behavior must be verified in a real browser; jsdom is not evidence for browser behavior.
- Keep test fixtures and fakes clearly separated from production behavior.
- Do not add agent/session state, generated skill packs, or machine-specific paths to the repository.
- Prefer the official agent workflows already available in the coding tools: Claude Code's bundled `/debug` and `/simplify`, and the repository's official Codex GitHub skills under `.agents/skills/`.
- Do not create competing agent frameworks, autonomous repair loops, or large generated instruction packs. Agent guidance must remain small, auditable, and task-specific.

## Debugging protocol
When debugging a failure or suspected hard-coded behavior:
1. Reproduce the failure with the narrowest real test or runtime path available.
2. Trace the production path to the root cause before editing tests.
3. Check whether the test actually exercises production wiring rather than a fixture or mock-only path.
4. Fix the production cause with the smallest coherent change.
5. Add or repair a regression test at the highest realistic layer that can prove the behavior.
6. Run the relevant deterministic checks and, for browser/provider behavior, the real integration gate.
7. Inspect the final diff for hard-coded simulation, dead code, skipped tests, duplicated gates, and machine-specific state.

## Verification
Before claiming a change is fixed, name the exact check that proved it. If it was not run, say so.

The normal frontend verification path is:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test -- --run`
4. `npm run gate:reachability`
5. `npm run gate:knowledge`
6. `npm run gate:secrets`
7. `npm run gate:assurance`
8. `npm run build`
9. `npm run test:mutation`

Browser behavior belongs in the Playwright workflows; live-provider behavior belongs in the live-model workflow and must never be silently replaced by a fake.

## Communication
Be direct. State what changed, what was actually verified, and what remains unverified.
