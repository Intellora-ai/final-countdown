import { describe, it, expect } from 'vitest'
import { selectArchetype, compositionFor, allArchetypes, GRID_COLUMNS, profile } from './archetypes'
import { ACCEPTANCE_LESSONS } from '../lessons/acceptance'
import { appearanceKeysDeep } from '../contract/validate'
import type { LessonElement } from '../contract/types'

/* THE LAYOUT GRAMMAR'S GUARDS.
 *
 * The claim under test is the one the whole project rests on: the same engine
 * produces compositionally DIFFERENT and stylistically UNIFIED output. This
 * file tests the first half. Two lessons sharing an archetype is fine when
 * their profiles are genuinely similar — what is not fine is an unexplainable
 * choice, or seven lessons collapsing onto one composition.
 */

describe('selection is deterministic and explainable', () => {
  it('returns the same archetype every run', () => {
    for (const lesson of ACCEPTANCE_LESSONS) {
      const runs = Array.from({ length: 5 }, () => selectArchetype(lesson.elements as never))
      expect(new Set(runs.map((r) => r.archetype)).size, lesson.id).toBe(1)
    }
  })

  it('names the rule that fired and the numbers it fired on', () => {
    for (const lesson of ACCEPTANCE_LESSONS) {
      const d = selectArchetype(lesson.elements as never)
      expect(d.rule, lesson.id).toBeTruthy()
      expect(d.because.length, lesson.id).toBeGreaterThan(20)
    }
  })

  it('is a pure function of its argument — no clock, no randomness, no globals', () => {
    const els = ACCEPTANCE_LESSONS[0].elements as never
    const a = selectArchetype(els)
    const b = selectArchetype(JSON.parse(JSON.stringify(els)))
    expect(a.archetype).toBe(b.archetype)
    expect(a.rule).toBe(b.rule)
  })
})

describe('different semantic profiles produce different compositions', () => {
  const picks = ACCEPTANCE_LESSONS.map((l) => ({
    id: l.id, ...selectArchetype(l.elements as never),
  }))

  it('does not collapse seven lessons onto one archetype', () => {
    const distinct = new Set(picks.map((p) => p.archetype))
    expect(distinct.size, `got ${[...distinct].join(', ')}`).toBeGreaterThanOrEqual(4)
  })

  it('routes each acceptance lesson to the composition its content wants', () => {
    const by = Object.fromEntries(picks.map((p) => [p.id, p.archetype]))
    expect(by['gas-pressure']).toBe('EXPLORATORY')        // has a simulation
    expect(by['quadratic-formula']).toBe('DERIVATION')    // purpose: derive
    expect(by['bill-to-law']).toBe('PROCESS')             // a sequence diagram
    expect(by['india-gdp']).toBe('DATA')                  // charts dominate
    expect(by['opportunity-cost']).toBe('NARRATIVE')      // prose dominates
  })

  it('explains a shared archetype rather than hiding it', () => {
    /* Two lessons may legitimately share a composition. What must never happen
     * is sharing one without the selector being able to say why. */
    const groups = new Map<string, string[]>()
    for (const p of picks) {
      groups.set(p.archetype, [...(groups.get(p.archetype) ?? []), p.id])
    }
    for (const [archetype, ids] of groups) {
      if (ids.length < 2) continue
      const rules = new Set(picks.filter((p) => ids.includes(p.id)).map((p) => p.rule))
      expect(rules.size, `${archetype} shared by ${ids.join(', ')} for different reasons`).toBe(1)
    }
  })
})

