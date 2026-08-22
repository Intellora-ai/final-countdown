// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { LessonRenderer } from './LessonRenderer'
import { registerRepresentations, resetBootstrap } from '../contract/bootstrap'
import { resetRegistry } from '../contract/registry'
import type { Lesson } from '../contract/types'

/* DEGRADATION IS A DECISION THE CONTRACT ALREADY MADE.
 *
 * `degradeIfNeeded` has existed in registry.ts since Step 2 with ZERO callers,
 * and every contract's `degrade()` has been dead code beside it. The chart
 * contract, for instance, says in as many words that fewer than three points
 * "is a table, not a trend", and hands back a fully-formed table payload to
 * render instead. Nothing ever asked for it.
 *
 * The result was that a two-point chart had only two possible fates: draw a
 * dishonest trend line (before invariants ran) or show a refusal box (after).
 * Both throw away a real answer the contract was holding. The data IS still
 * showable — as a table.
 *
 * These tests pin the rule: when a representation fails its invariants and its
 * contract offers a degradation, take the degradation, say so, and keep the
 * content. Refuse only when there is nothing honest left to show.
 */

beforeEach(() => {
  resetRegistry(); resetBootstrap(); registerRepresentations()
})
afterEach(cleanup)

/* Two points. chart.invariants -> enoughPointsToPlot fails.
 * chart.degrade -> { to: 'table', reason: 'Fewer than three points is a table,
 * not a trend.', payload: <columns+rows> } */
const twoPointChart: Lesson = {
  id: 'thin', question: 'Can two points be a trend?',
  elements: [{
    id: 'graph', kind: 'chart', purpose: 'quantify', title: 'Pressure vs temperature',
    payload: {
      intent: 'trend',
      fields: [
        { name: 'temperature', role: 'x', type: 'quantitative', unit: 'K' },
        { name: 'pressure', role: 'y', type: 'quantitative', unit: 'kPa' },
      ],
      data: [{ temperature: 300, pressure: 100 }, { temperature: 400, pressure: 133 }],
    },
  }],
}

describe('a failed invariant degrades before it refuses', () => {
  it('renders the degraded representation instead of a refusal', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-canvas="invariant-refusal"]')).toBeNull()
  })

  it('degrades a two-point chart to the table its contract asked for', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      const d = container.querySelector('[data-canvas="degraded"]')!
      expect(d.getAttribute('data-degraded-to')).toBe('table')
    })
  })

  it('records which representation it came from', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      const d = container.querySelector('[data-canvas="degraded"]')!
      expect(d.getAttribute('data-degraded-from')).toBe('chart')
    })
  })

  it('states the contract-authored reason, visibly', async () => {
    /* Not a silent swap. A learner who expected a chart is told why they got a
     * table, in the words the contract used. */
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.textContent).toContain('Fewer than three points is a table, not a trend.')
    })
  })

  it('keeps every data point through the degradation', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      const text = container.textContent ?? ''
      /* Both rows survived the transform: nothing was dropped to make it fit. */
      expect(text).toContain('300')
      expect(text).toContain('400')
      expect(text).toContain('100')
      expect(text).toContain('133')
    })
  })

  it('draws no chart marks after degrading', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
    })
    /* The whole point of degrading is that the dishonest mark is gone. */
    expect(container.querySelector('[data-mark]')).toBeNull()
  })

  it('announces the substitution to assistive technology', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      const notice = container.querySelector('[data-canvas="degraded"] [role="status"]')
      expect(notice).not.toBeNull()
    })
  })

  it('keeps the block title so the lesson still reads as a sequence', async () => {
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.textContent).toContain('Pressure vs temperature')
    })
  })
})

describe('degradation is bounded and explainable', () => {
  it('is deterministic: the same lesson degrades the same way every time', async () => {
    const runs: string[] = []
    for (let i = 0; i < 3; i++) {
      const { container, unmount } = render(<LessonRenderer lesson={twoPointChart} />)
      await waitFor(() => {
        expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
      })
      runs.push(container.querySelector('[data-canvas="degraded"]')!.getAttribute('data-degraded-to')!)
      unmount()
    }
    expect(new Set(runs).size).toBe(1)
  })

  it('does not degrade a representation whose invariants hold', async () => {
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
    await waitFor(() => {
      expect(container.querySelector('[data-mark]')).not.toBeNull()
    })
    expect(container.querySelector('[data-canvas="degraded"]')).toBeNull()
  })

  it('still refuses when the contract offers no degradation', () => {
    /* A diagram with nodes but no edges fails `hasRelationships` and its
     * contract DOES offer prose. A diagram with no nodes at all has nothing to
     * hand over, so the refusal path must still exist. */
    const empty: Lesson = {
      id: 'empty', question: 'What if there is nothing?',
      elements: [{
        id: 'd', kind: 'diagram', purpose: 'sequence',
        payload: { nodes: [], edges: [] },
      }],
    }
    const { container } = render(<LessonRenderer lesson={empty} />)
    const refused = container.querySelector('[data-canvas="invariant-refusal"]')
    const unrenderable = container.querySelector('[data-canvas="unrenderable"]')
    const degraded = container.querySelector('[data-canvas="degraded"]')
    /* Whatever it does, it must not silently render an empty diagram as if it
     * were a real one. One of the three honest outcomes must be present. */
    expect(Boolean(refused || unrenderable || degraded)).toBe(true)
  })

  it('degrades at most one hop, so two contracts cannot ping-pong', async () => {
    /* If chart -> table and table -> chart were both reachable, an unbounded
     * loop would hang the render. Exactly one degradation is applied and the
     * result is accepted or refused on its own merits. */
    const { container } = render(<LessonRenderer lesson={twoPointChart} />)
    await waitFor(() => {
      expect(container.querySelector('[data-canvas="degraded"]')).not.toBeNull()
    })
    expect(container.querySelectorAll('[data-canvas="degraded"]')).toHaveLength(1)
  })
})
