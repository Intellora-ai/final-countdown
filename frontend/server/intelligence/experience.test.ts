import { describe, expect, it } from 'vitest'

import type { Evidence } from '../memory/evidence.ts'
import { experienceOf } from './experience.ts'

/**
 * EXPERIENCE: what followed each piece of teaching, from the evidence store
 * alone -- what she typed after it, as what it observably was. Never a mark.
 * An artifact nothing followed is 'unknown', never a success. This is the
 * "learn" stage the brief ends on, and it is derived, never stored twice.
 */

function said(kind: Evidence['kind'], artifactSeq: number | undefined, at: number, strategy?: string): Evidence {
  return { said: kind === 'empty' ? '' : `${kind} ${at}`, kind, at: new Date(1_700_000_000_000 + at * 1000).toISOString(), ...(artifactSeq === undefined ? {} : { artifactSeq }), ...(strategy === undefined ? {} : { strategy }) }
}

describe('experience', () => {
  it('names what followed each artifact by the evidence s own kinds, one outcome per kind', () => {
    const cases: [Evidence['kind'], string][] = [['plea', 'pleaded'], ['answer', 'answered'], ['question', 'asked'], ['empty', 'silent']]
    for (const [kind, outcome] of cases) {
      const one = experienceOf([said(kind, 7, 1)])
      expect(one.artifacts.map((a) => [a.seq, a.outcome])).toEqual([[7, outcome]])
    }
  })

  it('a plea is the signal: one plea outranks any number of answers on the same artifact', () => {
    const many = [said('answer', 3, 1), said('answer', 3, 2), said('answer', 3, 3), said('plea', 3, 4), said('answer', 3, 5)]
    const [artifact] = experienceOf(many).artifacts
    expect(artifact?.outcome).toBe('pleaded')
    expect(artifact?.pleas).toBe(1)
    expect(artifact?.answers).toBe(4)
  })

  it('an artifact nothing followed is UNKNOWN, listed, and never a success', () => {
    const out = experienceOf([said('answer', 2, 1)], [1, 2, 3])
    expect(out.artifacts.map((a) => [a.seq, a.outcome])).toEqual([[1, 'unknown'], [2, 'answered'], [3, 'unknown']])
    expect(JSON.stringify(out)).not.toMatch(/success|understood|mastered|score/i)
  })

  it('counts evidence that names no artifact rather than dropping it', () => {
    const out = experienceOf([said('plea', undefined, 1), said('answer', 5, 2), said('empty', undefined, 3)])
    expect(out.unplaced).toBe(2)
    expect(out.artifacts).toHaveLength(1)
  })

  it('remembers the teaching moves already spent on an artifact, in order and without repeats', () => {
    const out = experienceOf([said('plea', 9, 1, 'worked-example'), said('plea', 9, 2, 'analogy'), said('plea', 9, 3, 'worked-example')])
    expect(out.artifacts[0]?.movesSpent).toEqual(['worked-example', 'analogy'])
  })

  it('lists artifacts in the order they were taught', () => {
    const out = experienceOf([said('answer', 12, 1), said('answer', 4, 2), said('plea', 8, 3)])
    expect(out.artifacts.map((a) => a.seq)).toEqual([4, 8, 12])
  })
})
