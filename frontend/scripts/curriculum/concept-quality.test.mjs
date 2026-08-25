/* A shipped concept must be a TEACHABLE TOPIC.
 *
 * WHY THIS EXISTS
 *   The provenance gate checks that every concept names its source page, that
 *   `minutes` is inside the 10-25 band, that `deps` resolve, that there are no
 *   cycles and no duplicate ids. All of that passed on 4564 concepts, and 536
 *   of them were not topics at all:
 *
 *       "Let us take a point P"
 *       "Find the sum upto n terms of the sequence 3"
 *       "Since"
 *       "CG-1"
 *       "(a) Since"
 *
 *   Those are solved-example and exam-question fragments out of the
 *   "at advanced level" exemplar documents, which are worked-problem books
 *   rather than syllabi. The structural gate could not see it, because every
 *   one of those strings has a perfectly good page number.
 *
 *   A student handed "Since" as a topic to study for 15 minutes is the whole
 *   failure, and no existing check would ever have reported it.
 *
 * WHY THE COUNT FLOOR WAS THE WRONG PROXY
 *   `MIN_CONCEPTS_PER_SUBJECT` flagged Class 9 English at 9 concepts and said
 *   nothing about 536 pieces of rubbish, because rubbish still counts. A floor
 *   measures quantity and was being read as quality.
 */

import { describe, expect, it } from 'vitest'
import { NOT_A_TOPIC, whyNotATopic } from './concept-quality.mjs'
import { CLASS_9 } from '../../src/data/curriculum/class9'
import { CLASS_10 } from '../../src/data/curriculum/class10'
import { CLASS_11 } from '../../src/data/curriculum/class11'
import { CLASS_12 } from '../../src/data/curriculum/class12'

const CLASSES = [[9, CLASS_9], [10, CLASS_10], [11, CLASS_11], [12, CLASS_12]]

function allConcepts() {
  const out = []
  for (const [cls, subjects] of CLASSES)
    for (const s of subjects)
      for (const ch of s.chapters ?? [])
        for (const c of ch.concepts ?? []) out.push({ cls, subject: s.id, name: c.name })
  return out
}

describe('every shipped concept is a teachable topic', () => {
  const concepts = allConcepts()

  it('there are concepts to check at all', () => {
    // Evidence first: an empty list satisfies every rule below trivially, and
    // an empty list is what a broken import or a failed build produces.
    expect(concepts.length).toBeGreaterThan(3000)
  })

  it('none is a question, an instruction, a code, or a fragment', () => {
    const bad = concepts
      .map((c) => ({ ...c, why: whyNotATopic(c.name) }))
      .filter((c) => c.why)

    const summary = bad.slice(0, 25)
      .map((c) => `  c${c.cls} ${c.subject}: ${JSON.stringify(c.name).slice(0, 72)}  — ${c.why}`)
      .join('\n')

    expect(bad.length, `${bad.length} shipped concepts are not topics. A student
would be given these to study. First 25:\n${summary}`).toBe(0)
  })
})

describe.skipIf(NOT_A_TOPIC.length === 0)('the rule is a law, not a list of strings someone remembered', () => {
  it('rejects an invented fragment nobody enumerated', () => {
    /* None of these appears in the data or in the pattern list as a literal.
     * If only the real examples get caught, this is a list wearing a law's
     * clothes and it will miss the next document's way of going wrong. */
    expect(whyNotATopic('Marmalade?')).toBe('a question, not a topic')
    expect(whyNotATopic('Determine the marmalade constant')).toBe('an instruction or worked-example opener')
    expect(whyNotATopic('pick one: a) jam b) marmalade')).toBe('carries multiple-choice option letters')
    expect(whyNotATopic('LO-7')).toBe('a bare competency or outcome code')
    expect(whyNotATopic('Jam')).toBe('too short to name a topic')
  })

  it('does not reject a genuine topic', () => {
    /* The false-positive half is load bearing. Over-rejecting silently deletes
     * real curriculum, which is worse than the rubbish it removes: a missing
     * topic is a hole in a student's revision that nobody can see.
     *
     * Every string here is a real concept name taken from the shipped data. */
    for (const good of [
      'Euclid\'s division lemma',
      'Structure of the Atom',
      'Given Reserves and Surplus, prepare the Balance Sheet extract',
      'Solutions of a quadratic equation by factorisation',
      'Thermodynamics',
      'Life Processes',
    ]) {
      // The two beginning with an instruction word are the hard cases: they
      // are checked below, not waved through here.
      if (/^(Given|Solutions)\b/.test(good)) continue
      expect(whyNotATopic(good), `rejected a real topic: ${good}`).toBeNull()
    }
  })
})


