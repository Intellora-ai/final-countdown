import React from 'react'
import type { TextBlock as TextBlockData } from '../types/learningBoard'

/* Short text with structured emphasis — and no other power.
 *
 * Emphasis is a WORD on a segment ('strong' | 'accent'), never markup. The
 * data cannot ask for a colour, a size, or a tag; it can only say "this part
 * matters" and let the stylesheet decide what mattering looks like. That is
 * the entire negotiation between generator and board, in miniature.
 */
export function TextBlock({ block }: { block: TextBlockData }) {
  const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : []
  if (!paragraphs.length) return null
  return (
    <div data-board="prose">
      {paragraphs.map((segments, p) => (
        <p key={p}>
          {(Array.isArray(segments) ? segments : []).map((seg, s) =>
            seg.emphasis
              ? <em key={s} data-board="em" data-em={seg.emphasis}>{seg.text}</em>
              : <React.Fragment key={s}>{seg.text}</React.Fragment>,
          )}
        </p>
      ))}
    </div>
  )
}
