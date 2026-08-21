import React from 'react'

/* THE VIEWPORT — the readable column the board's content lives in.
 *
 * Phase 1 scrolls normally: no pan, no zoom, no camera. This component exists
 * anyway, as a named seam. When spatial mode arrives, the transform attaches
 * HERE — one element, wrapping everything, already the thing that owns the
 * board's coordinate space. Introducing that later into a shell that had no
 * such element would mean restructuring the tree; introducing it into this one
 * means editing this file.
 */
export function BoardCanvas({ children }: { children: React.ReactNode }) {
  return <div data-board="canvas">{children}</div>
}
