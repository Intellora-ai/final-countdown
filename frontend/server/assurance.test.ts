import { describe, expect, it } from 'vitest'

import { needsAnotherLook, type OnCanvas, type WhatSheSaid } from './assurance.ts'

/**
 * SHOWING A LESSON DOES NOT END ITS LIFE.
 *
 * THE OWNER'S DECISION, 2026-09-03: "VERIFY BEFORE -> MONITOR AFTER -> RECHECK
 * WHEN WARRANTED -> CORRECT TRANSPARENTLY", and the reason is that this canvas
 * is permanent. A wrong explanation on a chat scrolls away in an hour. A wrong
 * explanation here sits on her canvas for years, and she may have learnt it.
 *
 * THE RULE THAT SHAPES EVERY TEST BELOW: rechecking is driven by EVIDENCE, not
 * by a timer and never by a model's own second thoughts. Re-reading every
 * lesson every night would burn compute re-confirming correct work and would
 * give a model repeated chances to "improve" something that was already right.
 * So nothing is looked at again until something real suggests it should be.
 */

const A_LESSON = (seq: number, over: Record<string, unknown> = {}): OnCanvas => ({
  seq,
  kind: 'lesson',
  question: `question ${seq}`,
  state: 'verified',
  knowledgeVersion: 1,
  /* The lesson's own words, which is what a signal reads. */
  says: 'A zero of a polynomial is a value of x that makes the polynomial equal to nought.',
  ...over,
})

const said = (over: Partial<WhatSheSaid> = {}): WhatSheSaid => ({
  artifactSeq: 1,
  beat: 'says',
  kind: 'plea',
  ...over,
})

describe('nothing is looked at again without a reason', () => {
  it('leaves a canvas alone when she has said nothing and nothing has changed', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1), A_LESSON(2), A_LESSON(3)],
      saidSince: [],
      knowledgeVersion: 1,
    })
    expect(found, 'lessons were queued for rechecking with no evidence at all').toEqual([])
  })

  it('is not moved by one moment of confusion', () => {
    /* Confusion is not error. A student saying "I do not get it" once means the
       lesson should be explained differently, which the diagnosis path already
       does. It does not mean the lesson is WRONG, and treating it that way
       would put every hard topic under permanent suspicion. */
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [said()],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })
})

describe('what does make a lesson suspect', () => {
  it('notices when she is confused by the same part of the same lesson again and again', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [said(), said(), said()],
      knowledgeVersion: 1,
    })
    expect(found.map((s) => s.kind)).toContain('repeated-confusion')
    expect(found[0]?.artifactSeq).toBe(1)
    expect(found[0]?.why.length ?? 0, 'the reason is not something a person could read').toBeGreaterThan(20)
  })

  it('does not add up confusion from different parts into a false alarm', () => {
    /* Three pleas at three different beats is a hard lesson, not a wrong one. */
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [said({ beat: 'a' }), said({ beat: 'b' }), said({ beat: 'c' })],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })

  it('does not add up confusion from different lessons', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1), A_LESSON(2), A_LESSON(3)],
      saidSince: [said({ artifactSeq: 1 }), said({ artifactSeq: 2 }), said({ artifactSeq: 3 })],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })

  it('notices a lesson that rests on a worked number, because those go wrong quietly', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { says: 'Adding the two sides gives 12 + 19 = 31, so the perimeter is 31 cm.' })],
      saidSince: [],
      knowledgeVersion: 1,
      /* Only asked for when there is budget to spend; see `alsoTheRiskyOnes`. */
      alsoTheRiskyOnes: true,
    })
    expect(found.map((s) => s.kind)).toContain('carries-a-worked-number')
  })

  it('notices when the syllabus itself has been re-checked since the lesson was written', () => {
    /* The canonical model for the topic moved on. Only the lessons written
       against the older one are affected -- not every canvas in the product. */
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { knowledgeVersion: 1 }), A_LESSON(2, { knowledgeVersion: 2 })],
      saidSince: [],
      knowledgeVersion: 2,
    })
    expect(found.map((s) => s.artifactSeq), 'the up-to-date lesson was dragged in too').toEqual([1])
    expect(found[0]?.kind).toBe('written-against-an-older-syllabus')
  })
})

