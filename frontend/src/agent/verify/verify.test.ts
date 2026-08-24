import { describe, expect, it } from 'vitest'

import type { Claim, Understanding } from '../kernel/contracts'
import { understand } from '../understand/understand'
import {
  decide,
  selfCheck,
  verifyAddressesGoal,
  verifyAndRepair,
  verifyArithmetic,
  verifyConstraints,
  verifyNoContradiction,
  verifySources,
  type Situation,
} from './verify'

const AT = '2026-08-24T00:00:00.000Z'
const read = (t: string): Understanding => understand({ parts: [{ modality: 'text', content: t }], at: AT })

const claim = (over: Partial<Claim> = {}): Claim => ({
  statement: 'inflation was 6.2 percent',
  sources: [{ kind: 'web', ref: 'https://rbi.org.in/a' }],
  confidence: 0.8,
  ...over,
})

describe('arithmetic verification catches the error users cannot', () => {
  it('passes a correct calculation', () => {
    expect(verifyArithmetic('17.5 / 100 * 2400', 420).passed).toBe(true)
  })

  it('FAILS a wrong one and says both numbers', () => {
    /* "17.5% of 2400 = 380" reads as authoritative. This is the check that
       makes it not ship. */
    const v = verifyArithmetic('17.5 / 100 * 2400', 380)
    expect(v.passed).toBe(false)
    expect(v.detail).toContain('420')
    expect(v.detail).toContain('380')
  })

  it('fails rather than passing when the expression cannot be evaluated', () => {
    expect(verifyArithmetic('banana', 3).passed).toBe(false)
  })

  it('tolerates floating point noise', () => {
    expect(verifyArithmetic('0.1 + 0.2', 0.30000000000000004).passed).toBe(true)
  })
})

describe('source verification', () => {
  it('passes when every claim is attributed', () => {
    expect(verifySources([claim(), claim()]).passed).toBe(true)
  })

  it('FAILS when a claim lost its citation', () => {
    /* An uncited sentence beside cited ones inherits their authority without
       earning it. */
    const v = verifySources([claim(), claim({ sources: [] })])
    expect(v.passed).toBe(false)
    expect(v.detail).toContain('1 of 2')
  })

  it('notes when a confident claim rests on model knowledge alone', () => {
    const v = verifySources([claim({ sources: [{ kind: 'model', ref: 'weights' }], confidence: 0.9 })])
    expect(v.detail).toContain('model knowledge')
  })
})

describe('constraint verification checks only what is checkable', () => {
  it('passes an answer within a sentence limit', () => {
    expect(verifyConstraints('One. Two.', ['in 3 sentences'])[0]?.passed).toBe(true)
  })

  it('FAILS an answer over the limit', () => {
    const v = verifyConstraints('A. B. C. D. E.', ['in 3 sentences'])[0]
    expect(v?.passed).toBe(false)
    expect(v?.detail).toContain('produced 5')
  })

  it('checks a word limit', () => {
    expect(verifyConstraints('one two three four', ['in 3 words'])[0]?.passed).toBe(false)
  })

  it('FAILS an answer using a word that was excluded', () => {
    const v = verifyConstraints('This is basically jargon heavy', ['without jargon'])[0]
    expect(v?.passed).toBe(false)
    expect(v?.detail).toContain('jargon')
  })

  it('passes when the excluded word is absent', () => {
    expect(verifyConstraints('Plain language only', ['without jargon'])[0]?.passed).toBe(true)
  })

  it('produces NO verification for a constraint it cannot mechanically check', () => {
    /* "Explain it simply" is a real constraint this cannot verify. Emitting a
       passing check for it would be exactly the empty-pass dishonesty this
       layer exists to prevent. */
    expect(verifyConstraints('anything', ['should be simple and friendly'])).toEqual([])
  })

  it('never crashes on a constraint containing regex metacharacters', () => {
    expect(() => verifyConstraints('x', ['without (a|b)*'])).not.toThrow()
  })
})

