import React from 'react'
import type { ProcessBlock as ProcessBlockData } from '../types/learningBoard'

/* Ordered steps. A real <ol>, because sequence is the semantics, and numbered
 * circles in the reference image are the STYLE of that semantics, not a
 * replacement for it. Flow layout only — a process never earns coordinates. */
export function ProcessBlock({ block }: { block: ProcessBlockData }) {
  const steps = Array.isArray(block.steps) ? block.steps : []
  if (!steps.length) return null
  return (
    <ol data-board="process">
      {steps.map((s, i) => (
        <li key={i} data-board="process-step">
          <span data-board="process-num" aria-hidden="true">{i + 1}</span>
          <span data-board="process-body">
            <span data-board="process-title">{s.title}</span>
            {s.detail ? <span data-board="process-detail">{s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
