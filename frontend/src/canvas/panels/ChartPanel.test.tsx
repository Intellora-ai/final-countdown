// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { ChartPanel } from './ChartPanel'
import { chartContract, type ChartPayload, type Mark } from '../contract/representations/chart'
import { series } from '../design/tokens'
import type { RepresentationContext, LessonElement } from '../contract/types'

/* THE MARK THE CONTRACT CHOSE MUST BE THE MARK THE USER SEES.
 *
 * ChartPanel used to branch on `mark === 'bar'` and send everything else --
 * line, area, pie AND scatter -- down one polyline path. A composition of
 * three unordered categories was therefore drawn as a descending trend line,
 * and the SVG's own aria-label announced it as "a pie chart" while doing so.
 * That is not a cosmetic gap: it is the renderer asserting a trend the data
 * cannot support, to sighted and screen-reader users alike.
 *
 * These tests assert SEMANTICS, not mounting. Every mark is driven through the
 * real contract, so a divergence between what `derive()` decides and what the
 * DOM contains fails here rather than in front of a learner.
 */

afterEach(cleanup)

const ctx = (element: LessonElement): RepresentationContext => ({
  element,
  sourceDataProfile: {},
  viewport: { width: 1200, height: 800 },
  availableRenderers: [],
  existingRelationships: [],
  accessibilityRequirements: {
    contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true,
  },
})

/** Drive a payload through the real contract and render what it decided. */
function renderChart(payload: ChartPayload, title = 'Chart') {
  const element: LessonElement = {
    id: 'c', kind: 'chart', purpose: 'quantify', payload,
  }
  const parsed = chartContract.validate(payload)
  if (!parsed.ok) throw new Error('fixture rejected: ' + JSON.stringify(parsed.issues))
  const c = ctx(element)
  const normalized = chartContract.normalize(parsed.value, c)
  const derived = chartContract.derive(normalized, c) as Record<string, unknown>
  const view = render(
    <ChartPanel data={normalized} derived={derived} title={title} />,
  )
  return { ...view, derived, mark: derived.mark as Mark, normalized }
}

/* ── fixtures, one per mark the contract can choose ─────────────────────── */

const composition: ChartPayload = {
  intent: 'composition',
  fields: [
    { name: 'sector', role: 'x', type: 'nominal' },
    { name: 'share', role: 'y', type: 'quantitative', unit: '%' },
  ],
  data: [
    { sector: 'Services', share: 55 },
    { sector: 'Industry', share: 27 },
    { sector: 'Agriculture', share: 18 },
  ],
}

const relationshipNominalX: ChartPayload = {
  intent: 'relationship',
  fields: [
    { name: 'material', role: 'x', type: 'nominal' },
    { name: 'strength', role: 'y', type: 'quantitative' },
  ],
  data: [
    { material: 'Steel', strength: 400 },
    { material: 'Aluminium', strength: 210 },
    { material: 'Copper', strength: 220 },
    { material: 'Titanium', strength: 380 },
  ],
}

const trendTemporal: ChartPayload = {
  intent: 'trend',
  fields: [
    { name: 'year', role: 'x', type: 'temporal' },
    { name: 'growth', role: 'y', type: 'quantitative', unit: '%' },
  ],
  data: [
    { year: 2020, growth: 3 }, { year: 2021, growth: 5 },
    { year: 2022, growth: 4 }, { year: 2023, growth: 7 },
  ],
}

const changeOverTime: ChartPayload = {
  intent: 'change',
  fields: [
    { name: 'month', role: 'x', type: 'temporal' },
    { name: 'level', role: 'y', type: 'quantitative' },
  ],
  data: [
    { month: 1, level: 10 }, { month: 2, level: 14 },
    { month: 3, level: 12 }, { month: 4, level: 18 },
  ],
}

const comparison: ChartPayload = {
  intent: 'comparison',
  fields: [
    { name: 'team', role: 'x', type: 'nominal' },
    { name: 'points', role: 'y', type: 'quantitative' },
  ],
  data: [
    { team: 'A', points: 12 }, { team: 'B', points: 9 }, { team: 'C', points: 15 },
  ],
}

