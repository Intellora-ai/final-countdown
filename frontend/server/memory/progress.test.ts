/* THE RULES THEMSELVES, TESTED WHERE THEY ARE DECIDED.
 *
 * WHY THIS EXISTS ALONGSIDE THE HTTP PROOFS AND DOES NOT REPLACE THEM.
 *   `m4-consistency` and `m5-correctness` drive the real server over a socket,
 *   which is the only way to know a rule actually reaches a learner. This file
 *   asks a narrower question that a socket cannot ask cheaply: does the RULE
 *   hold for every input, including the ones nobody would think to type?
 *
 *   `reconcile` is a pure function -- same inputs, same answer, no clock, no
 *   disk, no network. That is exactly the shape a property test can hammer four
 *   hundred times in a few milliseconds, and exactly the shape where an
 *   end-to-end test would spend a second per case and therefore try five.
 *
 * WHAT MUST BE TRUE, TAKEN FROM THE PHASE AND NOT FROM THE CODE.
 *   2. events stored in real order
 *   3. a mastered concept stays mastered
 *   4. each fact has one authoritative value
 *   ... and the boundary that makes all three safe: a record that is NOT canvas
 *   progress is stored exactly as sent, because Phase 1 promised that and this
 *   module was built not to have an opinion about it.
 */

import { describe, expect, it } from 'vitest'

import { aStorableValue, DRAWS, seededRandom } from './generate.test.ts'
import { isProgress, NotConsistent, reconcile, type Progress } from './progress.ts'

/** The lesson these records claim to belong to, unless a test says otherwise. */
const THE_LESSON = 'gas'

/** A progress record, with only the fields a test cares about spelled out. */
function progress(fields: Partial<Progress> = {}): Progress {
  return {
    lessonId: THE_LESSON,
    revealed: 0,
    asked: [],
    questionsAsked: 0,
    emptyAnswers: 0,
    ...fields,
  } as Progress
}

/** The three counters the phase says can only ever grow. */
const COUNTERS = ['revealed', 'questionsAsked', 'emptyAnswers'] as const

describe('M5 · one fact, one authoritative value', () => {
  it('stores a record whose lessonId agrees with the key it is filed under', () => {
    const record = progress({ revealed: 3 })
    expect(reconcile(THE_LESSON, undefined, record)).toBe(record)
  })

  it('refuses a record that claims a different lesson from the key', () => {
    /* THE PAIR THAT MAKES THE TEST ABOVE MEAN SOMETHING. A rule asserted only
     * to allow is satisfied by a function that allows everything. */
    expect(() => reconcile('civics', undefined, progress()))
      .toThrow(NotConsistent)
  })

  it('says which two lessons disagreed, because a bare refusal is unactionable', () => {
    try {
      reconcile('civics', undefined, progress())
      throw new Error('the disagreement was not refused at all')
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(NotConsistent)
      const said = (thrown as Error).message
      /* Both names must appear. A message naming only one leaves the reader
       * guessing which side was wrong. */
      expect(said).toContain('gas')
      expect(said).toContain('civics')
    }
  })

  it('refuses every disagreeing pair a generator can produce, not one handpicked pair', () => {
    const rng = seededRandom(4001)
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const inTheRecord = `lesson-${Math.floor(rng() * 1_000_000)}`
      const inTheKey = `lesson-${Math.floor(rng() * 1_000_000)}`
      const record = progress({ lessonId: inTheRecord })
      if (inTheRecord === inTheKey) {
        expect(reconcile(inTheKey, undefined, record)).toBe(record)
      } else {
        expect(
          () => reconcile(inTheKey, undefined, record),
          `seed=4001 draw=${draw}: "${inTheRecord}" filed under "${inTheKey}"`,
        ).toThrow(NotConsistent)
      }
    }
  })
})

