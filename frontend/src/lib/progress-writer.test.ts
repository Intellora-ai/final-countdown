/* CS-11 / DOD-11 — observed events only, and nothing invented.
 *
 * The assertions that matter are the ones about what is NOT written. It is easy
 * to test that a counter went up; the discipline this project actually needs is
 * that no number appears which nothing observed.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { store } from '../data/store'
import { createProgressWriter } from './progress-writer'
import type { Adapter, DB } from '../types'

class FakeAdapter implements Adapter {
  db: DB | null = null
  load() { return Promise.resolve(this.db) }
  subscribe() { return () => undefined }
  commit(db: DB) { this.db = db; return Promise.resolve() }
  close() { /* nothing to release */ }
}

const CH = 'matter-in-our-surroundings'
const CO = 'change-of-state'

beforeEach(async () => {
  await store.init(new FakeAdapter())
})

describe('CS-11 progress writes', () => {
  it('records one attempt per prediction, and nothing else numeric', () => {
    const before = store.observed(CH, CO)
    const writer = createProgressWriter(CH, CO)

    writer.recordPrediction('faster', true)
    writer.recordPrediction('heavier', false)

    const after = store.observed(CH, CO)
    expect(after.attempts).toBe(before.attempts + 2)
    // Hints are NOT incremented: this board has no hint affordance, so a hint
    // count would be a zero pretending to be an observation.
    expect(after.hints).toBe(before.hints)
    expect(after.revisits).toBe(before.revisits)
  })

  it('logs correctness as an event rather than folding it into a score', () => {
    const writer = createProgressWriter(CH, CO)
    writer.recordPrediction('heavier', false)
    const events = store.activity(20).filter((e) => e.type === 'prediction')
    expect(events[0].from).toBe('heavier')
    expect(events[0].to).toBe('incorrect')
    // There is no accuracy percentage anywhere, because nobody has defined what
    // one prediction on one concept would be a percentage OF.
    const observed = store.observed(CH, CO) as Record<string, unknown>
    expect(Object.keys(observed)).not.toContain('accuracy')
    expect(Object.keys(observed)).not.toContain('confidence')
    expect(Object.keys(observed)).not.toContain('score')
  })

  it('records representation switches in the activity log, not as a progress metric', () => {
    const writer = createProgressWriter(CH, CO)
    writer.recordRepresentation('melting-condition')
    const events = store.activity(20).filter((e) => e.type === 'representation')
    expect(events[0].to).toBe('melting-condition')
    // "How many ways did they look at it" is not a measure of anything until
    // someone defines what it would mean, so it stays out of ProgressRecord.
    const observed = store.observed(CH, CO) as Record<string, unknown>
    expect(Object.keys(observed)).not.toContain('representations')
  })

  it('writes measured seconds on close, and never a zero', () => {
    let clock = 1_000_000
    const before = store.observed(CH, CO).seconds
    const writer = createProgressWriter(CH, CO, () => clock)
    clock += 42_000
    writer.close()
    expect(store.observed(CH, CO).seconds).toBe(before + 42)
  })

  it('does not write a record for a board opened and closed within one second', () => {
    let clock = 2_000_000
    const before = store.observed(CH, CO).seconds
    const writer = createProgressWriter(CH, CO, () => clock)
    clock += 400
    writer.close()
    expect(store.observed(CH, CO).seconds).toBe(before)
  })

  it('is idempotent on close, so an unmount twice does not double the time', () => {
    let clock = 3_000_000
    const before = store.observed(CH, CO).seconds
    const writer = createProgressWriter(CH, CO, () => clock)
    clock += 10_000
    writer.close()
    clock += 10_000
    writer.close()
    expect(store.observed(CH, CO).seconds).toBe(before + 10)
  })

  it('leaves weaknessHook returning null — nothing here defines "weak"', () => {
    const writer = createProgressWriter(CH, CO)
    writer.recordPrediction('heavier', false)
    writer.recordPrediction('bigger', false)
    writer.close()
    // Two wrong predictions is not weakness. It is two wrong predictions.
    expect(store.weakness(CH, CO)).toBeNull()
  })
})
