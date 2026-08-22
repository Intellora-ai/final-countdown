import { useCallback, useEffect, useRef, useState } from 'react'

/* REAL MEASUREMENT, BECAUSE THE VALIDATOR WAS BEING LIED TO.
 *
 * layout/validate.ts has eight checks and a repair ladder, and it was correct
 * code. It was also unreachable from anything a learner could see: the only
 * production caller was LessonGallery's SLOT preview, and that caller built
 * every block with `rows: 3, overflows: false` — two constants. `noOverflow`
 * filters on `b.overflows`, so with the field pinned to false the check could
 * not fail for any lesson, at any viewport, ever. A green validator that reads
 * fabricated inputs is worse than no validator: it produces evidence.
 *
 * The other lie was the viewport. LessonRenderer defaulted to
 * `{ width: 1200, height: 800 }` whenever a caller passed nothing, and
 * LessonGallery passed nothing. Every contract's `capacity()` therefore sized
 * its content for a 1200px desktop while the user might be on a 375px phone.
 *
 * This module supplies the two things that were missing: the container's real
 * size, and each block's real overflow. Both come from the DOM.
 *
 * WHY MEASUREMENT IS INJECTABLE. jsdom reports 0 for every geometry property
 * and has no ResizeObserver, so a test that relied on real measurement could
 * only ever assert zeros. `measureBlock` is exported and pure, and the hook
 * accepts an override, so a test can drive the pipeline with the numbers it
 * wants to prove something about without the component branching on NODE_ENV.
 */

export interface Size {
  width: number
  height: number
}

/** What the DOM can tell us about one rendered block. */
export interface BlockMeasurement {
  /** Content wider or taller than the box it was given. */
  overflows: boolean
  /** Rendered extent in grid rows, for the validator's `rows` field. */
  rows: number
  /** Smallest interactive target inside this block, or undefined if none. */
  tapTarget?: number
  /** A label was shortened by CSS ellipsis or by the flow layout. */
  truncatedLabel?: boolean
  /** ...and the full text is still reachable, via title or aria-label. */
  hasTooltip?: boolean
}

/** One grid row, in px. Used to convert a pixel height into the validator's
 *  row unit. Not a style token: this is a measurement unit, not an appearance. */
export const GRID_ROW_PX = 24

/* A tolerance, in px. Sub-pixel differences between scrollWidth and clientWidth
 * are a rounding artefact of fractional layout, not an overflow a user can see
 * or scroll to. Flagging them would make the validator fire on every frame. */
const OVERFLOW_EPSILON = 1

/**
 * Measure one rendered block.
 *
 * `overflows` deliberately ignores elements that opted into their own
 * scrolling. A table inside `[data-overflow="scroll"]` is not a layout fault --
 * it is the table contract's disclosure plan working. Treating intentional
 * scroll as overflow would make the honest fix look like the bug.
 */
export function measureBlock(el: HTMLElement): BlockMeasurement {
  const scrollsOnPurpose = el.querySelector('[data-overflow="scroll"]') !== null

  const widthOverflow = !scrollsOnPurpose
    && el.scrollWidth - el.clientWidth > OVERFLOW_EPSILON

  /* Height overflow only counts when the element is actually clipping. An
   * auto-height block growing taller than an estimate is not a defect. */
  const clips = getComputedStyle(el).overflowY === 'hidden'
  const heightOverflow = clips && el.scrollHeight - el.clientHeight > OVERFLOW_EPSILON

  const targets = [...el.querySelectorAll('button, a, input, select, [role="button"]')]
    .map((t) => {
      const r = (t as HTMLElement).getBoundingClientRect()
      return Math.min(r.width, r.height)
    })
    .filter((n) => n > 0)

  /* A shortened label is only a fault when the full text cannot be recovered.
   * Both the flow layout (<title>) and CSS ellipsis are covered here. */
  const truncated = [...el.querySelectorAll<HTMLElement>('[data-truncated="true"]')]
  const untitled = truncated.filter(
    (t) => !t.querySelector('title') && !t.getAttribute('title') && !t.getAttribute('aria-label'),
  )

  return {
    overflows: widthOverflow || heightOverflow,
    rows: Math.max(1, Math.round(el.getBoundingClientRect().height / GRID_ROW_PX)),
    ...(targets.length ? { tapTarget: Math.min(...targets) } : {}),
    ...(truncated.length ? { truncatedLabel: true, hasTooltip: untitled.length === 0 } : {}),
  }
}

/**
 * The container's live size.
 *
 * Returns null until the element has been measured once, so a caller can tell
 * "not measured yet" from "measured as zero" and refuse to make a capacity
 * decision on a guess. That distinction is the whole point: the old code could
 * not make it, so it fell back to 1200x800 and called that a viewport.
 */
export function useElementSize(ref: React.RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const read = () => {
      const r = el.getBoundingClientRect()
      /* Ignore a zero measurement: an element inside a display:none ancestor
       * reports 0x0, and resizing the whole layout to fit nothing would be a
       * visible flash when it comes back. */
      if (r.width > 0 && r.height > 0) {
        setSize((prev) =>
          prev && prev.width === r.width && prev.height === r.height
            ? prev
            : { width: r.width, height: r.height },
        )
      }
    }

    read()

    /* jsdom has no ResizeObserver. Falling back to the one-shot read above
     * keeps the component mountable in unit tests rather than throwing. */
    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}

/**
 * Collect measurements for every registered block.
 *
 * Blocks register their element by id, so the renderer can measure exactly the
 * boxes it placed rather than guessing from a selector.
 */
export function useBlockMeasurements() {
  const nodes = useRef(new Map<string, HTMLElement>())
  const [measurements, setMeasurements] = useState<Record<string, BlockMeasurement>>({})

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el)
    else nodes.current.delete(id)
  }, [])

  const measureAll = useCallback(() => {
    const next: Record<string, BlockMeasurement> = {}
    for (const [id, el] of nodes.current) next[id] = measureBlock(el)
    setMeasurements((prev) => (sameMeasurements(prev, next) ? prev : next))
    return next
  }, [])

  return { register, measureAll, measurements }
}

/** Structural equality, so a re-measure that found nothing new does not loop. */
function sameMeasurements(
  a: Record<string, BlockMeasurement>,
  b: Record<string, BlockMeasurement>,
): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => {
    const x = a[k]
    const y = b[k]
    return y !== undefined
      && x.overflows === y.overflows
      && x.rows === y.rows
      && x.tapTarget === y.tapTarget
      && x.truncatedLabel === y.truncatedLabel
      && x.hasTooltip === y.hasTooltip
  })
}
