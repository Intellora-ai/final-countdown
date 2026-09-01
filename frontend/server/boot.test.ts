/* Does the real server actually start?
 *
 * WHY THIS TEST EXISTS
 *   Every other test in server/ runs under vitest, which resolves imports with
 *   Vite. `npm run typecheck` resolves them with TypeScript. Both accept an
 *   extensionless specifier like `from './figure'`. Node's native ESM does not.
 *
 *   So the server passed 49 unit tests and three typecheck projects, and then
 *   died on the first line of a real boot:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../canvas/spec/figure'
 *     imported from .../canvas/spec/validate.ts
 *
 *   Three green checks, all of them pointed away from the failure, because none
 *   of them ever started the process. This one starts it.
 *
 * WHY IT TESTS THE BUILT ARTIFACT
 *   The artifact that runs in production is the bundle, so the bundle is what is
 *   checked. Testing the source would prove something about a file nothing runs.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const run = promisify(execFile)
const FRONTEND = fileURLToPath(new URL('..', import.meta.url))
const BUNDLE = join(FRONTEND, 'dist-server', 'index.js')

/** Start the built server, run `body`, always kill the child. */
/**
 * Start the built server, wait until `until` appears in its output, run `body`.
 *
 * `until` is not decoration. The server prints THREE separate lines from its
 * listen callback:
 *
 *     almanac server listening on http://...
 *       ledger: ...
 *     WARNING: bound to ..., not loopback
 *
 * Three `console.log` calls are three writes, which arrive as three separate
 * `data` events on the pipe. A helper that always waited for `listening on`
 * therefore returned while the later chunks were still in flight, and the
 * WARNING assertion read output that had not arrived yet. It passed alone and
 * failed inside the full suite, where the machine is busy -- 0 failures in 5
 * isolated runs, and a failure in the full run.
 *
 * The fix is to wait for the thing the test actually needs rather than for a
 * proxy that usually precedes it. A test that waits for the wrong event does
 * not become correct by waiting longer.
 */
/**
 * Every environment variable that can configure a model, per `provider.ts`.
 *
 * WHY THE INHERITED ENVIRONMENT IS EMPTIED OF THESE FIRST.
 *
 * `withServer` used to spread `process.env` and let each test override the one
 * key it cared about. That makes every assertion about model configuration
 * depend on the shell the suite happens to run in, and it failed in both
 * directions at once:
 *
 *   - "refuses to start without a key" passed only on a machine with NO model
 *     keys exported. It cleared `ANTHROPIC_API_KEY` and inherited the rest, so
 *     on a developer machine with `GROQ_API_KEY` set the server booted
 *     correctly and the test read that correct boot as a defect. Measured:
 *     green in CI, red locally, with the product identical in both.
 *   - The four tests that set `ANTHROPIC_API_KEY: 'CANARY-...'` inherited
 *     `GROQ_API_KEY` too, and `provider.ts:48` reads Groq BEFORE Anthropic.
 *     So on that same machine they booted the Groq provider while claiming to
 *     prove something about the Anthropic one. Both were green, which is the
 *     worse half: a test that silently exercises the wrong provider reports
 *     success for code it never ran.
 *
 * Emptying the list makes each test state its own model configuration and
 * makes the result identical everywhere. It is not a carve-out for the failing
 * case — it removes a dependency the tests were never entitled to.
 */
const EVERY_MODEL_KEY = ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OLLAMA_MODEL'] as const

async function withServer(env, body, until = 'listening on') {
  const port = 8900 + Math.floor(Math.random() * 90)
  const withoutAnyModel = { ...process.env }
  for (const name of EVERY_MODEL_KEY) delete withoutAnyModel[name]
  const child = spawn(process.execPath, [BUNDLE], {
    cwd: FRONTEND,
    env: { ...withoutAnyModel, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (d) => { output += String(d) })
  child.stderr.on('data', (d) => { output += String(d) })

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (output.includes(until)) break
      if (child.exitCode !== null) break
      await new Promise((r) => setTimeout(r, 50))
    }
    return await body({ port, output: () => output, exitCode: () => child.exitCode })
  } finally {
    child.kill('SIGKILL')
  }
}

