import React from 'react'
import type { ExplanationBlock as ExplanationBlockData } from '../types/learningBoard'

/* Prose, and nothing else.
 *
 * BARE BY REGISTRY DECISION, NOT BY ITS OWN CHOICE. This component renders no
 * panel, no border, no margin and no background — BoardBlock owns all of that,
 * and the registry is where 'bare' was chosen. A block that styled its own
 * container would be a card, and a board made of cards is the admin dashboard
 * this product is deliberately not.
 *
 * PARAGRAPHS, NOT MARKUP. A blank line starts a new paragraph. Nothing else is
 * interpreted, which is what keeps generated content from ever becoming HTML.
 */
export function ExplanationBlock({ block }: { block: ExplanationBlockData }) {
  const paragraphs = String(block.content ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (!paragraphs.length) return null

  return (
    <div data-board="prose">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}
