/**
 * P11-T3 — the DETERMINISTIC validators, and they run before any scoring.
 *
 * The rule this phase is shaped by: a model is never the only judge. Whether a
 * response is valid JSON, carries every required field at the right type, offers
 * exactly four distinct options, names a correct option that actually exists,
 * and states a solution the cited source supports -- all of that is decidable by
 * code. Handing any of it to a model would be paying for an opinion about a
 * question that has an answer.
 *
 * Every case below is a PAIR: an input that must be rejected and one that must
 * be accepted. A validator asserted only to reject is satisfied completely by
 * `return [ANY_FINDING]`, and one asserted only to accept is satisfied by
 * `return []`. Both are vacuous, and both look like a passing suite.
 */
import { describe, expect, it } from 'vitest'

import { validatePractice } from './practice'

/**
 * The shape a good response has, stated as a type rather than as
 * `Record<string, unknown>`.
 *
 * The looser type made `good().options` `unknown`, so every spoiler in this file
 * had to cast before it could touch an option -- and a cast is where a typo
 * stops being a compile error. Naming the shape lets the spoilers stay honest:
 * they build a WRONG value from a RIGHT one, and the compiler still checks the
 * right one.
 */
interface Option {
  key: string
  text: string
  rationale: string
}
interface Good {
  questionText: string
  options: Option[]
  correctOption: string
  fullSolution: string
  computation: null
}

/** A response with nothing wrong with it. Every rejection case is this, spoiled. */
function good(): Good {
  return {
    questionText: 'A gas at 300 K is heated to 600 K at constant volume. What happens to its pressure?',
    options: [
      { key: 'A', text: 'It halves', rationale: 'Inverts the relationship.' },
      { key: 'B', text: 'It doubles', rationale: 'Pressure is proportional to absolute temperature at fixed volume.' },
      { key: 'C', text: 'It is unchanged', rationale: 'Confuses constant volume with constant pressure.' },
      { key: 'D', text: 'It quadruples', rationale: 'Squares the ratio instead of taking it directly.' },
    ],
    correctOption: 'B',
    fullSolution: 'At constant volume pressure is proportional to absolute temperature, so doubling 300 K to 600 K doubles the pressure.',
    computation: null,
  }
}

/** The codes the tests pin. A rename here must be a deliberate contract change. */
const CODES = {
  notJson: 'not-json',
  missing: 'missing-field',
  type: 'wrong-type',
  options: 'bad-options',
  correct: 'correct-option-not-an-option',
} as const

function codes(raw: unknown): string[] {
  return validatePractice(raw).map((f) => f.code)
}

describe('validatePractice', () => {
  it('ACCEPTS a well-formed response', () => {
    /*
     * The half that stops every other test being satisfied by a validator that
     * rejects everything. Without it, `return [{code:'x',detail:'x'}]` passes
     * every rejection case in this file.
     */
    expect(validatePractice(good())).toEqual([])
  })

  it('rejects a string that is not JSON at all', () => {
    expect(codes('not json {')).toContain(CODES.notJson)
  })

  it('rejects valid JSON that is not an object', () => {
    expect(codes('[1, 2, 3]')).toContain(CODES.notJson)
  })

  it.each(['questionText', 'options', 'correctOption', 'fullSolution'])(
    'rejects a response missing %s',
    (field) => {
      const raw: Record<string, unknown> = { ...good() }
      delete raw[field]
      const found = validatePractice(raw)
      expect(found.map((f) => f.code)).toContain(CODES.missing)
      /* The FIELD NAME, not just the code. A finding that says "something is
         missing" cannot be acted on, and this repository has already been
         bitten by assertions that checked the symptom instead of the message. */
      expect(found.some((f) => f.detail.includes(field))).toBe(true)
    },
  )

  it('rejects questionText that is a number rather than a string', () => {
    expect(codes({ ...good(), questionText: 42 })).toContain(CODES.type)
  })

  it('rejects a blank questionText', () => {
    /* `''` satisfies `typeof x === 'string'` and is not a question. A required
       field whose emptiness is allowed is not required. */
    expect(codes({ ...good(), questionText: '   ' })).toContain(CODES.missing)
  })

  it('rejects three options', () => {
    expect(codes({ ...good(), options: good().options.slice(0, 3) })).toContain(CODES.options)
  })

  it('rejects five options', () => {
    const raw = good()
    expect(
      codes({ ...raw, options: [...raw.options, { key: 'D', text: 'x', rationale: 'y' }] }),
    ).toContain(CODES.options)
  })

  it('rejects duplicate option keys', () => {
    /*
     * Four options, all four required keys present in the schema's eyes if it
     * only counted length. A duplicated key means one of A-D is unreachable and
     * the learner can be marked wrong for choosing the right letter.
     */
    const opts = good().options
    opts[3] = { ...opts[3], key: 'A' }
    expect(codes({ ...good(), options: opts })).toContain(CODES.options)
  })

  it('rejects an option with a blank rationale', () => {
    const opts = good().options
    opts[0] = { ...opts[0], rationale: '' }
    expect(codes({ ...good(), options: opts })).toContain(CODES.options)
  })

  it('rejects a correctOption that no option carries', () => {
    expect(codes({ ...good(), correctOption: 'E' })).toContain(CODES.correct)
  })

  it('reports EVERY problem, not just the first', () => {
    /*
     * A validator that returns on its first finding turns one bad response into
     * as many CI rounds as it has defects. The contract is a list.
     */
    const found = codes({ ...good(), questionText: '', correctOption: 'E' })
    expect(found).toContain(CODES.missing)
    expect(found).toContain(CODES.correct)
  })
})
