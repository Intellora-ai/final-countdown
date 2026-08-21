import React from 'react'

/* SHELL CONTROLS — six groups, seven controls, none of them wired.
 *
 * WHY REAL BUTTONS AND A REAL INPUT. `disabled` means something on a <button>
 * and on an <input>: the browser removes it from the tab order and exposes the
 * disabled state to assistive technology for free. On a <div> the attribute is
 * inert decoration — it looks disabled to a sighted user and is invisible to
 * everyone else. So every placeholder here is the element it is pretending to
 * be, and none of them is a styled <div>.
 *
 * NO REDUNDANT ARIA. Native `disabled` already removes these from the tab order
 * and announces the state, so `aria-disabled` and `tabIndex={-1}` are not
 * stacked on top of it. Those are for decorative non-button chrome, of which
 * this phase has none.
 *
 * NO HANDLERS AT ALL. Not a disabled handler, not a no-op handler — none. A
 * control that does nothing is honest; a control that quietly swallows a click
 * teaches the learner the product is broken.
 */

/* Top row: static flow, not absolutely positioned. Absolute controls over a
 * scrolling column collide with content the moment the text gets long, and the
 * board's content length is the one thing that will vary most. */
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

/* Left rail: the one place absolute positioning is used for controls, because
 * a zoom cluster belongs to the surface rather than to the document flow.
 * Hidden below 900px, where it would sit on top of the content instead of
 * beside it. */
export function BoardSideControls() {
  return (
    <div data-board="controls-side">
      <div data-board="rail">
        <button type="button" data-board="icon" disabled aria-label="Zoom in">
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" data-board="icon" disabled aria-label="Zoom out">
          <span aria-hidden="true">−</span>
        </button>
      </div>
      <button type="button" data-board="icon" disabled aria-label="Full screen">
        <span aria-hidden="true">⤢</span>
      </button>
    </div>
  )
}