describe('relevance and contradiction', () => {
  it('flags an answer about something else entirely', () => {
    expect(verifyAddressesGoal('The rover landed on Mars.', 'What is inflation?').passed).toBe(false)
  })

  it('passes a correct answer that uses different words', () => {
    /* A high threshold would fail most good explanations, which by definition
       introduce vocabulary the question did not contain. */
    expect(
      verifyAddressesGoal(
        'Inflation is a sustained rise in the general price level, eroding purchasing power.',
        'What is inflation?',
      ).passed,
    ).toBe(true)
  })

  it('flags repeating something the user corrected', () => {
    const v = verifyNoContradiction(
      'Real inflation is the headline number before adjustment',
      ['Real inflation is the headline number before adjustment'],
    )
    expect(v.passed).toBe(false)
  })

  it('passes when there are no corrections', () => {
    expect(verifyNoContradiction('anything at all', []).passed).toBe(true)
  })
})

describe('the repair loop', () => {
  const failing = (s: { answer: string }) => [
    { kind: 'constraint' as const, passed: s.answer.length <= 5, detail: 'too long' },
  ]

  it('repairs and re-checks', async () => {
    const out = await verifyAndRepair(
      { answer: 'far too long', claims: [] },
      failing,
      async (s) => ({ ...s, answer: 'short' }),
    )
    expect(out.passed).toBe(true)
    expect(out.rounds).toBe(1)
    expect(out.subject.answer).toBe('short')
  })

  it('marks a check as repaired so the round is visible', async () => {
    /* "It took two attempts" is the signal that the approach was wrong, not
       just the output. Hiding the round count hides that. */
    const out = await verifyAndRepair(
      { answer: 'far too long', claims: [] },
      failing,
      async (s) => ({ ...s, answer: 'short' }),
    )
    expect(out.verifications[0]?.repaired).toBe(true)
  })

  it('is bounded and does not loop forever', async () => {
    let calls = 0
    const out = await verifyAndRepair(
      { answer: 'never fixable', claims: [] },
      failing,
      async (s) => {
        calls++
        return s
      },
      3,
    )
    expect(calls).toBe(3)
    expect(out.passed).toBe(false)
    expect(out.rounds).toBe(3)
  })

  it('keeps the failures attached when it gives up', async () => {
    /* Nothing downstream may mistake a partially repaired answer for a
       verified one. */
    /* Must be LONGER than the 5-char limit, or the check passes and there is
       no failure to keep attached. The first version of this test used a
       4-character answer and asserted a green result was red. */
    const out = await verifyAndRepair({ answer: 'unfixably long', claims: [] }, failing, async (s) => s, 1)
    expect(out.passed).toBe(false)
    expect(out.verifications.some((v) => !v.passed)).toBe(true)
  })

  it('survives a repairer that throws, keeping the last attempt', async () => {
    const out = await verifyAndRepair(
      { answer: 'original', claims: [] },
      failing,
      async () => {
        throw new Error('repairer broke')
      },
    )
    expect(out.subject.answer).toBe('original')
    expect(out.passed).toBe(false)
  })

  it('does no work when everything already passes', async () => {
    let calls = 0
    const out = await verifyAndRepair({ answer: 'ok', claims: [] }, () => [], async (s) => {
      calls++
      return s
    })
    expect(calls).toBe(0)
    expect(out.rounds).toBe(0)
    expect(out.passed).toBe(true)
  })
})

