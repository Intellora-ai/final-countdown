import { describe, expect, it } from 'vitest'

import { CLASS_9 } from '../data/curriculum/class9'
import { CLASS_10 } from '../data/curriculum/class10'
import { CLASS_11 } from '../data/curriculum/class11'
import { CLASS_12 } from '../data/curriculum/class12'
import { notTeachable } from './teachable'

/**
 * EVERY CASE HERE IS A REAL ENTRY FROM THE REAL CURRICULUM.
 *
 * Not one is invented. They were found by reading all 3,995 entries built from
 * the 37 official CBSE PDFs in this repository, which is the only way to know
 * what a document actually turns into once it has been through a PDF extractor.
 *
 * The last block runs the rule over the WHOLE curriculum, so the claim being
 * made is about the product's real data and not about a handful of examples.
 */

/** Real entries that are not things to learn. Verbatim from the curriculum. */
const NOT_SOMETHING_TO_LEARN: readonly string[] = [
  'Record your observations and results in the following table',
  'Draw a straight 5‑metre line on the ground and mark the starting point as A and the end as B',
  'Place the toy car at point O and give it a gentle push so that it moves forward',
  'Collect the following items: A spring, a stand, a weight hanger, slotted weights, a ruler',
  'Repeat the experiment with the student running',
  'Production of __________ using bacteria',
  'Microbiology – An introduction: Gerrard J. Tortora, Berdell R. Funke and Christine J. Case',
  'Verification of Newton’s Second Law of Motion using a trolley, pulley and hanging masses. Ch. 6',
  'Draw the ‘Label’ of your product',
  'Observe developmental norms: (Physical, Motor, Language, Social and Emotional) birth to three years',
  /* FOUND BY RUNNING THE GENERATOR, 2026-09-03. Twenty topics went through a
     real model and these came back with a straight face: "30 Marks" decomposed
     into Practical/Project, Viva and Project Evaluation Parameters; a reading
     comprehension format decomposed into Word Count and Marks Allocation. They
     are assessment schemes, not ideas, and a canvas offering to teach one is
     offering to teach a mark sheet. */
  '30 Marks',
  'Practical/ Project: 30 Marks',
  'Discursive passage of 400-450 words. 10 marks',
  'Theory: 70 Marks',
  /* And these are sentence fragments the PDF broke apart. "whose first term is
     -3 and common difference is 4" is the tail of an example; asked what is
     inside it, the model dutifully produced "First Term" and "Common
     Difference", which are real ideas about a topic that is not there. */
  'whose first term is –3 and common difference is 4',
  'luxury of goods and services. goods',
  'which are defined at 0° and 90°. Values',
]

/** Real entries that ARE things to learn. Verbatim from the curriculum. */
const SOMETHING_TO_LEARN: readonly string[] = [
  'Fundamental Theorem of Arithmetic - statements after reviewing work done earlier and after illustrating and motivating through examples',
  'Zeros of a polynomial',
  'Relationship between zeros and coefficients of quadratic polynomials.',
  'Trigonometric ratios of an acute angle of a right-angled triangle. Proof of their existence (well defined)',
  'mirror formula',
  'mutable and immutable data types',
  'Cultural Change',
  'Latitude, Longitude and Time',
  'Memory Systems : Sensory, Short-term and Long-term Memories',
  'Espirit de corps',
  'Using the product rule',
  'To find the focal length of a concave lens, using a convex lens',
  /* REAL, and they matter: 283 entries begin with a single letter and a space.
     A rule that refused them all would hide a Class 12 English poem and a Class
     12 Business Studies project, which is exactly the "nobody notices a missing
     topic" failure. Found by a mutation that survived because no positive case
     here had this shape. */
  'A Photograph (Poem)',
  'A study on child labour laws, its implementation and consequences',
]

describe('an entry that is not something a student can learn', () => {
  for (const name of NOT_SOMETHING_TO_LEARN) {
    it(`refuses to treat as a topic: "${name.slice(0, 56)}"`, () => {
      const verdict = notTeachable(name)
      expect(verdict, 'this would have been handed to a decomposition that must invent something').not.toBeNull()
      expect(verdict?.reason.length ?? 0, 'the refusal says nothing a person could act on').toBeGreaterThan(10)
    })
  }
})

describe('an entry that IS something a student can learn', () => {
  for (const name of SOMETHING_TO_LEARN) {
    it(`treats as a topic: "${name.slice(0, 56)}"`, () => {
      expect(
        notTeachable(name),
        'a real syllabus topic was hidden from the student by this rule',
      ).toBeNull()
    })
  }
})

describe('the rule, run over the whole curriculum', () => {
  const every = [
    ...[['9', CLASS_9], ['10', CLASS_10], ['11', CLASS_11], ['12', CLASS_12]] as const,
  ].flatMap(([cls, subjects]) =>
    subjects.flatMap((s) => s.chapters.flatMap((ch) => ch.concepts.map((c) => ({ cls, name: c.name })))),
  )

  it('reads the real curriculum, not a fixture', () => {
    expect(every.length, 'the curriculum did not load, so this whole block proves nothing').toBeGreaterThan(3000)
  })

  it('leaves the overwhelming majority of the syllabus teachable', () => {
    /* THE DIRECTION THAT MATTERS. A rule that hides real topics is far worse
       than one that lets an oddity through: nobody notices a missing topic, and
       everybody notices an invented one. Measured 2026-09-03: about nine in a
       hundred entries trip a signal. If a change pushes this past a fifth, the
       rule has started eating the syllabus and this test says so. */
    const refused = every.filter((e) => notTeachable(e.name) !== null)
    const share = refused.length / every.length
    expect(
      share,
      `the rule now hides ${refused.length} of ${every.length} entries; examples: ` +
        refused.slice(0, 3).map((e) => `"${e.name.slice(0, 50)}"`).join(', '),
    ).toBeLessThan(0.2)
  })

  it('actually finds the entries that are not topics, rather than passing everything', () => {
    /* The other direction: a rule that refuses nothing would pass the test
       above trivially. The curriculum demonstrably contains this rubbish. */
    const refused = every.filter((e) => notTeachable(e.name) !== null)
    expect(refused.length, 'the rule found nothing at all, so it is not doing anything').toBeGreaterThan(100)
  })
})
