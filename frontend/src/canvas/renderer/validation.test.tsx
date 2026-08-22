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

/* SUPERSEDED BY DEGRADATION, DELIBERATELY.
 *
 * When these were written, a two-point chart's only honest outcome was a
 * refusal box, because `degrade()` had no caller. Step 5 wired degradation in,
 * so the same fixture now becomes the TABLE its contract was already offering:
 * strictly more useful than a refusal, and it keeps the data.
 *
 * These were updated rather than deleted, because the property they exist to
 * protect is unchanged -- a representation that fails its invariants must
 * never be DRAWN. Whether the honest answer is a substitution or a refusal is
 * the next question, and both are still pinned.
 *
 * Chart refusal is now unreachable by construction: the only chart invariant a
 * real payload fails is `enoughPointsToPlot`, and that case always has a table
 * to degrade to. The refusal path is covered in degradation.test.tsx with a
 * fixture whose contract offers nothing. */
describe('a representation that fails its own invariants is never drawn as itself', () => {
  it('does not draw a two-point trend', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-mark="line"]')).toBeNull()
  })

  it('substitutes the representation its contract nominated', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      const r = container.querySelector('[data-canvas="degraded"]')!
      expect(r.getAttribute('data-degraded-from')).toBe('chart')
      expect(r.getAttribute('data-degraded-to')).toBe('table')
    })
  })

  it('draws no chart marks at all for the failed representation', async () => {
    /* The whole point: no line, no area, no dots. Nothing that reads as data. */
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-mark]')).toBeNull()
  })

  it('explains the substitution in words a learner can act on', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.textContent).toContain('Fewer than three points')
    })
  })

  it('keeps the block title, so the lesson still reads as a sequence', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.textContent).toContain('Pressure vs temperature')
    })
  })

  it('announces the substitution to assistive technology', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"] [role="status"]')).not.toBeNull()
    })
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

  it('a substitution is distinct from "this build has no renderer"', async () => {
    /* Three outcomes with three causes must not collapse into one message.
     * "We cannot draw this kind at all", "this would be a lie so here is
     * something truer", and "this would be a lie and there is nothing truer"
     * are different things to tell a learner. */
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-canvas="unrenderable"]')).toBeNull()
    expect(container.querySelector('[data-canvas="invariant-refusal"]')).toBeNull()
  })
})

/* ── gap found by mutation testing ──────────────────────────────────────── *
 *
 * A mutation run scored 8/9 here. The survivor: `UNMEASURED_VIEWPORT` could be
 * flipped back to the old `1200x800` desktop guess with ZERO test failures,
 * because every test above sets a root width first, so measurement always
 * succeeds and the pre-measurement branch is never entered.
 *
 * Notably the test named "never silently reports 1200 when the container is a
 * phone" did NOT catch it: under that mutation alone, measurement still
 * succeeds and still reports 375. The two mutations together -- no measurement
 * AND a desktop guess -- would reproduce the original defect exactly, and only
 * one of them had a failure signature. */

