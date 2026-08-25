/**
 * A lesson heading is what the learner reads first. It must be readable.
 *
 * WHAT WENT WRONG
 * ---------------
 * The heading was the curriculum concept name, rendered raw. On 2026-08-26 a
 * real lesson opened with:
 *
 *   "Fundamental Theorem of Arithmetic - statements after reviewing work done
 *    earlier and after illustrating and motivating through examples"
 *
 * Everything after the dash is an instruction to a TEACHER, lifted out of the
 * syllabus. The learner is asked to read it as a title.
 *
 * Measured across `src/data/curriculum/class*.ts`: 984 of 4589 concept names
 * are over 60 characters, and the long tail includes exam questions, mark
 * schemes and raw textbook prose. This is not one bad row.
 *
 * WHAT THIS FIXES, AND WHAT IT DOES NOT
 * -------------------------------------
 * This makes the HEADING readable. It does not repair the data — the extractor
 * that produced those names is the real defect and it is a separate, larger
 * job. Trimming at render is honest as long as nobody claims the data is fixed.
 */

import { describe, expect, it } from 'vitest'

import { conceptHeading } from './conceptHeading'

describe('teacher instructions are not a title', () => {
  it('drops the syllabus tail after a dash', () => {
    expect(
      conceptHeading(
        'Fundamental Theorem of Arithmetic - statements after reviewing work done ' +
          'earlier and after illustrating and motivating through examples',
      ),
    ).toBe('Fundamental Theorem of Arithmetic')
  })

  it('keeps a short name that has no tail', () => {
    expect(conceptHeading('Pythagoras Theorem')).toBe('Pythagoras Theorem')
  })

  it('keeps a hyphenated term rather than cutting it in half', () => {
    /* The pair that stops this becoming "split on the first hyphen". A real
       concept name contains hyphens and losing half of one is a worse bug than
       the one being fixed. */
    expect(conceptHeading('Non-terminating repeating decimals')).toBe(
      'Non-terminating repeating decimals',
    )
  })
})

describe('a sentence is not a title', () => {
  it('takes the first clause of a name that is really prose', () => {
    expect(
      conceptHeading(
        'Use the Venn diagram given below to answer the questions that follow. ' +
          'Hint: You can find sets A, B, C and universal set U.',
      ),
    ).toBe('Use the Venn diagram given below to answer the questions that follow')
  })

  it('never returns something longer than a heading can be', () => {
    const monster =
      'Report File + viva (10 marks) Report file:-- 4 documents each with a word ' +
      'processor, spreadsheet, and presentation tool covering every topic taught'
    const out = conceptHeading(monster)
    expect(out.length).toBeLessThanOrEqual(70)
  })

  it('cuts on a word boundary, never mid-word', () => {
    /* THIS ASSERTION WAS WRONG WHEN FIRST WRITTEN, and is corrected here rather
       than quietly deleted.
       The original check was `expect(out).not.toMatch(/\w…$/)` — "must not end
       with a word character before the ellipsis". That flags "tracker…", which
       is a CORRECT cut, exactly as hard as it flags "compr…", which is the bug.
       Every clean word-boundary cut ends in a word character, so the check
       could never pass and was testing nothing about boundaries.
       The real question is where the cut LANDED in the original string: if the
       next character there is a space, a whole word was kept. That is what
       "word boundary" means, and it distinguishes the two cases. */
    const monster = 'Personal Budgeting: Designing a comprehensive monthly budget tracker in a spreadsheet'
    const out = conceptHeading(monster)
    const stem = out.replace(/…$/, '')
    expect(monster.startsWith(stem)).toBe(true)
    expect(monster[stem.length]).toBe(' ')
  })
})

describe('it never returns nothing', () => {
  it('falls back to the raw id when the name is empty', () => {
    /* A blank heading is worse than an ugly one: the learner cannot tell what
       the page is, and there is nothing to report. */
    expect(conceptHeading('', 'real-numbers--euclid')).toBe('real-numbers--euclid')
  })

  it('returns the trimmed name when there is no id either', () => {
    expect(conceptHeading('  Sets  ')).toBe('Sets')
  })
})
