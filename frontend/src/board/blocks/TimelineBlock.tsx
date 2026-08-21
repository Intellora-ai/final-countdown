import React from 'react'
import type { TimelineBlock as TimelineBlockData } from '../types/learningBoard'

/* Chronology on a rail. Flow layout: the rail is a border, the events are
 * list items, and time reads downward — which is also the one ordering that
 * survives every viewport without a single coordinate. */
export function TimelineBlock({ block }: { block: TimelineBlockData }) {
  const events = Array.isArray(block.events) ? block.events : []
  if (!events.length) return null
  return (
    <ol data-board="timeline">
      {events.map((e, i) => (
        <li key={i} data-board="timeline-event">
          <span data-board="timeline-dot" aria-hidden="true" />
          <span data-board="timeline-at">{e.at}</span>
          <span data-board="timeline-body">
            <span data-board="timeline-label">{e.label}</span>
            {e.detail ? <span data-board="timeline-detail">{e.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
