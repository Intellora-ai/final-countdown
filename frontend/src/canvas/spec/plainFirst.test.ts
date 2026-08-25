/**
 * PLAIN FIRST — the opening of a lesson must be usable on first reading.
 *
 * WHAT THIS IS FOR
 * ----------------
 * A learner cannot hang a name on nothing. The plain idea comes first, in words
 * they already have, and the term arrives afterwards to label an idea they are
 * already holding.
 *
 * There are two ways to break that, and only one of them involves jargon:
 *
 *   TECHNICAL FIRST  "A fraction is a part of a whole."
 *                    The term lands before anything it could attach to.
 *
 *   CLEVER FIRST     "It is not a division sum waiting to happen. It is a count
 *                    of parts you already made."
 *                    Every word is ordinary. It fails anyway, because the reader
 *                    has to DECODE it before they can act on it.
 *
 * The second is why a banned-word list is not enough, and it is not a
 * hypothetical: those sentences were written on 2026-08-25, in a reply that had
 * just finished arguing for plain language. Knowing the rule does not prevent
 * breaking it, because clever writing feels like good writing from the inside.
 * Only a check outside the writer catches it.
 *
 * WHAT IS MEASURED, AND WHAT IS NOT
 * ---------------------------------
 * These checks read SHAPE, never quality. They cannot tell whether an
 * explanation is correct or well-aimed — a human still has to read it. What
 * they remove is the class of failure that survives review because every
 * individual word looked fine.
 *
 * Every case below is a PAIR. A checker asserted only to refuse is satisfied by
 * returning a violation for everything, exactly as one asserted only to accept
 * is satisfied by returning nothing.
 */

import { describe, expect, it } from 'vitest'

import { checkPlainFirst, codesOf } from './plainFirst'

const block = (body: string, kind = 'prose') => ({ id: 'b1', kind, body })

const lesson = (body: string, question = 'How much pizza is gone?') => ({
  id: 'l1',
  question,
  blocks: [block(body)],
})

describe('the opening block', () => {
  it('refuses a metaphor doing the defining', () => {
    const found = checkPlainFirst(lesson('It is not a division sum waiting to happen.'))
    expect(codesOf(found)).toContain('METAPHOR_DEFINITION')
    expect(found[0].evidence).toBe('waiting to')
  })

  it('accepts the same idea said directly', () => {
    expect(checkPlainFirst(lesson('It is not a division problem.'))).toEqual([])
  })

  it('refuses a thing named where an action belongs', () => {
    const found = checkPlainFirst(lesson('It is a count of parts you already made.'))
    expect(codesOf(found)).toContain('ABSTRACT_NOUN')
    expect(found[0].evidence.toLowerCase()).toContain('a count of')
  })

  it('accepts the rewrite the learner can act on', () => {
    expect(
      checkPlainFirst(lesson('It tells you how many parts you have out of the total parts.')),
    ).toEqual([])
  })

  it('refuses a verb wearing a noun', () => {
    const found = checkPlainFirst(lesson('Multiplication is the repetition of addition.'))
    expect(codesOf(found)).toContain('ABSTRACT_NOUN')
  })

  it('accepts the same rule as something you do', () => {
    expect(checkPlainFirst(lesson('You add the same number again and again.'))).toEqual([])
  })

  /*
   * A HOLE FOUND BY MUTATION, NOT BY THINKING.
   *
   * Disabling the subject branch of the nominalisation check broke no test.
   * "Multiplication is the repetition of addition." was the only case covering
   * it, and that sentence ALSO trips the "the ... of" branch — so the subject
   * branch had never done any work and deleting it changed nothing. The case
   * below trips the subject form alone.
   */
  it('refuses a nouned verb as the subject even with no "the ... of" phrase', () => {
    const found = checkPlainFirst(lesson('Multiplication is adding the same number again.'))
    expect(codesOf(found)).toContain('ABSTRACT_NOUN')
    expect(found[0].evidence).toBe('Multiplication')
  })

  it('accepts a long ordinary subject that merely looks similar', () => {
    /* The pair. Grading by position must not turn into refusing every long
       word that happens to start a sentence. */
    expect(checkPlainFirst(lesson('Sandwiches are cut into pieces.'))).toEqual([])
  })
})

