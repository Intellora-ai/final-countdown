import React from 'react'
import type { ComparisonBlock as ComparisonBlockData } from '../types/learningBoard'

/* Side-by-side comparison: subjects are columns, criteria are rows. It is a
 * table underneath — because that is what a comparison IS — wearing the
 * board's column styling. On narrow boards the stylesheet stacks it into
 * per-criterion groups rather than shrinking text to fit. */
export function ComparisonBlock({ block }: { block: ComparisonBlockData }) {
  const subjects = Array.isArray(block.subjects) ? block.subjects : []
  const criteria = Array.isArray(block.criteria) ? block.criteria : []
  if (subjects.length < 2 || !criteria.length) return null
  return (
    <div data-board="table-scroll">
      <table data-board="compare">
        <thead>
          <tr>
            <th scope="col" data-board="compare-crit-head" aria-label="Criterion" />
            {subjects.map((s, i) => <th key={i} scope="col">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {criteria.map((c, r) => (
            <tr key={r}>
              <th scope="row" data-board="compare-crit">{c.label}</th>
              {subjects.map((_, i) => <td key={i}>{c.values?.[i] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