describe('the rule order is the design', () => {
  const el = (over: Record<string, unknown>) =>
    ({ id: 'x', kind: 'text', purpose: 'explain', payload: {}, ...over }) as never

  it('lets simulation beat derivation', () => {
    /* A lesson the learner can manipulate is exploratory even when it also
     * derives something. If this inverts, the gas scene stops being a stage. */
    const d = selectArchetype([
      el({ kind: 'simulation' }), el({ purpose: 'derive', kind: 'equation' }),
    ])
    expect(d.archetype).toBe('EXPLORATORY')
  })

  it('lets derivation beat comparison', () => {
    const d = selectArchetype([
      el({ purpose: 'derive', kind: 'equation' }),
      el({ kind: 'comparison', priority: 'primary' }),
    ])
    expect(d.archetype).toBe('DERIVATION')
  })

  it('falls through to SPLIT and says nothing fired', () => {
    const d = selectArchetype([el({ kind: 'quiz' }), el({ kind: 'image' as never })])
    expect(d.archetype).toBe('SPLIT')
    expect(d.rule).toBe('default')
    expect(d.because).toMatch(/No rule fired/)
  })

  it('needs exactly one primary for COMPARISON, not merely a comparison', () => {
    const twoPrimary = selectArchetype([
      el({ kind: 'comparison', priority: 'primary' }),
      el({ kind: 'table', priority: 'primary' }),
    ])
    expect(twoPrimary.archetype).not.toBe('COMPARISON')
  })
})

describe('every composition is a legal grid', () => {
  it('keeps every slot inside twelve columns', () => {
    for (const a of allArchetypes()) {
      for (const s of compositionFor(a).slots) {
        expect(s.col, `${a} slot col`).toBeGreaterThanOrEqual(1)
        expect(s.span, `${a} slot span`).toBeGreaterThanOrEqual(1)
        expect(s.col + s.span - 1, `${a} slot overflows the grid`).toBeLessThanOrEqual(GRID_COLUMNS)
      }
    }
  })

  it('never overlaps two slots in the same band', () => {
    for (const a of allArchetypes()) {
      const bands = new Map<number, Array<[number, number]>>()
      for (const s of compositionFor(a).slots) {
        const spans = bands.get(s.band) ?? []
        for (const [c0, c1] of spans) {
          const overlap = s.col <= c1 && s.col + s.span - 1 >= c0
          expect(overlap, `${a} band ${s.band}: slot ${s.col}..${s.col + s.span - 1} overlaps ${c0}..${c1}`).toBe(false)
        }
        bands.set(s.band, [...spans, [s.col, s.col + s.span - 1]])
      }
    }
  })

  it('declares intentional whitespace so a validator cannot call it a void', () => {
    /* NARRATIVE and DERIVATION leave margins on purpose. Step 5's
     * noAccidentalVoid check must be able to tell that apart from a layout
     * that simply failed. */
    expect(compositionFor('NARRATIVE').intentionalVoid).toBe(true)
    expect(compositionFor('DERIVATION').intentionalVoid).toBe(true)
    expect(compositionFor('DATA').intentionalVoid).toBe(false)
  })

  it('gives every archetype a lead slot', () => {
    for (const a of allArchetypes()) {
      expect(compositionFor(a).slots.some((s) => s.role === 'lead'), a).toBe(true)
    }
  })
})

describe('the acceptance lessons carry meaning, never appearance', () => {
  it('contains no coordinate, colour, size or alignment in any payload', () => {
    for (const lesson of ACCEPTANCE_LESSONS) {
      for (const e of lesson.elements) {
        expect(appearanceKeysDeep(e.payload), `${lesson.id}/${e.id}`).toBeNull()
      }
    }
  })

  it('covers all seven dominant forms', () => {
    const kinds = new Set(ACCEPTANCE_LESSONS.flatMap((l) => l.elements.map((e) => e.kind)))
    for (const k of ['text', 'table', 'chart', 'diagram', 'equation', 'simulation']) {
      expect(kinds.has(k as never), k).toBe(true)
    }
  })

  it('gives every lesson a question and at least two elements', () => {
    for (const l of ACCEPTANCE_LESSONS) {
      expect(l.question.endsWith('?'), l.id).toBe(true)
      expect(l.elements.length, l.id).toBeGreaterThanOrEqual(2)
      expect(l.elements.length, `${l.id} exceeds the 3-7 block budget`).toBeLessThanOrEqual(7)
    }
  })

  it('gives every lesson exactly one primary element', () => {
    for (const l of ACCEPTANCE_LESSONS) {
      const primary = l.elements.filter((e) => e.priority === 'primary')
      expect(primary.length, `${l.id} has ${primary.length} primary elements`).toBe(1)
    }
  })

  it('has a distinct semantic profile per lesson', () => {
    const sigs = ACCEPTANCE_LESSONS.map((l) => {
      const p = profile(l.elements as never)
      return `${p.dataMass.toFixed(2)}|${p.textMass.toFixed(2)}|${p.hasSimulation}|${p.hasDerivation}|${p.hasSequence}`
    })
    /* If every lesson had the same profile, the selector could not possibly
     * differentiate them and the whole exercise would be theatre. */
    expect(new Set(sigs).size).toBeGreaterThanOrEqual(5)
  })
})

