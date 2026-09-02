/**
 * EVIDENCE: WHAT THE LEARNER TYPED, WHEN, AND WHAT KIND OF THING IT WAS.
 *
 * C3 (decided 2026-09-02). This is the record every later decision -- the
 * eight-way diagnosis, the misconception hypotheses, the priority engine --
 * reasons from. It keeps `explanations.ts`'s rule: nothing here is a judgement
 * the software cannot observe. A plea IS observable: the learner wrote it.
 */
import { describe, expect, it } from 'vitest'
import { evidenceIn, MOST_EVIDENCE_KEPT, type Evidence } from './evidence.ts'
import { inMemoryStore } from './inMemory.spec.ts'

const her = { studentId: 'stu-1', tabId: 'any', lessonId: 'polynomials--zeros' }
const him = { studentId: 'stu-2', tabId: 'any', lessonId: 'polynomials--zeros' }
const one = (said: string, kind: Evidence['kind'], at: string): Evidence => ({ said, kind, at, beat: 'b1' })

describe('evidence is kept in the order it happened, per learner, per topic', () => {
  it('records and recalls in order', () => {
    const store = inMemoryStore()
    const evidence = evidenceIn(store)
    evidence.record(her, 'polynomials--zeros', one('so the zeros are where it crosses', 'answer', '2026-09-02T10:00:00Z'))
    evidence.record(her, 'polynomials--zeros', one('i still dont get why there are two', 'plea', '2026-09-02T10:01:00Z'))
    const kept = evidence.recall(her, 'polynomials--zeros')
    expect(kept.map((e) => e.kind)).toEqual(['answer', 'plea'])
    expect(kept[1]?.said).toBe('i still dont get why there are two')
  })

  it('one learner never sees another learner, and one topic never sees another', () => {
    const store = inMemoryStore()
    const evidence = evidenceIn(store)
    evidence.record(her, 'polynomials--zeros', one('a', 'answer', '2026-09-02T10:00:00Z'))
    expect(evidence.recall(him, 'polynomials--zeros')).toEqual([])
    expect(evidence.recall(her, 'real-numbers')).toEqual([])
  })

  it('keeps the most recent MOST_EVIDENCE_KEPT, never grows without bound', () => {
    const store = inMemoryStore()
    const evidence = evidenceIn(store)
    for (let i = 0; i < MOST_EVIDENCE_KEPT + 25; i += 1) {
      evidence.record(her, 't', one(`said ${i}`, 'answer', `2026-09-02T10:00:${String(i % 60).padStart(2, '0')}Z`))
    }
    const kept = evidence.recall(her, 't')
    expect(kept.length).toBe(MOST_EVIDENCE_KEPT)
    expect(kept[kept.length - 1]?.said).toBe(`said ${MOST_EVIDENCE_KEPT + 24}`)
  })

  it('a corrupt row is an empty history, never a crash', () => {
    const store = inMemoryStore()
    const evidence = evidenceIn(store)
    for (const key of [...store.rows.keys()]) store.rows.delete(key)
    evidence.record(her, 't', one('x', 'answer', '2026-09-02T10:00:00Z'))
    const [key] = [...store.rows.keys()]
    store.rows.set(key!, '{not json')
    expect(evidence.recall(her, 't')).toEqual([])
  })
})
