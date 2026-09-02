import { describe, expect, it } from 'vitest'

import { extractExpression } from './loop'

/**
 * A STUDENT TYPES A SUM THE WAY SHE WRITES IT. Indian classrooms write × and
 * ÷; keyboards give * and /. The calculator must read both, or "is my
 * working right: 2 × 3 = 7" is answered without ever checking the working
 * -- which the novel-composition benchmark measured on 2026-09-03: calculate
 * selected, never executed, "no arithmetic expression could be extracted".
 */
describe('extractExpression reads a sum however it is written', () => {
  it('reads × and ÷ exactly as it reads * and /', () => {
    const twins: [string, string][] = [
      ['is my working right: 2 × 3 = 7 so the answer is 7', 'is my working right: 2 * 3 = 7 so the answer is 7'],
      ['10 ÷ 4 gives 2.5', '10 / 4 gives 2.5'],
      ['so 12 × 3 ÷ 4 is 9', 'so 12 * 3 / 4 is 9'],
    ]
    for (const [written, ascii] of twins) {
      const fromWritten = extractExpression(written)
      const fromAscii = extractExpression(ascii)
      expect(fromAscii, ascii).not.toBeNull()
      expect(fromWritten, written).toBe(fromAscii)
    }
  })
})
