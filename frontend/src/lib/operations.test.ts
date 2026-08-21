/* CS-4 / DOD-6 — the log is what makes "step by step" measurable and replayable. */

import { describe, it, expect } from 'vitest'
import { OperationLog, isSemanticStep, type SceneOperation } from './operations'

const CH = 'matter-in-our-surroundings'
const CO = 'change-of-state'

function fixedLog() {
  let tick = 0
  return new OperationLog({ now: () => 1_700_000_000_000 + (tick += 1000) })
}

describe('CS-4 SceneOperation log', () => {
  it('numbers entries from one and never renumbers them', () => {
    const log = fixedLog()
    const a = log.append({ chapterId: CH, conceptId: CO, type: 'write', source: 'ai', payload: {} })
    const b = log.append({ chapterId: CH, conceptId: CO, type: 'draw', source: 'ai', payload: {} })
    expect([a.sequence, b.sequence]).toEqual([1, 2])
    expect(log.at(1)!.operationId).toBe(a.operationId)
  })

  it('counts only semantic steps, not camera moves or parameter changes', () => {
    // The distinction acceptance test T2 rests on: a log of six entries where
    // three are pans and slider drags contains three teaching steps.
    const log = fixedLog()
    const base = { chapterId: CH, conceptId: CO, source: 'ai' as const, payload: {} }
    log.append({ ...base, type: 'write' })
    log.append({ ...base, type: 'draw' })
    log.append({ ...base, type: 'ask' })
    log.append({ ...base, type: 'camera_change' })
    log.append({ ...base, type: 'set_parameter' })
    log.append({ ...base, type: 'camera_change' })
    expect(log.length).toBe(6)
    expect(log.semanticStepCount()).toBe(3)
  })

  it('classifies every operation type deliberately', () => {
    const op = (type: SceneOperation['type']): SceneOperation => ({
      operationId: 'x', sequence: 1, chapterId: CH, conceptId: CO,
      type, payload: {}, source: 'ai', timestamp: '',
    })
    // Exploration is not instruction.
    expect(isSemanticStep(op('camera_change'))).toBe(false)
    expect(isSemanticStep(op('set_parameter'))).toBe(false)
    // Hidden detail becoming visible IS a new idea arriving.
    expect(isSemanticStep(op('reveal'))).toBe(true)
    expect(isSemanticStep(op('correct'))).toBe(true)
    expect(isSemanticStep(op('change_representation'))).toBe(true)
  })

  it('produces identical ids and timestamps when the same log is built twice', () => {
    // DOD-6: same input, same scene. A random uuid would break this, which is
    // why identity is derived from position and kind.
    const build = () => {
      const log = fixedLog()
      log.append({ chapterId: CH, conceptId: CO, type: 'write', source: 'ai', payload: { t: 'q' } })
      log.append({ chapterId: CH, conceptId: CO, type: 'draw', source: 'ai', payload: { t: 'box' } })
      return log.list()
    }
    expect(build()).toEqual(build())
  })

  it('hands out a copy, so a caller cannot edit an append-only log', () => {
    const log = fixedLog()
    log.append({ chapterId: CH, conceptId: CO, type: 'write', source: 'ai', payload: {} })
    const taken = log.list()
    taken.push({} as SceneOperation)
    taken.length = 0
    expect(log.length).toBe(1)
  })

  it('restores a persisted log without re-deriving the ids its objects reference', () => {
    const log = fixedLog()
    log.append({ chapterId: CH, conceptId: CO, type: 'write', source: 'ai', payload: {} })
    const restored = OperationLog.from(log.toJSON())
    expect(restored.list()).toEqual(log.list())
    // And it continues numbering from where the persisted log stopped.
    const next = restored.append({ chapterId: CH, conceptId: CO, type: 'draw', source: 'ai', payload: {} })
    expect(next.sequence).toBe(2)
  })

  it('filters to one concept, so two concepts open in one session cannot mix', () => {
    const log = fixedLog()
    log.append({ chapterId: CH, conceptId: CO, type: 'write', source: 'ai', payload: {} })
    log.append({ chapterId: CH, conceptId: 'evaporation', type: 'write', source: 'ai', payload: {} })
    expect(log.forConcept(CH, CO)).toHaveLength(1)
  })
})
