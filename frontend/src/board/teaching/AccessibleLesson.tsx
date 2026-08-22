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

export function AccessibleLesson({ released, status }: {
  released: ReleasedStep[]
  /** Session status, announced politely when it changes. */
  status?: string
}) {
  /* WHAT IS ANNOUNCED, AND WHAT IS NOT.
   *
   * A live region that spoke every revealed chunk would talk over a learner
   * continuously — text arrives a few words at a time. What matters is when
   * something CHANGES for them: a new step, or a checkpoint waiting for a
   * decision. Those are announced; the typing is not. */
  const count = released.length
  const current = released[count - 1]
  const announcement = !current
    ? ''
    : status === 'checkpoint'
      ? `Step ${count} finished. ${current.step.checkpoint?.question ?? 'Ready to continue?'}`
      : status === 'complete'
        ? 'Lesson complete.'
        : `Step ${count}${current.step.title ? `: ${current.step.title}` : ''}.`

  return (
    <>
      {/* Polite, atomic, and always present in the DOM — a live region added
        * at the moment it has something to say is often missed, because the
        * technology was not watching the node yet. */}
      <div
        data-board="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      <section
        id="lesson-transcript"
        data-board="visually-hidden"
        aria-label="Lesson so far, in reading order"
        tabIndex={-1}
      >
        <h2>Lesson transcript</h2>
        <p>
          {count === 0
            ? 'Nothing has been taught yet.'
            : `${count} step${count === 1 ? '' : 's'} so far. The board shows the same content spatially.`}
        </p>
        <ol>
          {released.map((r, i) => (
            <li key={r.step.id} id={`lesson-step-${i + 1}`}>
              <h3>
                {r.step.title ?? `Step ${i + 1}`}
                {r.clarification ? ' (explained again)' : ''}
              </h3>
              {r.step.blocks.map((b) => <p key={b.id}>{textEquivalent(b)}</p>)}
              {(r.step.connectors ?? []).map((c) => (
                <p key={c.id}>Relationship: {c.from} {c.kind === 'causal' ? 'leads to' : c.kind === 'sequence' ? 'is followed by' : 'references'} {c.to}{c.label ? ` (${c.label})` : ''}.</p>
              ))}
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
