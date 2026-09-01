/*
 * A TABLE ROW THAT SAYS WHAT ITS OWN NAME MEANS IS A DEFINITION.
 *
 * MEASURED, ON THE LESSON WHOSE JOB IS TO NAME THE PARTS OF A LOGARITHM.
 * "what is the base" and "what is the argument" -- two of the three words
 * `logarithms` exists to teach, both typed the way a child types them -- came
 * back as REFUSALS. Not near misses: the refusal itself offered `the-parts` as
 * somewhere to look, and `the-parts` is the block that answers them, holding
 * the row
 *
 *     Base | 2 | the number doing the multiplying
 *
 * `answersADefinition` in `doubt.ts` reads `describes` -- a block's title, the
 * representation it declares itself to be, and the prose it carries -- and a
 * table's rows were in none of the three. So the rule that exists to stop the
 * resolver echoing a bare label back was throwing away the one shape of label
 * that is not bare: a row whose neighbouring cells are the author's own words
 * about the name in the first one.
 *
 * IT COST THE WHOLE QUESTION, NOT JUST THE BEST ANSWER. "what is the base" is
 * one content word. A one-word doubt cannot reach the sentence strategies
 * either -- `MIN_SENTENCE_WORDS` is two -- so discarding the name match was the
 * end of it. "What is X", X being one word, is the commonest thing a stuck
 * learner types and it had no path to an answer at all.
 *
 * BOTH HALVES ARE HERE, AND EITHER ONE ALONE IS VACUOUS.
 * A resolver that refuses every definition ask passes the second describe
 * block. A resolver that answers every definition ask passes the first.
 *
 * WHAT THE SECOND HALF IS PROTECTING. `glossaryNames` is not "every table row".
 * The row has to say something in WORDS that the name does not already say,
 * because the alternative -- any row name counts -- turns two tables that
 * define nothing into answers:
 *
 *   what-changes  Mean particle speed (m/s) | 484 | 684 | 41.4   measures it
 *   chambers      Vote of no confidence | Yes | No               tabulates it
 *
 * Neither table ever says what a mean particle speed or a vote of no
 * confidence IS, and a learner handed one has gained a number or a "Yes".
 *
 * THE FOUR MUTANTS THIS FILE WAS BUILT AGAINST, AND WHAT EACH DID.
 *   `const explained = true || ...`            all three refusals answered
 *   drop the `!inTheName.has(token)` clause    all three refusals answered
 *     (the naming cell is itself a text cell, so without that clause every
 *      row explains itself)
 *   drop `column.type !== 'text'`              the third refusal answered
 *   never add `glossaryNames` to `describes`   all three answers refused
 * Before this file existed the first of them turned not one test in
 * `src/canvas` red.
 */