describe('uncertainty selects an ACTION, not a confidence number', () => {
  const base = (over: Partial<Situation> = {}): Situation => ({
    understanding: read('What is inflation?'),
    claims: [],
    evidenceInsufficient: false,
    timeSensitive: false,
    searched: false,
    uncomputed: false,
    ...over,
  })

  it('answers a clear, settled question', () => {
    expect(decide(base()).action).toBe('answer')
  })

  it('ASKS when the referent is unknown, before anything else', () => {
    /* Searching for an unresolved "it" returns a well-sourced answer about the
       wrong thing. */
    expect(decide(base({ understanding: read('fix it') })).action).toBe('ask')
  })

  it('CALCULATES rather than answering when arithmetic is pending', () => {
    expect(decide(base({ uncomputed: true })).action).toBe('calculate')
  })

  it('SEARCHES a time-sensitive question before answering', () => {
    expect(decide(base({ timeSensitive: true })).action).toBe('search')
  })

  it('SEARCHES when the question is beyond what the model reliably knows', () => {
    const d = decide(base({ beyondKnowledge: true }))
    expect(d.action).toBe('search')
    expect(d.because).toContain('after what the model reliably knows')
  })

  it('QUALIFIES rather than answering when sources disagree', () => {
    /* Picking the better-sourced number and presenting it alone is the
       laundering this path exists to prevent. */
    const d = decide(base({ searched: true, claims: [claim({ conflict: '6.2 vs 4.9 percent' })] }))
    expect(d.action).toBe('qualify')
    expect(d.because).toContain('disagree')
  })

  it('DECLINES after a search that found nothing', () => {
    /* Falling back to model knowledge here answers, in the confident voice of
       research, a question we just proved we have no current data on. */
    const d = decide(base({ timeSensitive: true, searched: true, claims: [] }))
    expect(d.action).toBe('decline')
  })

  it('QUALIFIES on thin evidence', () => {
    expect(decide(base({ searched: true, claims: [claim()], evidenceInsufficient: true })).action).toBe('qualify')
  })

  it('ASKS when no reading of the request is confident', () => {
    const vague = { ...read('hmm'), intents: [{ kind: 'information' as const, confidence: 0.2, because: 'weak' }] }
    expect(decide(base({ understanding: vague })).action).toBe('ask')
  })

  it('always explains the action it chose', () => {
    for (const s of [base(), base({ timeSensitive: true }), base({ uncomputed: true })]) {
      expect(decide(s).because.length).toBeGreaterThan(15)
    }
  })

  it('does not answer in every situation', () => {
    /* The literal instruction: "Do not optimize for always answering." */
    const actions = new Set(
      [
        base(),
        base({ understanding: read('fix it') }),
        base({ uncomputed: true }),
        base({ timeSensitive: true }),
        base({ searched: true, timeSensitive: true, claims: [] }),
        base({ searched: true, claims: [claim({ conflict: 'x' })] }),
      ].map((s) => decide(s).action),
    )
    expect(actions.size).toBeGreaterThanOrEqual(5)
  })
})

describe('self-monitoring', () => {
  const input = (over: Partial<Parameters<typeof selfCheck>[0]> = {}) => ({
    understanding: read('What is inflation?'),
    answer: 'Inflation is a sustained rise in the general price level.',
    claims: [claim()],
    verifications: [],
    capabilitiesUsed: ['knowledge'],
    corrections: [],
    ...over,
  })

  it('answers every question from the brief’s list', () => {
    const checks = selfCheck(input())
    expect(checks.length).toBeGreaterThanOrEqual(7)
    for (const c of checks) expect(c.detail.length).toBeGreaterThan(5)
  })

  it('catches an answer that is about something else', () => {
    const checks = selfCheck(input({ answer: 'The rover landed on Mars.' }))
    expect(checks.find((c) => c.question.includes('actual question'))?.ok).toBe(false)
  })

  it('catches a number that was never recomputed', () => {
    /* The empty-pass catcher: an answer stating a figure with no arithmetic
       verification skipped the check that mattered most. */
    const checks = selfCheck(input({ answer: 'Inflation is 6.2 percent this year.' }))
    expect(checks.find((c) => c.question.includes('verify'))?.ok).toBe(false)
  })

  it('passes when the number WAS recomputed', () => {
    const checks = selfCheck(
      input({
        answer: 'That is 420.',
        verifications: [verifyArithmetic('17.5 / 100 * 2400', 420)],
      }),
    )
    expect(checks.find((c) => c.question.includes('verify'))?.ok).toBe(true)
  })

  it('catches over-explaining a greeting', () => {
    const checks = selfCheck(
      input({ understanding: read('hi'), answer: 'word '.repeat(200) }),
    )
    expect(checks.find((c) => c.question.includes('over-explain'))?.ok).toBe(false)
  })

  it('catches under-explaining an explanation request', () => {
    const checks = selfCheck(input({ answer: 'Prices rise.' }))
    expect(checks.find((c) => c.question.includes('under-explain'))?.ok).toBe(false)
  })

  it('catches an unsupported claim', () => {
    const checks = selfCheck(input({ claims: [claim({ sources: [] })] }))
    expect(checks.find((c) => c.question.includes('unsupported'))?.ok).toBe(false)
  })

  it('catches repeating a correction', () => {
    const checks = selfCheck(
      input({ answer: 'Real inflation is the headline number', corrections: ['Real inflation is the headline number'] }),
    )
    expect(checks.find((c) => c.question.includes('contradict'))?.ok).toBe(false)
  })
})
