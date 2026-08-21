/* HANDWRITING — the tutor's hand, and the two honest ways to fake it.
 *
 * TEXT AND STROKES ARE ANIMATED DIFFERENTLY, ON PURPOSE.
 *
 * A stroke — an arrow, an underline, a box — is a real path, so it is really
 * drawn: `stroke-dasharray` set to the path length and `stroke-dashoffset`
 * animated to zero traces it end to end, exactly as a pen would.
 *
 * Text is not a path. Converting glyphs to outlines and stroking them produces
 * letters that are drawn in outline order, which looks nothing like writing and
 * costs a font-parsing dependency to get wrong. So text is revealed by a
 * left-to-right wipe in a handwriting face. That is a wipe, not a simulation of
 * penmanship, and calling it what it is matters: the claim being made to the
 * learner is "this is appearing as I say it", not "this is my actual
 * handwriting", and the wipe satisfies the first honestly.
 *
 * ONE OBJECT AT A TIME. Both primitives report completion, and the board waits
 * for it before starting the next. DOD-3 requires that a semantic object
 * finishes before the next begins — a board where four things fade in at once
 * is displaying, not constructing, whatever the durations say.
 *
 * REDUCED MOTION KEEPS THE CONTENT. `prefers-reduced-motion` skips the reveal
 * and calls `onDone` immediately, so the same words and the same marks are on
 * the board; only the animation is gone. The static result is identical either
 * way, which is what makes the accessibility guarantee real rather than a
 * degraded second version of the lesson.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const listener = () => setReduced(query.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])
  return reduced
}

/** Milliseconds a line of handwriting takes: fast enough to feel responsive,
 *  slow enough that the learner sees it being written rather than appearing. */
export function writeDuration(text: string): number {
  return Math.min(1600, Math.max(420, text.length * 26))
}

export function Handwritten({
  text,
  size = 22,
  tone = 'ink',
  active,
  onDone,
  className,
}: {
  text: string
  size?: number
  tone?: 'ink' | 'accent' | 'muted'
  /** False while an earlier object is still being written. */
  active: boolean
  onDone?: () => void
  className?: string
}) {
  const reduced = usePrefersReducedMotion()
  const [revealed, setRevealed] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    if (!active || done.current) return
    if (reduced) {
      done.current = true
      setRevealed(true)
      onDone?.()
      return
    }
    setRevealed(true)
    const id = window.setTimeout(() => {
      done.current = true
      onDone?.()
    }, writeDuration(text))
    return () => window.clearTimeout(id)
  }, [active, reduced, text, onDone])

  return (
    <span
      className={`hw ${className ?? ''}`}
      data-tone={tone}
      data-revealed={revealed || undefined}
      data-reduced={reduced || undefined}
      style={{
        fontSize: size,
        // The wipe duration is the same number `writeDuration` reports, so the
        // "finished" callback and the visual finish cannot drift apart.
        ['--hw-dur' as string]: `${writeDuration(text)}ms`,
      }}
    >
      {text}
    </span>
  )
}

/** A real drawn stroke. `d` is any SVG path; it is traced from start to end. */
export function DrawnPath({
  d,
  active,
  onDone,
  stroke = 'var(--accent)',
  width = 1.6,
  duration = 620,
  markerEnd,
}: {
  d: string
  active: boolean
  onDone?: () => void
  stroke?: string
  width?: number
  duration?: number
  markerEnd?: string
}) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<SVGPathElement | null>(null)
  const [length, setLength] = useState(0)
  const done = useRef(false)

  // The dash pattern must equal the path's real length or the trace either
  // stops short or finishes early, so it is measured from the DOM rather than
  // estimated from the `d` string.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    try {
      setLength(node.getTotalLength())
    } catch {
      setLength(0) // jsdom and other non-rendering hosts
    }
  }, [d])

  useEffect(() => {
    if (!active || done.current) return
    if (reduced) {
      done.current = true
      onDone?.()
      return
    }
    const id = window.setTimeout(() => {
      done.current = true
      onDone?.()
    }, duration)
    return () => window.clearTimeout(id)
  }, [active, reduced, duration, onDone])

  const animate = active && !reduced && length > 0
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={markerEnd}
      style={{
        strokeDasharray: length || undefined,
        strokeDashoffset: animate ? 0 : length || undefined,
        transition: animate ? `stroke-dashoffset ${duration}ms cubic-bezier(.16,1,.3,1)` : undefined,
        opacity: active ? 1 : 0,
      }}
    />
  )
}

/** Sequences objects so exactly one is being written at any moment.
 *  Returns the index currently allowed to animate, and a way to advance. */
export function useWritingQueue(total: number, enabled = true) {
  const [written, setWritten] = useState(0)
  const advance = useMemo(
    () => () => setWritten((n) => Math.min(total, n + 1)),
    [total],
  )
  useEffect(() => {
    if (!enabled) setWritten(0)
  }, [enabled])
  return {
    /** True for the one object allowed to write now. */
    isActive: (index: number) => enabled && index === written,
    /** True once an object has finished and should stay on the board. */
    isSettled: (index: number) => index < written,
    /** True for anything not yet reached. */
    isPending: (index: number) => index > written,
    written,
    advance,
    reset: () => setWritten(0),
  }
}
