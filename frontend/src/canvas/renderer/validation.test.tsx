// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import React from 'react'
import { LessonRenderer } from './LessonRenderer'
import { measureBlock, GRID_ROW_PX } from './measure'
import { registerRepresentations, resetBootstrap } from '../contract/bootstrap'
import { resetRegistry } from '../contract/registry'
import type { Lesson } from '../contract/types'

/* THE VALIDATOR NOW RUNS WHERE THE PIXELS ARE.
 *
 * layout/validate.ts was correct code with no production caller on the render
 * path. Its only live caller was LessonGallery's slot preview, and that caller
 * constructed every block as `rows: 3, overflows: false` — two literals.
 * `noOverflow` filters on `b.overflows`, so with the field pinned to `false`
 * the check could not fail for any lesson at any viewport. The suite was green
 * because the inputs were fiction.
 *
 * These tests exist to make that specific failure impossible to reintroduce.
 * They assert that the renderer VALIDATES, that what it validates came from
 * MEASUREMENT, and that a frame which genuinely overflows is repaired rather
 * than shown.
 *
 * ON THE TEST ENVIRONMENT, stated because it bounds what these prove. jsdom
 * lays nothing out: every rect is 0x0 and scrollWidth is always 0, and it ships
 * no ResizeObserver. So geometry is injected here. That makes these tests
 * assertions about the PIPELINE — does a measured overflow reach the validator,
 * does a repair reach the DOM — and not about whether Chrome's box model
 * agrees. The browser half of that claim belongs in Playwright.
 */

/* ── a controllable ResizeObserver ──────────────────────────────────────── */

type ROCallback = (entries: unknown[], observer: unknown) => void
const observers: Array<{ cb: ROCallback; targets: Element[] }> = []

class StubResizeObserver {
  private entry: { cb: ROCallback; targets: Element[] }
  constructor(cb: ROCallback) {
    this.entry = { cb, targets: [] }
    observers.push(this.entry)
  }
  observe(el: Element) { this.entry.targets.push(el) }
  unobserve() { /* not needed */ }
  disconnect() {
    const i = observers.indexOf(this.entry)
    if (i >= 0) observers.splice(i, 1)
  }
}

/** Fire every live observer, as the browser would after a layout change. */
function triggerResize() {
  act(() => {
    for (const o of [...observers]) o.cb([], null)
  })
}

/* ── injected geometry ──────────────────────────────────────────────────── */

interface Geometry {
  /** Width reported by the lesson root, i.e. the measured viewport. */
  rootWidth: number
  rootHeight: number
  /** Per-block-id scroll/client widths. Absent ids get a non-overflowing box. */
  blocks?: Record<string, { scrollWidth: number; clientWidth: number; height?: number }>
}

let geometry: Geometry = { rootWidth: 1200, rootHeight: 800 }

function installGeometry() {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      if (this.dataset.canvas === 'lesson') {
        return { width: geometry.rootWidth, height: geometry.rootHeight, top: 0, left: 0,
          right: geometry.rootWidth, bottom: geometry.rootHeight, x: 0, y: 0, toJSON: () => ({}) }
      }
      const id = this.dataset.blockId
      const h = (id && geometry.blocks?.[id]?.height) ?? GRID_ROW_PX * 3
      const w = (id && geometry.blocks?.[id]?.clientWidth) ?? 300
      return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }
    },
  })

  for (const prop of ['scrollWidth', 'clientWidth'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        const id = this.dataset.blockId
        if (id && geometry.blocks?.[id]) return geometry.blocks[id][prop]
        return 300
      },
    })
  }
  for (const prop of ['scrollHeight', 'clientHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get() { return 100 },
    })
  }
}

