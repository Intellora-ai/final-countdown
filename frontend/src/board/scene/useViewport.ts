import { useCallback, useEffect, useRef, useState } from 'react'

/* THE VIEWPORT — {x, y, scale} and a CSS transform. That is the whole camera.
 *
 * WHY NOT A CANVAS LIBRARY. A drawing tool's camera comes attached to a shape
 * system, an undo stack and a collaboration layer, none of which a generated
 * board has any use for; the parts actually needed here are a wheel handler, a
 * drag handler and a matrix. Keeping them in one small file means the board's
 * coordinate space is something this codebase owns and can reason about,
 * rather than something it negotiates with.
 *
 * ZOOM IS ANCHORED TO THE POINTER. Scaling about the origin makes the content
 * under the cursor slide away, which reads as the board fighting you. The two
 * lines that fix it are the reason this feels like a map.
 */

export interface Viewport { x: number; y: number; scale: number }

export const MIN_SCALE = 0.35
export const MAX_SCALE = 3

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

export function useViewport(initial: Viewport) {
  const [vp, setVp] = useState<Viewport>(initial)
  const [panning, setPanning] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  /* Has the learner moved the camera themselves? Once they have, the board
   * stops re-fitting behind their back — a canvas that snaps back to fit
   * whenever the window nudges is a canvas you cannot hold a position in. */
  const touched = useRef(false)
  const markTouched = useCallback(() => { touched.current = true }, [])

  /** Zoom about a point in SCREEN space, keeping the world point under it fixed. */
  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setVp((v) => {
      const next = clampScale(v.scale * factor)
      if (next === v.scale) return v
      const k = next / v.scale
      return { scale: next, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }
    })
  }, [])

  /** Zoom about the centre of the viewport — what the rail buttons do. */
  const zoomTo = useCallback((scale: number) => {
    touched.current = true
    const el = ref.current
    const w = el ? el.clientWidth : window.innerWidth
    const h = el ? el.clientHeight : window.innerHeight
    setVp((v) => {
      const next = clampScale(scale)
      if (next === v.scale) return v
      const k = next / v.scale
      return { scale: next, x: w / 2 - (w / 2 - v.x) * k, y: h / 2 - (h / 2 - v.y) * k }
    })
  }, [])

  const reset = useCallback((to: Viewport) => setVp(to), [])

  /* AUTO-FIT, MEASURED FROM THE ELEMENT AND RETRIED UNTIL IT IS REAL.
   *
   * The bug this replaces: the fit was computed once, in a useMemo([]), from
   * window.innerWidth. At that moment the element had no layout, the measured
   * width was 0, min(0/W, 0/H) clamped up to MIN_SCALE, and the board was
   * frozen at 0.35 with a negative offset for the rest of the session.
   *
   * Two things were wrong and both are fixed here. It now measures THE
   * ELEMENT, because the scene lives inside an app shell and does not own the
   * window; and it measures through a ResizeObserver, so a zero-sized first
   * paint is simply an early observation that a later one corrects, instead of
   * a permanent state. A zero measurement is ignored outright — fitting to
   * nothing is never the right answer. */
  const autoFit = useCallback((worldW: number, worldH: number, margin = 0) => {
    const el = ref.current
    if (!el) return
    const apply = () => {
      if (touched.current) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (w <= 0 || h <= 0) return
      setVp(fitViewport(worldW, worldH, w, h, margin))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Wheel is attached natively rather than through React's onWheel: React
   * registers wheel listeners as passive, so preventDefault there is ignored
   * and the browser page-zooms behind the board. */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      touched.current = true
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), sx, sy)
      } else {
        setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    /* Never steal the gesture from a control. Sliders, buttons and inputs get
     * their pointer events; the background gets the pan. */
    const target = e.target as HTMLElement
    if (target.closest('input, button, a, [data-no-pan]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y }
    setPanning(true)
  }, [vp.x, vp.y])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    /* The camera becomes the learner's only once they actually MOVE it.
     *
     * Marking it owned on pointer-DOWN was wrong: a single click on the
     * background — or any stray press while the pane was still being sized —
     * permanently switched auto-fit off, and the board stayed frozen at
     * whatever half-laid-out size it happened to have. A press that never
     * travels is not a camera gesture. */
    if (!touched.current && Math.abs(dx) + Math.abs(dy) < 3) return
    touched.current = true
    setVp((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    drag.current = null
    setPanning(false)
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }, [])

  return { vp, ref, panning, zoomTo, zoomAt, reset, autoFit, markTouched, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

/** The transform that fits a world box into a viewport box, centred.
 *
 * A NON-POSITIVE MEASUREMENT IS REFUSED, NOT SCALED.
 *
 * This is the function that produced matrix(0.35,0,0,0.35,-246.4,-134.4) and
 * pinned the whole board into a corner for a session. Handed viewW = 0 it
 * computed min(0/W, 0/H) = 0, clamped that UP to MIN_SCALE, and returned a
 * viewport that was perfectly well-formed and completely wrong — the worst
 * kind of answer, because nothing downstream could tell it was garbage.
 *
 * An element that has not been laid out yet has no size, and there is no
 * correct way to fit a world into no space. Identity is the honest answer:
 * content at its natural size, which a later observation corrects. Guarding
 * here rather than at each call site means a future caller cannot reintroduce
 * the bug by forgetting to check.
 */
export function fitViewport(worldW: number, worldH: number, viewW: number, viewH: number, margin = 0): Viewport {
  const availW = viewW - margin * 2
  const availH = viewH - margin * 2
  if (!(availW > 0) || !(availH > 0) || !(worldW > 0) || !(worldH > 0)) {
    return { x: 0, y: 0, scale: 1 }
  }
  const scale = clampScale(Math.min(availW / worldW, availH / worldH))
  return { scale, x: (viewW - worldW * scale) / 2, y: (viewH - worldH * scale) / 2 }
}