/* THE THRESHOLDS, TESTED AT THEIR EDGES.
 *
 * Every test above this point asks whether selection is STABLE and
 * EXPLAINABLE: same input, same archetype; a named rule; seven lessons that do
 * not collapse onto one composition. None of them asks whether the numbers in
 * the rules are the numbers claimed.
 *
 * The mutation gate proved the gap. `p.dataMass > 0.5` became `> 0.05` and
 * `p.textMass > 0.6` became `> 0.06` -- thresholds loose enough that a single
 * table in a prose lesson selects DATA, and almost anything selects NARRATIVE
 * -- and the whole suite stayed green. The acceptance lessons all sit far from
 * the boundary, so moving the boundary moved nothing they measure.
 *
 * A threshold is only a threshold if something sits on it.
 */
describe('the mass thresholds hold exactly where they claim to', () => {
  /* A counter, not Math.random: this file's first test asserts selection is a
   * pure function with "no clock, no randomness, no globals", and a fixture
   * builder that rolls dice would undercut the claim it is helping to test. */
  let seq = 0
  const at = (kind: string): LessonElement =>
    ({ id: `e-${kind}-${seq++}`, kind, purpose: 'explain', payload: {} }) as LessonElement

  /** Neither `derive`, `simulation`, `comparison`, `timeline` nor `diagram`,
   *  so the four rules above the mass rules cannot fire and steal the case. */
  const mix = (data: number, text: number, other = 0): LessonElement[] => [
    ...Array.from({ length: data }, () => at('table')),
    ...Array.from({ length: text }, () => at('text')),
    ...Array.from({ length: other }, () => at('image')),
  ]

  it('does not select DATA at exactly half data mass', () => {
    const d = selectArchetype(mix(2, 2))
    expect(d.profile.dataMass).toBe(0.5)
    expect(d.archetype).not.toBe('DATA')
  })

  it('selects DATA as soon as data mass passes half', () => {
    const d = selectArchetype(mix(3, 1))
    expect(d.profile.dataMass).toBeCloseTo(0.75)
    expect(d.archetype).toBe('DATA')
  })

  it('does not select NARRATIVE at exactly six-tenths text mass', () => {
    /* 3 text of 5, with 2 tables keeping dataMass at 0.4 so the DATA rule
     * above cannot fire first and mask the result. */
    const d = selectArchetype(mix(2, 3))
    expect(d.profile.textMass).toBeCloseTo(0.6)
    expect(d.profile.dataMass).toBeCloseTo(0.4)
    expect(d.archetype).not.toBe('NARRATIVE')
  })

  it('selects NARRATIVE as soon as text mass passes six-tenths', () => {
    const d = selectArchetype(mix(1, 4))
    expect(d.profile.textMass).toBeCloseTo(0.8)
    expect(d.archetype).toBe('NARRATIVE')
  })

  it('falls through to SPLIT when neither mass rule fires', () => {
    const d = selectArchetype(mix(2, 2))
    expect(d.archetype).toBe('SPLIT')
    expect(d.rule).toBe('default')
  })
})
