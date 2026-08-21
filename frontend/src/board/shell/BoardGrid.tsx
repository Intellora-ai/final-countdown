import React from 'react'

/* THE GRID — twelve columns, measured against itself.
 *
 * CONTAINER QUERY, NOT MEDIA QUERY. The board does not own the viewport: the
 * curriculum sidebar takes 272px of it, and on a tablet that sidebar becomes a
 * drawer that opens and closes. A media query would keep claiming "desktop"
 * while the board was actually 600px wide behind an open drawer, and blocks
 * would be sized for space they do not have. Asking the grid how wide IT is
 * gets the right answer in every one of those states.
 *
 * The span for each semantic width lives in board-theme.css, so the mapping
 * from meaning to columns is written once, in the stylesheet, and not scattered
 * through components.
 */
export function BoardGrid({ children }: { children: React.ReactNode }) {
  return <div data-board="grid">{children}</div>
}
