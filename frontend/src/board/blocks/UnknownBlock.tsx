import React from 'react'

/* THE FALLBACK, AND WHY IT SAYS SOMETHING RATHER THAN NOTHING.
 *
 * A block type this build cannot render is not an error to hide. Rendering
 * nothing would leave a silent hole in the middle of a lesson, and the learner
 * would have no way to know that something was meant to be there. Throwing
 * would take the whole board down over one block.
 *
 * So it renders, calmly, naming the type it could not draw. That is also what
 * makes "new block types can be added without rewriting the canvas" a
 * verifiable claim rather than an intention: an unimplemented type has a
 * defined, visible, non-fatal outcome today.
 */
export function UnknownBlock({ block }: { block: unknown }) {
  const raw = block && typeof block === 'object' ? (block as { type?: unknown }).type : undefined
  const label = typeof raw === 'string' && raw.trim() ? raw.trim() : 'missing type'

  return (
    <div data-board="unknown">
      <p data-board="unknown-type">{label}</p>
      <p data-board="unknown-note">This block type is not available in this version of the board.</p>
    </div>
  )
}
