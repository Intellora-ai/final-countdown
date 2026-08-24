import { describe, expect, it } from 'vitest'
import { conflicts } from '../memory/memory'
import { dueForReview, masteryFromAttempts, type Attempt, type Learner } from '../learn/learn'
import type { MemoryRecord } from '../kernel/contracts'

/**
 * BOUNDARY PINS.
 *
 * Mutation testing on `src/agent` scored 3/8, and every one of the five
 * survivors was a comparison flipped by one notch --- `>` to `>=`, `<=` to
 * `<`. The three that were killed were behavioural: hardcode a verdict, drop a
 * term from a product, widen a gate to always-true. Those die instantly.
 *
 * That is one blind spot rather than five: the suite asserts WHAT each function
 * does and never WHERE it switches. A test that feeds a value comfortably
 * inside a range passes identically whichever side of the boundary the
 * comparison sits on, so the comparison itself is untested.
 *
 * Each test below feeds a value that lands EXACTLY on a threshold, which is the
 * only input that can tell `<` from `<=`. Each names the mutation it kills so a
 * later reader can re-run it rather than trust this comment.
 */

const DAY = 86_400_000

function record(over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'm1',
    kind: 'preference',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    strength: 1,
    supersedes: [],
    source: 'observed',
    ...over,
  }
}

function attempt(at: string, correct = true): Attempt {
  return { conceptId: 'photosynthesis', correct, at, difficulty: 3 }
}

function learner(attempts: readonly Attempt[]): Learner {
  return { mastery: new Map(), misconceptions: new Map(), attempts, claimed: [] }
}

describe('conflicts() at exactly the overlap threshold', () => {
  /* KILLS: memory.ts:303  `overlap(subjectA, subjectB) < threshold` -> `<=`
   *
   * `overlap` is `hits / Math.min(a.size, b.size)`, so an exact ratio is
   * constructible. `threshold` is a parameter, so the boundary can be hit
   * without depending on what the default happens to be today. */
  it('still reports a conflict when overlap EQUALS the threshold', () => {
    const a = record({ id: 'a', content: 'I like short answers about fractions' })
    const b = record({ id: 'b', content: 'I hate fractions' })

    /* Subject tokens after polarity words are stripped: {answers, fractions}
       versus {fractions}. hits=1, min size=1, so overlap is exactly 1.0. */
    expect(conflicts(a, b, 1)).toBe(true)
  })

  it('reports no conflict once the threshold is above the overlap', () => {
    const a = record({ id: 'a', content: 'I like short answers about fractions' })
    const b = record({ id: 'b', content: 'I hate fractions' })

    /* One notch past the boundary. This is the assertion that makes the pair
       meaningful: a test that only ever asserts `true` is satisfied by a
       function that returns `true` unconditionally. */
    expect(conflicts(a, b, 1.0001)).toBe(false)
  })
})

describe('masteryFromAttempts() at exactly one day of evidence', () => {
  /* KILLS: learn.ts:201  `span > 86_400_000` -> `>=`
   *
   * The comment above that line says mastery requires evidence that is "not all
   * from one sitting". A span of exactly 24h is the first instant that is
   * arguably no longer one sitting, so which way the comparison falls is a real
   * product decision and not an implementation detail. Today it is `>`, so
   * exactly-24h is NOT mastered; this pins that. */
  it('is not mastered when the span is exactly 24h', () => {
    const t0 = Date.parse('2026-01-01T00:00:00.000Z')

    expect(
      masteryFromAttempts([
        attempt(new Date(t0).toISOString()),
        attempt(new Date(t0 + DAY / 2).toISOString()),
        attempt(new Date(t0 + DAY).toISOString()),
      ]),
    ).toBe('competent')
  })

  it('is mastered one millisecond past 24h', () => {
    const t0 = Date.parse('2026-01-01T00:00:00.000Z')

    expect(
      masteryFromAttempts([
        attempt(new Date(t0).toISOString()),
        attempt(new Date(t0 + DAY / 2).toISOString()),
        attempt(new Date(t0 + DAY + 1).toISOString()),
      ]),
    ).toBe('mastered')
  })
})

describe('dueForReview() at exactly the review instant', () => {
  /* KILLS: learn.ts:352  `<= Date.parse(now)` -> `<`
   *
   * A concept whose review falls due at this exact millisecond must be
   * returned. Under the mutation it is silently dropped and resurfaces only on
   * the next call, which is invisible in any test that uses a clock comfortably
   * past the due time --- which is every existing test. */
  it('returns a concept whose review is due at exactly now', () => {
    const at = '2026-01-01T00:00:00.000Z'
    const l = learner([attempt(at)])

    /* One correct attempt gives interval = 1 day, so the review instant is
       exactly `at + DAY`. Feeding that instant back is the boundary. */
    const due = new Date(Date.parse(at) + DAY).toISOString()

    expect(dueForReview(l, due)).toContain('photosynthesis')
  })

  it('does not return it one millisecond early', () => {
    const at = '2026-01-01T00:00:00.000Z'
    const l = learner([attempt(at)])
    const justBefore = new Date(Date.parse(at) + DAY - 1).toISOString()

    expect(dueForReview(l, justBefore)).not.toContain('photosynthesis')
  })
})