describe('length — an idea the reader cannot hold is not plain', () => {
  it('refuses an opening over the word cap', () => {
    const long =
      'You cut a pizza into four pieces and then you take three of them and you ' +
      'look at what is left and you count the pieces you took and compare them.'
    expect(codesOf(checkPlainFirst(lesson(long)))).toContain('TOO_LONG')
  })

  it('refuses three sentences even when every one is short', () => {
    /* The word cap alone would let this through, and three short sentences are
       still three ideas arriving at once. */
    const three = 'You cut it. You take some. You look at the rest.'
    expect(three.split(' ').length).toBeLessThan(25)
    expect(codesOf(checkPlainFirst(lesson(three)))).toContain('TOO_LONG')
  })

  it('accepts two short sentences', () => {
    expect(checkPlainFirst(lesson('You cut it. You take some.'))).toEqual([])
  })
})

describe('the opening must explain, not announce', () => {
  it('refuses a block that describes the lesson instead of teaching it', () => {
    /* Measured in this repo on 2026-08-25: every committed generated lesson
       opened with exactly this shape. It tells the learner what is about to
       happen, which is the one thing they cannot use. */
    const found = checkPlainFirst(lesson('Here is one worked case of identify base case.'))
    expect(codesOf(found)).toContain('ANNOUNCEMENT')
  })

  it('accepts an opening that starts teaching immediately', () => {
    expect(checkPlainFirst(lesson('You cut a pizza into 4 pieces. You take 3.'))).toEqual([])
  })
})

describe('shape variance — the anti-generic check', () => {
  it('refuses a lesson that is nothing but prose', () => {
    /* Readable and non-generic are two different problems. Chunking fixes the
       first. Only varying the SHAPE fixes the second, and a lesson of three
       prose blocks has exactly one possible layout however well written it is. */
    const allProse = {
      id: 'l1',
      question: 'How much pizza is gone?',
      blocks: [block('You cut it.'), block('You take some.'), block('Now count.')],
    }
    expect(codesOf(checkPlainFirst(allProse))).toContain('ALL_PROSE')
  })

  it('accepts a lesson that uses more than one kind', () => {
    const mixed = {
      id: 'l1',
      question: 'How much pizza is gone?',
      blocks: [block('You cut it.'), block('3 out of 4', 'metric')],
    }
    expect(codesOf(checkPlainFirst(mixed))).not.toContain('ALL_PROSE')
  })

  it('does not call a one-block lesson all-prose', () => {
    /* A single block cannot vary from itself. Refusing here would fire on every
       short lesson and the gate would be switched off within a week. */
    expect(codesOf(checkPlainFirst(lesson('You cut it.')))).not.toContain('ALL_PROSE')
  })
})

describe('every violation can be acted on', () => {
  it('carries the offending text and the move that fixes it', () => {
    const found = checkPlainFirst(lesson('It is a count of parts you already made.'))
    expect(found[0].evidence).not.toBe('')
    expect(found[0].fix).not.toBe('')
  })

  it('reports the block it came from', () => {
    const found = checkPlainFirst(lesson('It is a count of parts you already made.'))
    expect(found[0].path).toBe('blocks[0].body')
  })
})

/*
 * THE CAP THAT MAKES A WALL UNWRITEABLE
 * -------------------------------------
 * The checks above refuse a bad opening. They cannot refuse a lesson that is
 * correct, plain, and 2,000 characters long — and the schema allowed exactly
 * that, which is how "keep each block to one idea" stayed a request that
 * nothing enforced.
 *
 * 400 is not a taste call, and the first attempt at it was measured wrong. 320
 * came from the generated lessons alone and broke 24 tests, because the
 * hand-authored acceptance lessons had never been looked at. The real longest
 * body in the repo is 394 characters. 400 refuses nothing that exists and still
 * makes a wall structurally impossible to express — a rule the schema enforces
 * cannot be talked past by a model having a confident day.
 */
import { LessonSpec } from './spec'

describe('the prose cap', () => {
  const lessonWithBody = (body: string) => ({
    id: 'l1',
    question: 'How much pizza is gone?',
    blocks: [{ id: 'b1', kind: 'prose' as const, body }],
  })

  it('refuses a block long enough to be a wall', () => {
    const wall = 'word '.repeat(120).trim()
    expect(wall.length).toBeGreaterThan(400)
    expect(LessonSpec.safeParse(lessonWithBody(wall)).success).toBe(false)
  })

  it('accepts the longest body the committed corpus actually contains', () => {
    /* The pair, and the thing that stops this cap being set by feel: 394 is a
       measured fact about every lesson in the repo, not a number that sounded
       about right. Setting it from a partial corpus is exactly how the first
       attempt broke 24 tests. */
    const realistic = 'x'.repeat(394)
    expect(LessonSpec.safeParse(lessonWithBody(realistic)).success).toBe(true)
  })
})
