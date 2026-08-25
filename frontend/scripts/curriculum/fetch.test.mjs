/* Tests for fetch.mjs — the curriculum source downloader.
 *
 * DESIRED OUTCOME
 *   Every official syllabus PDF is on disk, provably byte-identical to what the
 *   board published, and a mid-year revision is DETECTED rather than silently
 *   absorbed into the app.
 *
 * WHAT MUST BE TRUE FOR THAT OUTCOME TO HOLD
 *   1. Each manifest entry lands at outDir/<slug>.pdf with the exact bytes.
 *   2. The lock records the SHA-256 of those exact bytes.
 *   3. Re-running against unchanged remote bytes reports no drift.
 *   4. Re-running against CHANGED remote bytes reports drift, names the file,
 *      and carries both the old and the new digest. Silent acceptance here is
 *      the whole failure this script exists to prevent.
 *   5. A failed download leaves NO file behind. A half-written PDF that later
 *      parses into half a syllabus is worse than no PDF at all.
 *   6. A slug that tries to escape outDir is refused.
 *   7. The CLI exits non-zero on drift AND prints its own banner.
 *
 * WHY ASSERTIONS ARE ON DIGESTS AND BANNER TEXT, NOT ON EXIT CODES ALONE
 *   A missing script also exits non-zero, and an empty file also "contains no
 *   forbidden bytes". Every test below requires evidence the code actually ran:
 *   a digest computed elsewhere (python hashlib, not this module) or the
 *   script's own words.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { fetchAll } from './fetch.mjs'

const run = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('./fetch.mjs', import.meta.url))

/* Digests computed with python hashlib, NOT with this module's own hashing.
 * A test that hashes with the code under test proves only that the code agrees
 * with itself. */
const BYTES_A = 'PDF-BYTES-A'
const SHA_A = '7e6381d1aab0ba4b6884f0d3b6299a93b34d60b64f5728aae8b559ad27a825c0'
const BYTES_B = 'PDF-BYTES-B'
const SHA_B = '98adfac83d15f252b8b670ee72eb70bbd909efa288a910a6124466aa653a4dcf'
const BYTES_A_CHANGED = 'PDF-BYTES-A-CHANGED'
const SHA_A_CHANGED = 'f57b77bda4ccd53cd0e3cad0d211dee883837a1131891f106ec4145b35b35894'

const FIXED_NOW = '2026-08-25T00:00:00.000Z'

let dir
let outDir
let lockPath

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'curriculum-fetch-'))
  outDir = join(dir, 'source-pdfs')
  lockPath = join(dir, 'curriculum-sources.lock.json')
})

afterEach(() => {
  dir = undefined
})

/* A stand-in for global fetch. Maps url -> body string, or url -> Error. */
function fakeFetch(routes) {
  return async (url) => {
    const body = routes[url]
    if (body === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
    if (body instanceof Error) throw body
    if (body === 'STREAM_FAILS') {
      return { ok: true, status: 200, arrayBuffer: async () => { throw new Error('socket hang up') } }
    }
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(body).buffer }
  }
}

const MANIFEST_TWO = [
  { slug: 'science-x', url: 'https://example.test/science.pdf' },
  { slug: 'maths-x', url: 'https://example.test/maths.pdf' },
]

const ROUTES_OK = {
  'https://example.test/science.pdf': BYTES_A,
  'https://example.test/maths.pdf': BYTES_B,
}

describe('fetchAll — writing files', () => {
  it('writes each manifest entry to outDir/<slug>.pdf with the exact bytes', async () => {
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })

    expect(await readFile(join(outDir, 'science-x.pdf'), 'utf8')).toBe(BYTES_A)
    expect(await readFile(join(outDir, 'maths-x.pdf'), 'utf8')).toBe(BYTES_B)
  })

  it('writes exactly the manifest files and nothing else', async () => {
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })

    expect((await readdir(outDir)).sort()).toEqual(['maths-x.pdf', 'science-x.pdf'])
  })
})