describe('M5 · events are stored in real order', () => {
  it('accepts questions whose timestamps only ever move forward', () => {
    const record = progress({ asked: [{ at: 1 }, { at: 5 }, { at: 900 }] })
    expect(reconcile(THE_LESSON, undefined, record)).toBe(record)
  })

  it('accepts two questions asked in the SAME millisecond', () => {
    /* A DECISION, NOT AN OVERSIGHT. `at` is milliseconds and two questions can
     * genuinely land inside one. Refusing equal timestamps would reject a true
     * history, so only a timestamp that goes BACKWARDS is out of order. */
    const record = progress({ asked: [{ at: 7 }, { at: 7 }, { at: 7 }] })
    expect(reconcile(THE_LESSON, undefined, record)).toBe(record)
  })

  it('refuses a history where a later question happened earlier', () => {
    expect(() => reconcile(THE_LESSON, undefined, progress({ asked: [{ at: 9 }, { at: 2 }] })))
      .toThrow(NotConsistent)
  })

  it('names the position and both times, so the caller can find the bad entry', () => {
    try {
      reconcile(THE_LESSON, undefined, progress({ asked: [{ at: 9 }, { at: 2 }] }))
      throw new Error('the out-of-order history was not refused at all')
    } catch (thrown) {
      const said = (thrown as Error).message
      expect(said).toContain('9')
      expect(said).toContain('2')
    }
  })

  it('refuses a question with no usable time at all', () => {
    /* An entry with no `at` cannot be placed in an order. Guessing where it
     * belongs would invent history; refusing says what is missing. */
    for (const broken of [{}, { at: 'yesterday' }, { at: null }]) {
      expect(() =>
        reconcile(THE_LESSON, undefined, progress({ asked: [{ at: 1 }, broken as never] })),
      ).toThrow(NotConsistent)
    }
  })

  it('holds for every generated history: sorted is kept, unsorted is refused', () => {
    const rng = seededRandom(4002)
    let sawSorted = 0
    let sawUnsorted = 0

    for (let draw = 0; draw < DRAWS; draw += 1) {
      const howMany = 2 + Math.floor(rng() * 6)
      const times = Array.from({ length: howMany }, () => Math.floor(rng() * 50))
      const record = progress({ asked: times.map((at) => ({ at })) })
      const isSorted = times.every((at, index) => index === 0 || at >= (times[index - 1] as number))

      if (isSorted) {
        sawSorted += 1
        expect(reconcile(THE_LESSON, undefined, record), `seed=4002 draw=${draw}`).toBe(record)
      } else {
        sawUnsorted += 1
        expect(
          () => reconcile(THE_LESSON, undefined, record),
          `seed=4002 draw=${draw}: ${JSON.stringify(times)}`,
        ).toThrow(NotConsistent)
      }
    }

    /* NEITHER BRANCH MAY BE EMPTY. A run that happened to draw only sorted
     * histories would prove nothing about refusal, and would look identical to
     * a passing test. */
    expect(sawSorted).toBeGreaterThan(0)
    expect(sawUnsorted).toBeGreaterThan(0)
  })
})

describe('M5 · what happened cannot un-happen', () => {
  it.each(COUNTERS)('lets "%s" stay exactly where it was', (field) => {
    const before = progress({ [field]: 4 })
    const after = progress({ [field]: 4 })
    expect(reconcile(THE_LESSON, before, after)).toBe(after)
  })

  it.each(COUNTERS)('lets "%s" grow', (field) => {
    const before = progress({ [field]: 4 })
    const after = progress({ [field]: 5 })
    expect(reconcile(THE_LESSON, before, after)).toBe(after)
  })

  it.each(COUNTERS)('refuses to let "%s" shrink', (field) => {
    const before = progress({ [field]: 4 })
    const after = progress({ [field]: 3 })
    expect(() => reconcile(THE_LESSON, before, after)).toThrow(NotConsistent)
  })

  it.each(COUNTERS)('says the old and new value of "%s" when it refuses', (field) => {
    try {
      reconcile(THE_LESSON, progress({ [field]: 40 }), progress({ [field]: 7 }))
      throw new Error(`${field} was allowed to go backwards`)
    } catch (thrown) {
      const said = (thrown as Error).message
      expect(said).toContain(field)
      expect(said).toContain('40')
      expect(said).toContain('7')
    }
  })

  it('allows any starting value on a first save, because nothing contradicts it', () => {
    /* A restore from another device arrives with large counters and NO previous
     * record here. Inventing a floor of zero would refuse a true history. */
    const rng = seededRandom(4003)
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const record = progress({ revealed: Math.floor(rng() * 10_000) })
      expect(reconcile(THE_LESSON, undefined, record), `seed=4003 draw=${draw}`).toBe(record)
    }
  })

  it('compares every counter against every generated pair of values', () => {
    const rng = seededRandom(4004)
    let allowed = 0
    let refused = 0

    for (let draw = 0; draw < DRAWS; draw += 1) {
      const field = COUNTERS[Math.floor(rng() * COUNTERS.length)] as string
      const was = Math.floor(rng() * 60)
      const now = Math.floor(rng() * 60)
      const before = progress({ [field]: was })
      const after = progress({ [field]: now })

      if (now < was) {
        refused += 1
        expect(
          () => reconcile(THE_LESSON, before, after),
          `seed=4004 draw=${draw}: ${field} ${was} -> ${now}`,
        ).toThrow(NotConsistent)
      } else {
        allowed += 1
        expect(
          reconcile(THE_LESSON, before, after),
          `seed=4004 draw=${draw}: ${field} ${was} -> ${now}`,
        ).toBe(after)
      }
    }

    expect(allowed).toBeGreaterThan(0)
    expect(refused).toBeGreaterThan(0)
  })
})

