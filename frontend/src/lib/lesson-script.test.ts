/* CS-8 / DOD-2 — "step by step" as something a test can fail.
 *
 * Every assertion here is one of the plan's numeric constraints. They are worth
 * writing down precisely because the adjective version — "the board reveals
 * things gradually" — is true of every animated interface ever built, including
 * the ones that dump a finished diagram behind a fade.
 */

import { describe, it, expect } from 'vitest'
import { scriptFor, primaryCountThrough, semanticStepCount } from './lesson-script'

const CH = 'matter-in-our-surroundings'
const CO = 'change-of-state'

describe('CS-8 the reference lesson script', () => {
  const script = scriptFor(CH, CO)!

  it('exists for the reference concept and not for an unauthored one', () => {
    expect(script).toBeTruthy()
    expect(scriptFor(CH, 'evaporation')).toBeNull()
  })

  it('contains at least eight semantic steps', () => {
    // T2. Eight is the floor the plan sets; this script has exactly eight.
    expect(semanticStepCount(script)).toBeGreaterThanOrEqual(8)
  })

  it('opens with no more than three primary objects on the board', () => {
    // DOD-2. Only steps gated on `open` are on screen when the learner arrives;
    // everything else waits to be asked for.
    const onOpen = script.steps.filter((s) => s.gate === 'open')
    expect(onOpen.filter((s) => s.primary).length).toBeLessThanOrEqual(3)
    expect(onOpen).toHaveLength(1)
  })

  it('introduces at most one primary object per learner action', () => {
    // Each step is one action and one object, so no single action may carry two.
    for (let i = 0; i < script.steps.length; i++) {
      const introduced = primaryCountThrough(script, i) - primaryCountThrough(script, i - 1)
      expect(introduced, `${script.steps[i].id} introduced ${introduced} primary objects`)
        .toBeLessThanOrEqual(1)
    }
  })

  it('gates every step after the first on the learner asking for it', () => {
    // The property that separates constructing from playing at someone.
    const [first, ...rest] = script.steps
    expect(first.gate).toBe('open')
    for (const step of rest) expect(['continue', 'answer']).toContain(step.gate)
  })

  it('asks the learner to predict before it reveals the answer', () => {
    const ask = script.steps.findIndex((s) => s.body.kind === 'ask')
    const record = script.steps.findIndex((s) => s.body.kind === 'record')
    const reveal = script.steps.findIndex((s) => s.body.kind === 'reveal')
    expect(ask).toBeGreaterThanOrEqual(0)
    // The order is the pedagogy: commit, see it recorded, then find out.
    expect(record).toBeGreaterThan(ask)
    expect(reveal).toBeGreaterThan(record)
  })

  it('gives every option a real response and marks exactly one correct', () => {
    const ask = script.steps.find((s) => s.body.kind === 'ask')!
    if (ask.body.kind !== 'ask') throw new Error('unreachable')
    expect(ask.body.options.length).toBeGreaterThanOrEqual(3)
    expect(ask.body.options.filter((o) => o.correct)).toHaveLength(1)
    for (const option of ask.body.options) {
      // A wrong answer must be answered, not scored. An option with no response
      // would leave the learner told "no" and nothing else.
      expect(option.response.trim().length).toBeGreaterThan(10)
      expect(option.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('draws a typed causal relationship rather than an untyped arrow', () => {
    const causal = script.steps.find((s) => s.body.kind === 'causal')!
    expect(causal).toBeTruthy()
    if (causal.body.kind !== 'causal') throw new Error('unreachable')
    expect(causal.body.edgeType).toBe('causal')
    expect(causal.body.chain.length).toBeGreaterThanOrEqual(3)
  })

  it('names the variable the learner may manipulate once the mechanism is shown', () => {
    expect(script.interactiveVariableId).toBe('temperature')
  })

  it('gives every step a unique id, so operations reference something stable', () => {
    const ids = script.steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
