import { defineConfig, devices } from '@playwright/test';

/**
 * BROWSER-LEVEL SMOKE TESTING FOR THIS REPOSITORY.
 *
 * This project has no product frontend — it is a Python + Lean verification
 * suite. The one artifact it produces that a browser can render is the
 * coverage report, so that is what the E2E layer opens. Testing a real
 * generated artifact keeps the suite honest; inventing a placeholder page
 * would prove only that Playwright can load a file this repo does not ship.
 *
 * The report is regenerated from the existing .coverage database rather than
 * by re-running the suite, so startup stays fast and deterministic.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // A test that only passes sometimes is worse than no test. CI retries once
  // so a genuine flake is visible as a retry rather than hidden by a rerun.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: true,

  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Evidence only when something goes wrong: a trace on the retry, a
    // screenshot on the failure. Recording everything makes the artifacts
    // large enough that nobody opens them.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Two viewports, one spec. A separate mobile spec would be the same
  // assertions pasted twice and would drift; running the existing one at a
  // phone viewport asks the only question worth asking here — does the page
  // still render and stay reachable when the screen is small.
  //
  // Both are Chromium. Firefox and WebKit are not added because nothing in
  // this repository ships to a browser, so a second engine would multiply
  // runtime without testing a claim anyone is making.
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    // Generate the report only if it is missing, then serve it. `coverage
    // html` reads the committed .coverage database — it does not re-run the
    // test suite, so this takes well under a second.
    command:
      'sh -c "([ -f htmlcov/index.html ] || .venv/bin/coverage html -d htmlcov) && python3 -m http.server 4173 --directory htmlcov --bind 127.0.0.1"',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
