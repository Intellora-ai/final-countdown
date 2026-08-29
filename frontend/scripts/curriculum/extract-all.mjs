#!/usr/bin/env node
/**
 * RUN THE EXTRACTOR OVER EVERY OFFICIAL SOURCE
 *
 * Reads the lock, converts each PDF to text twice — `-layout` for tables and
 * `-raw` for documents whose tables are only legible in reading order — and
 * writes one structured record per source.
 *
 * WHY A REGRESSION GATE AND NOT A COVERAGE TARGET
 *     A percentage would be satisfied by 36 of 37 forever. What matters is that
 *     a subject which reads correctly today still reads correctly tomorrow, so
 *     the gate fails on any document that yields no topics and is not on the
 *     written exception list.
 *
 * WHY THE EXCEPTION LIST HAS REASONS ATTACHED
 *     An entry with no reason is one nobody can ever review. Each entry says
 *     what was tried and why it failed, and a test refuses a reason too short
 *     to be useful.
 */

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { extractDocument } from './extract.mjs'

const exec = promisify(execFile)

/**
 * Documents no available extraction mode can read, with what was tried.
 * Adding to this is a deliberate line in a diff, never a silent zero.
 */
export const KNOWN_UNREADABLE = {
  'physical-education':
    'The unit-name column is split one word per line and interleaved with three ' +
    'other columns. Tried -layout field splitting, -layout fixed column slicing ' +
    'from the header spans, and -raw reading order; all three produced corrupted ' +
    'titles such as "Physical Educationaims, and gy-based". Needs manual entry.',
}

async function pdfText(run, pdfPath, mode) {
  const args = mode === 'raw' ? ['-raw', pdfPath, '-'] : ['-layout', pdfPath, '-']
  try {
    const result = await run('pdftotext', args)
    return typeof result === 'string' ? result : (result?.stdout ?? '')
  } catch {
    /* A source that will not convert is not a crash: it becomes a document with
     * no topics, which the regression gate then reports by name. */
    return ''
  }
}

export async function extractAll({ sources, pdfDir, run }) {
  const documents = []
  for (const source of sources) {
    const pdfPath = join(pdfDir, source.file)
    const text = await pdfText(run, pdfPath, 'layout')
    const rawText = await pdfText(run, pdfPath, 'raw')
    documents.push(extractDocument({ slug: source.slug, text, rawText }))
  }

  const regressions = documents
    .filter((d) => d.topics.length === 0 && !(d.slug in KNOWN_UNREADABLE))
    .map((d) => d.slug)

  const recovered = documents
    .filter((d) => d.topics.length > 0 && d.slug in KNOWN_UNREADABLE)
    .map((d) => d.slug)

  const summary = {
    documents: documents.length,
    topics: documents.reduce((n, d) => n + d.topics.length, 0),
    concepts: documents.reduce((n, d) => n + (d.concepts?.length ?? 0), 0),
    withMarks: documents.reduce((n, d) => n + d.topics.filter((t) => t.marks !== null).length, 0),
    withHours: documents.reduce((n, d) => n + d.topics.filter((t) => t.hours != null).length, 0),
    needingReview: documents.filter((d) => d.needsReview.length > 0).length,
  }

  return { documents, regressions, recovered, summary }
}

/* ---------------------------------------------------------------- CLI ---- */

const DEFAULT_PDFS = fileURLToPath(new URL('../../../data/source-pdfs/', import.meta.url))
const DEFAULT_LOCK = fileURLToPath(new URL('../../../data/curriculum-sources.lock.json', import.meta.url))
const DEFAULT_OUT = fileURLToPath(new URL('../../../data/curriculum-extracted.json', import.meta.url))

async function main() {
  const lockPath = process.env['CURRICULUM_LOCK'] ?? DEFAULT_LOCK
  const pdfDir = process.env['CURRICULUM_OUT'] ?? DEFAULT_PDFS
  const outPath = process.env['CURRICULUM_EXTRACT_OUT'] ?? DEFAULT_OUT

  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  const sources = Object.entries(lock.sources).map(([slug, record]) => ({ slug, file: record.file }))

  const { documents, regressions, recovered, summary } = await extractAll({
    sources,
    pdfDir,
    run: (cmd, args) => exec(cmd, args, { maxBuffer: 64 * 1024 * 1024 }).then((r) => r.stdout),
  })

  await writeFile(outPath, `${JSON.stringify({ summary, documents }, null, 2)}\n`, 'utf8')

  console.log(`CURRICULUM EXTRACTED — ${summary.documents} documents, ${summary.topics} topics`)
  console.log(`  atomic concepts: ${summary.concepts}`)
  console.log(`  topics carrying marks: ${summary.withMarks}`)
  console.log(`  topics carrying study hours: ${summary.withHours}`)
  console.log(`  documents with review notes: ${summary.needingReview}`)
  for (const slug of recovered) {
    console.log(`  NOW READABLE: ${slug} — remove it from KNOWN_UNREADABLE.`)
  }
  for (const slug of Object.keys(KNOWN_UNREADABLE)) {
    if (!recovered.includes(slug)) console.log(`  known unreadable: ${slug}`)
  }

  if (regressions.length > 0) {
    console.log('')
    console.log('CURRICULUM EXTRACTION REGRESSION')
    for (const slug of regressions) {
      console.log(`  ${slug} yielded no topics and is not a known exception.`)
    }
    return 1
  }
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.log(`curriculum extract: ${err.message}`)
      process.exit(1)
    },
  )
}
