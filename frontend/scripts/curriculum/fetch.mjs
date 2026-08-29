#!/usr/bin/env node
/**
 * CURRICULUM SOURCE FETCHER
 *
 * Downloads the official syllabus PDFs and records a SHA-256 for each, so that
 * every fact the app later teaches can be traced back to a specific published
 * document rather than to somebody's typing.
 *
 * WHY A LOCK FILE AND NOT JUST THE PDFs
 *     The PDFs are large binaries and are not committed. The lock IS the
 *     committed record: it says which document was reviewed and what its bytes
 *     hashed to. `--verify` re-checks the working copy against it.
 *
 * WHY DRIFT DOES NOT UPDATE THE LOCK
 *     A board can revise a syllabus mid-year. When that happens the correct
 *     response is a human re-reading the changed chapters, not a silent
 *     re-hash. Overwriting the locked digest on drift would erase the only
 *     evidence that a review is owed, so `fetchAll` reports drift and leaves
 *     the recorded digest exactly as it was.
 *
 * WHY WRITES ARE ATOMIC
 *     A half-written PDF still parses. It parses into half a syllabus, and a
 *     student then studies a course with chapters missing. Bytes are hashed in
 *     memory and written to a temporary file that is renamed into place only
 *     once complete, so an interrupted download leaves nothing behind.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A slug becomes a filename, so it may not contain anything path-like. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/
const UNSAFE_SLUG_REASON = 'unsafe slug: must match /^[a-z0-9][a-z0-9-]*$/'

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readLock(lockPath) {
  try {
    const parsed = JSON.parse(await readFile(lockPath, 'utf8'))
    return parsed && typeof parsed === 'object' && parsed.sources ? parsed : { sources: {} }
  } catch {
    /* No lock yet, or an unreadable one. Either way this run establishes it.
     * Not a swallowed failure: the absence of a lock is a real, expected state
     * on a first run, and the returned value carries that meaning forward. */
    return { sources: {} }
  }
}

/**
 * Download every manifest entry, hash it, and reconcile against the lock.
 *
 * @returns {Promise<{written: string[], drifted: Array<{slug,was,now}>, failed: Array<{slug,reason}>}>}
 */
export async function fetchAll({ manifest, outDir, lockPath, fetchImpl, now }) {
  const at = typeof now === 'function' ? now : () => new Date().toISOString()
  const get = fetchImpl ?? globalThis.fetch

  const lock = await readLock(lockPath)
  const written = []
  const drifted = []
  const failed = []

  await mkdir(outDir, { recursive: true })

  for (const entry of manifest) {
    const { slug, url } = entry

    if (!SAFE_SLUG.test(slug)) {
      failed.push({ slug, reason: UNSAFE_SLUG_REASON })
      continue
    }

    let bytes
    try {
      const response = await get(url)
      if (!response.ok) {
        failed.push({ slug, reason: `HTTP ${response.status}` })
        continue
      }
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (err) {
      failed.push({ slug, reason: err.message })
      continue
    }

    const digest = sha256(bytes)
    const recorded = lock.sources[slug]

    if (recorded && recorded.sha256 !== digest) {
      /* Drift. Keep the file we already trust, keep the locked digest, and
       * report. Nothing downstream should move until a human has looked. */
      drifted.push({ slug, was: recorded.sha256, now: digest })
      continue
    }

    const file = `${slug}.pdf`
    const finalPath = join(outDir, file)
    const tempPath = `${finalPath}.partial`
    try {
      await writeFile(tempPath, bytes)
      await rename(tempPath, finalPath)
    } catch (err) {
      await unlink(tempPath).catch(() => {})
      failed.push({ slug, reason: err.message })
      continue
    }

    lock.sources[slug] = {
      url,
      file,
      sha256: digest,
      bytes: bytes.length,
      fetchedAt: at(),
    }
    written.push(slug)
  }

  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
  return { written, drifted, failed }
}

/**
 * Offline check: re-hash what is on disk and compare with the lock.
 * @returns {Promise<{ok: string[], drifted: Array<{slug,was,now}>, missing: string[]}>}
 */
export async function verify({ outDir, lockPath }) {
  const lock = await readLock(lockPath)
  const ok = []
  const drifted = []
  const missing = []

  for (const [slug, record] of Object.entries(lock.sources)) {
    let bytes
    try {
      bytes = await readFile(join(outDir, record.file))
    } catch {
      /* Recorded but absent. Reported, not swallowed. */
      missing.push(slug)
      continue
    }
    const digest = sha256(bytes)
    if (digest === record.sha256) ok.push(slug)
    else drifted.push({ slug, was: record.sha256, now: digest })
  }

  return { ok, drifted, missing }
}

/* ---------------------------------------------------------------- CLI ---- */

const DEFAULT_OUT = fileURLToPath(new URL('../../../data/source-pdfs/', import.meta.url))
const DEFAULT_LOCK = fileURLToPath(new URL('../../../data/curriculum-sources.lock.json', import.meta.url))

async function main(argv) {
  const outDir = process.env['CURRICULUM_OUT'] ?? DEFAULT_OUT
  const lockPath = process.env['CURRICULUM_LOCK'] ?? DEFAULT_LOCK

  if (argv.includes('--verify')) {
    const { ok, drifted, missing } = await verify({ outDir, lockPath })

    if (drifted.length === 0 && missing.length === 0) {
      console.log(`CURRICULUM SOURCES VERIFIED — ${ok.length} source${ok.length === 1 ? '' : 's'} match the lock.`)
      return 0
    }

    console.log('CURRICULUM SOURCE DRIFT')
    for (const slug of missing) {
      console.log(`  missing: ${slug} — recorded in the lock but not on disk. Run without --verify to fetch it.`)
    }
    for (const d of drifted) {
      console.log(`  changed: ${d.slug}`)
      console.log(`    locked: ${d.was}`)
      console.log(`    ondisk: ${d.now}`)
    }
    console.log('')
    console.log('A locked source no longer matches. Re-read the changed chapters before')
    console.log('rebuilding the curriculum, then update the lock deliberately.')
    return 1
  }

  const { MANIFEST } = await import('./manifest.mjs')
  const { written, drifted, failed } = await fetchAll({ manifest: MANIFEST, outDir, lockPath })

  console.log(`fetched ${written.length} source${written.length === 1 ? '' : 's'}`)
  for (const f of failed) console.log(`  FAILED  ${f.slug}: ${f.reason}`)

  if (drifted.length > 0) {
    console.log('')
    console.log('CURRICULUM SOURCE DRIFT')
    for (const d of drifted) {
      console.log(`  changed: ${d.slug}`)
      console.log(`    locked: ${d.was}`)
      console.log(`    remote: ${d.now}`)
    }
    return 1
  }
  return failed.length > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.log(`curriculum fetch: ${err.message}`)
      process.exit(1)
    },
  )
}
