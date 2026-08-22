import { describe, it, expect } from 'vitest'
import { ADVERSARIAL_LESSONS } from './adversarial'
import { ACCEPTANCE_LESSONS } from './acceptance'
import { selectArchetype, compositionFor } from '../layout/archetypes'
import { contentMass, climbLadder } from '../layout/disclosure'
import { validateAndRepair, type LayoutFrame, type PlacedBlock } from '../layout/validate'
import { checkBudget, budgetPrompt, BUDGET } from '../contract/budget'
import { appearanceKeysDeep } from '../contract/validate'
import type { Lesson } from '../contract/types'

/* THE STRESS SUITE.
 *
 * PASS is not "it rendered". PASS is: no overflow, no collision, no accidental
 * void, all content reachable, and a composition a person would call
 * deliberate. Every fixture here was written to break something.
 */

function compose(lesson: Lesson) {
  const decision = selectArchetype(lesson.elements as never)
  const mass = contentMass(lesson.elements as never)
  const comp = compositionFor(decision.archetype)
  const ladder = climbLadder(decision.archetype, mass, comp.slots.length, lesson.elements.length)
  const final = compositionFor(ladder.archetype)

  const blocks: PlacedBlock[] = lesson.elements.map((e, i) => {
    const slot = final.slots[Math.min(i, final.slots.length - 1)]
    const band = i < final.slots.length ? slot.band : slot.band + (i - final.slots.length) + 1
    return { id: e.id, col: slot.col, span: slot.span, band, rows: 3, overflows: false }
  })

  const frame: LayoutFrame = { archetype: ladder.archetype, blocks, edges: [], mass }
  return { decision, ladder, frame, outcome: validateAndRepair(frame, lesson.elements.length) }
}

describe('every adversarial fixture composes without breaking', () => {
  for (const lesson of ADVERSARIAL_LESSONS) {
    it(`${lesson.id} renders valid`, () => {
      const { outcome } = compose(lesson)
      const failed = outcome.checks.filter((c) => !c.holds)
      expect(failed.map((c) => `${c.name}: ${c.detail}`), lesson.id).toEqual([])
      expect(outcome.passed, lesson.id).toBe(true)
    })
  }

  it('never drops a block, in any fixture', () => {
    /* Hiding is allowed; dropping is not. The distinction Goal 2 rests on. */
    for (const lesson of ADVERSARIAL_LESSONS) {
      const { outcome } = compose(lesson)
      expect(outcome.frame.blocks.length, lesson.id).toBe(lesson.elements.length)
      const ids = new Set(outcome.frame.blocks.map((b) => b.id))
      for (const e of lesson.elements) expect(ids.has(e.id), `${lesson.id}/${e.id}`).toBe(true)
    }
  })

  it('always reaches a decision it can explain', () => {
    for (const lesson of ADVERSARIAL_LESSONS) {
      const { decision } = compose(lesson)
      expect(decision.rule, lesson.id).toBeTruthy()
      expect(decision.because.length, lesson.id).toBeGreaterThan(20)
    }
  })

  it('never leaves an accidental void, even at one block', () => {
    for (const lesson of ADVERSARIAL_LESSONS) {
      const { outcome } = compose(lesson)
      const void_ = outcome.checks.find((c) => c.name === 'noAccidentalVoid')
      expect(void_?.holds, `${lesson.id}: ${void_?.detail}`).toBe(true)
    }
  })

  it('never collides, even with nine primary blocks', () => {
    for (const lesson of ADVERSARIAL_LESSONS) {
      const { outcome } = compose(lesson)
      expect(outcome.checks.find((c) => c.name === 'noCollision')?.holds, lesson.id).toBe(true)
    }
  })
})

