import { describe, expect, it } from 'vitest'

import type { MemoryRecord } from '../kernel/contracts'
import { DEFAULT_PERSONALIZATION, planCommunication } from '../communicate/communicate'
import { understand } from '../understand/understand'
import {
  buildGraph,
  dueForReview,
  feedbackFor,
  learnerFrom,
  masteryFromAttempts,
  masteryOf,
  NEW_LEARNER,
  nextDifficulty,
  nextReview,
  teachingAdjustments,
  whatNext,
  type Attempt,
  type Concept,
  type Learner,
} from './learn'

const T0 = '2026-01-01T00:00:00.000Z'
const day = (n: number) => new Date(Date.parse(T0) + n * 86_400_000).toISOString()

const CONCEPTS: Concept[] = [
  { id: 'arith', label: 'arithmetic', requires: [] },
  { id: 'frac', label: 'fractions', requires: ['arith'] },
  { id: 'pct', label: 'percentages', requires: ['frac'] },
  { id: 'interest', label: 'compound interest', requires: ['pct'] },
  { id: 'algebra', label: 'algebra', requires: ['arith'] },
]
const GRAPH = buildGraph(CONCEPTS)

const attempt = (conceptId: string, correct: boolean, at: string, difficulty = 2): Attempt => ({
  conceptId, correct, at, difficulty,
})

const mem = (content: string, kind: MemoryRecord['kind']): MemoryRecord => ({
  id: 'm', kind, content, createdAt: T0, updatedAt: T0, strength: 0.9, supersedes: [], source: 'user-stated',
})

describe('the concept graph refuses impossible curricula', () => {
  it('rejects a prerequisite cycle', () => {
    /* Discovered at run time this looks like a curriculum that simply never
       recommends anything. */
    expect(() =>
      buildGraph([
        { id: 'a', label: 'a', requires: ['b'] },
        { id: 'b', label: 'b', requires: ['a'] },
      ]),
    ).toThrow(/cycle/)
  })

  it('rejects a prerequisite that does not exist', () => {
    expect(() => buildGraph([{ id: 'a', label: 'a', requires: ['ghost'] }])).toThrow(/unknown concept/)
  })
})

describe('the learner is built from the SAME memory everything else uses', () => {
  it('reads a stated struggle as PARTIAL, not unknown', () => {
    /* Someone who says "I struggle with percentages" has MET percentages.
       Treating them as a beginner restarts material they have seen, which is
       the fastest way to lose them. */
    const l = learnerFrom([mem('I struggle with percentages', 'misconception')], GRAPH)
    expect(masteryOf(l, 'pct')).toBe('partial')
    expect(l.misconceptions.get('pct')).toContain('struggle')
  })

  it('reads a stated strength as competent', () => {
    const l = learnerFrom([mem('I already know arithmetic', 'mastery')], GRAPH)
    expect(masteryOf(l, 'arith')).toBe('competent')
  })

  it('lets what they DID override what they SAID', () => {
    const l = learnerFrom(
      [mem('I already know percentages', 'mastery')],
      GRAPH,
      [attempt('pct', false, day(1)), attempt('pct', false, day(2))],
    )
    expect(masteryOf(l, 'pct')).toBe('exposed')
  })

  it('ignores memories that match no concept', () => {
    const l = learnerFrom([mem('I live in Chandigarh', 'fact')], GRAPH)
    expect(l.mastery.size).toBe(0)
  })
})

describe('mastery is recency-weighted, because learning moves one way', () => {
  it('calls someone who failed then succeeded improving, not stuck', () => {
    /* A mean would say 33% and call them stuck. The last three attempts decide. */
    const m = masteryFromAttempts([
      attempt('pct', false, day(1)), attempt('pct', false, day(2)),
      attempt('pct', false, day(3)), attempt('pct', false, day(4)),
      attempt('pct', true, day(5)), attempt('pct', true, day(6)),
    ])
    expect(m).not.toBe('exposed')
    expect(['partial', 'competent', 'mastered']).toContain(m)
  })

  it('is unknown with no evidence', () => {
    expect(masteryFromAttempts([])).toBe('unknown')
  })

  it('is exposed after only failures', () => {
    expect(masteryFromAttempts([attempt('pct', false, day(1)), attempt('pct', false, day(2))])).toBe('exposed')
  })

  it('does NOT call three-right-in-one-sitting mastery', () => {
    /* Three correct immediately after being shown something is short-term
       recall --- precisely what spacing exists to tell apart from mastery. */
    const sameDay = [
      attempt('pct', true, '2026-01-01T10:00:00Z'),
      attempt('pct', true, '2026-01-01T10:05:00Z'),
      attempt('pct', true, '2026-01-01T10:10:00Z'),
    ]
    expect(masteryFromAttempts(sameDay)).toBe('competent')
  })

  it('DOES call three-right-across-weeks mastery', () => {
    expect(
      masteryFromAttempts([attempt('pct', true, day(1)), attempt('pct', true, day(8)), attempt('pct', true, day(30))]),
    ).toBe('mastered')
  })
})

