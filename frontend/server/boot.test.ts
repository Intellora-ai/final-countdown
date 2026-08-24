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
async function withServer(env, body) {
  const port = 8900 + Math.floor(Math.random() * 90)
  const child = spawn(process.execPath, [BUNDLE], {
    cwd: FRONTEND,
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (d) => { output += String(d) })
  child.stderr.on('data', (d) => { output += String(d) })

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (output.includes('listening on')) break
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
    await withServer({ ANTHROPIC_API_KEY: 'sk-ant-boot-test' }, async (s) => {
      expect(s.output()).not.toContain('ERR_MODULE_NOT_FOUND')
      expect(s.output()).toContain('listening on')
    })
  })

  it('binds to loopback, not every interface', async () => {
    await withServer({ ANTHROPIC_API_KEY: 'sk-ant-boot-test' }, async (s) => {
      expect(s.output()).toContain('http://127.0.0.1:')
    })
  })

  it('answers a request over a real socket', async () => {
    await withServer({ ANTHROPIC_API_KEY: 'sk-ant-boot-test' }, async (s) => {
      const res = await fetch(`http://127.0.0.1:${s.port}/api/nope`, { method: 'POST', body: '{}' })
      expect(res.status).toBe(404)
    })
  })

  it('refuses to start without a key, and says which one', async () => {
    await withServer({ ANTHROPIC_API_KEY: '' }, async (s) => {
      expect(s.output()).toContain('ANTHROPIC_API_KEY')
      expect(s.exitCode()).not.toBe(0)
    })
  })

  it('does not print the key when it starts', async () => {
    const key = 'sk-ant-boot-SECRET-9999'
    await withServer({ ANTHROPIC_API_KEY: key }, async (s) => {
      /* Evidence first: a process that crashed on boot also prints no key.
       * Require it to have actually started before believing the absence. */
      expect(s.output()).toContain('listening on')
      expect(s.output()).not.toContain(key)
    })
  })

  it('warns when bound somewhere other than loopback', async () => {
    /* A process holding an API key should say so out loud if it is exposed. */
    await withServer({ ANTHROPIC_API_KEY: 'sk-ant-boot-test', HOST: '0.0.0.0' }, async (s) => {
      expect(s.output()).toContain('WARNING')
    })
  })
})
