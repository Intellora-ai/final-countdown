import { describe, expect, it } from 'vitest'

import { checkFrame, plan, profile, selectArchetype } from '../layout/layout'
import { validateLesson } from '../spec/validate'
import { billBecomesLaw } from './billBecomesLaw'
import { classifierEvaluation } from './classifierEvaluation'
import { gasPressure } from './gasPressure'

/**
 * The acceptance test for the whole engine.
 *
 * Two things must be SIMULTANEOUSLY true, and they pull against each other:
 *
 *   Compositionally different — different semantic profiles must produce
 *   different compositions, each one explainable.
 *
 *   Stylistically unified — the same tokens and component recipes across both.
 *
 * Two lessons that lay out identically would mean the selector is decoration.
 * Two that look like different products would mean the design system is. This
 * file guards the first; the Law 4 sweep and the shared visual kit guard the
 * second.
 */

const LESSONS = [
  { name: 'gas pressure (physics, simulation-led)', spec: gasPressure },
  { name: 'bill becomes law (civics, process-led)', spec: billBecomesLaw },
  { name: 'classifier evaluation (ML, figure-led)', spec: classifierEvaluation },
] as const

const WIDTHS = [420, 760, 1024, 1440, 2200]

describe('every lesson passes the gate', () => {
  for (const { name, spec } of LESSONS) {
    it(`${name} validates`, () => {
      const result = validateLesson(spec)
      // The failure message carries the issues, so a break is diagnosable from
      // CI output alone rather than needing a local repro.
      expect(result.ok, result.ok ? '' : JSON.stringify(result.issues, null, 1)).toBe(true)
    })

    it(`${name} lays out cleanly at every width`, () => {
      const result = validateLesson(spec)
      if (!result.ok) throw new Error('invalid fixture')

      for (const width of WIDTHS) {
        const frame = plan(result.lesson, { width, height: 900 })
        const failures = checkFrame(frame).filter((c) => !c.ok)
        expect(failures, `${name} at ${width}: ${JSON.stringify(failures)}`).toHaveLength(0)

        // Nothing may be dropped to make a frame fit.
        expect(frame.blocks).toHaveLength(result.lesson.blocks.length)
      }
    })

    it(`${name} justifies its composition`, () => {
      const result = validateLesson(spec)
      if (!result.ok) throw new Error('invalid fixture')
      const { explain } = selectArchetype(profile(result.lesson))
      expect(explain.length).toBeGreaterThan(40)
    })
  }
})

describe('different content produces different composition', () => {
  it('does not give two unlike lessons the same archetype', () => {
    /*
     * The one assertion that catches a selector which has quietly become a
     * constant. A physics lesson built around an interactive simulation and a
     * civics lesson built around a branching process have genuinely different
     * profiles; if they land on the same composition, the selector is not
     * reading the content.
     */
    const archetypes = LESSONS.map(({ spec }) => {
      const result = validateLesson(spec)
      if (!result.ok) throw new Error('invalid fixture')
      return selectArchetype(profile(result.lesson)).archetype
    })

    expect(new Set(archetypes).size).toBe(archetypes.length)
  })

  it('uses shapes the other lesson never touches', () => {
    // If both lessons drew the same shapes, "it renders anything" would be
    // untested no matter how many representations the registry lists.
    const kindsOf = (spec: (typeof LESSONS)[number]['spec']) => {
      const result = validateLesson(spec)
      if (!result.ok) throw new Error('invalid fixture')
      return new Set(
        result.lesson.blocks.map((b) => (b.kind === 'figure' ? `figure:${b.as}` : b.kind)),
      )
    }

    const gas = kindsOf(gasPressure)
    const bill = kindsOf(billBecomesLaw)

    const onlyGas = [...gas].filter((k) => !bill.has(k))
    const onlyBill = [...bill].filter((k) => !gas.has(k))

    expect(onlyGas.length, 'gas uses nothing unique').toBeGreaterThan(2)
    expect(onlyBill.length, 'bill uses nothing unique').toBeGreaterThan(2)
  })
})

describe('the validator actually refuses things', () => {
  /* A gate that has never said no is a gate nobody has tested. */

  it('refuses a spec carrying appearance', () => {
    const result = validateLesson({
      ...gasPressure,
      blocks: [{ id: 'p', kind: 'prose', body: 'hi', color: '#ff0000' }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => /appearance/.test(i.message))).toBe(true)
  })

  it('refuses a figure whose data does not match its representation', () => {
    const result = validateLesson({
      id: 'x',
      question: 'Q?',
      blocks: [
        {
          id: 'f',
          kind: 'figure',
          as: 'sankey', // wants flowWeighted
          data: { shape: 'parts', parts: [{ label: 'a', value: 1 }] },
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.issues.some((i) => /needs flowWeighted/.test(i.message))).toBe(true)
  })

  it('refuses a figure that breaks its shape invariant', () => {
    const result = validateLesson({
      id: 'x',
      question: 'Q?',
      blocks: [
        {
          id: 'f',
          kind: 'figure',
          as: 'flowchart',
          data: {
            shape: 'process',
            // A decision with one way out is an action wearing a diamond.
            steps: [
              { id: 's', label: 'S', kind: 'start' },
              { id: 'd', label: 'D?', kind: 'decision' },
              { id: 'e', label: 'E', kind: 'end' },
            ],
            transitions: [
              { from: 's', to: 'd' },
              { from: 'd', to: 'e', label: 'only way' },
            ],
          },
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => /at least two/.test(i.message))).toBe(true)
  })
})
