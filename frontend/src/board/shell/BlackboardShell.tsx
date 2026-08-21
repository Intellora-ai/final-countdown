import React from 'react'
import { BoardCanvas } from './BoardCanvas'
import { BoardTopControls, BoardSideControls } from './BoardControls'
import './board-theme.css'

/* THE PERMANENT ROOM.
 *
 * Everything in this component is the part that does NOT change per question:
 * the ground, the edge, the controls, the header, the reading column. The
 * answer changes inside it. That split is the product, and it is why this file
 * knows nothing about blocks — it takes children and frames them.
 *
 * WHY THE THEME IS IMPORTED HERE. `styles/index.css` is a shared file the
 * dashboard owns. Importing board-theme.css from this component instead means
 * the board ships its own stylesheet without editing anything the dashboard
 * depends on. Vite bundles it identically; scoping comes from the
 * `[data-board="root"]` selector, not from where the import sits.
 *
 * THE EDGE LAYER. The board's ground is #16191C and the app around it is
 * #0C0E16 — close enough to look like a mistake if they simply met at a hard
 * line. A gradient falling inward from the top and left edges turns the join
 * into a deliberate one: the canvas reads as a room you have entered rather
 * than a panel pasted beside the sidebar. It is `aria-hidden` and
 * `pointer-events: none`, so it is decoration in the strict sense.
 */
export function BlackboardShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string | null
  children: React.ReactNode
}) {
  return (
    <div data-board="root">
      <div data-board="edge" aria-hidden="true" />
      <BoardTopControls />
      <BoardSideControls />
      <BoardCanvas>
        <header data-board="header">
          {eyebrow ? <p data-board="eyebrow">{eyebrow}</p> : null}
          <h1 data-board="title">{title}</h1>
          {subtitle ? <p data-board="subtitle">{subtitle}</p> : null}
        </header>
        {children}
      </BoardCanvas>
    </div>
  )
}
