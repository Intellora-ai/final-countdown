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
 * workers: 1 — the specs measure frame intervals and input latency.
 * Parallel workers fight for the same CPU and poison every p95 they touch.
 */
export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  workers: 1,
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
   * Playwright's `github` reporter emits `::error file=...,line=...,col=...`
   * workflow commands. GitHub turns each into a run annotation and an
   * `##[error]` line in the raw log, so a failure names its own source
   * location instead of hiding in scrollback. Kept alongside `list` so a local
   * run still reads normally. */
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
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

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