describe('what to learn next', () => {
  it('never recommends something whose prerequisites are shaky as ready', () => {
    /* This is how a learner concludes they are bad at a subject when they are
       actually missing one thing underneath it. */
    const l = learnerFrom([], GRAPH)
    const next = whatNext(l, GRAPH, 5)
    const interest = next.find((r) => r.conceptId === 'interest')
    if (interest) expect(interest.blockedBy.length).toBeGreaterThan(0)
    expect(next[0]?.conceptId).toBe('arith')
  })

  it('prefers shoring up a wobbly prerequisite over starting new material', () => {
    /* A `partial` concept other things depend on is the highest-leverage
       thing in the graph. */
    const l: Learner = {
      ...NEW_LEARNER,
      mastery: new Map([['arith', 'competent'], ['frac', 'partial']]),
    }
    expect(whatNext(l, GRAPH)[0]?.conceptId).toBe('frac')
  })

  it('does not recommend something already mastered', () => {
    const l: Learner = { ...NEW_LEARNER, mastery: new Map([['arith', 'mastered']]) }
    expect(whatNext(l, GRAPH, 10).map((r) => r.conceptId)).not.toContain('arith')
  })

  it('explains every recommendation', () => {
    for (const r of whatNext(learnerFrom([], GRAPH), GRAPH, 5)) {
      expect(r.because.length).toBeGreaterThan(10)
    }
  })

  it('names what is blocking a concept that is not ready', () => {
    const blocked = whatNext(learnerFrom([], GRAPH), GRAPH, 10).find((r) => r.blockedBy.length > 0)
    expect(blocked?.blockedBy.length ?? 0).toBeGreaterThan(0)
  })
})

describe('adaptive difficulty moves down faster than up', () => {
  it('rises after two successes', () => {
    expect(nextDifficulty([attempt('p', true, day(1), 2), attempt('p', true, day(2), 2)])).toBe(3)
  })

  it('DROPS TWO after two failures', () => {
    /* A learner stuck too high stops and concludes they cannot do it. One
       held too low is merely bored for one more question. */
    expect(nextDifficulty([attempt('p', false, day(1), 4), attempt('p', false, day(2), 4)])).toBe(2)
  })

  it('holds after a mixed pair', () => {
    expect(nextDifficulty([attempt('p', true, day(1), 3), attempt('p', false, day(2), 3)])).toBe(3)
  })

  it('starts in the middle with no history', () => {
    expect(nextDifficulty([])).toBe(2)
  })

  it('stays inside the bounds', () => {
    expect(nextDifficulty([attempt('p', true, day(1), 5), attempt('p', true, day(2), 5)])).toBe(5)
    expect(nextDifficulty([attempt('p', false, day(1), 1), attempt('p', false, day(2), 1)])).toBe(1)
  })
})

describe('spaced repetition', () => {
  it('doubles the interval on a success streak', () => {
    const one = nextReview([attempt('p', true, day(1))], 'p', day(1))
    const three = nextReview(
      [attempt('p', true, day(1)), attempt('p', true, day(2)), attempt('p', true, day(4))],
      'p', day(4),
    )
    expect(Date.parse(three) - Date.parse(day(4))).toBeGreaterThan(Date.parse(one) - Date.parse(day(1)))
  })

  it('RESETS to one day on a failure, rather than halving', () => {
    /* Halving would leave a forgotten concept a week away because it used to
       be strong. Getting it wrong means seeing it soon, full stop. */
    const after = nextReview(
      [attempt('p', true, day(1)), attempt('p', true, day(2)), attempt('p', true, day(4)), attempt('p', false, day(8))],
      'p', day(8),
    )
    expect(Date.parse(after) - Date.parse(day(8))).toBe(86_400_000)
  })

  it('surfaces a concept once its interval has elapsed', () => {
    const l: Learner = { ...NEW_LEARNER, attempts: [attempt('pct', true, day(1))] }
    expect(dueForReview(l, day(1))).toEqual([])
    expect(dueForReview(l, day(5))).toEqual(['pct'])
  })

  it('has nothing due for a learner with no attempts', () => {
    expect(dueForReview(NEW_LEARNER, day(100))).toEqual([])
  })
})

