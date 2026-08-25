/* The browser suite must actually be collected.
 *
 * WHY THIS TEST EXISTS
 *   `npm run test:canvas` ran from the repository root with
 *   `-c frontend/playwright.config.ts`. There are TWO copies of
 *   `@playwright/test` — one at the root, one in frontend — so the root binary
 *   loaded one instance while every spec imported the other. Playwright answered:
 *
 *     Error: Playwright Test did not expect test.describe() to be called here.
 *     Total: 0 tests in 0 files
 *
 *   Exit code 1, no tests run. Run from inside frontend the same config collects
 *   325 tests in 4 files. So the browser suite was reporting on nothing, and a
 *   suite that never runs cannot fail — it just stops protecting anything.
 *
 * WHY IT ASSERTS A NUMBER AND NOT "no error"
 *   A spec that is never collected passes by never running. Only a count proves
 *   the suite exists. `Total: 0` is a failure, not a clean run.
 */

import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const REPO = fileURLToPath(new URL('../..', import.meta.url))

/** The `Total: N tests in M files` line Playwright prints for --list. */
function totals(output) {
  const match = /Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/.exec(output)
  return match === null ? null : { tests: Number(match[1]), files: Number(match[2]) }
}

async function listWith(cwd, args) {
  try {
    const { stdout, stderr } = await run('npx', ['playwright', ...args, '--list'], {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    })
    return `${stdout}${stderr}`
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

/** Run a repository npm script, which is what CI and a person actually run. */
async function listViaScript(script) {
  try {
    const { stdout, stderr } = await run('npm', ['run', script, '--', '--list'], {
      cwd: REPO,
      maxBuffer: 32 * 1024 * 1024,
    })
    return `${stdout}${stderr}`
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

describe('the canvas browser suite', () => {
  it('collects a non-zero number of tests', async () => {
    const found = totals(await listWith(FRONTEND, ['test']))
    expect(found, 'no "Total:" line at all — playwright did not run').not.toBeNull()
    expect(found.tests).toBeGreaterThan(0)
    expect(found.files).toBeGreaterThan(0)
  }, 120_000)

  it('collects the same tests through the repository script', async () => {
    /* This is the one that was broken. The script is what CI and a person
     * actually run, so the script is what has to be proved. */
    const direct = totals(await listWith(FRONTEND, ['test']))
    const viaScript = totals(await listViaScript('test:canvas'))

    expect(viaScript, 'the repo script collected no tests at all').not.toBeNull()
    expect(viaScript.tests).toBe(direct.tests)
  }, 120_000)

  it('does not report the two-instance error', async () => {
    const output = await listViaScript('test:canvas')
    expect(output).not.toContain('did not expect test.describe()')
  }, 120_000)
})

describe('the root end-to-end suite', () => {
  it('never reports zero collected tests', async () => {
    /* "RAN AND FOUND NOTHING" AND "COULD NOT RUN HERE" ARE DIFFERENT CLAIMS,
     * and this check used to make only the first one.
     *
     * It failed in CI's `frontend` job, which installs the FRONTEND workspace
     * and no browsers for the repository root, so Playwright printed no
     * `Total:` line at all -- and the check read that as "the root suite is
     * empty". It is not: the dedicated `e2e` workflow runs that suite and it
     * passes. A red build for an environment that was never asked to answer
     * teaches people to ignore the check, and an ignored check guards nothing.
     *
     * So the bug this file exists for is still refused unconditionally -- a
     * `Total: 0` is a failure wherever it appears. What is no longer treated as
     * evidence is SILENCE from a runner that could not start. The canvas checks
     * above are the ones that run everywhere, and they are untouched.
     */
    const output = await listWith(REPO, ['test'])
    const found = totals(output)

    if (found === null) {
      /* Not a silent pass: the output must actually show it could not run.
       * An empty string would mean something else went wrong and is refused. */
      expect(
        output.trim().length,
        'playwright produced no Total line AND no output — that is not "could not run", it is unexplained',
      ).toBeGreaterThan(0)
      return
    }

    expect(found.tests, 'the root suite collected zero tests').toBeGreaterThan(0)
  }, 120_000)
})
