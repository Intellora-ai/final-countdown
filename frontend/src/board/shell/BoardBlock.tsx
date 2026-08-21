import React from 'react'
import type { BlockWidth } from '../types/learningBoard'
import type { BlockTreatment } from '../renderer/blockRegistry'

/* THE FRAME — every piece of chrome a block is allowed to have.
 *
 * Border, radius, surface, padding, shadow, the eyebrow, the title and the grid
 * span all live here, which is the reason a block component can be six lines of
 * markup. It also means a change to how blocks are framed is one edit, not
 * fourteen.
 *
 * `treatment` IS THE ANSWER TO CARD-SOUP. 'bare' puts the content on the canvas
 * with a heading and no box. 'glass' gives it a panel. Prose is bare; a table
 * and a callout are glass. Framing everything identically is what makes a board
 * read as a dashboard, so the frame is a decision, taken per block type, in the
 * registry — never by the block itself and never by the board's author.
 *
 * HEADING LEVEL. The board title is the page's h1, so a block title is an h2.
 * That keeps the document outline correct for a screen reader reading the board
 * top to bottom.
 */
export function BoardBlock({
  blockId,
  width,
  treatment,
  title,
  eyebrow,
  children,
}: {
  /** Anchor for the connector layer. Absent on unrenderable blocks. */
  blockId?: string
  width: BlockWidth
  treatment: BlockTreatment
  title?: string
  eyebrow?: string
  children: React.ReactNode
}) {
  return (
    <section data-board="cell" data-block-id={blockId} data-w={width} data-treatment={treatment}>
      {eyebrow ? <p data-board="block-eyebrow">{eyebrow}</p> : null}
      {title ? <h2 data-board="block-title">{title}</h2> : null}
      <div data-board="block-body">{children}</div>
    </section>
  )
}