describe('two lessons on one canvas that cannot both be right', () => {
  /*
   * THE FIRST OF THE THREE SIGNALS THAT WERE DESIGNED AND NOT BUILT.
   *
   * It was left out because "disagrees with" is genuinely harder than "is about
   * the same thing", and embeddings only give the second. But there is a real,
   * deterministic case that needs no model at all and is the one that actually
   * hurts a student: **the same quantity given two different values**, on the
   * same canvas, weeks apart. She has no way to know which lesson to believe,
   * and neither did the system.
   *
   * This does not try to detect disagreement in prose. It detects a value that
   * changed, which is narrow, checkable, and the shape most likely to be wrong.
   */

  it('notices when one lesson says a thing is one number and another says a different one', () => {
    const found = needsAnotherLook({
      canvas: [
        A_LESSON(1, { says: 'For a quadratic, the sum of the zeros is -b/a.' }),
        A_LESSON(2, { says: 'Remember that the sum of the zeros is b/a.' }),
      ],
      saidSince: [],
      knowledgeVersion: 1,
    })
    expect(found.map((s) => s.kind), 'two contradictory lessons sat on her canvas unremarked')
      .toContain('two-lessons-disagree')
    /* BOTH are raised. Nothing here knows which one is wrong, and quietly
       picking the newer would be a guess dressed up as a correction. */
    expect(found.map((f) => f.artifactSeq).sort()).toEqual([1, 2])
  })

  it('says nothing when two lessons agree', () => {
    const found = needsAnotherLook({
      canvas: [
        A_LESSON(1, { says: 'For a quadratic, the sum of the zeros is -b/a.' }),
        A_LESSON(2, { says: 'As before, the sum of the zeros is -b/a.' }),
      ],
      saidSince: [],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })

  it('says nothing about two lessons that are simply about different things', () => {
    const found = needsAnotherLook({
      canvas: [
        A_LESSON(1, { says: 'The sum of the zeros is -b/a.' }),
        A_LESSON(2, { says: 'The product of the zeros is c/a.' }),
      ],
      saidSince: [],
      knowledgeVersion: 1,
    })
    expect(found, 'two different facts were read as a contradiction').toEqual([])
  })

  it('reads a plain number the same way it reads a formula', () => {
    const found = needsAnotherLook({
      canvas: [
        A_LESSON(1, { says: 'At sea level, the boiling point of water is 100 degrees celsius.' }),
        A_LESSON(2, { says: 'The boiling point of water is 90 degrees celsius.' }),
      ],
      saidSince: [],
      knowledgeVersion: 1,
    })
    expect(found.map((s) => s.kind)).toContain('two-lessons-disagree')
  })
})

describe('she was taught, asked, and could not answer', () => {
  /*
   * THE SECOND SIGNAL. It was left out as "nothing grades an answer", which is
   * true and is not the only way to see failure. A checkpoint asks her one
   * question. Answering NOTHING, more than once, on the same lesson, is not a
   * wrong answer that needs marking -- it is observable silence, and the
   * evidence store already records it as `empty`.
   *
   * A student who reads a lesson and then cannot say anything about it has been
   * failed by the lesson, whatever the lesson's facts are.
   */

  it('notices two empty answers on the same lesson', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [said({ kind: 'empty' }), said({ kind: 'empty' })],
      knowledgeVersion: 1,
    })
    expect(found.map((s) => s.kind)).toContain('asked-and-could-not-answer')
  })

  it('is not moved by one', () => {
    /* Once is a distraction, a phone, a bell. */
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [said({ kind: 'empty' })],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })

  it('does not count silences across different lessons as one failure', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1), A_LESSON(2)],
      saidSince: [said({ artifactSeq: 1, kind: 'empty' }), said({ artifactSeq: 2, kind: 'empty' })],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })

  it('does not read an ordinary answer as a silence', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [said({ kind: 'answer' }), said({ kind: 'answer' }), said({ kind: 'answer' })],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })
})

