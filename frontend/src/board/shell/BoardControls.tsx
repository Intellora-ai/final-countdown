import React from 'react'

/* SHELL CONTROLS — fixed chrome, outside the camera's reach.
 *
 * PHASE 1C CHANGE: the camera made three controls REAL. Zoom in, zoom out
 * and reset-to-focus now receive handlers and lose their disabled state —
 * they are the camera's buttons. Everything else (back, ask, 2D/3D, layers)
 * stays a genuinely disabled real element, exactly as before: `disabled` on
 * a <button>/<input>, never on a <div>, no handlers, no fake affordances.
 *
 * These components render OUTSIDE the transformed world by construction —
 * BlackboardShell mounts them beside the viewport, never inside it — so no
 * camera movement can move them.
 */

export function BoardTopControls() {
  return (
    <div data-board="controls-top">
      <button type="button" data-board="pill" disabled>
        <span aria-hidden="true">←</span>
        <span>Back</span>
      </button>

      <input
        type="text"
        data-board="ask"
        disabled
        placeholder="Ask anything…"
        aria-label="Ask anything (not available yet)"
      />

      <div data-board="controls-right">
        <div data-board="segmented" role="group" aria-label="Dimension">
          <button type="button" data-board="segment" data-active="true" disabled>2D</button>
          <button type="button" data-board="segment" disabled>3D</button>
        </div>
        <button type="button" data-board="icon" disabled aria-label="Layers">
          <span aria-hidden="true">≡</span>
        </button>
      </div>
    </div>
  )
}

export function BoardSideControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn?: () => void
  onZoomOut?: () => void
  onReset?: () => void
}) {
  return (
    <div data-board="controls-side">
      <div data-board="rail">
        <button type="button" data-board="icon" disabled={!onZoomIn} onClick={onZoomIn} aria-label="Zoom in">
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" data-board="icon" disabled={!onZoomOut} onClick={onZoomOut} aria-label="Zoom out">
          <span aria-hidden="true">−</span>
        </button>
        <button type="button" data-board="icon" disabled={!onReset} onClick={onReset} aria-label="Reset view to the current step">
          <span aria-hidden="true">⌖</span>
        </button>
      </div>
      <button type="button" data-board="icon" disabled aria-label="Full screen">
        <span aria-hidden="true">⤢</span>
      </button>
    </div>
  )
}
