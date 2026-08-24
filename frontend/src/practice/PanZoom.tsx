import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { useViewportStore, type Viewport } from './viewport'

/**
 * The pannable surface: one transformed layer, and the input that moves it.
 *
 * THE TRANSFORM IS APPLIED WITHOUT REACT
 * --------------------------------------
 * Panning changes the viewport every pointer frame. Routed through React state
 * that re-renders this component on every one of them, and at 120 Hz on a
 * trackpad the reconciler becomes the frame budget. So this subscribes to the
 * store directly and writes `style.transform` on one node. It renders once.
 * The map inside it is `children` — an element the parent created and never
 * recreates — so a pan does not touch it at all.
 *
 * WHEEL IS THE ONE THAT SHIPS BROKEN
 * ----------------------------------
 * React's `onWheel` is delegated to a passive root listener, and in a passive
 * listener `preventDefault()` does nothing. It does not throw and it does not
 * warn — the browser just zooms the page while the map appears to ignore the
 * wheel. The only fix is a real `addEventListener` with `{ passive: false }`.
 *
 * THE TRACKPAD PROBLEM
 * --------------------
 * A pinch arrives as a `wheel` event with `ctrlKey: true` — unambiguous. Telling
 * a two-finger *scroll* from a mouse wheel is not: same event type. The
 * heuristic leans on what a wheel does that a trackpad does not — report in
 * lines or pages, or emit big, evenly quantised deltas with no horizontal
 * component. It is a heuristic and it is labelled one; the keyboard shortcuts
 * exist so nobody is stuck if it guesses wrong on some device.
 *
 * TOUCH IS NOT WHEEL, AND HAS TO BE HANDLED AS ITSELF
 * ---------------------------------------------------
 * A touchscreen emits no `wheel` at all, so everything above is silent on it.
 * Two fingers are tracked as two pointers here and reduced to a span and a
 * midpoint — the span is the zoom, the midpoint is the pan.
 *
 * None of which runs at all under the default `touch-action: auto`. The browser
 * claims both gestures before the page sees them: a two-finger pinch zooms the
 * whole document, and a one-finger drag scrolls the page — which also fires
 * `pointercancel` and kills a pan halfway through. Neither reaches JavaScript,
 * so no `preventDefault` in a pointer handler can recover them.
 *
 * So `touch-action: none` is declared on the surface, from here rather than
 * from `practice.css`. It is not part of the map's visual language; it is the
 * precondition for the handlers below, and it belongs on the same element as
 * the code that stops working without it. It is scoped to the surface and
 * nothing wider: `.practice-map` is a fixed-height pane with `overflow:
 * hidden`, so there is nothing to scroll inside it, and ordinary scrolling of
 * the dashboard around this map is untouched.
 *
 * WHAT IS NOT HERE: AN UNMOUNT CLEANUP THAT RELEASES POINTER CAPTURE
 * -----------------------------------------------------------------
 * There used to be `useEffect(() => () => endPan(), [endPan])`, whose stated
 * job was releasing a capture still held at unmount. It could never do it.
 * React detaches host refs during the mutation phase and runs passive effect
 * cleanups afterwards, so `surfaceRef.current` is already `null` when that
 * cleanup runs and the release line is unreachable — confirmed by test, not by
 * reading: unmounting mid-drag never called `releasePointerCapture`, with the
 * effect present. The browser releases capture implicitly when the capturing
 * element leaves the document anyway, so there is nothing left to do.
 */

const WHEEL_ZOOM_RATE = 0.0015
const PINCH_ZOOM_RATE = 0.01
const MAX_ZOOM_PER_EVENT = 2
const KEY_PAN_PX = 64
const KEY_ZOOM_FACTOR = 1.25

const LINE_HEIGHT_PX = 16
const PAGE_HEIGHT_PX = 400

/** How long after the last wheel event the gesture counts as finished. */
const WHEEL_SETTLE_MS = 140