describe('a lesson resting on a page that has since changed', () => {
  /*
   * THE THIRD SIGNAL. Left out because artifacts did not record what they were
   * built from. They do now: an artifact carries the addresses it was grounded
   * on, and the caller says which of those are known to have changed.
   *
   * This matters most for anything dated -- a statistic, a policy, a record.
   * The lesson was true when it was written and is not any more, and nothing
   * about the lesson itself shows that.
   */

  it('raises a lesson whose source has changed underneath it', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { sources: ['https://example.test/a', 'https://example.test/b'] })],
      saidSince: [],
      knowledgeVersion: 1,
      sourcesThatChanged: ['https://example.test/b'],
    })
    expect(found.map((s) => s.kind)).toContain('a-source-has-changed')
    expect(found[0]?.why, 'the changed page is not named, so nobody can go and look')
      .toContain('https://example.test/b')
  })

  it('leaves alone a lesson whose sources are all as they were', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { sources: ['https://example.test/a'] })],
      saidSince: [],
      knowledgeVersion: 1,
      sourcesThatChanged: ['https://example.test/somewhere-else'],
    })
    expect(found).toEqual([])
  })

  it('leaves alone a lesson that cites nothing', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1)],
      saidSince: [],
      knowledgeVersion: 1,
      sourcesThatChanged: ['https://example.test/a'],
    })
    expect(found).toEqual([])
  })
})

describe('a lesson is never rechecked over and over', () => {
  it('leaves alone a lesson that has already been through this', () => {
    /* Without a ceiling, a lesson that a recheck cannot settle is rechecked
       every time she opens the canvas, forever, at the cost of a model call
       each time -- and each call is another chance to rewrite something that
       was right. */
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { state: 'suspect' })],
      saidSince: [said(), said(), said()],
      knowledgeVersion: 1,
    })
    expect(found, 'a lesson already under suspicion was queued again').toEqual([])
  })

  it('leaves alone a lesson that has already been corrected', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { state: 'corrected' })],
      saidSince: [said(), said(), said()],
      knowledgeVersion: 1,
    })
    expect(found).toEqual([])
  })

  it('never queues a correction itself for rechecking', () => {
    /* A correction that can be corrected is a loop with a student inside it. */
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { kind: 'correction', knowledgeVersion: 1 })],
      saidSince: [],
      knowledgeVersion: 9,
    })
    expect(found).toEqual([])
  })

  it('never queues the topic scope, which is not a lesson', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { kind: 'scope', knowledgeVersion: 1 })],
      saidSince: [],
      knowledgeVersion: 9,
    })
    expect(found).toEqual([])
  })
})

describe('what a recheck can and cannot do', () => {
  it('reports at most one reason per lesson, so one lesson is one piece of work', () => {
    const found = needsAnotherLook({
      canvas: [A_LESSON(1, { knowledgeVersion: 1, says: 'So 2 + 2 = 5 and the answer follows.' })],
      saidSince: [said(), said(), said()],
      knowledgeVersion: 2,
      alsoTheRiskyOnes: true,
    })
    expect(found.filter((s) => s.artifactSeq === 1).length).toBe(1)
  })

  it('puts the strongest reason first, so limited budget is spent on the worst', () => {
    const found = needsAnotherLook({
      canvas: [
        A_LESSON(1, { says: 'The total is 3 + 4 = 8 altogether.' }),
        A_LESSON(2, { knowledgeVersion: 1 }),
      ],
      saidSince: [said({ artifactSeq: 2 }), said({ artifactSeq: 2 }), said({ artifactSeq: 2 })],
      knowledgeVersion: 2,
      alsoTheRiskyOnes: true,
    })
    expect(found[0]?.artifactSeq, 'the weakest signal was put first').toBe(2)
  })
})