describe('the boundary: records this module must not have an opinion about', () => {
  it('hands back anything that is not canvas progress, exactly as it arrived', () => {
    /* PHASE 1 PROMISED THE STORE HOLDS ANYTHING, and 68 tests depend on it. If
     * this ever starts refusing, those break -- and a child's memory starts
     * being rejected for having a shape nobody predicted. */
    const rng = seededRandom(4005)
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const value = aStorableValue(rng)
      if (isProgress(value)) continue
      expect(reconcile(THE_LESSON, undefined, value), `seed=4005 draw=${draw}`).toBe(value)
    }
  })

  it('DID once let a non-progress record overwrite progress — it no longer does', () => {
    /* THIS TEST HAS BEEN FLIPPED, AND THE REASON IS MEASURED, NOT ARGUED.
     *
     * It used to assert that a lesson holding progress would accept a number, a
     * string or an arbitrary object in its place, on the reasoning that this
     * module has no opinion about shapes it does not recognise. That reasoning
     * is right for an EMPTY lesson and was wrong here, and the gap was a real
     * hole: driven over real HTTP, `revealed: 9` -> a record with no `revealed`
     * (not progress, so every rule skipped) -> `revealed: 0` was accepted three
     * times over and ended at zero. The same door bypassed the lessonId rule.
     *
     * Losing what a child has done is not "having no opinion". The pair that
     * keeps this from becoming "refuse everything" is the test below: an empty
     * lesson still takes any shape at all. */
    const before = progress({ revealed: 99 })
    for (const value of [0, 'a string', null, [1, 2, 3], { anything: true }]) {
      expect(() => reconcile(THE_LESSON, before, value)).toThrow(NotConsistent)
    }
  })

  it('is not fooled into treating a partial record as progress', () => {
    /* Missing any of the three fields the rules read means the rules have
     * nothing to say. Half-checking would be worse than not checking. */
    for (const partial of [
      { lessonId: 'gas', revealed: 1 },
      { lessonId: 'gas', asked: [] },
      { revealed: 1, asked: [] },
      { lessonId: 5, revealed: 1, asked: [] },
    ]) {
      expect(isProgress(partial)).toBe(false)
      expect(reconcile('a-completely-different-lesson', undefined, partial)).toBe(partial)
    }
  })
})

describe('M5 · a counter cannot be dropped to escape the rule that guards it', () => {
  /* FOUND THROUGH THE REAL SERVER OVER REAL HTTP, NOT BY READING.
   *
   * Measured: revealed 9 -> a save carrying NO `revealed` -> a save with
   * revealed 0. Every request answered 200, and the stored value ended at 0.
   * Mastery went to nothing in three accepted saves.
   *
   * TWO DOORS, ONE SHAPE. `numberAt` returned undefined for an absent field and
   * the loop skipped it; and `isProgress` REQUIRED `revealed`, so a record
   * without it was "not progress" and skipped every rule there is -- including
   * the one authoritative lessonId. Omitting a fact must never be a cheaper way
   * to change it than lowering it. */

  it('refuses a save that simply leaves out a counter the stored record has', () => {
    const before = progress({ revealed: 9, questionsAsked: 7, emptyAnswers: 2 })
    const { revealed: _dropped, ...withoutRevealed } = before
    expect(() => reconcile(THE_LESSON, before, withoutRevealed))
      .toThrow(NotConsistent)
  })

  it.each(COUNTERS)('refuses a save that leaves out "%s" specifically', (field) => {
    const before = progress({ revealed: 9, questionsAsked: 7, emptyAnswers: 2 })
    const proposed: Record<string, unknown> = { ...before }
    delete proposed[field]
    expect(() => reconcile(THE_LESSON, before, proposed)).toThrow(NotConsistent)
  })

  it('says which counter was dropped, and what it was, so it can be put back', () => {
    /* `questionsAsked`, NOT `revealed`, AND THE REASON IS EXACT. `isProgress`
     * reads `lessonId`, `revealed` and `asked`, so a record missing `revealed`
     * stops being progress at all and is refused by the WIDER rule above, with
     * a different sentence. `questionsAsked` is a counter whose absence leaves
     * the record still recognisably progress, so it is the case that reaches
     * the per-counter message this test is about. Both doors are shut; this
     * one asserts what the narrower door SAYS. */
    const before = progress({ questionsAsked: 9 })
    const { questionsAsked: _dropped, ...withoutIt } = before
    try {
      reconcile(THE_LESSON, before, withoutIt)
      throw new Error('the dropped counter was accepted')
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(NotConsistent)
      const said = (thrown as Error).message
      expect(said).toContain('questionsAsked')
      expect(said).toContain('9')
    }
  })

  it('refuses a save that stops being progress at all, once progress is stored', () => {
    /* The widest version of the same door: send something that is not a
     * progress record and every rule is skipped, so the lessonId check goes
     * with it. A lesson that HAS progress cannot be overwritten by a shape that
     * has none -- that is not a new kind of memory, it is losing the old one. */
    const before = progress({ revealed: 9 })
    for (const notProgress of [0, 'a string', null, [1, 2], { anything: true }]) {
      expect(() => reconcile(THE_LESSON, before, notProgress)).toThrow(NotConsistent)
    }
  })

  it('still lets a lesson that holds nothing accept any shape at all', () => {
    /* THE PAIR. Phase 1 promised the store holds anything, and 68 tests depend
     * on it. The rule above must bite only where progress already exists. */
    const rng = seededRandom(4006)
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const value = aStorableValue(rng)
      if (isProgress(value)) continue
      expect(reconcile(THE_LESSON, undefined, value), `seed=4006 draw=${draw}`).toBe(value)
    }
  })
})
