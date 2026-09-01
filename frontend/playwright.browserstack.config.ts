import { defineConfig, devices } from '@playwright/test'

/**
 * THE SIX LAWS, ON BROWSERSTACK'S MACHINES INSTEAD OF THIS ONE.
 *
 * Same `tests/integration/` specs, same `person.ts`, same assertions. The only
 * thing that changes is where the browser runs. That is the entire point: if a
 * LAW holds here and breaks on a real Windows Firefox, the suite was measuring
 * this laptop and calling it the world.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS INERT UNLESS YOU ASK FOR IT, AND THAT IS A DESIGN REQUIREMENT.
 *
 * Playwright only loads `playwright.config.ts` by default. Nothing reaches this
 * file without an explicit `--config=playwright.browserstack.config.ts`, so a
 * developer with no BrowserStack account is not merely unaffected by it — they
 * cannot execute a line of it by accident. `npm test`, `npm run test:laws` and
 * the default e2e config do not import, resolve or parse this module.
 *
 * That is why the credential check below is allowed to THROW rather than
 * silently degrade. Reaching this code means someone explicitly asked to run on
 * BrowserStack; the useful answer to "you have no key" is to say so on line one,
 * not to connect to a URL that will hang until the socket times out. A config
 * that quietly does nothing is the failure mode this whole file is guarding
 * against — see the note on Sauce Labs in `playwright.saucelabs.config.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE ENDPOINT IS COPIED FROM BROWSERSTACK'S DOCUMENTATION, NOT GUESSED.
 *
 *   wss://cdp.browserstack.com/playwright?caps=<encodeURIComponent(JSON)>
 *
 * verified against two BrowserStack pages that state it verbatim —
 * `docs/automate/playwright/playwright-capabilities` and
 * `docs/automate/playwright/migrate-existing-test-suites` — and cross-checked
 * against a real config in the wild (BabylonJS/Babylon.js
 * `playwright.browserstack.config.ts`), which builds the same string.
 *
 * The three `browser` values are likewise taken from BrowserStack's published
 * Playwright browser list rather than inferred: `playwright-chromium`,
 * `playwright-firefox`, `playwright-webkit`. That list currently offers WebKit
 * 26.5 and Firefox 153, which are the same builds `npx playwright install`
 * puts in `~/Library/Caches/ms-playwright` for Playwright 1.62.1 — so the
 * cloud matrix and the local matrix are testing the same engines.
 */

/*
 * The slice of Node this config uses, declared rather than installed.
 *
 * `@types/node` is deliberately not a dependency of this package — see the
 * header of `server/node.d.ts`, which makes the same choice for the same
 * reasons, as does `src/websearch/node-http.d.ts`. Two environment reads are
 * not grounds for reversing that decision, so the two environment reads are
 * what gets declared.
 *
 * This is a module-scoped declaration, not an ambient global: this file has
 * imports, so `declare const` here binds inside the module and cannot collide
 * with the identical line in the Sauce Labs config.
 */
declare const process: { env: Record<string, string | undefined> }

/**
 * Fail loudly, once, with the variable names in the message.
 *
 * The alternative — defaulting to `''` and letting BrowserStack reject the
 * handshake — produces `browserType.connect: WebSocket error 4xx` with no
 * mention of a credential, which is how an afternoon disappears.
 */