beforeEach(() => {
  resetRegistry(); resetBootstrap(); registerRepresentations()
  observers.length = 0
  geometry = { rootWidth: 1200, rootHeight: 800 }
  vi.stubGlobal('ResizeObserver', StubResizeObserver)
  installGeometry()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const prose = (id: string, text: string) => ({
  id, kind: 'text' as const, purpose: 'explain' as const,
  payload: { paragraphs: [text] },
})

const lesson: Lesson = {
  id: 'measured', question: 'Does the validator see real numbers?',
  elements: [
    prose('a', 'The first block.'),
    prose('b', 'The second block.'),
    prose('c', 'The third block.'),
  ],
}

/* ── the validator is on the render path ────────────────────────────────── */

describe('the validator runs in the production render flow', () => {
  it('marks the frame validated, not merely rendered', () => {
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-validated')).toBe('true')
  })

  it('reports the validator verdict on the element', () => {
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-validation-passed')).toBe('true')
  })

  it('renders every block it was given', () => {
    const { container } = render(<LessonRenderer lesson={lesson} />)
    expect(container.querySelectorAll('[data-canvas="block"]')).toHaveLength(3)
  })
})

/* ── the viewport is measured, not guessed ──────────────────────────────── */

describe('the viewport comes from the DOM, not from a constant', () => {
  it('uses the measured width rather than the old 1200x800 default', () => {
    geometry = { rootWidth: 375, rootHeight: 812 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-source')).toBe('measured')
    expect(root.getAttribute('data-viewport-width')).toBe('375')
  })

  it('never silently reports 1200 when the container is a phone', () => {
    /* The exact regression: a 375px container producing desktop capacity. */
    geometry = { rootWidth: 375, rootHeight: 812 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-width')).not.toBe('1200')
  })

  it('remeasures when the container resizes', () => {
    geometry = { rootWidth: 375, rootHeight: 812 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-width')).toBe('375')

    geometry = { rootWidth: 1440, rootHeight: 900 }
    triggerResize()

    expect(root.getAttribute('data-viewport-width')).toBe('1440')
  })

  it('lets an explicit prop win over measurement, for embedders that know better', () => {
    geometry = { rootWidth: 375, rootHeight: 812 }
    const { container } = render(
      <LessonRenderer lesson={lesson} viewport={{ width: 1024, height: 768 }} />,
    )
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-source')).toBe('prop')
    expect(root.getAttribute('data-viewport-width')).toBe('1024')
  })
})

/* ── overflow is detected, not assumed away ─────────────────────────────── */

describe('a block that genuinely overflows is caught', () => {
  it('measureBlock reports overflow when content is wider than the box', () => {
    const el = document.createElement('div')
    el.dataset.blockId = 'wide'
    geometry = { rootWidth: 375, rootHeight: 812, blocks: { wide: { scrollWidth: 900, clientWidth: 300 } } }
    document.body.appendChild(el)
    expect(measureBlock(el).overflows).toBe(true)
  })

  it('measureBlock does NOT report overflow for a box that opted into scrolling', () => {
    /* A table's scroll container is the disclosure plan working, not a fault.
     * Counting it as overflow would make the honest fix look like the bug. */
    const el = document.createElement('div')
    el.dataset.blockId = 'wide'
    el.innerHTML = '<div data-overflow="scroll"></div>'
    geometry = { rootWidth: 375, rootHeight: 812, blocks: { wide: { scrollWidth: 900, clientWidth: 300 } } }
    document.body.appendChild(el)
    expect(measureBlock(el).overflows).toBe(false)
  })

  it('ignores a sub-pixel difference, which is rounding rather than overflow', () => {
    const el = document.createElement('div')
    el.dataset.blockId = 'hair'
    geometry = { rootWidth: 375, rootHeight: 812, blocks: { hair: { scrollWidth: 300.4, clientWidth: 300 } } }
    document.body.appendChild(el)
    expect(measureBlock(el).overflows).toBe(false)
  })

  it('repairs the frame when a measured block overflows', () => {
    geometry = {
      rootWidth: 375, rootHeight: 812,
      blocks: {
        a: { scrollWidth: 1200, clientWidth: 200 },
        b: { scrollWidth: 1200, clientWidth: 200 },
        c: { scrollWidth: 1200, clientWidth: 200 },
      },
    }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    /* The repair ladder ran because the measurement said it had to. */
    expect(Number(root.getAttribute('data-repairs'))).toBeGreaterThan(0)
  })

  it('does not repair a frame that measures clean', () => {
    geometry = {
      rootWidth: 1440, rootHeight: 900,
      blocks: {
        a: { scrollWidth: 200, clientWidth: 300 },
        b: { scrollWidth: 200, clientWidth: 300 },
        c: { scrollWidth: 200, clientWidth: 300 },
      },
    }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-repairs')).toBe('0')
    expect(root.getAttribute('data-used-fallback')).toBe('false')
  })

  it('never leaves an unresolved failing check on the painted frame', () => {
    geometry = {
      rootWidth: 320, rootHeight: 568,
      blocks: {
        a: { scrollWidth: 2000, clientWidth: 100 },
        b: { scrollWidth: 2000, clientWidth: 100 },
        c: { scrollWidth: 2000, clientWidth: 100 },
      },
    }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    /* Either it passed, or the fallback ran. What it must never do is paint a
     * frame that is still failing a check. */
    const passed = root.getAttribute('data-validation-passed') === 'true'
    const fellBack = root.getAttribute('data-used-fallback') === 'true'
    expect(passed || fellBack, `failed: ${root.getAttribute('data-failed-checks')}`).toBe(true)
  })

  it('keeps every block after a repair — content is moved, never dropped', () => {
    geometry = {
      rootWidth: 320, rootHeight: 568,
      blocks: {
        a: { scrollWidth: 2000, clientWidth: 100 },
        b: { scrollWidth: 2000, clientWidth: 100 },
        c: { scrollWidth: 2000, clientWidth: 100 },
      },
    }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    expect(container.querySelectorAll('[data-canvas="block"]')).toHaveLength(3)
  })
})

/* ── the constants that made the old validator vacuous ──────────────────── */

describe('the fabricated inputs are gone', () => {
  it('rows come from the measured height, not the literal 3', () => {
    const el = document.createElement('div')
    el.dataset.blockId = 'tall'
    geometry = {
      rootWidth: 1200, rootHeight: 800,
      blocks: { tall: { scrollWidth: 100, clientWidth: 300, height: GRID_ROW_PX * 9 } },
    }
    document.body.appendChild(el)
    expect(measureBlock(el).rows).toBe(9)
  })

  it('overflows comes from the measured box, not the literal false', () => {
    const el = document.createElement('div')
    el.dataset.blockId = 'over'
    geometry = { rootWidth: 1200, rootHeight: 800, blocks: { over: { scrollWidth: 800, clientWidth: 300 } } }
    document.body.appendChild(el)
    expect(measureBlock(el).overflows).toBe(true)
  })
})

/* ── invariants run, and a violation is never drawn ─────────────────────── */

/* The gas lesson's `graph` element carries two points. chart fitness scores it
 * 0.1, `enoughPointsToPlot` reports holds:false, and before this it rendered
 * anyway: a confident two-point trend line. The contract knew and the renderer
 * never asked. */
const twoPointChart: Lesson = {
  id: 'thin', question: 'Can two points be a trend?',
  elements: [{
    id: 'graph', kind: 'chart', purpose: 'quantify', title: 'Pressure vs temperature',
    payload: {
      intent: 'trend',
      fields: [
        { name: 't', role: 'x', type: 'quantitative' },
        { name: 'p', role: 'y', type: 'quantitative', unit: 'kPa' },
      ],
      data: [{ t: 300, p: 100 }, { t: 400, p: 133 }],
    },
  }],
}

describe('a representation that fails its own invariants is refused, not drawn', () => {
  it('refuses a two-point trend instead of drawing one', () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    expect(container.querySelector('[data-canvas="invariant-refusal"]')).not.toBeNull()
  })

  it('names the invariant that failed', () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    const r = container.querySelector('[data-canvas="invariant-refusal"]')!
    expect(r.getAttribute('data-violated')).toContain('enoughPointsToPlot')
  })

  it('draws no chart marks at all for the refused block', () => {
    /* The whole point: no line, no area, no dots. Nothing that reads as data. */
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    expect(container.querySelector('[data-mark]')).toBeNull()
  })

  it('explains the refusal in words a learner can act on', () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    expect(container.textContent).toContain('Fewer than three points')
  })

  it('keeps the block title, so the lesson still reads as a sequence', () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    expect(container.textContent).toContain('Pressure vs temperature')
  })

  it('announces the refusal to assistive technology', () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    const r = container.querySelector('[data-canvas="invariant-refusal"]')!
    expect(r.getAttribute('role')).toBe('status')
  })

  it('does not refuse a chart whose invariants all hold', async () => {
    const fine: Lesson = {
      id: 'fine', question: 'Three points?',
      elements: [{
        id: 'g', kind: 'chart', purpose: 'quantify',
        payload: {
          intent: 'trend',
          fields: [
            { name: 't', role: 'x', type: 'quantitative' },
            { name: 'p', role: 'y', type: 'quantitative' },
          ],
          data: [{ t: 1, p: 2 }, { t: 2, p: 4 }, { t: 3, p: 9 }],
        },
      }],
    }
    const { container } = render(<LessonRenderer lesson={fine} />)
    expect(container.querySelector('[data-canvas="invariant-refusal"]')).toBeNull()
    /* ChartPanel is React.lazy, so the first synchronous frame is the Suspense
     * fallback and the dynamic import resolves over several microtasks. The
     * refusal path above is NOT lazy, which is why only this case waits. */
    await waitFor(() => {
      expect(container.querySelector('[data-mark]')).not.toBeNull()
    })
  })

  it('a refusal is distinct from "this build has no renderer"', () => {
    /* Two different failures with two different causes must not collapse into
     * one message: "we cannot draw this" and "this would be a lie" are
     * different things to tell a learner. */
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    expect(container.querySelector('[data-canvas="unrenderable"]')).toBeNull()
    expect(container.querySelector('[data-canvas="invariant-refusal"]')).not.toBeNull()
  })
})