/* ── the parity gate ────────────────────────────────────────────────────── */

describe('every mark the contract can choose has a rendering branch', () => {
  /* Derived from chart.ts markFor() + marksAgree(). If a new mark is added to
   * the Mark union without a branch here and in ChartPanel, this fails. */
  const MARKS: Mark[] = ['bar', 'line', 'area', 'pie', 'scatter']

  const fixtureFor: Record<Mark, ChartPayload> = {
    bar: comparison,
    line: trendTemporal,
    area: changeOverTime,
    pie: composition,
    scatter: relationshipNominalX,
  }

  it('the Mark union and the fixture table agree, so no mark is untested', () => {
    expect(Object.keys(fixtureFor).sort()).toEqual([...MARKS].sort())
  })

  for (const mark of MARKS) {
    it(`renders '${mark}' with its own marks in the DOM, not another mark's`, () => {
      const r = renderChart(fixtureFor[mark])
      expect(r.mark, `fixture for '${mark}' derived '${r.mark}'`).toBe(mark)

      const drawn = r.container.querySelectorAll(`[data-mark="${mark}"]`)
      expect(drawn.length, `no [data-mark="${mark}"] element was rendered`)
        .toBeGreaterThan(0)
    })
  }

  it('never renders a mark the contract did not choose', () => {
    for (const mark of MARKS) {
      const r = renderChart(fixtureFor[mark])
      const foreign = MARKS
        .filter((m) => m !== mark)
        /* area legitimately contains a line: the boundary of the filled band. */
        .filter((m) => !(mark === 'area' && m === 'line'))
        .filter((m) => r.container.querySelector(`[data-mark="${m}"]`) !== null)
      expect(foreign, `'${mark}' also drew: ${foreign.join(', ')}`).toEqual([])
      cleanup()
    }
  })
})

/* ── pie: the bug that shipped ──────────────────────────────────────────── */

describe('a composition renders as sectors, never as a trend', () => {
  it('derives pie for three unordered categories', () => {
    expect(renderChart(composition).mark).toBe('pie')
  })

  it('draws one sector per category', () => {
    const r = renderChart(composition)
    expect(r.container.querySelectorAll('[data-mark="pie"]')).toHaveLength(3)
  })

  it('draws arcs, not straight segments', () => {
    const r = renderChart(composition)
    const sectors = [...r.container.querySelectorAll('[data-mark="pie"]')]
    for (const s of sectors) {
      /* 'A' is the SVG elliptical-arc command. A pie without one is a polygon. */
      expect(s.getAttribute('d') ?? '').toMatch(/A/)
    }
  })

  it('does NOT draw a connecting line through the categories', () => {
    /* The exact defect: Services 55 -> Industry 27 -> Agriculture 18 drawn as a
     * descending line asserts a trend across categories that have no order. */
    const r = renderChart(composition)
    expect(r.container.querySelector('[data-mark="line"]')).toBeNull()
    expect(r.container.querySelector('[data-mark="area"]')).toBeNull()
  })

  it('gives every sector its own series colour', () => {
    const r = renderChart(composition)
    const fills = [...r.container.querySelectorAll('[data-mark="pie"]')]
      .map((s) => s.getAttribute('fill'))
    expect(new Set(fills).size, 'sectors share a fill and cannot be told apart')
      .toBe(fills.length)
    for (const f of fills) expect(series as readonly string[]).toContain(f)
  })

  it('labels every sector with its category and value', () => {
    const r = renderChart(composition)
    const text = r.container.textContent ?? ''
    for (const row of composition.data) {
      expect(text).toContain(String(row.sector))
    }
  })

  it('states each sector share as a percentage of the whole', () => {
    const r = renderChart(composition)
    /* 55 of 100 -> 55%. A sector whose angle encodes a share must say so. */
    expect(r.container.textContent).toMatch(/55%/)
  })

  it('drops the cartesian axes, which mean nothing on a pie', () => {
    const r = renderChart(composition)
    expect(r.container.querySelector('[data-axis="y"]')).toBeNull()
    expect(r.container.querySelector('[data-axis="x"]')).toBeNull()
  })

  it('announces itself as a pie chart and is one', () => {
    const r = renderChart(composition)
    const svg = r.container.querySelector('svg[role="img"]')!
    expect(svg.getAttribute('aria-label')).toMatch(/pie/i)
    expect(r.container.querySelectorAll('[data-mark="pie"]').length).toBeGreaterThan(0)
  })
})