describe('the built server', () => {
  beforeAll(async () => {
    await run('npx', ['vite', 'build', '--config', 'vite.server.config.ts'], { cwd: FRONTEND })
  }, 120_000)

  it('starts without a module-resolution error', async () => {
    await withServer({ ANTHROPIC_API_KEY: 'CANARY-boot-bind-test' }, async (s) => {
      expect(s.output()).not.toContain('ERR_MODULE_NOT_FOUND')
      expect(s.output()).toContain('listening on')
    })
  })

  it('binds to loopback, not every interface', async () => {
    await withServer({ ANTHROPIC_API_KEY: 'CANARY-boot-bind-test' }, async (s) => {
      expect(s.output()).toContain('http://127.0.0.1:')
    })
  })

  it('answers a request over a real socket', async () => {
    await withServer({ ANTHROPIC_API_KEY: 'CANARY-boot-bind-test' }, async (s) => {
      const res = await fetch(`http://127.0.0.1:${s.port}/api/nope`, { method: 'POST', body: '{}' })
      expect(res.status).toBe(404)
    })
  })

  /* EVERY PROVIDER IS CLEARED, NOT JUST THE ONE THIS TEST WAS BORN WITH.
   *
   * This cleared `ANTHROPIC_API_KEY` alone and asserted that one name. It was
   * correct on the day it was written, when Anthropic was the only provider.
   * `chooseProvider` then grew Groq and Ollama, and Groq is checked FIRST
   * (provider.ts:44-52). `withServer` spawns with `{ ...process.env, ...env }`,
   * so a `GROQ_API_KEY` exported in the developer's shell survived the blanking
   * of the Anthropic one: the server chose Groq, started correctly, and this
   * test failed demanding a name the refusal had no reason to print.
   *
   * Measured 2026-09-01: the suite was red for exactly this, and
   * `scripts/mutation-gate.mjs` refuses to establish a baseline against a red
   * suite -- so one over-specific assertion was holding the entire mutation
   * score hostage.
   *
   * The assertion is now about the GUARANTEE rather than one spelling of it:
   * with no provider configured the process must refuse, and the refusal must
   * name every way to configure one. A fourth provider added later that this
   * message forgets to mention is a failure here, which is the property the
   * original test was reaching for.
   */
  it('refuses to start when no provider is configured, and names every way to set one', async () => {
    await withServer(
      { OLLAMA_MODEL: '', GROQ_API_KEY: '', GROQ_MODEL: '', ANTHROPIC_API_KEY: '' },
      async (s) => {
        expect(s.exitCode()).not.toBe(0)
        for (const name of ['GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'OLLAMA_MODEL']) {
          expect(s.output()).toContain(name)
        }
      },
    )
  })

  it('does not print the key when it starts', async () => {
    const key = 'CANARY-boot-must-not-leak-9999'
    await withServer({ ANTHROPIC_API_KEY: key }, async (s) => {
      /* Evidence first: a process that crashed on boot also prints no key.
       * Require it to have actually started before believing the absence. */
      expect(s.output()).toContain('listening on')
      expect(s.output()).not.toContain(key)
    })
  })

  it('warns when bound somewhere other than loopback', async () => {
    /* A process holding an API key should say so out loud if it is exposed. */
    await withServer(
      { ANTHROPIC_API_KEY: 'CANARY-boot-bind-test', HOST: '0.0.0.0' },
      async (s) => {
        /* Evidence first: a process that died on boot also prints no WARNING,
         * and waiting for WARNING would then just time out. Require it to have
         * genuinely started before reading anything into the warning's
         * presence. */
        expect(s.output()).toContain('listening on')
        expect(s.output()).toContain('WARNING')
        expect(s.output()).toContain('0.0.0.0')
      },
      'WARNING',
    )
  })
})
