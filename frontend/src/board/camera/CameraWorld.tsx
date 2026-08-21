import React from 'react'

/* THE VIEWPORT AND THE WORLD — the two halves of the camera model.
 *
 * BoardViewport clips (overflow hidden, overscroll contained) and receives
 * every pointer. FIXED SHELL CONTROLS ARE NOT ITS CHILDREN — they live
 * beside it in BlackboardShell, outside the transformed subtree, so the
 * camera cannot move them. That is structural, not stylistic: a control
 * inside the world WOULD move, so no control is inside the world.
 *
 * CameraWorld carries the one transform. translate3d + scale, driven by CSS
 * variables the camera hook writes inside rAF — pan is compositor work, and
 * React does not render during a drag.
 */
export const BoardViewport = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function BoardViewport({ children }, ref) {
    return (
      <div ref={ref} data-board="viewport" role="region" aria-label="Lesson board. Drag to pan, scroll to zoom, arrow keys to move.">
        {children}
      </div>
    )
  },
)

export const CameraWorld = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function CameraWorld({ children }, ref) {
    return (
      <div ref={ref} data-board="world">
        {children}
      </div>
    )
  },
)