describe('feedback escalates help with repeated failure', () => {
  const failures = (n: number): Learner => ({
    ...NEW_LEARNER,
    attempts: Array.from({ length: n }, (_, i) => attempt('pct', false, day(i + 1))),
  })

  it('gives only a hint on the first miss', () => {
    /* A full worked solution here removes the only chance the learner had to
       find it themselves. */
    expect(feedbackFor('pct', failures(1), '380', '420').help).toBe('hint')
  })

  it('gives a partial on the second', () => {
    expect(feedbackFor('pct', failures(2), '380', '420').help).toBe('partial')
  })

  it('gives the full solution by the third', () => {
    /* A hint on the fourth miss is withholding. */
    expect(feedbackFor('pct', failures(3), '380', '420').help).toBe('full')
  })

  it('resets after a success', () => {
    const l: Learner = {
      ...NEW_LEARNER,
      attempts: [attempt('pct', false, day(1)), attempt('pct', false, day(2)), attempt('pct', true, day(3)), attempt('pct', false, day(4))],
    }
    expect(feedbackFor('pct', l, '380', '420').help).toBe('hint')
  })

  it('always says what is wrong AND why', () => {
    const f = feedbackFor('pct', failures(1), '380', '420')
    expect(f.whatIsWrong).toContain('380')
    expect(f.whatIsWrong).toContain('420')
    expect(f.whyItIsWrong.length).toBeGreaterThan(10)
    expect(f.nextAttempt.length).toBeGreaterThan(5)
  })

  it('uses the recorded misconception as the reason when there is one', () => {
    const l: Learner = { ...failures(1), misconceptions: new Map([['pct', 'treats percent as a raw count']]) }
    expect(feedbackFor('pct', l, '380', '420').whyItIsWrong).toContain('raw count')
  })
})

describe('teaching ADJUSTS the communication plan, never replaces it', () => {
  const base = () =>
    planCommunication({
      understanding: understand({ parts: [{ modality: 'text', content: 'Teach me percentages' }], at: T0 }),
      content: '',
      personalization: DEFAULT_PERSONALIZATION,
      userState: { confusion: 0, frustration: 0, urgency: 0, repeats: 0 },
      teaching: true,
    })

  it('keeps every field of the base plan it did not need to change', () => {
    /* THE SEAM. If this built its own plan, "explain X" and "teach me X" would
       drift into two different products. */
    const b = base()
    const t = teachingAdjustments(b, NEW_LEARNER, 'pct')
    expect(t.depth).toBe(b.depth)
    expect(t.leadWith).toBe(b.leadWith)
    expect(t.language).toBe(b.language)
    expect(t.because).toContain(b.because)
  })

  it('leads with a worked example for brand new material', () => {
    expect(teachingAdjustments(base(), NEW_LEARNER, 'pct').representations[0]).toBe('worked-example')
  })

  it('CONTRASTS rather than restating when a misconception is on record', () => {
    /* The learner already has an explanation that fits. A fresh one does not
       displace it; a contrast against what they believe does. */
    const l: Learner = { ...NEW_LEARNER, mastery: new Map([['pct', 'partial']]), misconceptions: new Map([['pct', 'treats percent as a count']]) }
    const t = teachingAdjustments(base(), l, 'pct')
    expect(t.representations[0]).toBe('comparison')
    expect(t.because).toContain('contrast')
  })

  it('does NOT re-teach something already held', () => {
    /* Re-explaining what they know teaches them the system does not track
       what they know. */
    const l: Learner = { ...NEW_LEARNER, mastery: new Map([['pct', 'mastered']]) }
    const t = teachingAdjustments(base(), l, 'pct')
    expect(t.omit.join(' ')).toContain('already holds')
    expect(t.because).toContain('retrieve and stretch')
  })

  it('forces progressive disclosure for new material', () => {
    /* The checkpoint between beats is the only moment the system finds out
       whether any of it landed. */
    expect(teachingAdjustments(base(), NEW_LEARNER, 'pct').progressive).toBe(true)
  })

  it('adds no design values', () => {
    const t = teachingAdjustments(base(), NEW_LEARNER, 'pct')
    expect(JSON.stringify(t)).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\b\d+(px|rem|em)\b/i)
  })
})