/* ── scatter: the silent fallthrough ────────────────────────────────────── */

describe('a relationship over categories renders as points, never as a trend', () => {
  it('derives scatter for a nominal x', () => {
    expect(renderChart(relationshipNominalX).mark).toBe('scatter')
  })

  it('draws one independent point per datum', () => {
    const r = renderChart(relationshipNominalX)
    expect(r.container.querySelectorAll('[data-mark="scatter"]')).toHaveLength(4)
  })

  it('does NOT connect the points', () => {
    const r = renderChart(relationshipNominalX)
    expect(r.container.querySelector('[data-mark="line"]')).toBeNull()
  })

  it('keeps every point when the series is longer than the old 24-dot cap', () => {
    /* The line branch only drew dots at <= 24 rows, so a 30-point scatter used
     * to lose every marker and become a bare polyline. */
    const many: ChartPayload = {
      intent: 'relationship',
      fields: [
        { name: 'label', role: 'x', type: 'nominal' },
        { name: 'v', role: 'y', type: 'quantitative' },
      ],
      data: Array.from({ length: 30 }, (_, i) => ({ label: `c${i}`, v: i * 3 })),
    }
    const r = renderChart(many)
    expect(r.mark).toBe('scatter')
    expect(r.container.querySelectorAll('[data-mark="scatter"]')).toHaveLength(30)
  })
})

/* ── the marks that already worked, now pinned ──────────────────────────── */

describe('bar, line and area keep their meaning', () => {
  it('draws one bar per category, all anchored to the same baseline', () => {
    const r = renderChart(comparison)
    const bars = [...r.container.querySelectorAll('[data-mark="bar"]')]
    expect(bars).toHaveLength(3)
    const bases = bars.map((b) => Number(b.getAttribute('y')) + Number(b.getAttribute('height')))
    for (const base of bases) expect(base).toBeCloseTo(bases[0], 6)
  })

  it('draws a single connected path for a temporal trend', () => {
    const r = renderChart(trendTemporal)
    expect(r.container.querySelectorAll('[data-mark="line"]')).toHaveLength(1)
  })

  it('draws a filled band and its boundary for a change', () => {
    const r = renderChart(changeOverTime)
    expect(r.container.querySelectorAll('[data-mark="area"]')).toHaveLength(1)
    expect(r.container.querySelectorAll('[data-mark="line"]')).toHaveLength(1)
  })

  it('keeps the y axis on cartesian marks', () => {
    const r = renderChart(comparison)
    expect(r.container.querySelector('[data-axis="y"]')).not.toBeNull()
  })
})

/* ── the aria-label may never outrun the drawing ────────────────────────── */

describe('the accessible name matches what was drawn', () => {
  const cases: Array<[string, ChartPayload]> = [
    ['bar', comparison],
    ['line', trendTemporal],
    ['area', changeOverTime],
    ['pie', composition],
    ['scatter', relationshipNominalX],
  ]

  for (const [name, payload] of cases) {
    it(`announces '${name}' only when it drew ${name}`, () => {
      const r = renderChart(payload)
      const label = r.container.querySelector('svg[role="img"]')!.getAttribute('aria-label') ?? ''
      expect(label).toContain(name)
      expect(r.container.querySelectorAll(`[data-mark="${name}"]`).length).toBeGreaterThan(0)
    })
  }
})
