// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import CanvasRoute from './CanvasRoute'
import { logarithms } from './lessons/logarithms'

/**
 * ZOOMING OUT TO SEE THE WHOLE TERM.
 *
 * THE OWNER'S DECISION, 2026-09-03: a long column you can zoom out of. Zoom out
 * to see everything learned on a topic at a glance, zoom in to read, pan
 * sideways when something is too wide. Not a 2D board -- learning stays in one
 * vertical stream, which is the thing that already works.
 *
 * THE ONE RULE THAT MATTERS, AND EVERY TEST BELOW IS ABOUT IT: **zoom never
 * changes content.** It does not re-ask, does not re-render a lesson, does not
 * re-lay-out blocks, does not lose her place. It is the same validated lesson,
 * drawn smaller. A zoom that quietly re-fetched would be a zoom that could show
 * her something different from what she was reading, which is the whole
 * durability promise broken by a scroll wheel.
 */

/* A REAL, KNOWN-VALID LESSON, not one written for this test.
 *
 * A hand-made lesson was tried here first and the canvas refused it -- rightly:
 * it fails the teaching rules the gate actually enforces, and the test then
 * proved only that a refusal renders. `logarithms` is one of the fixtures kept
 * in `src/canvas/lessons/` for exactly this, and it passes `validateLesson`. */
const HER_LESSON = logarithms

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 300, status, json: async () => body, headers: { get: () => 'application/json' } } as unknown as Response
}

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  } as Storage
}

const settle = async () => { await act(async () => { await Promise.resolve() }) }

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown): Promise<Response> => {
      const url = String(input)
      if (url.startsWith('/api/canvas?')) {
        return jsonResponse(200, {
          artifacts: [{ seq: 1, createdAt: 'then', artifact: { kind: 'lesson', question: 'what is a zero', payload: HER_LESSON, teaching: 'lesson' } }],
        })
      }
      if (url.startsWith('/api/memory?')) return jsonResponse(200, { record: null })
      return jsonResponse(200, {})
    }),
  )
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function openCanvas(): Promise<HTMLElement> {
  render(
    <MemoryRouter>
      <CanvasRoute topic={{ id: 'polynomials--zeros-of-a-polynomial', name: 'Zeros of a polynomial' }} />
    </MemoryRouter>,
  )
  for (let i = 0; i < 5; i += 1) await settle()
  const zoomed = document.querySelector('.lc-zoom')
  if (zoomed === null) throw new Error('the canvas has nothing that can be zoomed')
  return zoomed as HTMLElement
}

/** Scale as the browser would read it off the element, or 1 when unset. */
function scaleOf(el: HTMLElement): number {
  const found = /scale\(([\d.]+)\)/.exec(el.style.transform)
  return found === null ? 1 : Number(found[1])
}

async function wheel(deltaY: number, times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, cancelable: true, bubbles: true }))
    })
  }
}

describe('zooming out to see the whole topic', () => {
  it('starts at its natural size', async () => {
    expect(scaleOf(await openCanvas())).toBe(1)
  })

  it('zooms out when she pinches out, and in when she pinches in', async () => {
    const stage = await openCanvas()
    await wheel(120, 3)
    const out = scaleOf(stage)
    expect(out, 'pinching out did not make the canvas smaller').toBeLessThan(1)
    await wheel(-120, 6)
    expect(scaleOf(stage), 'pinching in did not make it bigger again').toBeGreaterThan(out)
  })

  it('never shrinks past the point of being readable, or grows without end', async () => {
    const stage = await openCanvas()
    await wheel(120, 60)
    expect(scaleOf(stage), 'the canvas shrank to nothing').toBeGreaterThanOrEqual(0.25)
    await wheel(-120, 200)
    expect(scaleOf(stage), 'the canvas grew without limit').toBeLessThanOrEqual(2)
  })

  it('goes back to its natural size on one keystroke', async () => {
    const stage = await openCanvas()
    await wheel(120, 5)
    expect(scaleOf(stage)).not.toBe(1)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true }))
    })
    expect(scaleOf(stage), 'Cmd+0 did not put the canvas back').toBe(1)
  })

  it('leaves an ordinary scroll alone, so the page still scrolls', async () => {
    const stage = await openCanvas()
    await act(async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, ctrlKey: false, bubbles: true, cancelable: true }))
    })
    expect(scaleOf(stage), 'scrolling the page zoomed it instead').toBe(1)
  })
})

describe('zoom never changes what she is reading', () => {
  it('shows exactly the same words, and asks the server for nothing', async () => {
    const stage = await openCanvas()
    /* `textContent`, not `innerText`: jsdom does not implement `innerText`, so
       an assertion written against it compares `undefined` to `undefined` and
       passes whatever the product does. Found when the sibling test below
       failed on the same mistake. */
    const before = document.body.textContent
    const callsBefore = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length

    await wheel(120, 4)
    await wheel(-120, 2)

    expect(before?.length ?? 0, 'nothing rendered, so there is nothing to compare').toBeGreaterThan(50)
    expect(document.body.textContent, 'zooming changed the lesson').toBe(before)
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
      'zooming went back to the server',
    ).toBe(callsBefore)
    expect(scaleOf(stage), 'nothing actually happened, so this proves nothing').not.toBe(1)
  })

  it('keeps her lesson on the canvas at every size', async () => {
    await openCanvas()
    for (const times of [3, 6, 10, 20]) {
      await wheel(120, times)
      expect(document.body.textContent, `the lesson vanished at zoom step ${times}`).toContain('logarithm')
    }
  })
})