function credentials(): { username: string; accessKey: string } {
  const username = process.env.BROWSERSTACK_USERNAME
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY
  const missing = [
    ['BROWSERSTACK_USERNAME', username],
    ['BROWSERSTACK_ACCESS_KEY', accessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0 || !username || !accessKey) {
    throw new Error(
      `BrowserStack credentials are not set: ${missing.join(', ')}.\n` +
        'Get them from https://www.browserstack.com/accounts/settings and export them:\n' +
        '  export BROWSERSTACK_USERNAME=...\n' +
        '  export BROWSERSTACK_ACCESS_KEY=...\n' +
        'Nothing else in this repository needs them. The local suites\n' +
        '(npm test, npm run test:laws, npx playwright test) do not read this file.',
    )
  }
  return { username, accessKey }
}

/*
 * BrowserStack matches the client Playwright version against the one it runs.
 *
 * `npm run test:browserstack` computes this from the installed package at
 * invocation time, so it cannot drift from `node_modules`. The fallback exists
 * for someone invoking `playwright test --config=...` by hand; if it is wrong
 * BrowserStack says so explicitly in the handshake, which is a good failure.
 */
const CLIENT_PLAYWRIGHT_VERSION = process.env.BROWSERSTACK_PLAYWRIGHT_VERSION ?? '1.62.1'

/* One build per run, so a red test in the dashboard can be traced back to the
 * commit that produced it rather than to "the last time someone ran this". */
const BUILD = process.env.BROWSERSTACK_BUILD_NAME ?? process.env.GITHUB_SHA ?? 'the-six-laws-local'

/**
 * The engine table. `browserName` and `caps.browser` are derived from ONE row
 * each so they can never disagree.
 *
 * They have to agree. Playwright picks which browser type's `connect()` to call
 * from `browserName`, and BrowserStack picks which engine to hand back from
 * `caps.browser`. Set them independently and a `firefox` client eventually
 * talks to a Chromium server, which fails deep inside the protocol with an
 * error that names neither field.
 */
const ENGINES = [
  { project: 'a-person-on-a-laptop', browserName: 'chromium', bsBrowser: 'playwright-chromium' },
  { project: 'a-person-on-firefox', browserName: 'firefox', bsBrowser: 'playwright-firefox' },
  { project: 'a-person-on-safari', browserName: 'webkit', bsBrowser: 'playwright-webkit' },
] as const

/* `os`/`os_version` are BrowserStack's key names — snake_case, unlike the
 * camelCase `browserstack.accessKey` beside them. Both spellings are theirs. */
const OS = process.env.BROWSERSTACK_OS ?? 'Windows'
const OS_VERSION = process.env.BROWSERSTACK_OS_VERSION ?? '11'

function wsEndpoint(engine: (typeof ENGINES)[number]): string {
  const { username, accessKey } = credentials()
  const caps = {
    browser: engine.bsBrowser,
    os: OS,
    os_version: OS_VERSION,
    project: 'learning-canvas — real life',
    build: BUILD,
    name: engine.project,
    'browserstack.username': username,
    'browserstack.accessKey': accessKey,
    'client.playwrightVersion': CLIENT_PLAYWRIGHT_VERSION,
  }
  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`
}

export default defineConfig({
  testDir: './tests/integration',
  retries: 0,
  workers: 1,
  fullyParallel: false,

  /* The reallife budget plus room for a transatlantic round trip on every
   * single interaction. The local config allows 900s for a test that does
   * eighteen page loads; each of those loads is now a network hop to
   * BrowserStack rather than to 127.0.0.1. */
  timeout: 1_800_000,
  expect: { timeout: 30_000 },

  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: ENGINES.map((engine) => ({
    name: engine.project,
    use: {
      ...devices['Desktop Chrome'],
      browserName: engine.browserName,
      viewport: { width: 1440, height: 900 },
      connectOptions: { wsEndpoint: wsEndpoint(engine) },
    },
  })),

  /*
   * THE SERVER IS STILL LOCAL, AND THE BROWSER IS NOT. THAT NEEDS A TUNNEL.
   *
   * `baseURL` is 127.0.0.1 as it is everywhere else, but "localhost" now means
   * a machine in a BrowserStack datacentre, where nothing is listening. The
   * page will not load until BrowserStack Local is running and forwarding:
   *
   *   npx browserstack-local --key "$BROWSERSTACK_ACCESS_KEY"
   *
   * and `'browserstack.local': 'true'` is added to `caps` above. That binary is
   * NOT a dependency of this package and adding one was out of scope for the
   * change that created this file, so this config does not pretend to start it.
   * Stated here rather than discovered later from a blank page.
   */
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
