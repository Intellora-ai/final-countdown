// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { LessonRenderer } from './LessonRenderer'
import { rendererKeys, isRendererKey, loaderFor } from './renderers'
import { registerRepresentations, resetBootstrap } from '../contract/bootstrap'
import { resetRegistry, contractFor } from '../contract/registry'
import type { Lesson } from '../contract/types'

/* THE TEST THAT WAS MISSING.
 *
 * 252 tests passed while no renderer existed at all. Every one of them tested
 * the engine -- expressions, contracts, archetypes, disclosure, axis maths --
 * and not one turned a lesson into elements. That is exactly how a missing
 * layer hid behind a green suite.
 *
 * These assert CONTENT, not structure: real cell values, real prose, real
 * mathematics. A test that only checked "a div rendered" would reproduce the
 * blind spot it exists to close.
 */

const lesson: Lesson = {
  id: 'mixed', question: 'Does the renderer actually draw anything?',
  elements: [
    {
      id: 'prose', kind: 'text', purpose: 'explain', priority: 'primary',
      title: 'The idea',
      payload: {
        paragraphs: ['Compound interest is interest earned on interest.'],
        emphasis: ['interest'],
      },
    },
    {
      id: 'numbers', kind: 'table', purpose: 'quantify', priority: 'supporting',
      title: 'Growth',
      payload: {
        columns: [
          { key: 'years', label: 'Years', type: 'number' },
          { key: 'value', label: 'Value', type: 'currency', unit: 'INR', precision: 0 },
        ],
        rows: [{ years: 5, value: 14693 }, { years: 10, value: 21589 }],
      },
    },
    {
      id: 'curve', kind: 'chart', purpose: 'quantify', priority: 'supporting',
      title: 'Over time',
      payload: {
        intent: 'trend',
        fields: [
          { name: 'year', role: 'x', type: 'quantitative' },
          { name: 'value', role: 'y', type: 'quantitative', unit: 'INR' },
        ],
        data: [{ year: 0, value: 100 }, { year: 1, value: 108 }, { year: 2, value: 117 }],
      },
    },
  ],
}

beforeEach(() => { resetRegistry(); resetBootstrap(); registerRepresentations() })
afterEach(cleanup)

describe('the renderer draws real content, not placeholders', () => {
  it('renders the question as a heading', () => {
    render(<LessonRenderer lesson={lesson} />)
    expect(screen.getByRole('heading', { name: lesson.question })).toBeDefined()
  })

  it('renders prose with its actual words', async () => {
    render(<LessonRenderer lesson={lesson} />)
    /* The text is deliberately split across elements — 'interest' is
     * emphasised, so it renders inside its own <strong>. Matching the whole
     * sentence therefore needs a flexible matcher, and the split is the
     * emphasis feature working rather than a defect. */
    const para = await screen.findByText(
      (_, el) => el?.tagName === 'P' && /interest earned on interest/.test(el.textContent ?? ''),
    )
    expect(para).toBeDefined()
    expect(para.querySelectorAll('strong').length).toBeGreaterThan(0)
  })

  it('renders a table with real rows, headers and formatted cells', async () => {
    render(<LessonRenderer lesson={lesson} />)
    const table = await screen.findByRole('table')

    /* The unit belongs in the header, once — never repeated per cell. */
    expect(within(table).getByText('Value (INR)')).toBeDefined()
    expect(within(table).getByText('Years')).toBeDefined()

    /* Real values, formatted by column type — not raw JSON. */
    /* Formatted by column type AND unit: thousands separator, no decimals as
     * declared, and the rupee symbol because the column says INR. */
    expect(within(table).getByText('₹14,693')).toBeDefined()
    expect(within(table).getByText('₹21,589')).toBeDefined()
    expect(within(table).getAllByRole('row')).toHaveLength(3) // header + 2
  })

  it('renders a chart as an accessible image with real axis ticks', async () => {
    render(<LessonRenderer lesson={lesson} />)
    const chart = await screen.findByRole('img', { name: /against/ })
    /* Ticks come from d3-scale via derive(); their presence proves the whole
     * contract → derive → panel chain ran, not just that an SVG appeared. */
    /* Ticks come from d3-scale via derive(); their presence proves the whole
     * contract → derive → panel chain ran, not just that an SVG appeared.
     * '0' appears on both axes, so assert the tick set rather than one label. */
    const ticks = [...chart.querySelectorAll('text')].map((t) => t.textContent)
    expect(ticks.filter((t) => /^\d+$/.test(t ?? '')).length).toBeGreaterThan(2)

    /* Assert MARKS exist without assuming which mark. Three points on a
     * quantitative x-axis is a bar chart, not a line -- the contract decides
     * that, and a test that demanded <path> would be asserting my guess about
     * the chart type rather than the renderer's behaviour. */
    const marks = chart.querySelectorAll('path, rect, circle')
    expect(marks.length, 'the chart drew no marks at all').toBeGreaterThan(0)
  })

  it('renders every element — none silently disappears', async () => {
    const { container } = render(<LessonRenderer lesson={lesson} />)
    await screen.findByRole('table')
    expect(container.querySelectorAll('[data-canvas="block"]')).toHaveLength(3)
  })
})

describe('unknown kinds fail visibly, never silently', () => {
  const broken: Lesson = {
    id: 'b', question: 'What happens to a kind nothing can draw?',
    elements: [{
      id: 'ghost', kind: 'simulation', purpose: 'demonstrate',
      payload: { model: 'ideal-gas' },
    }],
  }

  it('shows a placeholder that names the kind and the reason', () => {
    const { container } = render(<LessonRenderer lesson={broken} />)
    const el = container.querySelector('[data-canvas="unrenderable"]')
    expect(el, 'an unrenderable block must be visible').not.toBeNull()
    expect(el!.textContent).toMatch(/simulation/)
    expect(el!.textContent).toMatch(/Nothing could render/)
  })

  it('still renders the block slot, so the lesson has no invisible hole', () => {
    const { container } = render(<LessonRenderer lesson={broken} />)
    expect(container.querySelectorAll('[data-canvas="block"]')).toHaveLength(1)
  })
})

describe('the renderer map is the only route from data to a component', () => {
  it('resolves every key a registered contract names', () => {
    for (const kind of ['text', 'table', 'chart']) {
      const key = contractFor(kind)!.renderer
      expect(isRendererKey(key), `${kind} names '${key}', which is not registered`).toBe(true)
      expect(loaderFor(key), key).not.toBeNull()
    }
  })

  it('refuses a key that was never registered', () => {
    /* A lesson naming its own component is the injection this map exists to
     * prevent. */
    expect(isRendererKey('EvilPanel')).toBe(false)
    expect(loaderFor('EvilPanel')).toBeNull()
    expect(loaderFor(undefined)).toBeNull()
    expect(loaderFor({ toString: () => 'TextPanel' })).toBeNull()
  })

  it('exposes a closed set of keys', () => {
    expect(rendererKeys().sort()).toEqual(
      ['ChartPanel', 'DiagramPanel', 'EquationPanel', 'TablePanel', 'TextPanel'],
    )
  })
})