describe('fetchAll — the lock is the provenance record', () => {
  it('records the SHA-256 of the exact bytes, keyed by slug', async () => {
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })

    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    expect(lock.sources['science-x'].sha256).toBe(SHA_A)
    expect(lock.sources['maths-x'].sha256).toBe(SHA_B)
  })

  it('records the url, byte count and fetch date for each source', async () => {
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })

    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    expect(lock.sources['science-x']).toEqual({
      url: 'https://example.test/science.pdf',
      file: 'science-x.pdf',
      sha256: SHA_A,
      bytes: 11,
      fetchedAt: FIXED_NOW,
    })
  })
})

describe('fetchAll — drift detection', () => {
  it('reports no drift when the remote bytes are unchanged', async () => {
    const opts = {
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    }
    await fetchAll(opts)
    const second = await fetchAll(opts)

    /* Evidence first: a run that fetched nothing also drifts nothing. */
    expect(second.written.sort()).toEqual(['maths-x', 'science-x'])
    expect(second.drifted).toEqual([])
  })

  it('reports drift naming the slug and BOTH digests when remote bytes change', async () => {
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })

    const changed = await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      now: () => FIXED_NOW,
      fetchImpl: fakeFetch({
        ...ROUTES_OK,
        'https://example.test/science.pdf': BYTES_A_CHANGED,
      }),
    })

    expect(changed.drifted).toEqual([
      { slug: 'science-x', was: SHA_A, now: SHA_A_CHANGED },
    ])
  })

  it('does not overwrite the locked digest when drift is found', async () => {
    /* The lock is the record of what was REVIEWED. Overwriting it on drift
     * would erase the very evidence that a review is owed. */
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })
    await fetchAll({
      manifest: MANIFEST_TWO, outDir, lockPath,
      now: () => FIXED_NOW,
      fetchImpl: fakeFetch({
        ...ROUTES_OK,
        'https://example.test/science.pdf': BYTES_A_CHANGED,
      }),
    })

    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    expect(lock.sources['science-x'].sha256).toBe(SHA_A)
  })

  it('accepts new bytes when the slug is not in the lock yet', async () => {
    await mkdir(outDir, { recursive: true })
    await writeFile(lockPath, JSON.stringify({ sources: {} }), 'utf8')

    const result = await fetchAll({
      manifest: [MANIFEST_TWO[0]], outDir, lockPath,
      fetchImpl: fakeFetch(ROUTES_OK), now: () => FIXED_NOW,
    })

    expect(result.drifted).toEqual([])
    expect(result.written).toEqual(['science-x'])
  })
})

describe('fetchAll — failures leave nothing behind', () => {
  it('writes no file when the response is not ok', async () => {
    const result = await fetchAll({
      manifest: [{ slug: 'missing', url: 'https://example.test/gone.pdf' }],
      outDir, lockPath, now: () => FIXED_NOW,
      fetchImpl: fakeFetch({}),
    })

    expect(existsSync(join(outDir, 'missing.pdf'))).toBe(false)
    expect(result.failed).toEqual([{ slug: 'missing', reason: 'HTTP 404' }])
  })

  it('writes no partial file when the body fails mid-stream', async () => {
    const result = await fetchAll({
      manifest: [{ slug: 'truncated', url: 'https://example.test/half.pdf' }],
      outDir, lockPath, now: () => FIXED_NOW,
      fetchImpl: fakeFetch({ 'https://example.test/half.pdf': 'STREAM_FAILS' }),
    })

    expect(existsSync(join(outDir, 'truncated.pdf'))).toBe(false)
    expect(result.failed).toEqual([{ slug: 'truncated', reason: 'socket hang up' }])
  })

  it('keeps going after one failure and still fetches the rest', async () => {
    const result = await fetchAll({
      manifest: [
        { slug: 'missing', url: 'https://example.test/gone.pdf' },
        { slug: 'maths-x', url: 'https://example.test/maths.pdf' },
      ],
      outDir, lockPath, now: () => FIXED_NOW,
      fetchImpl: fakeFetch(ROUTES_OK),
    })

    expect(result.written).toEqual(['maths-x'])
    expect(await readFile(join(outDir, 'maths-x.pdf'), 'utf8')).toBe(BYTES_B)
  })
})

