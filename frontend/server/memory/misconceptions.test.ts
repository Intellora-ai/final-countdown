/**
 * MISCONCEPTIONS ARE HYPOTHESES, NOT VERDICTS. C4, decided 2026-09-02.
 *
 *   Concept: free fall · Observed: heavier objects fall faster · Evidence: …
 *   Confidence: high · Status: active · Interventions tried: … · Outcome: …
 *   Last observed: <when> · Next action: reassess with a novel scenario
 *
 * Revisable, evidence-backed, and carried across topics: one record per
 * learner, not per topic, because "heavier falls faster" shows up in gravity,
 * in momentum, and in a chemistry lesson about density.
 */
import { describe, expect, it } from 'vitest'
import { misconceptionsIn, MOST_HYPOTHESES_KEPT } from './misconceptions.ts'
import { inMemoryStore } from './inMemory.spec.ts'

const her = { studentId: 'stu-1', tabId: 'any', lessonId: 'anything' }
const him = { studentId: 'stu-2', tabId: 'any', lessonId: 'anything' }
const seen = (said: string, at: string) => ({ said, at, beat: 'b1' })

describe('a misconception is a hypothesis with its evidence attached', () => {
  it('is observed with low confidence and everything the shape needs', () => {
    const store = misconceptionsIn(inMemoryStore())
    const one = store.observe(her, {
      concept: 'free-fall',
      observed: 'heavier objects fall faster',
      evidence: seen('the 10 kg ball lands first, even in a vacuum', '2026-09-02T10:00:00Z'),
    })
    expect(one).toMatchObject({
      concept: 'free-fall',
      observed: 'heavier objects fall faster',
      confidence: 'low',
      status: 'active',
      interventions: [],
      lastObserved: '2026-09-02T10:00:00Z',
      nextAction: 'reassess with a novel scenario',
    })
    expect(one.evidence).toHaveLength(1)
    expect(one.id).not.toBe('')
  })

  it('the same belief observed again gains evidence and confidence, never a second record', () => {
    const store = misconceptionsIn(inMemoryStore())
    store.observe(her, { concept: 'free-fall', observed: 'heavier objects fall faster', evidence: seen('a', '2026-09-02T10:00:00Z') })
    store.observe(her, { concept: 'free-fall', observed: 'Heavier objects fall faster.', evidence: seen('b', '2026-09-02T10:05:00Z') })
    const third = store.observe(her, { concept: 'free-fall', observed: 'heavier objects fall faster', evidence: seen('c', '2026-09-02T10:09:00Z') })
    expect(store.recall(her)).toHaveLength(1)
    expect(third.evidence.map((e) => e.said)).toEqual(['a', 'b', 'c'])
    expect(third.confidence).toBe('high')
    expect(third.lastObserved).toBe('2026-09-02T10:09:00Z')
  })

  it('is carried across topics and never across learners', () => {
    const store = misconceptionsIn(inMemoryStore())
    store.observe(her, { concept: 'free-fall', observed: 'heavier objects fall faster', evidence: seen('a', '2026-09-02T10:00:00Z') })
    store.observe(her, { concept: 'momentum', observed: 'heavier objects fall faster', evidence: seen('b', '2026-09-02T11:00:00Z') })
    expect(store.recall(her).map((h) => h.concept).sort()).toEqual(['free-fall', 'momentum'])
    expect(store.activeFor(her, 'momentum').map((h) => h.observed)).toEqual(['heavier objects fall faster'])
    expect(store.recall(him)).toEqual([])
  })

  it('an intervention and its outcome are recorded, and a resolved belief seen again comes back active', () => {
    const store = misconceptionsIn(inMemoryStore())
    const one = store.observe(her, { concept: 'free-fall', observed: 'heavier objects fall faster', evidence: seen('a', '2026-09-02T10:00:00Z') })
    store.intervened(her, one.id, 'concrete demonstration', '2026-09-02T10:10:00Z')
    store.concluded(her, one.id, { status: 'resolved', outcome: 'predicted equal landing in a vacuum', at: '2026-09-02T10:20:00Z' })
    let kept = store.recall(her)[0]!
    expect(kept.interventions).toEqual([{ kind: 'concrete demonstration', at: '2026-09-02T10:10:00Z' }])
    expect(kept.status).toBe('resolved')
    expect(kept.outcome).toBe('predicted equal landing in a vacuum')
    expect(store.activeFor(her, 'free-fall')).toEqual([])
    store.observe(her, { concept: 'free-fall', observed: 'heavier objects fall faster', evidence: seen('d', '2026-09-03T09:00:00Z') })
    kept = store.recall(her)[0]!
    expect(kept.status).toBe('active')
    expect(kept.nextAction).toBe('reassess with a novel scenario')
  })

  it('keeps the most recently observed MOST_HYPOTHESES_KEPT, and a corrupt row is an empty history', () => {
    const memory = inMemoryStore()
    const store = misconceptionsIn(memory)
    for (let i = 0; i < MOST_HYPOTHESES_KEPT + 5; i += 1) {
      store.observe(her, { concept: `c${i}`, observed: `belief ${i}`, evidence: seen('x', `2026-09-02T10:${String(i % 60).padStart(2, '0')}:00Z`) })
    }
    expect(store.recall(her)).toHaveLength(MOST_HYPOTHESES_KEPT)
    for (const key of [...memory.rows.keys()]) memory.rows.set(key, '{broken')
    expect(store.recall(her)).toEqual([])
  })
})