describe('the budget names every breach and never asks for a regeneration', () => {
  it('passes every acceptance lesson', () => {
    for (const l of ACCEPTANCE_LESSONS) {
      const hard = checkBudget(l as Lesson).filter((b) => b.rule !== 'blocks' || b.actual > BUDGET.blocks.max)
      expect(hard.map((b) => b.message), l.id).toEqual([])
    }
  })

  it('catches every adversarial breach with a remedy, not a retry', () => {
    const breached = ADVERSARIAL_LESSONS
      .map((l) => ({ id: l.id, breaches: checkBudget(l as Lesson) }))
      .filter((x) => x.breaches.length)

    expect(breached.length, 'the stress fixtures should breach budgets').toBeGreaterThan(5)

    for (const { id, breaches } of breached) {
      for (const b of breaches) {
        expect(b.message.length, id).toBeGreaterThan(5)
        expect(b.remedy.length, id).toBeGreaterThan(10)
        /* Regeneration is non-deterministic, costs a round trip, and hands the
         * learner a different lesson than the one that was nearly right. */
        expect(b.remedy.toLowerCase(), `${id}: ${b.rule}`).not.toMatch(/regenerat/)
      }
    }
  })

  it('"explain all of thermodynamics" degrades rather than breaks', () => {
    const everything: Lesson = {
      id: 'thermodynamics', question: 'Explain all of thermodynamics',
      elements: Array.from({ length: 14 }, (_, i) => ({
        id: `t${i}`, kind: 'text' as const, purpose: 'explain' as const,
        priority: 'primary' as const,
        payload: { paragraphs: ['x'.repeat(1500)] },
      })),
    }

    const breaches = checkBudget(everything)
    expect(breaches.length).toBeGreaterThan(3)
    expect(breaches.some((b) => b.rule === 'blocks')).toBe(true)
    expect(breaches.some((b) => b.rule === 'primary')).toBe(true)
    expect(breaches.some((b) => b.rule === 'proseChars')).toBe(true)

    /* And it still composes into something valid. */
    const { outcome } = compose(everything)
    expect(outcome.passed).toBe(true)
    expect(outcome.frame.blocks).toHaveLength(14)
  })

  it('states the same limits to the model that it enforces in code', () => {
    /* A limit told to the generator and a limit checked in code must be one
     * limit. Generating the prompt from the constants is how that is kept
     * true rather than remembered. */
    const prompt = budgetPrompt()
    expect(prompt).toContain(String(BUDGET.proseChars))
    expect(prompt).toContain(String(BUDGET.tableCols))
    expect(prompt).toContain(String(BUDGET.causalSteps))
    expect(prompt).toContain(String(BUDGET.chartPoints.max))
    expect(prompt).toMatch(/do not choose colours/i)
  })
})

describe('no adversarial fixture smuggles appearance', () => {
  it('holds even for content written to break things', () => {
    for (const lesson of ADVERSARIAL_LESSONS) {
      for (const e of lesson.elements) {
        const keys = e.kind === 'table' ? ['rows'] : e.kind === 'chart' ? ['data'] : []
        expect(appearanceKeysDeep(e.payload, '', keys), `${lesson.id}/${e.id}`).toBeNull()
      }
    }
  })
})

describe('the two claims, together', () => {
  const all = [...ACCEPTANCE_LESSONS, ...ADVERSARIAL_LESSONS] as unknown as Lesson[]

  it('COMPOSITIONALLY DIFFERENT — the profiles spread across the grammar', () => {
    const picks = all.map((l) => selectArchetype(l.elements as never).archetype)
    expect(new Set(picks).size, `only ${new Set(picks).size} archetypes used`).toBeGreaterThanOrEqual(5)
  })

  it('STYLISTICALLY UNIFIED — every composition draws from one grid', () => {
    for (const l of all) {
      const comp = compositionFor(selectArchetype(l.elements as never).archetype)
      for (const s of comp.slots) {
        expect(s.col + s.span - 1, l.id).toBeLessThanOrEqual(12)
      }
    }
  })

  it('every lesson, acceptance or adversarial, survives the validator', () => {
    for (const l of all) {
      expect(compose(l).outcome.passed, l.id).toBe(true)
    }
  })
})