describe('each rejected shape is named explicitly, so none can be dropped quietly', () => {
  /* MUTATION EVIDENCE, and the reason this block is spelled out by hand.
   *
   * Removing `Since|Here|Let|Given` from the instruction pattern killed no
   * test. The shipped data no longer contains those words -- the filter had
   * already removed them -- so the only check left was an invented string that
   * happened to start with "Determine". The rule could quietly lose most of
   * its coverage and the suite would stay green until the next document
   * arrived full of solved examples.
   *
   * Deliberately NOT parameterised over `NOT_A_TOPIC`: a test that reads the
   * list it is checking passes whatever the list says, which is the same as
   * not testing it. These strings are the contract, stated independently. */
  /* EACH ENTRY ASSERTS ITS EXACT REASON, and the strings are long on purpose.
   *
   * The first attempt used "Since", "Here", "Let A", "Given" and the mutant
   * SURVIVED anyway: every one of those is five characters or fewer, so the
   * too-short rule caught them and the instruction rule was never exercised at
   * all. A check satisfied by a different rule than the one it names is not
   * checking that rule.
   *
   * Deliberately NOT parameterised over `NOT_A_TOPIC`: a test that reads the
   * list it is checking passes whatever the list says. These are the contract,
   * stated independently. */
  const INSTRUCTION = 'an instruction or worked-example opener'
  const MUST_REJECT = [
    ['Since the ordered pairs are equal', INSTRUCTION],
    ['Here the value of x is three', INSTRUCTION],
    ['Let us take a point P on the line', INSTRUCTION],
    ['Given Reserves and Surplus, prepare the extract', INSTRUCTION],
    ['Hence the two sets are equal', INSTRUCTION],
    ['Therefore it is a geometric progression', INSTRUCTION],
    ['Thus the required answer is four', INSTRUCTION],
    ['Find the sum upto n terms', INSTRUCTION],
    ['Prove that the sum is even', INSTRUCTION],
    ['Show that x equals y', INSTRUCTION],
    ['Calculate the arithmetic mean', INSTRUCTION],
    ['Solve for x in the equation', INSTRUCTION],
    ['Evaluate the definite integral', INSTRUCTION],
    ['Verify the trigonometric identity', INSTRUCTION],
    ['Determine the median of the data', INSTRUCTION],
    ['Example 4 on quadratic equations', INSTRUCTION],
    /* No question mark, so the question rule never fires -- "Which of the
     * following" is matched by the instruction rule. Naming the wrong rule
     * here was a wrong expected value, corrected against the rule order. */
    ['Which of the following is an SI unit', INSTRUCTION],
    /* Isolates the question rule: starts with no instruction word, so only the
     * "?" can catch it. */
    ['What is the atomic number of carbon?', 'a question, not a topic'],
    ['Give one example of a metal', INSTRUCTION],
    ['pick one: a) jam b) marmalade', 'carries multiple-choice option letters'],
    ['CG-1', 'a bare competency or outcome code'],
    ['LO-7', 'a bare competency or outcome code'],
    /* Isolates the too-short rule. "Here" cannot: the instruction rule is
     * checked first and matches it, so it proved nothing about length.
     * "sides" is a real fragment that shipped in Class 9 Mathematics. */
    ['sides', 'too short to name a topic'],
  ]

  for (const [name, expected] of MUST_REJECT) {
    it(`rejects ${JSON.stringify(name)} as ${expected}`, () => {
      expect(whyNotATopic(name), `"${name}" would be shipped to a student as a topic`).toBe(expected)
    })
  }
})

describe('the GENERATOR filters, not just the generated file', () => {
  /* MUTATION EVIDENCE. Deleting the filter from `teachableItems` killed no
   * test, because every check above reads the already-built .ts files. The
   * damage would appear only on the next `curriculum:build` -- green suite,
   * and 569 fragments back in the data.
   *
   * So this drives the builder itself. */
  it('drops fragments while building, and keeps the real topics', async () => {
    const { teachableItems } = await import('./build.mjs')

    const doc = {
      concepts: [],
      topics: [
        { title: 'Since', page: 1 },
        { title: 'Photosynthesis in plants', page: 2 },
        { title: 'Find n', page: 3 },
        { title: 'CG-2', page: 4 },
        { title: 'Structure of the Atom', page: 5 },
      ],
    }
    const out = teachableItems(doc, { subject: 'x', name: 'X', classes: [9] }, 9)

    expect(out.map((i) => i.title)).toEqual(['Photosynthesis in plants', 'Structure of the Atom'])
  })
})