import { describe, expect, it } from 'vitest'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { gasPressure } from '../lessons/gasPressure'
import { logarithms } from '../lessons/logarithms'
import type { Block, Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'
import type { Resolution } from './contract'
import { lessonResolver } from './doubt'

function lessonOf(spec: unknown, teaching: 'lesson' | 'off' = 'lesson'): Lesson {
  const result = validateLesson(spec, { teaching })
  if (!result.ok) throw new Error(`fixture does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

const LOGS = lessonOf(logarithms)
const GAS = lessonOf(gasPressure)
const BILL = lessonOf(billBecomesLaw)

/** The learner is always somewhere, and none of this may depend on where. */
function ask(lesson: Lesson, text: string): Resolution {
  return lessonResolver.resolve({ text, atBeatId: lesson.blocks[0]?.id ?? 'unknown' }, lesson)
}

function refusalTo(lesson: Lesson, text: string): { reason: string; nearest: readonly string[] } {
  const resolution = ask(lesson, text)
  if (resolution.kind !== 'refusal')
    throw new Error(`expected a refusal to "${text}", answered from ${resolution.drawnFrom.join(', ')}`)
  return resolution
}

describe('a table row that explains its own name answers a definition ask', () => {
  for (const [text, part] of [
    ['what is the base', 'Base'],
    ['what is the argument', 'Argument'],
    ['what is the value', 'Value'],
  ] as const) {
    it(`answers "${text}" with the table that names the parts`, () => {
      const resolution = ask(LOGS, text)
      if (resolution.kind !== 'answer') throw new Error(`refused: ${resolution.reason}`)

      expect(resolution.drawnFrom).toEqual(['the-parts'])

      /* The row has to SURVIVE into the answer, or "answered" means nothing:
         its last cell is the author's sentence about that part, and those are
         the words the learner did not already have. */
      const table = resolution.lesson.blocks.find((block: Block) => block.kind === 'table')
      if (!table || table.kind !== 'table') throw new Error('expected the table itself')
      const row = table.rows.find((candidate) => candidate.part === part)
      expect(row, `the row naming ${part} did not survive into the answer`).toBeDefined()
      expect(typeof row?.job === 'string' ? row.job : '').toMatch(/\S/)
    })
  }
})

describe('a row that only measures or tabulates its name is not a definition', () => {
  it('refuses "what is mean particle speed" and points at the table anyway', () => {
    /* `Mean particle speed (m/s)` is a row of `what-changes`, and the only
       other cells in it are 484, 684 and 41.4. The gas lesson never says what
       a mean particle speed is, and three numbers do not amount to saying it. */
    const refusal = refusalTo(GAS, 'what is mean particle speed')

    // Proof the row was there to be grabbed at, and was still not answered with.
    expect(refusal.nearest).toContain('what-changes')
    expect(refusal.reason.length).toBeGreaterThan(20)
  })

  it('refuses "what is a vote of no confidence" where the row is only Yes and No', () => {
    /* `chambers` tabulates which House may do what. Its row for a vote of no
       confidence reads Yes | No -- which says where the power sits and never
       once what the power is. Both cells are text; neither carries a content
       word ("yes" and "no" are stopwords), which is why the rule is about
       WORDS and not about a non-empty cell. */
    const refusal = refusalTo(BILL, 'what is a vote of no confidence')

    expect(refusal.nearest).toContain('chambers')
  })

  it('reads only the text columns, so a number written as a string is still a number', () => {
    /*
     * THE GUARD THAT NO AUTHORED LESSON REACHES, HELD ANYWAY.
     *
     * `firstTextCell` picks the name out of the `text` columns only, and
     * `glossaryNames` asks the same of the cell that explains it. The three
     * shipped lessons all store their numbers as numbers, so `typeof value !==
     * 'string'` alone would carry them and the column-type check would be
     * decoration. It is not decoration: a `number` column MAY hold a string,
     * and "484" beside "Mean particle speed" is still a measurement.
     *
     * So the case is written out. `readings` is exactly `what-changes` with its
     * numbers quoted, and it must refuse for the same reason `what-changes`
     * does. Delete `column.type !== 'text'` and this test alone goes red.
     */
    const readings = lessonOf(
      {
        id: 'readings',
        question: 'What did the gas do when it was heated?',
        subject: 'Physics',
        blocks: [
          {
            id: 'readings-table',
            kind: 'table',
            title: 'What changed',
            emphasis: 'primary',
            tone: 'neutral',
            columns: [
              { key: 'quantity', label: 'Quantity', type: 'text' },
              { key: 'at300', label: 'At 300 K', type: 'number' },
              { key: 'at600', label: 'At 600 K', type: 'number' },
            ],
            rows: [
              { quantity: 'Mean particle speed', at300: '484', at600: '684' },
              { quantity: 'Volume', at300: '24', at600: '24' },
            ],
            caption: 'Two readings, taken three hundred kelvin apart.',
          },
        ],
        relations: [],
      },
      'off',
    )

    const refusal = refusalTo(readings, 'what is mean particle speed')
    expect(refusal.nearest).toContain('readings-table')
  })
})
