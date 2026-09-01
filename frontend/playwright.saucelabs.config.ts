import { defineConfig, devices } from '@playwright/test'

/**
 * THE SIX LAWS, ON SAUCE LABS' MACHINES.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ TODO — READ THIS BEFORE CHANGING THE CONNECTION MECHANISM.                ║
 * ║                                                                           ║
 * ║ THERE IS NO `connectOptions.wsEndpoint` FOR SAUCE LABS. This file was     ║
 * ║ asked for as a mirror of the BrowserStack one, which connects over        ║
 * ║ `wss://cdp.browserstack.com/playwright?caps=...`. Sauce Labs publishes    ║
 * ║ no equivalent URL, so this config does NOT use one.                       ║
 * ║                                                                           ║
 * ║ Four Sauce Labs documentation pages were read looking for it:             ║
 * ║   docs.saucelabs.com/web-apps/automated-testing/playwright/               ║
 * ║     -> "test your web apps remotely on Sauce Labs Cloud using the         ║
 * ║        `saucectl` CLI". No websocket URL on the page.                     ║
 * ║   .../playwright/quickstart/    -> saucectl only. No `wss://`, no `caps`. ║
 * ║   .../cdp-bidi/                 -> Selenium Grid endpoints only; CDP is   ║
 * ║        reached through `/wd/hub`, not a Playwright socket.                ║
 * ║   .../playwright/selenium-grid/ -> the mechanism implemented below.       ║
 * ║                                                                           ║
 * ║ A web search will confidently return                                      ║
 * ║   `wss://ondemand.us-west-1.saucelabs.com:443/playwright?caps=...`        ║
 * ║ That string appears in NO Sauce Labs document reached from this machine.  ║
 * ║ It is BrowserStack's URL shape with Sauce's hostname pasted in, and it is ║
 * ║ exactly the kind of invented endpoint that connects to nothing and fails  ║
 * ║ as a timeout twenty minutes into a CI run. It is not used here.           ║
 * ║                                                                           ║
 * ║ If Sauce ever ships a real Playwright socket, replace the env-var block   ║
 * ║ below with `use.connectOptions.wsEndpoint` and delete this box.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * WHAT THIS FILE ACTUALLY DOES INSTEAD.
 *
 * Playwright's own (experimental) Selenium Grid support, which is what Sauce
 * documents for Playwright users. Playwright drives a Chrome or Edge session
 * that Sauce's grid allocates, over CDP, through `/wd/hub`. It is configured by
 * three environment variables rather than by config fields — there is no
 * Playwright config option for a grid — so this module sets them.
 *
 * TWO LIMITS THIS INHERITS, BOTH FROM UPSTREAM, NEITHER FIXABLE HERE:
 *
 *   1. CHROMIUM ONLY. Playwright: "this only works for Google Chrome and
 *      Microsoft Edge." Sauce: "Only Google Chrome and Microsoft Edge are
 *      supported, as they provide CDP endpoints." So the three-engine matrix
 *      that `playwright.reallife.config.ts` and the BrowserStack config both
 *      run is NOT available on Sauce. Asking this config for Firefox or WebKit
 *      is refused below rather than silently downgraded to Chrome.
 *
 *   2. ONE PLATFORM PER RUN. `SELENIUM_REMOTE_CAPABILITIES` is a single
 *      process-wide JSON string, so it cannot vary per Playwright project. A
 *      matrix here would be a lie — four project names all pointing at the same
 *      grid session. This file therefore declares ONE project and takes the
 *      platform from the environment, so a matrix is expressed where it can
 *      actually be honoured: as separate CI jobs.
 *
 * Playwright also marks the grid integration experimental: "There is a risk of
 * Playwright integration with Selenium Grid Hub breaking in the future."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INERT UNLESS EXPLICITLY SELECTED. Playwright loads only `playwright.config.ts`
 * by default; nothing reaches this module without
 * `--config=playwright.saucelabs.config.ts`. This matters more here than it
 * does for BrowserStack, because `SELENIUM_REMOTE_URL` is a PROCESS-WIDE switch
 * that redirects every browser launch away from the local machine. If this file
 * were loaded by a local run, every local test would silently start driving a
 * browser in Sauce's datacentre. It sets that variable only after credentials
 * are confirmed, and only inside a module that a local run never resolves.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/*
 * The slice of Node this config uses, declared rather than installed.
 * `@types/node` is deliberately not a dependency — see `server/node.d.ts`.
 * Module-scoped (this file has imports), so it cannot collide with the
 * identical declaration in `playwright.browserstack.config.ts`.
 */
declare const process: { env: Record<string, string | undefined> }

