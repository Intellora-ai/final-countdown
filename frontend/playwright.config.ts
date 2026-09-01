import { defineConfig, devices } from '@playwright/test'

/**
 * CANVAS BROWSER HARNESS — the measured half of the Phases 4–7 gates.
 *
 * This config is deliberately separate from the repository root's
 * playwright.config.ts: that one serves the Python coverage report and its
 * honesty depends on staying single-purpose. This one drives the learning
 * canvas in a real Chromium and reads the DEV-only __boardHarness bridge.
 *
 * DEV server, not a production build: the perf marks and the harness bridge
 * compile to no-ops in production (import.meta.env.DEV), so the only build
 * that can testify is the dev one. Numbers from a dev serve are pessimistic —
 * unminified code, no tree-shaking — and the report labels them as such
 * rather than pretending they came from prod.
 *
 * workers — THE PERF HARNESS IS BUILT AND DISCONNECTED, SO THE CAP GUARDS NOTHING.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TRIPWIRE. If you make ANY spec import `./util/perf`, `./util/bridge` or │
 * │ `./util/cdp`, PUT `workers: 1` BACK in the same commit. Those modules   │
 * │ are what measure p95 and frame intervals, and parallel workers fight    │
 * │ for the same CPU and invalidate every number they produce.              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * This said `workers: 1` because "the specs measure frame intervals and input
 * latency, and parallel workers poison every p95 they touch". That reasoning is
 * correct and the machinery it protects is REAL — it is simply not wired to
 * anything today. `util/cdp.ts` opens a genuine CDPSession and sends
 * `Emulation.setCPUThrottlingRate` using `project.metadata.cpuThrottle`;
 * `util/bridge.ts` computes jsWorkP95, frameIntervalP95 and missedFrameCount;
 * `util/perf.ts` drives scripted gestures for cross-run p95 comparison.
 *
 * None of it runs, because nothing reaches it. The full reachable set from the
 * two specs, traced import by import:
 *
 *     composed-renderer.spec.ts ─┬─ util/attribution  (types only)
 *     scene-regressions.spec.ts ─┘─ util/canvas ── util/media  (types only)
 *                                              └── lesson data
 *
 *   - `util/cdp.ts` and `util/perf.ts` are imported by NOTHING. `util/bridge.ts`
 *     is imported only by `util/perf.ts`, so it is dead by transitivity.
 *   - No throttle is ever applied. `mobile-375` declares
 *     `metadata: { cpuThrottle: 4 }` and `applyProjectThrottle` would honour it,
 *     but that function has no callers, so the metadata stays a label.
 *   - `util/report.ts` IS loaded, via `globalTeardown` below — but its writer
 *     `appendLedger` has no callers, so LEDGER_PATH is never created, teardown
 *     returns at its `existsSync` guard every run, and
 *     `canvas-harness-report.json` is never produced.
 *
 * So there is no live p95 to poison, and the cap costs 156s of critical path to
 * protect a measurement nobody takes. Reconnecting the harness is a one-import
 * change, which is exactly why the tripwire above is at the config site and not
 * only in the commit message.
 *
 * Measured, `--fail-on-flaky-tests` on throughout, 290 tests passing every run:
 *   workers=1  234s      workers=2  149s      workers=4  77s / 87s / 115s
 * Seven runs, zero flakes. Caveat stated plainly because this exact trap bit us
 * today: those numbers are macOS/10-core and CI is Linux/4-core, the same split
 * that made the KaTeX overflow pass locally and fail on CI. Direction evidenced,
 * magnitude not transferable — the honest CI projection is 340s → ~200-225s.
 *
 * `fullyParallel` stays false: the win came from parallelising the ten
 * file×project units, which is what was measured. Nothing here needed tests
 * inside a single file to interleave.
 *
 * WHY 4 AND NOT 2, once the scene guards are sharded one project per runner.
 * Playwright never starts more workers than it has parallelisable units, and
 * with `fullyParallel: false` a unit is one file within one project. So the
 * effective count is `min(workers, files × projects)`, and 4 means two
 * different things depending on how the step is invoked:
 *
 *     all five projects, one runner   2 files × 5 projects = 10 units -> 4 workers
 *     one project per runner (shard)  2 files × 1 project  =  2 units -> 2 workers
 *
 * Measured on one project, asking for 4: `Running 58 tests using 2 workers`,
 * 47s at workers=1 against 35s capped at 2. So the cap is real, it is a unit
 * cap rather than a core cap (this box has 10 cores; a core cap would have
 * said 5), and it costs nothing to leave the number at 4 — it is correct
 * unsharded and self-limits when sharded. It also means a shard can never
 * oversubscribe a 4-core runner with four browsers: it cannot find the work.
 *
 * The one case that WOULD make this a no-op is sharding by file as well as by
 * project, which drops each runner to a single unit. Do not do both without
 * re-measuring.
 */
