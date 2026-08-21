import React, { forwardRef } from 'react'

/* THE GRID — twelve columns, measured against itself.
 *
 * CONTAINER QUERY, NOT MEDIA QUERY. The board does not own the viewport: the
 * curriculum sidebar takes a share of it and the drawer changes that share
 * without the window moving. Asking the grid how wide IT is gets the right
 * answer in every state; the span each semantic width earns lives in
 * board-theme.css.
 *
 * The ref is exposed so the connector layer can measure real cell positions —
 * measurement, not participation: the grid neither knows nor cares that
 * anything draws above it.
 */
export const BoardGrid = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function BoardGrid({ children }, ref) {
    return <div ref={ref} data-board="grid">{children}</div>
  },
)
