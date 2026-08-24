// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PanZoom, pinchZoomFactor, spanOf, wheelZoomFactor } from './PanZoom'
import { DEFAULT_VIEWPORT, useViewportStore } from './viewport'

/**
 * The gestures, and the one timer that used to speak for a gesture it did not own.
 *
 * WHAT THESE CANNOT PROVE, STATED RATHER THAN IMPLIED
 * ---------------------------------------------------
 * jsdom performs no layout, applies no stylesheet, and has no compositor. So
 * nothing here can show that a pinch actually zooms the map instead of the page
 * — that is a browser fact and belongs to the browser harness. What can be
 * shown is the arithmetic each gesture reduces to, the state the handlers leave
 * behind, and that the stylesheet still contains the one declaration the whole
 * touch story depends on.
 */

beforeEach(() => {
  useViewportStore.setState({ viewport: DEFAULT_VIEWPORT })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('the zoom step per event', () => {
  it('keeps a wheel notch to a comfortable step', () => {
    expect(wheelZoomFactor(120)).toBeGreaterThan(0.8)
    expect(wheelZoomFactor(120)).toBeLessThan(1)
  })

  it('does not let one pinch event move the scale by the per-event maximum', () => {
    /*
     * REGRESSION GUARD. `exp(-120 * 0.01)` is 0.30, which the old code clamped
     * to the 0.5 backstop: a single ctrl-wheel event — which is what a mouse
     * with ctrl held emits, and what a fast trackpad pinch overshoots into —
     * halved the scale. Four of them crossed the whole zoom range.
     */
    expect(pinchZoomFactor(120)).toBeGreaterThan(0.85)
    expect(pinchZoomFactor(-120)).toBeLessThan(1.2)
  })

  it('still scales the step by the delta below the saturation point', () => {
    expect(pinchZoomFactor(2)).toBeGreaterThan(pinchZoomFactor(8))
    expect(pinchZoomFactor(8)).toBeGreaterThan(pinchZoomFactor(9))
  })

  it('saturates rather than growing without bound', () => {
    expect(pinchZoomFactor(200)).toBe(pinchZoomFactor(2000))
  })

  it('survives a delta that is not a number', () => {
    expect(pinchZoomFactor(Number.NaN)).toBe(1)
  })

  it('reduces two fingers to a span and a midpoint', () => {
    expect(spanOf({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({ distance: 10, x: 3, y: 4 })
  })
})

describe('the wheel-settle timer', () => {
  const surfaceOf = (container: HTMLElement) => {
    const surface = container.querySelector<HTMLDivElement>('.pm-surface')
    if (!surface) throw new Error('no surface rendered')
    return surface
  }
  const layerOf = (container: HTMLElement) => {
    const layer = container.querySelector<HTMLDivElement>('.pm-layer')
    if (!layer) throw new Error('no layer rendered')
    return layer
  }

  it('does not declare a drag finished while the drag is still happening', () => {
    const { container } = render(
      <PanZoom>
        <span />
      </PanZoom>,
    )
    const surface = surfaceOf(container)
    const layer = layerOf(container)

    vi.useFakeTimers()

    // Momentum from a trackpad, arriving as the hand comes down on the map.
    surface.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }),
    )
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    })

    // Long past the 140 ms settle, and the pointer has not come up.
    vi.advanceTimersByTime(500)

    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 160, clientY: 140 })

    /*
     * `0ms` is the whole point: the layer must follow the pointer, not ease
     * toward it. When the settle timer cleared the shared `direct` flag
     * mid-drag, every remaining frame of the drag animated over 200 ms and the
     * map visibly lagged behind the cursor.
     */
    expect(layer.style.transitionDuration).toBe('0ms')
  })

  it('does ease again once the drag is over', () => {
    const { container } = render(
      <PanZoom>
        <span />
      </PanZoom>,
    )
    const surface = surfaceOf(container)
    const layer = layerOf(container)

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 })

    useViewportStore.getState().panBy(40, 40)

    expect(layer.style.transitionDuration).toBe('200ms')
  })
})

describe('two pointers pinch instead of dragging twice', () => {
  it('zooms by the change in span and pans by the change in midpoint', () => {
    const { container } = render(
      <PanZoom>
        <span />
      </PanZoom>,
    )
    const surface = container.querySelector<HTMLDivElement>('.pm-surface')
    if (!surface) throw new Error('no surface rendered')

    const down = (pointerId: number, clientX: number) =>
      fireEvent.pointerDown(surface, {
        pointerId,
        pointerType: 'touch',
        clientX,
        clientY: 100,
      })

    down(1, 100)
    down(2, 200)

    const before = useViewportStore.getState().viewport.scale
    // Both fingers move outward by 50: the span doubles, the midpoint holds.
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 50, clientY: 100 })
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 250, clientY: 100 })

    expect(useViewportStore.getState().viewport.scale).toBeGreaterThan(before)
  })

  it('hands the map back to the finger that is still down', () => {
    const { container } = render(
      <PanZoom>
        <span />
      </PanZoom>,
    )
    const surface = container.querySelector<HTMLDivElement>('.pm-surface')
    if (!surface) throw new Error('no surface rendered')

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 })
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 200, clientY: 100 })

    const before = useViewportStore.getState().viewport.x
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 140, clientY: 100 })

    expect(useViewportStore.getState().viewport.x).toBe(before + 40)
  })
})

describe('the unmount cleanup that could not run', () => {
  it('never released a capture, because the ref was already detached', () => {
    /*
     * HOW THE DEAD CLEANUP WAS CONFIRMED, AND WHY THE TEST STAYS.
     *
     * `useEffect(() => () => endPan(), [endPan])` claimed to release a pointer
     * capture still held at unmount. React detaches host refs in the mutation
     * phase and runs passive cleanups after it, so `surfaceRef.current` is null
     * by then and the release line is unreachable. This test passed unchanged
     * with that effect in place — which is the confirmation, not a side effect
     * of removing it. It stays so that anyone reintroducing the effect on the
     * belief that it does something has to explain this result first.
     *
     * The browser releases capture implicitly when the capturing element leaves
     * the document, so nothing is lost by the absence.
     */
    const release = vi.fn()
    const prototype = window.Element.prototype as unknown as Record<string, unknown>
    prototype.setPointerCapture = vi.fn()
    prototype.hasPointerCapture = vi.fn(() => true)
    prototype.releasePointerCapture = release

    const { container, unmount } = render(
      <PanZoom>
        <span />
      </PanZoom>,
    )
    const surface = container.querySelector<HTMLDivElement>('.pm-surface')
    if (!surface) throw new Error('no surface rendered')

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    release.mockClear()

    unmount()

    expect(release).not.toHaveBeenCalled()

    delete prototype.setPointerCapture
    delete prototype.hasPointerCapture
    delete prototype.releasePointerCapture
  })
})

describe('the surface owns its touch gestures', () => {
  it('opts out of the browser claiming them first', () => {
    const { container } = render(
      <PanZoom>
        <span />
      </PanZoom>,
    )
    const surface = container.querySelector<HTMLDivElement>('.pm-surface')

    /*
     * The honest limit of this assertion: jsdom has no touch input and no
     * compositor, so it can show that the surface declares `touch-action:
     * none` and nothing more. That a pinch then reaches the pointer handlers
     * instead of the browser's page zoom is a browser fact, and the browser
     * harness is where it can be had.
     */
    expect(surface?.style.touchAction).toBe('none')
  })
})
