/**
 * D1 — DIAGNOSIS BEFORE INTERVENTION, AS COMPETING HYPOTHESES.
 *
 * "Explain it again" helps for exactly one of the ways understanding fails.
 * Before anything is written, what went wrong is guessed at -- more than one
 * guess, each with confidence, each with the evidence that raised it. The
 * learner never sees any of this (decided: uncertainty is invisible); it
 * chooses the next move, and two learners failing the same concept for
 * different reasons must get structurally different next moves.
 */
import { describe, expect, it } from 'vitest'
import { diagnose, type Signals } from './diagnose.ts'
import { chooseStrategy, DIAGNOSES } from './teaching.ts'

const plea = (said: string, at = '2026-09-02T10:00:00Z') => ({ said, kind: 'plea' as const, at })
const answer = (said: string, at = '2026-09-02T10:00:00Z') => ({ said, kind: 'answer' as const, at })

const bare: Signals = { concept: 'quadratics', evidence: [], mayHold: [], taught: '', attempts: 0, alreadyUsed: [] }

describe('the eight ways understanding fails are told apart', () => {
  it('names every hypothesis from the shared vocabulary, ranked, with its evidence', () => {
    const ranked = diagnose({ ...bare, evidence: [plea('i dont get it')] })
    expect(ranked.length).toBeGreaterThan(1)
    for (const one of ranked) {
      expect(DIAGNOSES as readonly string[]).toContain(one.diagnosis)
      expect(one.confidence).toBeGreaterThan(0)
      expect(one.confidence).toBeLessThanOrEqual(1)
      expect(one.because).not.toBe('')
    }
    expect([...ranked].sort((a, b) => b.confidence - a.confidence)).toEqual(ranked)
  })

  it('a belief she may hold outranks everything, and repairs the misconception', () => {
    const ranked = diagnose({ ...bare, mayHold: ['heavier objects fall faster'], evidence: [plea('i dont get why the hammer doesnt land first')] })
    expect(ranked[0]?.diagnosis).toBe('misconception')
    expect(ranked[0]?.because).toMatch(/heavier objects fall faster/)
    expect(chooseStrategy({ diagnosis: ranked[0]!.diagnosis })).toBe('misconception_repair')
  })

  it('naming an earlier idea she has not met is a prerequisite gap, and repairs that instead', () => {
    const ranked = diagnose({ ...bare, evidence: [plea('what is a coefficient? i never learnt that')] })
    expect(ranked[0]?.diagnosis).toBe('prerequisite_gap')
    expect(chooseStrategy({ diagnosis: ranked[0]!.diagnosis })).toBe('prerequisite_repair')
  })

  it('two learners, one concept, two reasons: structurally different next moves', () => {
    const misconception = diagnose({ ...bare, concept: 'free-fall', mayHold: ['heavier objects fall faster'], evidence: [plea('i dont get it')] })
    const missing = diagnose({ ...bare, concept: 'free-fall', evidence: [plea('i dont get it, what is mass?')] })
    expect(misconception[0]?.diagnosis).not.toBe(missing[0]?.diagnosis)
    expect(chooseStrategy({ diagnosis: misconception[0]!.diagnosis })).not.toBe(
      chooseStrategy({ diagnosis: missing[0]!.diagnosis }),
    )
  })

  it('asking about the picture is a representation failure, not a concept gap', () => {
    const ranked = diagnose({ ...bare, evidence: [plea('the graph makes no sense to me')] })
    expect(ranked[0]?.diagnosis).toBe('representation_failure')
    expect(chooseStrategy({ diagnosis: ranked[0]!.diagnosis })).toBe('change_representation')
  })

  it('too much at once, said as much, is overload and is broken down', () => {
    const ranked = diagnose({ ...bare, evidence: [plea('this is too much at once')] })
    expect(ranked[0]?.diagnosis).toBe('cognitive_overload')
    expect(chooseStrategy({ diagnosis: ranked[0]!.diagnosis })).toBe('decomposition')
  })

  it('a fourth plea on the same idea is never the same move as the first', () => {
    const first = diagnose({ ...bare, evidence: [plea('i dont get it')] })
    const firstMove = chooseStrategy({ diagnosis: first[0]!.diagnosis })
    const later = diagnose({ ...bare, attempts: 3, alreadyUsed: [firstMove], evidence: [plea('still dont get it', '2026-09-02T10:30:00Z')] })
    const laterMove = chooseStrategy({ diagnosis: later[0]!.diagnosis, attempts: 3, alreadyUsed: [firstMove] })
    expect(laterMove).not.toBe(firstMove)
  })

  it('a learner who is answering, not pleading, is not diagnosed with anything', () => {
    expect(diagnose({ ...bare, evidence: [answer('so the zeros are where it crosses')] })).toEqual([])
  })

  it('uncertainty is real: when nothing points anywhere, the top guess is not certain', () => {
    const ranked = diagnose({ ...bare, evidence: [plea('i dont get it')] })
    expect(ranked[0]!.confidence).toBeLessThan(0.7)
    expect(ranked.map((r) => r.diagnosis)).toContain('concept_gap')
  })
})