describe('the pre-measurement frame guesses small, not desktop', () => {
  it('reports itself as unmeasured when the container has no size yet', () => {
    geometry = { rootWidth: 0, rootHeight: 0 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-source')).toBe('unmeasured')
  })

  it('guesses a phone, not a desktop, before the first measurement', () => {
    /* Guessing small is the safe direction. A layout computed for 360px and
     * then measured wider discloses less for one frame, which is recoverable.
     * The reverse ships an overflowing frame to a real phone. */
    geometry = { rootWidth: 0, rootHeight: 0 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-width')).toBe('360')
    expect(Number(root.getAttribute('data-viewport-width'))).toBeLessThan(768)
  })

  it('still validates the frame it painted from the guess', () => {
    geometry = { rootWidth: 0, rootHeight: 0 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-validated')).toBe('true')
  })

  it('switches to the measured width as soon as one arrives', () => {
    geometry = { rootWidth: 0, rootHeight: 0 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    expect(root.getAttribute('data-viewport-source')).toBe('unmeasured')

    geometry = { rootWidth: 1440, rootHeight: 900 }
    triggerResize()

    expect(root.getAttribute('data-viewport-source')).toBe('measured')
    expect(root.getAttribute('data-viewport-width')).toBe('1440')
  })
})

/* ── guards for fixes that a mutation audit found UNPROTECTED ───────────── *
 *
 * Reverting each of these used to leave the suite green. A fix nothing pins is
 * a fix that comes back.
 */

describe('the repair budget is not refunded by its own output', () => {
  it('a height-only change does not reset the repair counter', () => {
    /* THE OSCILLATION THIS PREVENTS. `MAX_REPAIR_ROUNDS` caps the
     * measure -> validate -> repair loop. The reset effect used to depend on
     * `effectiveViewport.height`, and height is an OUTPUT of the layout that
     * effect resets -- so every repair that changed a block's height refunded
     * the budget and the loop ran forever.
     *
     * Observed live at 320px: `equation#law` and `chart#graph` flipped
     * 77x365 <-> 157x257 indefinitely, span 4 against singleColumnFallback's
     * span 8. The fallback made them wide enough to stop overflowing, so the
     * next validation reverted it, so they overflowed again.
     *
     * Width is a real input and may reset. Height may never. */
    geometry = {
      rootWidth: 320, rootHeight: 500,
      blocks: {
        a: { scrollWidth: 2000, clientWidth: 100 },
        b: { scrollWidth: 2000, clientWidth: 100 },
        c: { scrollWidth: 2000, clientWidth: 100 },
      },
    }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    const repairsBefore = root.getAttribute('data-repairs')

    /* Same width, taller container -- exactly what a repair itself causes. */
    geometry = { ...geometry, rootHeight: 900 }
    triggerResize()

    expect(root.getAttribute('data-viewport-width')).toBe('320')
    expect(
      root.getAttribute('data-repairs'),
      'a height change refunded the repair budget, so the loop can never terminate',
    ).toBe(repairsBefore)
  })

  it('a width change DOES reset it, because width is a real input', () => {
    geometry = { rootWidth: 320, rootHeight: 500 }
    const { container } = render(<LessonRenderer lesson={lesson} />)
    const root = container.querySelector('[data-canvas="lesson"]')!
    geometry = { rootWidth: 1440, rootHeight: 500 }
    triggerResize()
    expect(root.getAttribute('data-viewport-width')).toBe('1440')
  })
})

describe('an intentional scroll container announces itself', () => {
  const tableLesson: Lesson = {
    id: 'wide', question: 'Does the table declare its own scrolling?',
    elements: [{
      id: 't', kind: 'table', purpose: 'compare', title: 'Three methods',
      payload: {
        columns: [
          { key: 'a', label: 'Method', type: 'text' },
          { key: 'b', label: 'Assumes', type: 'text' },
        ],
        rows: [{ a: 'FIFO', b: 'Oldest sells first' }, { a: 'LIFO', b: 'Newest sells first' }],
      },
    }],
  }

  it('emits data-overflow="scroll" on the box that scrolls', async () => {
    /* renderer/measure.ts reads this attribute to tell an intentional scroller
     * from a layout fault. The query was written; the attribute was not, so
     * every working table was counted as a defect -- the exact thing
     * measure.ts says it exists to avoid: "Treating intentional scroll as
     * overflow would make the honest fix look like the bug." */
    const { container } = render(<LessonRenderer lesson={tableLesson} />)
    await waitFor(() => {
      expect(container.querySelector('table')).not.toBeNull()
    })
    expect(container.querySelector('[data-overflow="scroll"]')).not.toBeNull()
  })

  it('is reachable without a mouse', async () => {
    const { container } = render(<LessonRenderer lesson={tableLesson} />)
    await waitFor(() => {
      expect(container.querySelector('[data-overflow="scroll"]')).not.toBeNull()
    })
    const box = container.querySelector('[data-overflow="scroll"]')!
    expect(box.getAttribute('tabindex')).toBe('0')
    expect(box.getAttribute('role')).toBe('group')
    expect(box.getAttribute('aria-label')).toBeTruthy()
  })
})
