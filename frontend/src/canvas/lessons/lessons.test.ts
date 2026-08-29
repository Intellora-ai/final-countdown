import { describe, expect, it } from 'vitest'

import { checkFrame, plan, profile, selectArchetype } from '../layout/layout'
import { validateLesson } from '../spec/validate'
import { billBecomesLaw } from './billBecomesLaw'
import { classifierEvaluation } from './classifierEvaluation'
import { gasPressure } from './gasPressure'
import { logarithms } from './logarithms'
import { tenses } from './tenses'

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

/*
 * ALL FIVE AUTHORED LESSONS, NOT THREE.
 *
 * `logarithms` and `tenses` shipped in `CanvasRoute`'s registry at `'lesson'`
 * level -- the strictest teaching setting -- and were absent from here, so
 * nothing failed if either stopped teaching. They render today, which means
 * this addition is expected to pass on its first run: it is a GUARD, not a
 * fix, and saying that out loud is the point. A test that passes immediately
 * proves only that the thing was already true; what it buys is that a future
 * change which breaks it now goes red instead of silent.
 *
 * The three engine lessons are deliberately NOT here. They are held at
 * `'answer'` level because the engine's `emit` builds only `prose` and
 * `callout` -- see `CanvasRoute.tsx`. Listing them at `'lesson'` would fail for
 * a reason this file cannot fix.
 */
const LESSONS = [
  { name: 'gas pressure (physics, simulation-led)', spec: gasPressure },
  { name: 'bill becomes law (civics, process-led)', spec: billBecomesLaw },
  { name: 'classifier evaluation (ML, figure-led)', spec: classifierEvaluation },
  { name: 'logarithms (maths, equation-led)', spec: logarithms },
  { name: 'tenses (English, table-led)', spec: tenses },
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
  it('justifies every lesson differently, so the selector cannot be a constant', () => {
    /*
     * THIS ASSERTION CHANGED. It used to require every lesson to land on a
     * DIFFERENT archetype. Here is the evidence that the assertion was the
     * wrong one, because a test is not edited on taste.
     *
     * MEASURED: with the selector reading content correctly, `bill` (a
     * legislative process drawn as figures), `logs` (a derivation) and `tenses`
     * (how a tense is formed) are all chains walked end to end. There are five
     * archetypes and five lessons, so demanding all-distinct demands that three
     * genuine sequences be given three different compositions -- which is the
     * selector NOT reading the content, the exact defect this test exists to
     * catch. The old assertion held only by accident, while the corpus was
     * three lessons.
     *
     * `CLAUDE.md` states the real rule: "Two lessons sharing an archetype is
     * fine IF their profiles are genuinely similar and the selector can justify
     * it." All-distinct is stricter than that and contradicts it.
     *
     * WHY THE REPLACEMENT IS HARDER, NOT SOFTER. It asserts the second half of
     * that sentence -- the half nothing checked. When this was written the
     * sequence branch returned a fixed string with no numbers in it, so `logs`
     * and `tenses` were justified BYTE-IDENTICALLY. All-distinct-archetypes
     * sails past that; this does not. "If the selector cannot justify its
     * archetype choice, the selector failed" is now a fact rather than a hope.
     *
     * A selector that became a constant fails here too: identical archetypes
     * produced by identical reasoning collapse to one justification.
     */
    const justifications = LESSONS.map(({ spec }) => {
      const result = validateLesson(spec)
      if (!result.ok) throw new Error('invalid fixture')
      const chosen = selectArchetype(profile(result.lesson))
      return `${chosen.archetype}: ${chosen.explain}`
    })

    expect(new Set(justifications).size).toBe(justifications.length)

    /* And it is still reading the content, not returning one answer with
       different numbers glued on. */
    const archetypes = new Set(justifications.map((j) => j.split(':')[0]))
    expect(archetypes.size).toBeGreaterThanOrEqual(3)
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