describe('fetchAll — a slug may not escape outDir', () => {
  it('refuses a slug containing a path separator', async () => {
    const result = await fetchAll({
      manifest: [{ slug: '../escape', url: 'https://example.test/science.pdf' }],
      outDir, lockPath, now: () => FIXED_NOW,
      fetchImpl: fakeFetch(ROUTES_OK),
    })

    expect(result.failed).toEqual([
      { slug: '../escape', reason: 'unsafe slug: must match /^[a-z0-9][a-z0-9-]*$/' },
    ])
  })

  it('writes nothing above outDir when a slug tries to escape', async () => {
    const result = await fetchAll({
      manifest: [{ slug: '../escape', url: 'https://example.test/science.pdf' }],
      outDir, lockPath, now: () => FIXED_NOW,
      fetchImpl: fakeFetch(ROUTES_OK),
    })

    /* Evidence first: a run that did nothing at all also wrote nothing above
     * outDir. Require the refusal to have actually been recorded. */
    expect(result.failed.map((f) => f.slug)).toEqual(['../escape'])
    expect(existsSync(join(dir, 'escape.pdf'))).toBe(false)
  })
})

describe('the CLI --verify mode', () => {
  it('exits 1 and prints its own banner when a file on disk no longer matches the lock', async () => {
    /* --verify is a real, offline code path: re-hash what is on disk and
     * compare with the lock. CI runs it to prove the PDFs the build parsed are
     * the PDFs that were reviewed.
     *
     * The banner assertion is load bearing. A missing script, a syntax error,
     * and a genuine drift refusal all exit non-zero; only one of them says so. */
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'science-x.pdf'), BYTES_A, 'utf8')
    await writeFile(lockPath, JSON.stringify({
      sources: {
        'science-x': {
          url: 'https://example.test/science.pdf',
          file: 'science-x.pdf',
          sha256: SHA_A_CHANGED,
          bytes: 19,
          fetchedAt: FIXED_NOW,
        },
      },
    }), 'utf8')

    let code = 0
    let stdout = ''
    try {
      const r = await run(process.execPath, [SCRIPT, '--verify'], {
        env: { ...process.env, CURRICULUM_LOCK: lockPath, CURRICULUM_OUT: outDir },
      })
      stdout = r.stdout
    } catch (err) {
      code = err.code
      stdout = err.stdout ?? ''
    }

    expect(code).toBe(1)
    expect(stdout).toContain('CURRICULUM SOURCE DRIFT')
    expect(stdout).toContain('science-x')
  })

  it('exits 0 and says so when every file on disk matches the lock', async () => {
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'science-x.pdf'), BYTES_A, 'utf8')
    await writeFile(lockPath, JSON.stringify({
      sources: {
        'science-x': {
          url: 'https://example.test/science.pdf',
          file: 'science-x.pdf',
          sha256: SHA_A,
          bytes: 11,
          fetchedAt: FIXED_NOW,
        },
      },
    }), 'utf8')

    const r = await run(process.execPath, [SCRIPT, '--verify'], {
      env: { ...process.env, CURRICULUM_LOCK: lockPath, CURRICULUM_OUT: outDir },
    })

    expect(r.stdout).toContain('CURRICULUM SOURCES VERIFIED')
    expect(r.stdout).toContain('1 source')
  })

  it('exits 1 when a locked file is missing from disk entirely', async () => {
    await mkdir(outDir, { recursive: true })
    await writeFile(lockPath, JSON.stringify({
      sources: {
        'science-x': {
          url: 'https://example.test/science.pdf',
          file: 'science-x.pdf', sha256: SHA_A, bytes: 11, fetchedAt: FIXED_NOW,
        },
      },
    }), 'utf8')

    let code = 0
    let stdout = ''
    try {
      const r = await run(process.execPath, [SCRIPT, '--verify'], {
        env: { ...process.env, CURRICULUM_LOCK: lockPath, CURRICULUM_OUT: outDir },
      })
      stdout = r.stdout
    } catch (err) {
      code = err.code
      stdout = err.stdout ?? ''
    }

    expect(code).toBe(1)
    expect(stdout).toContain('missing')
  })
})
