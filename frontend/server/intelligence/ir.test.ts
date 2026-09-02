import { describe, expect, it } from 'vitest'

import { learningAction } from './ir.ts'

const ACTION_KINDS = learningAction.shape.kind.options

/**
 * THE LEARNING ACTION IR is the only thing an intelligence may hand the
 * canvas, and every field on it is a promise a person can check. These tests
 * iterate the kinds the IR itself declares, so a kind added tomorrow is
 * covered the day it appears.
 */
describe('a learning action', () => {
  it('says WHY, or it is not an action', () => {
    for (const kind of ACTION_KINDS) {
      const refused = learningAction.safeParse({ kind, risk: 0, evidence: [] })
      expect(refused.success, `${kind} without a reason was accepted`).toBe(false)
    }
  })

  it('accepts every kind it declares, and only those', () => {
    for (const kind of ACTION_KINDS) {
      const ok = learningAction.safeParse({ kind, because: 'a real reason', risk: 0, evidence: [] })
      expect(ok.success, `${kind} was refused`).toBe(true)
    }
    expect(learningAction.safeParse({ kind: 'teach-somehow', because: 'x', risk: 0, evidence: [] }).success).toBe(false)
  })

  it('carries a risk of 0, 1 or 2 and nothing in between', () => {
    for (const risk of [0, 1, 2]) {
      expect(learningAction.safeParse({ kind: 'explain', because: 'r', risk, evidence: [] }).success).toBe(true)
    }
    for (const risk of [-1, 3, 1.5, '1']) {
      expect(learningAction.safeParse({ kind: 'explain', because: 'r', risk, evidence: [] }).success, `risk ${String(risk)}`).toBe(false)
    }
  })
})
