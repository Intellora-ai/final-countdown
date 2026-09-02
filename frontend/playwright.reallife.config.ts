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
 * THE API SERVER IS STARTED HERE, KEYLESS -- AND FOR A LONG TIME IT WAS NOT.
 *
 * `playwright.config.ts` starts `dist-server/index.js` with
 * `ANTHROPIC_API_KEY=CANARY-e2e-must-not-leak`, so the e2e suite has never once
 * seen what a person without a key sees. Most people who clone this repo will
 * not have a key. That state IS real life, so it is the state these laws run
 * in, and that part of the reasoning is unchanged.
 *
 * What changed is a measurement that went stale. This header once said the
 * server could not be started at all without a key -- "npm run server exits 1
 * with 'no model is configured'" -- and so no server was started, and every
 * `/api/*` request Vite proxied went to a port nobody was listening on. That
 * is not "a person without a key". That is "a person whose server crashed",
 * and twelve laws passed against it for one reason: an honest "could not be
 * reached" satisfies a law about honest refusal. Law G was the first law that
 * needed the server to REMEMBER something, and it failed in four browsers on
 * four consecutive CI runs while every server-side test of the same route
 * passed -- because there was no server. Measured through the law itself:
 * `page.request.get('/api/situation')` answered 500, the dev server's word for
 * "upstream is not there".
 *
 * `server/boot.test.ts` proves the built server starts with no model key and
 * says `listening on`. So the server runs here with every model key set to
 * blank -- which `provider.ts` reads as unset -- and the laws finally run
 * against the product a keyless person actually has: a server that refuses
 * honestly, asks back when it cannot tell what was meant, and remembers.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* Fresh per run, outside the checkout, so a law never reads yesterday's
   memory and a developer's own `data/` is never written to by a test. */
const scratch = join(tmpdir(), `learning-canvas-laws-${process.pid}`)
export default defineConfig({
  testDir: './tests/integration',
  retries: 0,
  /* A committed `.only` silently shrinks the suite to one test and everything
     else "passes" by not existing. Refused on CI, same as the main config. */
  forbidOnly: !!process.env.CI,
  /*
   * TWO WORKERS ON CI, ONE ON A LAPTOP -- AND WHY THIS IS SAFE WHERE THE PERF
   * CONFIG'S CAP IS NOT. playwright.config.ts pins workers only to protect CDP
   * frame-interval measurement; NOTHING in these laws measures time -- they
   * measure TEXT DELTAS, and every context's state is its own localStorage,
   * which Playwright isolates per test. `fullyParallel` stays false: the unit
   * of parallelism is the FILE, so tests within a law keep their order and two
   * law files simply run side by side. Measured serially at ~4.6 minutes per
   * browser project; two workers halve the wall on a 4-vCPU runner.
   */
  workers: process.env.CI ? 2 : 1,
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

  /* `github` on CI for the same reason the main config carries it: a failed
     law annotates its exact file and line in the PR view, with the law's own
     sentence as the message. Locally it is inert noise, so list-only. */
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5183',

    /* AND THE SAME SHORT LEASH ON EVERY ACTION, WHICH IS THE HALF THAT WAS
     * MISSING AND COST FIFTEEN MINUTES A RUN.
     *
     * Playwright's default `actionTimeout` is 0, which means NO LIMIT -- a
     * click or a fill that can never succeed waits until the whole test dies.
     * With `timeout: 900_000` above, that is what one unfillable box costs.
     *
     * MEASURED, and this is the number that started the hunt. Law A walks
     * every lesson this app offers. One of them is refused, and a refused
     * lesson draws no box to type in, so `fill` waited on a control that will
     * never be enabled: 900s, then "Test timeout of 900000ms exceeded" with no
     * word about which element or why. The same wait happens on Chromium and
     * WebKit -- it was never an engine's fault.
     *
     * 15s for the same reason `expect` gets 15s: it is roughly the point at
     * which a real person decides the screen is broken. Every action this
     * suite actually performs is measured in tens of milliseconds, so this
     * cannot shorten an honest one; it only stops a hopeless one from
     * pretending to be slow. */
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /* THREE ENGINES, BECAUSE "IT WORKS" IS AN ENGINE-SPECIFIC CLAIM.
   *
   * Until now these six LAWS only ever ran on Chromium — `Desktop Chrome` and
   * `Pixel 7` are both `defaultBrowserType: 'chromium'`, so the two projects
   * that looked like a matrix were one engine at two viewports. Every "a person
   * can do this" statement the suite made was really "a person on Blink can do
   * this", and a Gecko or WebKit-only regression had nowhere to show up.
   *
   * The specs can afford this because of what they are allowed to see. Nothing
   * under `tests/integration/` touches a CDP session, a coverage API or any
   * other Chromium-protocol feature — `person.ts` exposes only ARIA roles,
   * accessible names and visible words, and those are exactly the things that
   * are specified across engines rather than implemented per engine. So the
   * same eleven tests are meaningful on all three, unchanged.
   *
   * THE THREE DESKTOP PROJECTS SHARE ONE VIEWPORT ON PURPOSE. 1440x900 for
   * Chrome, Firefox and Safari alike, so that when one of them goes red the
   * engine is the only variable that differs and the failure is attributable.
   * A different viewport per engine would make every difference ambiguous.
   *
   * The two original projects are byte-for-byte what they were; the phone stays
   * Chromium because Pixel 7 is a Chromium device and pretending otherwise
   * would be a worse lie than the gap this closes. `Desktop Safari` is WebKit,
   * which is the engine every browser on iOS is required to use, so it is the
   * closest honest proxy for an iPhone that a laptop can run. */
  projects: [
    {
      name: 'a-person-on-a-laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'a-person-on-a-phone',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'a-person-on-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'a-person-on-safari',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: [
    /* THE API SERVER, KEYLESS. See the header for why it is here and why it
       was not. `npm run server` builds `dist-server/index.js` and boots it;
       readiness is the PORT accepting a connection rather than a health URL,
       because a keyless server's health reply is allowed to be honest about
       having no model and Playwright treats a 5xx as "not up yet".

       Every model key is set to BLANK rather than unset: Playwright's `env`
       can only add, and `provider.ts` reads blank as unset, so a developer's
       own GROQ_API_KEY in the shell cannot quietly turn these laws into the
       keyed suite. `reuseExistingServer` matches the Vite entry below -- on a
       laptop an already-running server is used as-is, which is the one way to
       run the laws against a keyed server, and it is a choice, not a default. */
    {
      command: 'npm run server',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        HOST: '127.0.0.1',
        PORT: '8787',
        CANVAS_MEMORY_DB: join(scratch, 'canvas-memory.db'),
        ALMANAC_IDENTITY_SECRET_FILE: join(scratch, 'identity-secret'),
        ANTHROPIC_API_KEY: '',
        GROQ_API_KEY: '',
        OLLAMA_MODEL: '',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
      url: 'http://127.0.0.1:5183',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
