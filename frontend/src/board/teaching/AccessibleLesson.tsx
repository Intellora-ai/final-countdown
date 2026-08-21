/* THE LINEAR LESSON — everything released, as plain document flow.
 *
 * The camera world is a visual arrangement; this is the same released
 * content as an ordinary top-to-bottom document, visually hidden but fully
 * present to assistive technology. Position, glow and arrows carry nothing
 * that is not also stated here in text.
 */
import React from 'react'
import type { ReleasedStep } from './useTeachingSession'
import { proseOf } from './reveal'
import type { Block } from '../types/learningBoard'

function textEquivalent(b: Block): string {
  const prose = proseOf(b)
  if (prose !== null) return prose
  switch (b.type) {
    case 'equation':
      return `Equation: ${b.latex}.` + (b.variables ?? []).map((v) => ` ${v.symbol} is ${v.meaning}${v.unit ? ` (${v.unit})` : ''}.`).join('')
    case 'diagram':
      return b.nodes.map((n) => {
        const out = b.edges.filter((e) => e.from === n.id)
        const rel = out.map((e) => `${e.kind === 'causal' ? 'leads to' : e.kind === 'sequence' ? 'is followed by' : 'relates to'} ${b.nodes.find((x) => x.id === e.to)?.label ?? e.to}${e.label ? ` (${e.label})` : ''}`).join('; ')
        return `${n.label}${n.detail ? ` — ${n.detail}` : ''}${rel ? `. ${rel}` : ''}.`
      }).join(' ')
    case 'line_chart':
      return `Chart${b.title ? ` "${b.title}"` : ''}: ` + b.points.map((p) => `${p.x}: ${p.y}`).join(', ') + '.'
    case 'bar_chart':
      return `Chart${b.title ? ` "${b.title}"` : ''}: ` + b.data.map((d) => `${d.label}: ${d.value}`).join(', ') + '.'
    case 'pie_chart':
      return `Chart${b.title ? ` "${b.title}"` : ''}: ` + b.data.map((d) => `${d.label}: ${d.value}`).join(', ') + '.'
    case 'table':
      return `Table${b.title ? ` "${b.title}"` : ''} with columns ${b.columns.join(', ')}. ` + b.rows.map((r) => r.join('; ')).join('. ')
    case 'image':
      return `Image: ${b.alt}`
    default:
      return `${b.type} content.`
  }
}

export function AccessibleLesson({ released }: { released: ReleasedStep[] }) {
  return (
    <section data-board="visually-hidden" aria-label="Lesson so far, in reading order">
      <ol>
        {released.map((r) => (
          <li key={r.step.id}>
            {r.step.title ? <h3>{r.step.title}</h3> : null}
            {r.step.blocks.map((b) => <p key={b.id}>{textEquivalent(b)}</p>)}
            {(r.step.connectors ?? []).map((c) => (
              <p key={c.id}>Relationship: {c.from} {c.kind === 'causal' ? 'leads to' : c.kind === 'sequence' ? 'is followed by' : 'references'} {c.to}{c.label ? ` (${c.label})` : ''}.</p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  )
}
