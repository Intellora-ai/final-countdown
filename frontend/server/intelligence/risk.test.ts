import { describe, expect, it } from 'vitest'

import { riskOf, verify, type Critic } from './risk.ts'
import liveRun2 from './__fixtures__/live-run-2.json'
import liveRun4 from './__fixtures__/live-run-4.json'

/**
 * RISK-TIERED VERIFICATION. The tier comes from the CONTENT, never from the
 * proposer's word: 0 = deterministic checks are enough, 1 = a claim about
 * the world that needs a source, 2 = a stated number, a derivation or a
 * dated fact. A risk-2 artifact without a critic's verdict is never
 * verified. Risk never lowers itself. An unknown is never a pass.
 */

function answerOf(run: unknown): string {
  return (run as { candidate: { proposal: { actions: { payload: { answer: string } }[] } } }).candidate.proposal.actions[0]?.payload.answer ?? ''
}

describe('the risk tier of an explanation', () => {
  it('is 2 for a stated value, a sum, a derivation or a dated fact -- including both recorded live answers', () => {
    for (const text of ['the sum of the zeros is -b/a', 'so 2 × 3 = 6 and we are done', 'In 1947 the country was partitioned.', answerOf(liveRun2), answerOf(liveRun4)]) {
      expect(riskOf({ answer: text, sources: [] }), text.slice(0, 40)).toBe(2)
    }
  })

  it('is 1 for a claim resting on sources, and 0 for a plain definition with no number, sum, equation or date', () => {
    expect(riskOf({ answer: 'Photosynthesis happens in the chloroplast.', sources: ['https://example.org/a'] })).toBe(1)
    expect(riskOf({ answer: 'A zero of a polynomial is a number that makes the polynomial equal zero.', sources: [] })).toBe(0)
  })

  it('never lowers a risk the proposer declared', () => {
    expect(riskOf({ answer: 'A zero of a polynomial is a number that makes it zero.', sources: [], declared: 2 })).toBe(2)
  })
})

describe('verification by tier', () => {
  const sound: Critic = async () => ({ verdict: 'sound', because: 'correct for class 10' })

  it('tier 0: the deterministic checks alone decide, and a wrong sum is unsound with the right answer', async () => {
    const wrong = await verify({ answer: 'Notice that 2 × 3 = 7.', sources: [] }, {})
    expect(wrong.risk).toBe(2)
    const arithmetic = wrong.verdicts.find((v) => v.check === 'arithmetic')
    expect(arithmetic?.verdict).toBe('unsound')
    expect(arithmetic?.because).toMatch(/6/)
    expect(wrong.verified).toBe(false)
  })

  it('tier 2 without a critic is NEVER verified, and says so', async () => {
    const out = await verify({ answer: answerOf(liveRun2), sources: [] }, {})
    expect(out.risk).toBe(2)
    expect(out.verified).toBe(false)
    expect(out.verdicts.some((v) => v.check === 'critic' && v.verdict === 'could-not-check' && /no critic/.test(v.because))).toBe(true)
  })

  it('tier 2 with a critic that finds it sound, and clean arithmetic, is verified', async () => {
    const out = await verify({ answer: answerOf(liveRun2), sources: [] }, { critic: sound })
    expect(out.verdicts.find((v) => v.check === 'critic')?.verdict).toBe('sound')
    expect(out.verified).toBe(true)
  })

  it('a critic that cannot check, or finds it unsound, leaves it unverified -- an unknown is not a pass', async () => {
    for (const reply of [{ verdict: 'could-not-check' as const, because: 'the model timed out' }, { verdict: 'unsound' as const, because: 'the sign is wrong' }]) {
      const out = await verify({ answer: 'the sum of the zeros is -b/a', sources: [] }, { critic: async () => reply })
      expect(out.verified, reply.verdict).toBe(false)
    }
  })

  it('tier 1 without sources to check against is could-not-check, never sound', async () => {
    const out = await verify({ answer: 'Photosynthesis happens in the chloroplast.', sources: ['https://example.org/a'] }, {})
    expect(out.risk).toBe(1)
    expect(out.verdicts.find((v) => v.check === 'claim')?.verdict).toBe('could-not-check')
    expect(out.verified).toBe(false)
  })

  it('a critic that throws is a could-not-check in its own words, never a crash and never a pass', async () => {
    const out = await verify({ answer: 'the sum of the zeros is -b/a', sources: [] }, { critic: async () => { throw new Error('the reasoner fell over') } })
    expect(out.verified).toBe(false)
    expect(out.verdicts.find((v) => v.check === 'critic')?.because).toMatch(/fell over/)
  })
})
