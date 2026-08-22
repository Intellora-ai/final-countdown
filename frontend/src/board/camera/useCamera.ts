/* THE CAMERA HOOK — the DOM's side of the bargain.
 *
 * All arithmetic lives in camera.ts; this hook owns events and the one piece
 * of performance discipline that matters: THE CAMERA DOES NOT RENDER REACT.
 * Pan and zoom write CSS variables on the world element inside a
 * requestAnimationFrame, so a drag is compositor work, not a re-render of
 * every mounted block. React state is only synced when an interaction ENDS,
 * for the parts of the UI (zoom readout, culling) that genuinely depend on it.
 *
 * CAMERA SAFETY, IMPLEMENTED NOT PROMISED:
 *   - manualSince: set on any user pan/zoom; focusStep() consults it, so the
 *     session only auto-focuses the next step when the learner has NOT
 *     wandered off. Reset-to-focus clears it.
 *   - no auto-pan while dragging: focus requests during a drag are dropped.
 *   - every camera move traces to an input or an explicit focus/reset call.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_CAMERA, DRAG_THRESHOLD, ZOOM_BTN_IN, ZOOM_BTN_OUT,
  cameraToFocus, clampZoom, panBy, panByKey, zoomAround,
  type CanvasCamera, type WorldRect,
} from './camera'
import { mark, sample } from '../perf/marks'
import { sampleCameraInputToPaint, sampleInputToPaint } from '../perf/harness'

export interface CameraApi {
  /** Committed camera — updates when an interaction settles. */
  camera: CanvasCamera
  viewportRef: (el: HTMLDivElement | null) => void
  worldRef: (el: HTMLDivElement | null) => void
  zoomIn: () => void
  zoomOut: () => void
  /** True when the learner has panned/zoomed away since the last focus. */
  wanderedAway: () => boolean
  /** Centre a world rect. respectManual: skip if the learner wandered. */
  focusRect: (rect: WorldRect, opts?: { respectManual?: boolean }) => void
  resetToFocus: () => void
  /** Put the camera back where a resumed session left it. Marked as manual so
   *  the first auto-focus does not immediately overrule the position the
   *  learner chose before they closed the tab. */
  restore: (camera: CanvasCamera) => void
}

