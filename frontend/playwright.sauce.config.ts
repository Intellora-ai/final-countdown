import { defineConfig } from '@playwright/test'

import local from './playwright.config'

/**
 * THE CANVAS BROWSER HARNESS, RUN ON SAUCE LABS CLOUD BROWSERS.
 *
 * A SEPARATE FILE, AND `playwright.config.ts` IS NOT TOUCHED.
 * That config is what CI runs and what every Phases 4-7 gate is measured
 * against. Nothing cloud-specific may reach it, so all of it is here.
 *
 * IT IMPORTS THE LOCAL CONFIG RATHER THAN COPYING IT.
 * The local config declares five projects, a spec/test suffix boundary between
 * two runners, and a set of timeouts that were measured rather than guessed. A
 * hand-copied mirror of that is correct exactly until someone adds a sixth
 * project. Spreading the real config means the projects, the specs and the
 * timeouts ARE the local ones, and only what genuinely differs in a cloud VM
 * is overridden below.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE `workers` TRIPWIRE IS INHERITED, AND STILL APPLIES.
 *
 * The local config carries a tripwire: if ANY spec imports `./util/perf`,
 * `./util/bridge` or `./util/cdp`, `workers: 1` goes back in the same commit,
 * because those modules measure p95 and frame intervals and parallel workers
 * fight for the same CPU and invalidate every number they produce.
 *
 * That reasoning does not stop being true on a rented machine. It gets WORSE:
 * a cloud VM is shared, virtualised hardware with noisier timing than a
 * developer's laptop. So if the perf harness is ever reconnected, this file
 * needs `workers: 1` too -- and honestly, a p95 measured on a Sauce VM should
 * not be compared against one measured locally at all.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE THE FIRST CLOUD RUN: THIS SUITE STARTS TWO SERVERS.
 *
 * The product is two processes -- the Vite dev server and the planner -- and
 * the harness drives the DEV build on purpose, because the `__boardHarness`
 * bridge and the perf marks compile to no-ops in production.
 *
 * saucectl uploads `rootDir` and runs Playwright INSIDE the VM, so both
 * servers start there and 127.0.0.1 is the VM's own loopback. Nothing reaches
 * back to a developer's machine, which is why no Sauce Connect tunnel is
 * configured.
 *
 * It does mean the VM must be able to run `npm run server:build` and
 * `npm run dev`: node_modules has to be installed there, and the first run
 * pays for a Vite build. If that proves too slow, the fix is to serve a
 * prebuilt bundle -- NOT to switch this suite to a production build, which
 * would silently disable the harness bridge and make several specs assert
 * against a page that no longer exposes what they read.
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
   * CLOUD PARALLELISM, WHICH IS A DIFFERENT KNOB FROM THE LOCAL ONE.
   *
   * The local `workers: 4` is a measured UNIT cap for one shared CI runner:
   * with `fullyParallel: false` a unit is one file within one project, so four
   * is correct unsharded and self-limits when sharded. On Sauce every suite in
   * `.sauce/config.yml` gets its OWN VM and runs ONE project, so that cap
   * would be rationing a machine nothing else is using.
   *
   * `undefined` hands the count to Playwright, which sizes it from the VM's
   * cores. The parallelism that matters here -- five projects, five VMs, at
   * once -- is declared in `.sauce/config.yml`, not in this file.
   *
   * `fullyParallel` stays FALSE, inherited. That is not a parallelism cap: it
   * is a decision that tests inside one file do not interleave, and the local
   * config's measurements were taken with it false. Flipping it here would
   * make a cloud failure impossible to compare against a local one.
   */
  workers: undefined,

  /* A stray `test.only` reaching a paid cloud run costs money to learn
     nothing. On locally, unlike the local config which only sets it in CI. */
  forbidOnly: true,
  retries: 1,

  /*
   * The GitHub-annotating reporter is dropped, and that is deliberate.
   *
   * `canvas-reporter.ts` exists to emit `::error file=` annotations against
   * the panel source a test attributed to, and to write `ci-findings.json` for
   * the workflow to upload. Neither has any meaning inside a Sauce VM: there
   * is no GitHub run to annotate and no workflow step to collect the file.
   * Keeping it would produce output nothing reads.
   *
   * `saucectl` collects its own artefacts; `list` keeps the console readable
   * and the HTML report goes to its own folder so a cloud run can never
   * overwrite the local `playwright-report/` someone is reading.
   */
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-sauce', open: 'never' }]],

  webServer: [
    {
      /* The planner. The key is deliberately a canary, exactly as locally:
         nothing these specs do reaches a model, and a real key here would be a
         real key sitting on rented infrastructure. */
      command:
        'npm run server:build && ANTHROPIC_API_KEY=CANARY-e2e-must-not-leak PORT=8787 node dist-server/index.js',
      url: 'http://127.0.0.1:8787/api/health',
      /* Never reuse in the cloud: a VM is fresh every run, so something
         already listening means something unexpected is running. */
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
      url: 'http://127.0.0.1:5183',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