function credentials(): { username: string; accessKey: string } {
  const username = process.env.SAUCE_USERNAME
  const accessKey = process.env.SAUCE_ACCESS_KEY
  const missing = [
    ['SAUCE_USERNAME', username],
    ['SAUCE_ACCESS_KEY', accessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0 || !username || !accessKey) {
    throw new Error(
      `Sauce Labs credentials are not set: ${missing.join(', ')}.\n` +
        'Get them from https://app.saucelabs.com/user-settings and export them:\n' +
        '  export SAUCE_USERNAME=...\n' +
        '  export SAUCE_ACCESS_KEY=...\n' +
        'Nothing else in this repository needs them. The local suites\n' +
        '(npm test, npm run test:laws, npx playwright test) do not read this file.',
    )
  }
  return { username, accessKey }
}

/* Sauce's documented data centres. `us-west-1` is the one their Playwright and
 * CDP pages use in every example; `eu-central-1` is the other host their
 * Selenium endpoint list gives. An unrecognised value is rejected rather than
 * interpolated, because a typo'd region resolves to a hostname that does not
 * exist and reads as a network fault rather than a config fault. */
const REGIONS = ['us-west-1', 'eu-central-1'] as const
type Region = (typeof REGIONS)[number]

const region = (process.env.SAUCE_REGION ?? 'us-west-1') as Region
if (!REGIONS.includes(region)) {
  throw new Error(
    `SAUCE_REGION="${region}" is not a Sauce Labs data centre. ` +
      `Use one of: ${REGIONS.join(', ')}.`,
  )
}

/* Chrome and Edge only — see limit 1 in the header. Refused, not downgraded:
 * silently running Chrome when Firefox was asked for would produce a green
 * "Firefox" job that never launched Firefox, which is worse than no job. */
const SUPPORTED_BROWSERS = ['chrome', 'MicrosoftEdge'] as const
const browserName = process.env.SAUCE_BROWSER ?? 'chrome'
if (!SUPPORTED_BROWSERS.includes(browserName as (typeof SUPPORTED_BROWSERS)[number])) {
  throw new Error(
    `SAUCE_BROWSER="${browserName}" cannot be driven by Playwright on Sauce Labs.\n` +
      'Playwright\'s Selenium Grid integration supports Google Chrome and Microsoft\n' +
      `Edge only, because only those expose CDP. Use one of: ${SUPPORTED_BROWSERS.join(', ')}.\n` +
      'For Firefox or WebKit coverage use playwright.browserstack.config.ts, which\n' +
      'connects over a real Playwright socket and serves all three engines.',
  )
}

const platformName = process.env.SAUCE_PLATFORM ?? 'Windows 11'

/*
 * THE GRID HANDSHAKE. Set on `process.env` because Playwright reads it from
 * there and offers no config field for it.
 *
 * MEASURED, NOT ASSUMED. The worry worth checking was that the config is parsed
 * in the runner process while browsers are launched in a worker process, which
 * would make this assignment land in the wrong process and leave half a run
 * pointed at the local machine — a grid switch that half-applies is the failure
 * where tests silently run locally and the job still reports green.
 *
 * Probed with a throwaway config that set a variable in its body and a spec
 * that read it back:
 *
 *     [config loaded] pid=6408          <- runner
 *     Running 1 test using 1 worker
 *     [config loaded] pid=6538          <- worker re-loads the SAME module
 *     [worker] pid=6538 PROBE=yes-6538
 *     1 passed
 *
 * The worker re-loads this module and re-runs this assignment in its own
 * process, so the variable is set everywhere a browser is launched. That is why
 * the npm script does NOT also export these in the shell: duplicating the caps
 * JSON in `package.json` would be a second copy to keep in sync, and the
 * measurement says one copy is enough.
 */
const { username, accessKey } = credentials()

process.env.SELENIUM_REMOTE_URL = `https://ondemand.${region}.saucelabs.com:443/wd/hub`
process.env.SELENIUM_REMOTE_CAPABILITIES = JSON.stringify({
  platformName,
  browserName,
  'sauce:options': {
    /* Without this Sauce allocates a session with no CDP endpoint and
     * Playwright cannot attach at all. It is the flag that makes the whole
     * mechanism work, and it is easy to lose in a caps refactor. */
    devTools: true,
    username,
    accessKey,
    build: process.env.SAUCE_BUILD_NAME ?? process.env.GITHUB_SHA ?? 'the-six-laws-local',
    name: 'learning-canvas — real life',
  },
})

export default defineConfig({
  testDir: './tests/integration',
  retries: 0,
  workers: 1,
  fullyParallel: false,

  /* As with BrowserStack: the same eighteen-page-load test, but every load is
   * now a round trip to a Sauce data centre. */
  timeout: 1_800_000,
  expect: { timeout: 30_000 },

  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

    /* NOT AN AESTHETIC CHOICE. Sauce: "Playwright must run in headed mode for
     * Sauce Labs to capture video recordings." A headless grid session records
     * nothing, so a failure arrives with no video to diagnose it — which is
     * most of what a device cloud is being paid for. */
    headless: false,
  },

  /* ONE project, because one is all `SELENIUM_REMOTE_CAPABILITIES` can honestly
   * describe. The name carries the platform so a CI matrix of jobs produces
   * distinguishable output instead of four identical "chromium" lines. */
  projects: [
    {
      name: `a-person-on-${browserName}-${platformName}`.replace(/\s+/g, '-').toLowerCase(),
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  /*
   * Same tunnel caveat as BrowserStack: `baseURL` is 127.0.0.1, and the browser
   * is not on this machine. Sauce Connect Proxy has to be up for the page to
   * resolve. It is not a dependency of this package, so this config does not
   * pretend to start it — stated here rather than discovered from a blank page.
   */
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
