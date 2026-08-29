import { defineConfig } from '@playwright/test'

import local from './playwright.config'

/**
 * THE ROOT SMOKE SUITE, RUN ON SAUCE LABS CLOUD BROWSERS.
 *
 * A SEPARATE FILE, AND `playwright.config.ts` IS NOT TOUCHED.
 * That config's honesty depends on staying single-purpose, and it is the one
 * CI runs. Everything cloud-specific lives here, so a broken cloud experiment
 * can never change what the local gate measures.
 *
 * IT IMPORTS THE LOCAL CONFIG RATHER THAN COPYING IT.
 * A hand-copied mirror is a mirror until someone adds a project to one side.
 * Spreading the real config means the specs, the timeouts and the projects ARE
 * the local ones -- there is no second list to keep in step -- and only the
 * three things that genuinely differ in the cloud are overridden below.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE THE FIRST CLOUD RUN: THIS SUITE SERVES A LOCAL ARTEFACT.
 *
 * The local config serves `htmlcov/` -- the Python coverage report -- and
 * regenerates it on demand with `.venv/bin/coverage html`. A Sauce VM has no
 * `.venv` and no `.coverage` database, so that branch cannot work there.
 *
 * The webServer below therefore does NOT regenerate. It requires `htmlcov/` to
 * have been built locally and uploaded with the project (`rootDir` in
 * `.sauce/config.yml`), and it REFUSES with a readable message when the
 * directory is absent rather than serving an empty root and failing later as a
 * pile of confusing 404s.
 *
 * Build it first:
 *
 *     .venv/bin/coverage html -d htmlcov
 *
 * This is stated rather than worked around because the alternative -- silently
 * serving nothing -- is the failure mode this repository keeps writing gates
 * against.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * CREDENTIALS ARE NEVER IN THIS FILE. `saucectl` reads `SAUCE_USERNAME` and
 * `SAUCE_ACCESS_KEY` from the environment. Nothing here reads, prints or
 * defaults them, and `.sauce/credentials.yml` -- where `saucectl configure`
 * writes a key on disk -- is gitignored.
 */
export default defineConfig({
  ...local,

  /*
   * CLOUD PARALLELISM, WHICH IS NOT THE SAME KNOB AS THE LOCAL ONE.
   *
   * The local config pins `workers: 1` under CI so a single shared runner
   * cannot interleave two browsers. On Sauce each suite in `.sauce/config.yml`
   * gets its OWN VM, and `sauce.concurrency` decides how many run at once, so
   * that cap would be throttling a machine that is not shared with anything.
   *
   * `undefined` hands the decision to Playwright, which sizes it from the VM's
   * own cores. The parallelism that matters -- one VM per project -- is
   * declared in `.sauce/config.yml`, not here.
   */
  workers: undefined,
  fullyParallel: true,

  /* `forbidOnly` stays on for the same reason it is on in CI: a stray
     `test.only` that reaches a paid cloud run costs money to learn nothing. */
  forbidOnly: true,

  /* One retry, matching the local CI behaviour. A cloud VM adds network
     between the browser and nothing else here, so the flake surface is the
     same one the local config already decided about. */
  retries: 1,

  /* Written to its own folder. Sharing `playwright-report/` with the local run
     would let a cloud run overwrite the report someone is reading. */
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-sauce', open: 'never' }]],

  webServer: {
    /*
     * No `.venv`, no regeneration, and a loud refusal when the report is
     * missing. `python3 -m http.server` is in the runner image; `coverage` is
     * not.
     */
    command:
      'sh -c \'[ -f htmlcov/index.html ] || { echo "htmlcov/index.html is missing. Build it before uploading: .venv/bin/coverage html -d htmlcov" >&2; exit 1; }; python3 -m http.server 4173 --directory htmlcov --bind 127.0.0.1\'',
    url: 'http://127.0.0.1:4173',
    /* Never reuse in the cloud: a VM is fresh every run, so a "reused" server
       would mean something unexpected is already listening. */
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
