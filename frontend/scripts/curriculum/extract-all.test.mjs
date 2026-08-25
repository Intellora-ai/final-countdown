/* Tests for extract-all.mjs — running the extractor over every source.
 *
 * DESIRED OUTCOME
 *   One command turns the 37 official PDFs into structured data, and the build
 *   fails if a subject that used to be readable stops being readable.
 *
 * WHY THERE IS AN EXPLICIT LIST OF UNREADABLE DOCUMENTS
 *   One document (Physical Education) cannot be read by any extraction mode
 *   available: its table cells are split one word per line and interleaved with
 *   other columns, so every reconstruction produced corrupted titles. Failing
 *   the build forever on a known, accepted limitation would make the gate noise,
 *   and a noisy gate gets switched off. Listing it makes the exception a
 *   deliberate line in a diff instead of a silent zero.
 *
 *   The list is not a mute button: a document that is NOT on it and yields no
 *   topics fails the run, because that is a regression.
 */

import { describe, expect, it } from 'vitest'
import { extractAll, KNOWN_UNREADABLE } from './extract-all.mjs'

/* A fake `pdftotext`: slug + mode -> text. */
function fakeRun(texts) {
  return async (_cmd, args) => {
    const mode = args.includes('-raw') ? 'raw' : 'layout'
    const file = args[args.length - 2]
    const slug = file.replace(/^.*\//, '').replace(/\.pdf$/, '')
    return texts[`${slug}:${mode}`] ?? ''
  }
}

const CLEAN_TABLE = [
  'COURSE STRUCTURE',
  '   Units   Unit Name    Marks',
  '     I     ALPHA          40',
  '     II    BETA           40',
  '           Total          80',
].join('\n')

describe('extractAll', () => {
  it('returns one document per source in the lock', async () => {
    const result = await extractAll({
      sources: [
        { slug: 'alpha', file: 'alpha.pdf' },
        { slug: 'beta', file: 'beta.pdf' },
      ],
      pdfDir: '/pdfs',
      run: fakeRun({ 'alpha:layout': CLEAN_TABLE, 'beta:layout': CLEAN_TABLE }),
    })
    expect(result.documents.map((d) => d.slug)).toEqual(['alpha', 'beta'])
  })

  it('extracts the topics from each source', async () => {
    const result = await extractAll({
      sources: [{ slug: 'alpha', file: 'alpha.pdf' }],
      pdfDir: '/pdfs',
      run: fakeRun({ 'alpha:layout': CLEAN_TABLE }),
    })
    expect(result.documents[0].topics.map((t) => t.title)).toEqual(['ALPHA', 'BETA'])
  })

  it('counts the totals across every document', async () => {
    const result = await extractAll({
      sources: [
        { slug: 'alpha', file: 'alpha.pdf' },
        { slug: 'beta', file: 'beta.pdf' },
      ],
      pdfDir: '/pdfs',
      run: fakeRun({ 'alpha:layout': CLEAN_TABLE, 'beta:layout': CLEAN_TABLE }),
    })
    expect(result.summary).toMatchObject({ documents: 2, topics: 4 })
  })

  it('reports a document with no topics as a regression', async () => {
    const result = await extractAll({
      sources: [{ slug: 'went-blank', file: 'went-blank.pdf' }],
      pdfDir: '/pdfs',
      run: fakeRun({ 'went-blank:layout': 'prose only' }),
    })
    expect(result.regressions).toEqual(['went-blank'])
  })

  it('does NOT report a known-unreadable document as a regression', async () => {
    const known = Object.keys(KNOWN_UNREADABLE)[0]
    const result = await extractAll({
      sources: [{ slug: known, file: `${known}.pdf` }],
      pdfDir: '/pdfs',
      run: fakeRun({}),
    })
    expect(result.regressions).toEqual([])
  })

  it('notices when a known-unreadable document starts working', async () => {
    /* The list must not rot. A document that becomes readable is reported so it
     * can be taken off the list, but it does not fail the run. */
    const known = Object.keys(KNOWN_UNREADABLE)[0]
    const result = await extractAll({
      sources: [{ slug: known, file: `${known}.pdf` }],
      pdfDir: '/pdfs',
      run: fakeRun({ [`${known}:layout`]: CLEAN_TABLE }),
    })
    expect(result.recovered).toEqual([known])
    expect(result.regressions).toEqual([])
  })

  it('passes the raw text through so raw-only documents are readable', async () => {
    const result = await extractAll({
      sources: [{ slug: 'rawonly', file: 'rawonly.pdf' }],
      pdfDir: '/pdfs',
      run: fakeRun({
        'rawonly:layout': 'nothing useful here',
        'rawonly:raw': 'Chapter 1- Development\nChapter 2- Sectors',
      }),
    })
    expect(result.documents[0].topics.map((t) => t.title)).toEqual(['Development', 'Sectors'])
  })

  it('carries every needsReview note into the output', async () => {
    const result = await extractAll({
      sources: [{ slug: 'odd', file: 'odd.pdf' }],
      pdfDir: '/pdfs',
      run: fakeRun({
        'odd:layout': ['COURSE STRUCTURE', '  I   ALPHA   10', '  II  BETA    20', '      Total   80'].join('\n'),
      }),
    })
    expect(result.documents[0].needsReview)
      .toContain('unit marks sum to 30 but the document prints Total 80')
  })

  it('keeps every known-unreadable entry paired with a written reason', async () => {
    /* An entry with no reason is an entry nobody can review later. */
    for (const [slug, reason] of Object.entries(KNOWN_UNREADABLE)) {
      expect(typeof reason, `${slug} has no reason`).toBe('string')
      expect(reason.length, `${slug}'s reason is too short to be useful`).toBeGreaterThan(30)
    }
  })
})