/**
 * The largest `deltaY` one pinch event is allowed to spend.
 *
 * A trackpad pinch arrives as dozens of small deltas a second, so a rate tuned
 * for those is a rate that must never meet a large one — and it does. Ctrl held
 * over a real wheel produces `ctrlKey` wheel events at the wheel's own ±100 or
 * ±120 a notch, and a fast pinch on Chrome overshoots well past 50. At |deltaY|
 * of 70 the old code's factor was already `exp(-0.7)` = 0.50, i.e. the
 * `MAX_ZOOM_PER_EVENT` backstop: one notch halved the scale, and four notches
 * crossed the entire zoom range. Saturating the delta keeps the step
 * proportional where proportion means something and flat where it does not, so
 * the ceiling is about 10% a event instead of 100%.
 */
const MAX_PINCH_DELTA_PX = 10

export interface PanZoomProps {
  children: ReactNode
  /** Fired on a press that did not land on a node — used to clear selection. */
  onBackgroundPress?(): void
}

export function PanZoom({ children, onBackgroundPress }: PanZoomProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const helpId = useId()

  /** Set while a drag or wheel gesture is in flight: no easing then. */
  const directRef = useRef(false)
  const reducedMotionRef = useRef(false)
  const firstPaintRef = useRef(true)
  const wheelSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  /** Every pointer currently down on the surface. Two of them mean a pinch. */
  const pointersRef = useRef(new Map<number, Point>())
  /** The two-finger gesture in flight: what it measured last frame. */
  const pinchRef = useRef<{ distance: number; x: number; y: number } | null>(null)

  /* -- The transform ------------------------------------------------------ */

  const applyViewport = useCallback((viewport: Viewport) => {
    const layer = layerRef.current
    if (!layer) return

    const x = Number.isFinite(viewport.x) ? viewport.x : 0
    const y = Number.isFinite(viewport.y) ? viewport.y : 0
    const scale = Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1

    const eased = !directRef.current && !reducedMotionRef.current && !firstPaintRef.current
    layer.style.transitionDuration = eased ? '200ms' : '0ms'
    layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    firstPaintRef.current = false
  }, [])

  useLayoutEffect(() => {
    applyViewport(useViewportStore.getState().viewport)
    return useViewportStore.subscribe((state, previous) => {
      if (state.viewport !== previous.viewport) applyViewport(state.viewport)
    })
  }, [applyViewport])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = query.matches

    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  /* -- Wheel: zoom at the cursor, pan on two fingers ---------------------- */

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const onWheel = (event: WheelEvent) => {
      // Non-passive, so this actually takes effect. See the note above.
      event.preventDefault()

      const store = useViewportStore.getState()
      const box = surface.getBoundingClientRect()
      const originX = event.clientX - box.left
      const originY = event.clientY - box.top

      const deltaY = normaliseDelta(event.deltaY, event.deltaMode)
      const deltaX = normaliseDelta(event.deltaX, event.deltaMode)

      directRef.current = true
      if (wheelSettleRef.current) clearTimeout(wheelSettleRef.current)
      wheelSettleRef.current = setTimeout(() => {
        wheelSettleRef.current = null
        /*
         * A DRAG OUTRANKS THIS TIMER, BECAUSE THE DRAG IS STILL HAPPENING.
         *
         * `directRef` is one flag for two gestures. A trackpad keeps emitting
         * momentum `wheel` events after the fingers move on, so one can easily
         * land just after a drag begins — and 140 ms later this fired and
         * declared the gesture over while the pointer was still down. From
         * that frame on, `applyViewport` put the 200 ms ease back on the layer
         * and every remaining pan frame animated toward the cursor instead of
         * tracking it: the map visibly lagged for the rest of the drag, with
         * nothing in the pan code to blame. `endPan` owns the flag while a
         * drag is in flight.
         */
        if (panRef.current) return
        directRef.current = false
      }, WHEEL_SETTLE_MS)

      const pinching = event.ctrlKey || event.metaKey
      if (pinching) {
        store.zoomAt(pinchZoomFactor(deltaY), originX, originY)
        return
      }

      if (looksLikeMouseWheel(event, deltaX, deltaY)) {
        store.zoomAt(wheelZoomFactor(deltaY), originX, originY)
        return
      }

      store.panBy(-deltaX, -deltaY)
    }

    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      surface.removeEventListener('wheel', onWheel)
      if (wheelSettleRef.current) clearTimeout(wheelSettleRef.current)
    }
  }, [])

  /* -- Pointer: drag with one, pinch with two ----------------------------- */

  /**
   * The pinch's two live points, or nothing.
   *
   * Reads the map rather than being handed the pair, because the two pointers
   * arrive and leave in separate events and only their CURRENT positions are
   * ever the right ones.
   */
  const pinchPoints = useCallback((): [Point, Point] | null => {
    const points = [...pointersRef.current.values()]
    const [a, b] = points
    return points.length === 2 && a && b ? [a, b] : null
  }, [])

  const beginPinch = useCallback(() => {
    const pair = pinchPoints()
    if (!pair) return
    // A pinch is not a drag. Handing the remaining finger to the pan handler as
    // well would make the map slide by half the pinch on every frame.
    panRef.current = null
    pinchRef.current = spanOf(pair[0], pair[1])
  }, [pinchPoints])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // A drag that begins on a node belongs to the node, not to the map.
      if (event.target instanceof Element && event.target.closest('[data-node]')) return
      // Middle and right buttons keep their own meanings; touch and pen have none.
      if (event.pointerType === 'mouse' && event.button !== 0) return

      const surface = surfaceRef.current
      if (!surface) return
      if (pointersRef.current.has(event.pointerId)) return

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      directRef.current = true
      surface.dataset.panning = 'true'

      // Capture, so a gesture that leaves the element — or the window — keeps
      // going and still delivers its pointerup.
      if (surface.setPointerCapture) surface.setPointerCapture(event.pointerId)

      if (pointersRef.current.size === 2) {
        beginPinch()
        return
      }
      // A third finger is not a gesture this map has a meaning for.
      if (pointersRef.current.size !== 1) return

      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      surface.focus({ preventScroll: true })
      onBackgroundPress?.()
    },
    [beginPinch, onBackgroundPress],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const tracked = pointersRef.current.get(event.pointerId)
      if (!tracked) return
      tracked.x = event.clientX
      tracked.y = event.clientY

      const previous = pinchRef.current
      const pair = pinchPoints()
      // A pinch in flight with a third finger down: `pinchPoints` gives nothing,
      // and the map holds still rather than picking two of three at random.
      if (previous && !pair) return
      if (previous && pair) {
        const next = spanOf(pair[0], pair[1])
        pinchRef.current = next

        const box = surfaceRef.current?.getBoundingClientRect()
        const store = useViewportStore.getState()

        // The midpoint moving is a pan, the span changing is a zoom, and a real
        // pinch does both at once. Pan first: the zoom anchors on where the
        // fingers are NOW.
        store.panBy(next.x - previous.x, next.y - previous.y)
        if (previous.distance > 0 && next.distance > 0) {
          store.zoomAt(
            next.distance / previous.distance,
            next.x - (box?.left ?? 0),
            next.y - (box?.top ?? 0),
          )
        }
        return
      }

      const pan = panRef.current
      if (!pan || pan.pointerId !== event.pointerId) return

      const dx = event.clientX - pan.x
      const dy = event.clientY - pan.y
      pan.x = event.clientX
      pan.y = event.clientY

      if (dx !== 0 || dy !== 0) useViewportStore.getState().panBy(dx, dy)
    },
    [pinchPoints],
  )

  const endPan = useCallback(
    (pointerId: number) => {
      const surface = surfaceRef.current
      if (!pointersRef.current.delete(pointerId)) return

      if (surface?.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId)
      if (panRef.current?.pointerId === pointerId) panRef.current = null

      /*
       * The gesture is whatever is left on the glass, measured fresh.
       *
       * Carrying `pinchRef` across a finger going up would compare this frame's
       * span against a span taken when a different pair of fingers was down —
       * one frame of arbitrary zoom, exactly where the learner is already in the
       * middle of doing something. Two fingers left is still a pinch (a third
       * one lifting), one is a drag the survivor inherits rather than the map
       * going dead under the hand, none is the end.
       */
      pinchRef.current = null

      if (pointersRef.current.size >= 2) {
        beginPinch()
        return
      }

      const [remainingId] = [...pointersRef.current.keys()]
      const remaining = remainingId === undefined ? undefined : pointersRef.current.get(remainingId)
      if (remainingId !== undefined && remaining) {
        panRef.current = { pointerId: remainingId, x: remaining.x, y: remaining.y }
        return
      }

      directRef.current = false
      if (surface) delete surface.dataset.panning
    },
    [beginPinch],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => endPan(event.pointerId),
    [endPan],
  )

  /* -- Keyboard ----------------------------------------------------------- */

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    /*
     * Only when the surface ITSELF has focus.
     *
     * React key events bubble, so without this guard every `preventDefault()`
     * below cancels the native behaviour of whatever control the learner is
     * actually using — the questions slider could not be moved with the arrow
     * keys at all, because the map ate every ArrowRight and panned instead.
     */
    if (event.target !== event.currentTarget) return

    const store = useViewportStore.getState()
    const box = surfaceRef.current?.getBoundingClientRect()
    const centreX = (box?.width ?? 0) / 2
    const centreY = (box?.height ?? 0) / 2
    const step = KEY_PAN_PX * (event.shiftKey ? 4 : 1)

    const pan = PAN_KEYS[event.key]
    if (pan) {
      event.preventDefault()
      store.panBy(pan.x * step, pan.y * step)
      return
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      store.zoomAt(KEY_ZOOM_FACTOR, centreX, centreY)
      return
    }

    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      store.zoomAt(1 / KEY_ZOOM_FACTOR, centreX, centreY)
    }
  }, [])

  return (
    <div
      ref={surfaceRef}
      className="pm-surface"
      // Read the note at the top of this file before moving this to the
      // stylesheet: every gesture below depends on it.
      style={{ touchAction: 'none' }}
      role="application"
      tabIndex={0}
      aria-label="Practice map. A pannable, zoomable space."
      aria-describedby={helpId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div ref={layerRef} className="pm-layer">
        {children}
      </div>

      <p id={helpId} className="pm-sr-only">
        Drag to move the map. Arrow keys pan, hold shift to pan faster. Plus and minus zoom
        about the centre.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export interface Point {
  x: number
  y: number
}

/** Two fingers reduced to the only two things a pinch is: how far apart, and where. */
export function spanOf(a: Point, b: Point): { distance: number; x: number; y: number } {
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

/** A notched wheel's step: one notch, one comfortable increment. */
export function wheelZoomFactor(deltaY: number): number {
  return clamp(
    Math.exp(-deltaY * WHEEL_ZOOM_RATE),
    1 / MAX_ZOOM_PER_EVENT,
    MAX_ZOOM_PER_EVENT,
  )
}

/**
 * A pinch's step: proportional to the delta, saturating well before the clamp.
 *
 * See `MAX_PINCH_DELTA_PX`. The clamp stays as a backstop but should never be
 * the thing that decides the factor — when it was, one event moved the scale by
 * the whole per-event maximum and the zoom jumped rather than tracked.
 */
export function pinchZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY)) return 1
  const spent = Math.sign(deltaY) * Math.min(Math.abs(deltaY), MAX_PINCH_DELTA_PX)
  return clamp(Math.exp(-spent * PINCH_ZOOM_RATE), 1 / MAX_ZOOM_PER_EVENT, MAX_ZOOM_PER_EVENT)
}

const PAN_KEYS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
}

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
function normaliseDelta(delta: number, mode: number): number {
  if (!Number.isFinite(delta)) return 0
  if (mode === 1) return delta * LINE_HEIGHT_PX
  if (mode === 2) return delta * PAGE_HEIGHT_PX
  return delta
}

/**
 * Best guess at "this came from a wheel, not two fingers".
 *
 * Line and page deltas are only ever produced by discrete wheels. Pixel deltas
 * are ambiguous, so the test is the signature of a notched wheel: nothing
 * sideways, a large step, quantised to a round number (Chrome emits multiples
 * of 120). A trackpad's inertial deltas are small, uneven and usually carry
 * some horizontal component.
 */
function looksLikeMouseWheel(event: WheelEvent, deltaX: number, deltaY: number): boolean {
  if (event.deltaMode !== 0) return true
  if (deltaX !== 0) return false
  const magnitude = Math.abs(deltaY)
  return magnitude >= 100 && magnitude % 20 === 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