export function useCamera(): CameraApi {
  const [committed, setCommitted] = useState<CanvasCamera>(DEFAULT_CAMERA)
  const cam = useRef<CanvasCamera>(DEFAULT_CAMERA)
  const viewportEl = useRef<HTMLDivElement | null>(null)
  const worldEl = useRef<HTMLDivElement | null>(null)
  const raf = useRef(0)
  const manualSince = useRef(false)
  const dragging = useRef(false)
  const lastFocus = useRef<WorldRect | null>(null)
  const spaceHeld = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null)

  const apply = useCallback(() => {
    const el = worldEl.current
    if (!el) return
    const t0 = performance.now()
    const c = cam.current
    el.style.setProperty('--camera-x', `${-c.x * c.zoom}px`)
    el.style.setProperty('--camera-y', `${-c.y * c.zoom}px`)
    el.style.setProperty('--camera-zoom', String(c.zoom))
    sample('camera-frame-js', performance.now() - t0)
    mark('camera-frame')
  }, [])

  const schedule = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      apply()
    })
  }, [apply])

  const commit = useCallback(() => setCommitted({ ...cam.current }), [])

  const set = useCallback((next: CanvasCamera, manual: boolean) => {
    cam.current = next
    if (manual) manualSince.current = true
    schedule()
  }, [schedule])

  /* ── wiring ──────────────────────────────────────────────────────────── */
  const attachViewport = useCallback((el: HTMLDivElement | null) => {
    viewportEl.current = el
    if (!el) return

    let downX = 0, downY = 0, lastX = 0, lastY = 0
    let passedThreshold = false
    let inputT0 = 0

    const isPanStart = (e: PointerEvent) =>
      e.button === 1 || (e.button === 0 && (spaceHeld.current || !(e.target as HTMLElement).closest('button, input, a, [data-board="quiz-option"]')))

    const down = (e: PointerEvent) => {
      if (!isPanStart(e)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      /* Capture can throw (InvalidPointerId) when the pointer is already gone
       * or synthetic — a drag must degrade to uncaptured, never abort. */
      try { el.setPointerCapture(e.pointerId) } catch { /* uncaptured drag */ }
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        pinchStart.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: cam.current.zoom,
          cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        }
        return
      }
      dragging.current = true
      passedThreshold = false
      downX = lastX = e.clientX
      downY = lastY = e.clientY
      inputT0 = performance.now()
      mark('camera-input')
    }

    const move = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinchStart.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const rect = el.getBoundingClientRect()
        const factor = (dist / pinchStart.current.dist) * (pinchStart.current.zoom / cam.current.zoom)
        set(zoomAround(cam.current, factor, pinchStart.current.cx - rect.left, pinchStart.current.cy - rect.top), true)
        return
      }
      if (!dragging.current) return
      if (!passedThreshold) {
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < DRAG_THRESHOLD) return
        passedThreshold = true
        el.dataset.dragging = 'true'
      }
      const t0 = performance.now()
      set(panBy(cam.current, e.clientX - lastX, e.clientY - lastY), true)
      lastX = e.clientX; lastY = e.clientY
      sample('pan-handler-js', performance.now() - t0)
      /* Input → next paint: measured from the event's own timestamp to two
       * animation frames later, which is when the compositor has actually put
       * the moved world on screen. Handler duration alone would flatter it. */
      sampleCameraInputToPaint(t0)
      if (inputT0) { sample('input-to-camera', performance.now() - inputT0); inputT0 = 0 }
    }

    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinchStart.current = null
      if (!dragging.current) return
      dragging.current = false
      delete el.dataset.dragging
      commit()
    }

    const wheel = (e: WheelEvent) => {
      /* Wheel and trackpad ZOOM around the pointer — the board is a camera
       * surface, not a scroll page. preventDefault keeps the page still. */
      e.preventDefault()
      mark('camera-input')
      const t0 = performance.now()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))
      set(zoomAround(cam.current, factor, e.clientX - rect.left, e.clientY - rect.top), true)
      sample('input-to-camera', performance.now() - t0)
      sampleCameraInputToPaint(t0)
      commit()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    ;(el as HTMLDivElement & { __detach?: () => void }).__detach = () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [set, commit])

  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    const prev = viewportEl.current as (HTMLDivElement & { __detach?: () => void }) | null
    prev?.__detach?.()
    attachViewport(el)
  }, [attachViewport])

  const worldRef = useCallback((el: HTMLDivElement | null) => {
    worldEl.current = el
    if (el) apply()
  }, [apply])

  /* Space-hold + arrow keys, on the document so focus position never matters.
   * Arrow keys pan only when nothing focusable is active — the checkpoint
   * buttons keep their keyboard behaviour. */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) { spaceHeld.current = true }
      const dir = arrowDir(e.key)
      if (dir && !isEditable(e.target)) {
        e.preventDefault()
        mark('camera-input')
        const t0 = performance.now()
        set(panByKey(cam.current, dir[0], dir[1]), true)
        sampleCameraInputToPaint(t0)
        commit()
      }
    }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') spaceHeld.current = false }
    document.addEventListener('keydown', kd)
    document.addEventListener('keyup', ku)
    return () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku) }
  }, [set, commit])

  const zoomStep = useCallback((factor: number) => {
    const el = viewportEl.current
    const rect = el?.getBoundingClientRect()
    mark('camera-input')
    const t0 = performance.now()
    set(zoomAround(cam.current, factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2), true)
    sampleCameraInputToPaint(t0)
    commit()
  }, [set, commit])

  const focusRect = useCallback((rect: WorldRect, opts?: { respectManual?: boolean }) => {
    if (dragging.current) return                       // never yank mid-drag
    if (opts?.respectManual && manualSince.current) { lastFocus.current = rect; return }
    const el = viewportEl.current
    if (!el) return
    lastFocus.current = rect
    manualSince.current = false
    cam.current = cameraToFocus(rect, el.clientWidth, el.clientHeight)
    schedule()
    commit()
  }, [schedule, commit])

  const resetToFocus = useCallback(() => {
    if (lastFocus.current) {
      mark('reset-input')
      const t0 = performance.now()
      manualSince.current = false
      focusRect(lastFocus.current)
      /* Both channels measure to PAINT, two frames out. The reset label is
       * separate so the Phase 7 reset budget is not diluted by drag samples. */
      sampleCameraInputToPaint(t0)
      sampleInputToPaint(t0, 'camera-reset-to-paint')
    }
  }, [focusRect])

  const restore = useCallback((next: CanvasCamera) => {
    cam.current = { x: next.x, y: next.y, zoom: clampZoom(next.zoom) }
    /* Treated as a manual position: the learner chose it, even if they chose
     * it yesterday. Without this the session's first focusRect would move the
     * camera the moment the restored step is placed, and the restore would be
     * invisible. */
    manualSince.current = true
    schedule()
    commit()
  }, [schedule, commit])

  return useMemo(() => ({
    camera: committed,
    viewportRef,
    worldRef,
    zoomIn: () => zoomStep(ZOOM_BTN_IN),
    zoomOut: () => zoomStep(ZOOM_BTN_OUT),
    wanderedAway: () => manualSince.current,
    focusRect,
    resetToFocus,
    restore,
  }), [committed, viewportRef, worldRef, zoomStep, focusRect, resetToFocus, restore])
}

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || el.isContentEditable
}

function arrowDir(key: string): [number, number] | null {
  switch (key) {
    case 'ArrowLeft': return [-1, 0]
    case 'ArrowRight': return [1, 0]
    case 'ArrowUp': return [0, -1]
    case 'ArrowDown': return [0, 1]
    default: return null
  }
}

/* Type escape hatch used above. */
export function clampZoomPublic(z: number): number { return clampZoom(z) }
