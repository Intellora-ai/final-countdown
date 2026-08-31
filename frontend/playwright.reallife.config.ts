import { defineConfig, devices } from '@playwright/test'

/**
 * REAL LIFE. Not the code checking itself.
 *
 * Every test under `tests/integration/` is a person doing a thing, and every
 * assertion is what that person can see. Nothing here imports a module from
 * `src/`. If the whole of `src/` were rewritten in another language tomorrow,
 * these tests would still be the right tests, because they are about the human
 * outcome and not about the implementation that happens to produce it.
 *
 * WHY THE API SERVER IS NOT STARTED HERE, AND IT IS NOT AN OVERSIGHT.
 *
 * `playwright.config.ts` starts `dist-server/index.js` with
 * `ANTHROPIC_API_KEY=CANARY-e2e-must-not-leak`. That is why the existing e2e
 * suite has never once seen what a person without a key sees. Measured on this
 * machine: `npm run server` exits 1 with "no model is configured", the browser
 * gets `POST /api/day -> 500`, and the home screen reads "the planner answered
 * 500".
 *
 * Most people who clone this repo will not have a key. That state IS real life,
 * so it is the state these tests run in. A suite that can only run in the one
 * configuration where everything is provided is a suite that cannot find this
 * class of defect at all.
 */
export default defineConfig({
  testDir: './tests/integration',
  retries: 0,
  workers: 1,
  fullyParallel: false,

  /* GENEROUS ON PURPOSE, AND NOT THE SAME THING AS A SLOW APP.
   *
   * One of these tests asks every lesson three separate questions, reloading
   * between each so no question is measured against the previous one's answer.
   * That is eighteen full page loads and eighteen round trips in a single test,
   * which is minutes of honest work, not a hang.
   *
   * The individual `expect` timeout stays short. That is the one that catches a
   * screen which never responds, and it is the one a real person feels. */
  timeout: 900_000,
  expect: { timeout: 15_000 },

  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'a-person-on-a-laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'a-person-on-a-phone',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
