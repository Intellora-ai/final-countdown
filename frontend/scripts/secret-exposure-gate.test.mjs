/* Tests for secret-exposure-gate.mjs
 *
 * DESIRED OUTCOME
 *   No credential can reach the browser bundle, and that stays true as the code
 *   grows — not because everyone remembers, but because the build refuses.
 *
 * THE BUG CLASS THIS PREVENTS
 *   The server process holds the API key. Everything under src/ is compiled
 *   into JavaScript that is downloaded by every student. Those two facts are
 *   only safe while nothing under src/ imports anything under server/. That is
 *   one careless import away from being false, and the resulting bundle looks
 *   completely normal.
 *
 *   The second half is Vite's own rule: any environment variable named VITE_*
 *   is INLINED into the bundle as a literal string. A variable called
 *   VITE_ANTHROPIC_API_KEY would ship the key to every browser, and nothing in
 *   the toolchain warns about it.
 *
 * WHY A GATE AND NOT A NOTE IN THE README
 *   A note is a request. This refuses.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { findExposures, SECRETY_NAME } from './secret-exposure-gate.mjs'

const run = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('./secret-exposure-gate.mjs', import.meta.url))
const REAL_FRONTEND = fileURLToPath(new URL('..', import.meta.url))

async function sandbox(files) {
  const dir = await mkdtemp(join(tmpdir(), 'secret-gate-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
  return dir
}

describe('SECRETY_NAME', () => {
  it('recognises the obvious secret-ish names', () => {
    for (const name of ['VITE_API_KEY', 'VITE_ANTHROPIC_API_KEY', 'VITE_SECRET', 'VITE_AUTH_TOKEN', 'VITE_DB_PASSWORD']) {
      expect(SECRETY_NAME.test(name), name).toBe(true)
    }
  })

  it('does not flag a variable that carries no credential', () => {
    for (const name of ['VITE_PRACTICE_ENDPOINT', 'VITE_PRACTICE_PROVIDER', 'VITE_BASE_URL']) {
      expect(SECRETY_NAME.test(name), name).toBe(false)
    }
  })
})

describe('findExposures — src must not import the key-holding process', () => {
  it('flags a src file importing from server/', async () => {
    const dir = await sandbox({
      'src/app.ts': "import { createModel } from '../server/model.ts'\n",
    })
    const found = await findExposures(dir)
    expect(found.map((f) => f.kind)).toEqual(['imports-server'])
  })

  it('names the file and line of the import', async () => {
    const dir = await sandbox({
      'src/app.ts': "// a comment\nimport { createModel } from '../server/model.ts'\n",
    })
    const [first] = await findExposures(dir)
    expect(first.file).toBe('src/app.ts')
    expect(first.line).toBe(2)
  })

  it('flags a deep relative path into server/', async () => {
    const dir = await sandbox({
      'src/deep/nested/thing.ts': "export * from '../../../server/handler.ts'\n",
    })
    expect((await findExposures(dir))).toHaveLength(1)
  })

  it('allows server/ importing from src/, which is the safe direction', async () => {
    const dir = await sandbox({
      'server/handler.ts': "import { validateLesson } from '../src/canvas/spec/validate.ts'\n",
    })
    expect(await findExposures(dir)).toEqual([])
  })

  it('does not flag the word server inside an unrelated identifier', async () => {
    const dir = await sandbox({
      'src/app.ts': "const serverName = 'observer'\nimport x from './serverless-helper.ts'\n",
    })
    expect(await findExposures(dir)).toEqual([])
  })
})

describe('findExposures — no secret may be inlined into the bundle', () => {
  it('flags a src file reading a secret-looking VITE_ variable', async () => {
    const dir = await sandbox({
      'src/app.ts': "const k = import.meta.env['VITE_ANTHROPIC_API_KEY']\n",
    })
    const found = await findExposures(dir)
    expect(found.map((f) => f.kind)).toEqual(['inlined-secret'])
  })

  it('flags the dot-access form too', async () => {
    const dir = await sandbox({ 'src/app.ts': 'const k = import.meta.env.VITE_API_KEY\n' })
    expect(await findExposures(dir)).toHaveLength(1)
  })

  it('allows a VITE_ variable that carries no credential', async () => {
    const dir = await sandbox({
      'src/app.ts': "const e = import.meta.env['VITE_PRACTICE_ENDPOINT']\n",
    })
    expect(await findExposures(dir)).toEqual([])
  })

  it('ignores a secret-looking name that is not a VITE_ variable', async () => {
    /* Only VITE_* is inlined by Vite. A plain process.env read in a script is
     * not a browser exposure, and flagging it would make the gate cry wolf. */
    const dir = await sandbox({ 'src/app.ts': "const k = process.env['ANTHROPIC_API_KEY']\n" })
    expect(await findExposures(dir)).toEqual([])
  })

  it('finds both kinds in one sweep', async () => {
    const dir = await sandbox({
      'src/a.ts': "import x from '../server/model.ts'\n",
      'src/b.ts': 'const k = import.meta.env.VITE_SECRET_TOKEN\n',
    })
    expect((await findExposures(dir)).map((f) => f.kind).sort())
      .toEqual(['imports-server', 'inlined-secret'])
  })
})

describe('the real repository', () => {
  it('has no secret exposure today', async () => {
    /* The regression guard. If this ever goes red, a credential just became
     * reachable from the browser bundle. */
    expect(await findExposures(REAL_FRONTEND)).toEqual([])
  })
})

describe('the CLI', () => {
  it('exits 0 and says so when the repo is clean', async () => {
    const { stdout } = await run(process.execPath, [SCRIPT], { env: { ...process.env, SECRET_GATE_ROOT: REAL_FRONTEND } })
    expect(stdout).toContain('SECRET EXPOSURE GATE: PASS')
  })

  it('exits 1 and prints its own banner when a secret is exposed', async () => {
    /* The banner matters: a missing script also exits non-zero. */
    const dir = await sandbox({ 'src/app.ts': "import x from '../server/model.ts'\n" })
    let code = 0
    let stdout = ''
    try {
      const r = await run(process.execPath, [SCRIPT], { env: { ...process.env, SECRET_GATE_ROOT: dir } })
      stdout = r.stdout
    } catch (err) {
      code = err.code
      stdout = err.stdout ?? ''
    }
    expect(code).toBe(1)
    expect(stdout).toContain('SECRET EXPOSURE')
    expect(stdout).toContain('src/app.ts')
  })
})
