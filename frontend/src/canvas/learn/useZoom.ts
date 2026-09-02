/**
 * ZOOMING OUT TO SEE THE WHOLE TOPIC.
 *
 * THE OWNER'S DECISION, 2026-09-03: a long column you can zoom out of. Not a
 * 2D board -- learning stays in one vertical stream, which is the shape that
 * already works and the shape a lesson is written in. Zoom out to see a term at
 * a glance, zoom in to read, and the page still scrolls exactly as it did.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: **zoom never changes content.** It is a
 * CSS transform over already-rendered, already-validated blocks. It does not
 * re-ask, re-author, re-validate or re-lay-out anything. A zoom that re-fetched
 * could show her something different from what she was reading, which is the
 * durability promise broken by a scroll wheel.
 *
 * WHY `ctrlKey` IS THE TEST FOR A PINCH. Every browser reports a trackpad pinch
 * as a `wheel` event with `ctrlKey` set, whether or not a key is held -- it is
 * the platform convention, not a guess. An ordinary two-finger scroll has it
 * clear and is left completely alone, so the page scrolls as it always has.
 */

import { useCallback, useEffect, useState } from 'react'

/** Below this the words stop being words. */
const SMALLEST = 0.25
/** Above this a lesson is wider than any screen and panning becomes the product. */
const LARGEST = 2

/** One notch. Small enough that a pinch feels continuous rather than stepped. */
const A_NOTCH = 0.06

const keyFor = (canvasId: string | null): string => `canvas-zoom:${canvasId ?? 'free'}`

function clamp(value: number): number {
  return Math.min(LARGEST, Math.max(SMALLEST, Number(value.toFixed(3))))
}

/**
 * The scale this canvas is drawn at, and a way back to normal.
 *
 * Kept per canvas in `localStorage`: how far out she was looking is a
 * convenience for this browser, not learning, so it never goes to the server.
 * Storage that refuses is not an error -- the canvas simply opens at its
 * natural size, which is the right answer anyway.
 */
export function useZoom(canvasId: string | null): { scale: number; reset: () => void } {
  const [scale, setScale] = useState(() => {
    try {
      const kept = Number(window.localStorage.getItem(keyFor(canvasId)))
      return Number.isFinite(kept) && kept > 0 ? clamp(kept) : 1
    } catch {
      return 1
    }
  })

  const remember = useCallback(
    (next: number) => {
      setScale(next)
      try {
        window.localStorage.setItem(keyFor(canvasId), String(next))
      } catch {
        /* A private window, or storage switched off. The zoom still works for
           this visit; it simply is not there on the next one. */
      }
    },
    [canvasId],
  )

  useEffect(() => {
    const onWheel = (event: WheelEvent): void => {
      /* An ordinary scroll is a scroll. Only a pinch zooms. */
      if (!event.ctrlKey) return
      /* Without this the browser zooms its own chrome as well, and the two
         zooms fight: the page grows while the canvas shrinks. */
      event.preventDefault()
      setScale((current) => {
        const next = clamp(current - Math.sign(event.deltaY) * A_NOTCH)
        try {
          window.localStorage.setItem(keyFor(canvasId), String(next))
        } catch {
          /* See `remember`. */
        }
        return next
      })
    }

    const onKey = (event: KeyboardEvent): void => {
      /* The same keystroke every browser already uses for "actual size", so
         nobody has to learn a new one. */
      if (event.key !== '0' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      remember(1)
    }

    /* `passive: false` because `preventDefault` on a wheel event is ignored on
       a passive listener, and Chrome makes wheel listeners passive by default. */
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [canvasId, remember])

  return { scale, reset: () => remember(1) }
}
