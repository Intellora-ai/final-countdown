import { describe, expect, it } from 'vitest'

import { extractExpression } from './loop'

/**
 * THE ARITHMETIC EXTRACTOR, AND BOTH WAYS IT HAS BEEN WRONG.
 *
 * This function decides whether a number in an answer gets verified at all, so
 * it has two failure modes and they point in opposite directions.
 *
 * TOO PERMISSIVE was the original bug. The regex anchors on the first digit it
 * can reach, so a notation it does not model had its prefix eaten and what
 * remained was a DIFFERENT valid expression. The verifier then faithfully
 * checked that other expression and stamped `passed: true` --- five of six
 * cases wrong, every one internally consistent, and correct on `2+2` which is
 * the case anyone writes a fixture for.
 *
 * TOO STRICT was the fix's own regression. `\s*` sits inside the repeated group
 * of the bare regex, so the match swallows its trailing space and the character
 * examined after it was the first letter of the NEXT WORD. Every expression not
 * at the very end of a string was refused. That is a regression in the SAFE
 * direction, which is exactly why it would have survived: `calculate` quietly
 * stops firing on ordinary phrasing and nothing looks broken.
 *
 * So both halves are asserted here, in one file, because fixing either one
 * alone is what produced the other.
 */

describe('refuses a truncation rather than verifying a different sum', () => {
  const MISREAD: readonly [string, string][] = [
    ['What is 1e5*2?', 'scientific notation, would compute 5*2 = 10 not 200000'],
    ['What is 3.5e2 + 1?', 'would compute 2 + 1 = 3 not 351'],
    ['What is 0x10+1?', 'hexadecimal, would compute 10+1 = 11 not 17'],
    ['What is 1_000+1?', 'digit separator, would compute 000+1 = 1 not 1001'],
    ['What is .5+1?', 'leading decimal point, would compute 5+1 = 6 not 1.5'],
    ['What is 2e3*2?', 'scientific notation without a decimal part'],
    ['1e5*2 now?', 'at the start of the string, so only the left side betrays it'],
    ['2+2.5e3?', 'the notation is in the SECOND operand, not the first'],
  ]

  for (const [text, why] of MISREAD) {
    it(`refuses "${text}" --- ${why}`, () => {
      expect(extractExpression(text)).toBeNull()
    })
  }
})

describe('still extracts ordinary arithmetic, wherever it sits in the sentence', () => {
  /* THE HALF THAT KEEPS THE REFUSAL HONEST. A guard that refuses everything
     satisfies every assertion above and silently deletes the capability. */
  const EXTRACTS: readonly [string, string][] = [
    ['What is 2+2?', '2+2'],
    ['Add 10+20 please', '10+20'],
    ['please compute 2+2 for me', '2+2'],
    ['the answer to 5*5 is', '5*5'],
    ['Compute 3*4.', '3*4'],
    ['what is 2 + 3 * 4', '2 + 3 * 4'],
    ['What is 100/4?', '100/4'],
    ['10 * 10 exactly', '10 * 10'],
  ]

  for (const [text, expected] of EXTRACTS) {
    it(`reads "${text}" as ${expected}`, () => {
      expect(extractExpression(text)).toBe(expected)
    })
  }

  it('rewrites a percentage to division rather than dropping the sign', () => {
    /* Dropping the `%` would compute 17.5 * 2400 --- a wrong answer rather
       than a refusal, which is the worse of the two failures. */
    expect(extractExpression('Calculate 17.5% of 2400')).toBe('17.5 / 100 * 2400')
  })

  it('handles a percentage followed by a full stop', () => {
    expect(extractExpression('what is 17.5% of 2400.')).toBe('17.5 / 100 * 2400')
  })

  it('returns null when there is no arithmetic at all, not a guess', () => {
    expect(extractExpression('What is inflation?')).toBeNull()
    expect(extractExpression('hello')).toBeNull()
  })
})

describe('the two sides of a match are not symmetric', () => {
  /* Treating them the same leaked `.5+1`. A `.` immediately BEFORE the match is
     always a decimal point, because the match begins with a digit by
     construction. A `.` AFTER it is only a decimal point when a digit follows;
     otherwise it is a full stop. */

  it('a period BEFORE the match is always a decimal point', () => {
    expect(extractExpression('is .5+1 correct')).toBeNull()
  })

  it('a period AFTER the match is a full stop when no digit follows', () => {
    expect(extractExpression('Compute 3*4. Thanks')).toBe('3*4')
  })

  it('a decimal operand is matched WHOLE, so there is nothing to refuse', () => {
    /* I first wrote this expecting null, and the code was right and the test
       was wrong. The bare regex already models `\.\d+` as part of a number, so
       `3*4.5` matches in full --- it is not a truncation, and 3*4.5 = 13.5 is
       exactly what should be verified. The `.`-after-match rule only fires when
       the match STOPPED before a decimal part, which this does not. */
    expect(extractExpression('Compute 3*4.5')).toBe('3*4.5')
  })

  it('refuses when the match genuinely stopped before a decimal part', () => {
    /* The case the after-side `.` rule exists for: scientific notation puts a
       non-digit between the digits, so the match ends at `2+2` with `.5e3`
       trailing and unconsumed. */
    expect(extractExpression('2+2.5e3?')).toBeNull()
  })
})