export default defineConfig({
  testDir: './e2e',
  /*
   * THE BOUNDARY BETWEEN THE TWO RUNNERS, STATED IN THIS DIRECTION TOO.
   *
   * `vite.config.ts` has always said that vitest must not sweep up
   * `e2e/*.spec.ts`. The reverse was never said, and it turned out to matter:
   * adding one vitest unit test beside an e2e helper made Playwright pick it
   * up, try to run it, and die on `Vitest failed to access its internal state`
   * -- reported as `Total: 0 tests in 0 files`.
   *
   * A collection crash reads exactly like a clean run with nothing to do, and
   * the repo already has a gate whose whole job is to catch that. It caught
   * this.
   *
   * `.spec.ts` is Playwright's here; `.test.ts` is vitest's. Two runners, two
   * suffixes, and now both configs say so.
   */
  testMatch: '**/*.spec.ts',
  /*
   * ZERO RETRIES, EVERYWHERE, AND THAT IS A GATE-HARDNESS DECISION.
   *
   * `CI ? 1 : 0` meant every browser test got a second roll of the dice on
   * exactly the machine where the verdict matters -- a test that fails once
   * and passes once is NONDETERMINISTIC, and a retry converts that coin-flip
   * into a green check nobody ever looks at. This run's own history shows it
   * working: the visual failures each burned a "(retry #1)" before going red.
   * A flake is a defect in the test or the product; with retries off it
   * surfaces as red and gets FIXED at the root instead of absorbed. Nothing
   * passes by chance.
   */
  retries: 0,
  forbidOnly: !!process.env.CI,
  workers: 4,
  fullyParallel: false,

  timeout: 90_000,
  expect: { timeout: 10_000 },

  /* GITHUB MUST BE ABLE TO POINT AT THE LINE.
   *
   * `list` prints to stdout and stdout alone. A failure in CI therefore
   * appeared only as a wall of text inside a collapsed log group, with no
   * annotation on the run, no file, and no line number -- which is why a
   * census of 8,236 log lines across 19 jobs returned zero `##[error]` entries
   * even though the gate is capable of failing.
   *
   * THE STOCK `github` REPORTER WAS REPLACED, and the reason is measured. It
   * emitted `::error file=...` naming the SPEC: all 49 annotations this branch
   * ever produced pointed at composed-renderer.spec.ts, which is where the
   * assertion lives and never where the defect lives. It also annotated every
   * retry attempt, so run 32589708228 showed 13 annotations for 5 real
   * failures, and it left nothing machine-readable behind.
   *
   * canvas-reporter emits one annotation per test, on the panel source the
   * test attributed via `attribute()`, and writes ci-findings.json for the
   * workflow to upload. `list` stays so a local run still reads normally. */
  /* NOT the stock `github` reporter, and gate_integrity enforces this with a
     measurement: it annotates the spec line rather than the SOURCE, and once
     per retry rather than once per test -- 13 annotations for 5 real failures
     on run 32589708228. canvas-reporter is the repository's own annotator and
     it points at the panel source that actually broke. The reallife config,
     which has no custom reporter, is where the stock one earns its place. */
  reporter: process.env.CI
    ? [['./e2e/reporters/canvas-reporter.ts'], ['list']]
    : [['list']],
  globalTeardown: './e2e/util/teardown.ts',

  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* The spec's stated matrix: three viewports, reduced motion, keyboard-only,
   * synthetic touch with a 4× CPU throttle. All Chromium — the throttle and
   * the CDP bridge are Chromium-protocol features, and the product ships to
   * evergreen browsers where Chromium is the honest majority proxy. Synthetic
   * touch is tagged as synthetic in every metric row; nothing here claims
   * real-device evidence. */
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'square-900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 900 } },
    },
    {
      name: 'mobile-375',
      metadata: { cpuThrottle: 4, syntheticTouch: true },
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 800 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'reduced-motion',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'keyboard',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  /*
   * TWO SERVERS, because the product is two servers.
   *
   * The browser posts to /api, Vite proxies it to the planner, and the planner
   * is a separate process. Running only Vite meant every browser test drove a
   * dashboard whose planner was unreachable -- the deep-qa harness counted 180
   * console errors from that one cause, and every "the app works" claim was
   * made against half of it.
   *
   * The key is deliberately not a real one. Nothing these tests do reaches the
   * model: the day and done routes are pure planner, and a lesson request
   * fails at the network rather than spending anything. A real key here would
   * be a real key in CI.
   */
  webServer: [
    {
      command: 'npm run server:build && ANTHROPIC_API_KEY=CANARY-e2e-must-not-leak PORT=8787 node dist-server/index.js',
      /* The one route that answers a GET. Every other route mutates or costs
         money, so none of them can be polled -- which is why this endpoint
         exists at all. */
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
      url: 'http://127.0.0.1:5183',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
