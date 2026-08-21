import React from 'react'

/* THE THREE HONEST ANSWERS to "where is my lesson?".
 *
 * Loading is skeleton bars at believable spans — motion restrained to the
 * existing pulse, which reduced-motion collapses. Empty says emptiness is a
 * fact, not a fault. Error names what happened and does not pretend a board
 * exists. None of these invents content, which is the standing rule: the
 * board shows what is true, including "nothing yet".
 */
export function BoardLoading() {
  return (
    <div data-board="state" data-state="loading" aria-label="Loading board" role="status">
      <div data-board="skeleton" style={{ width: '52%' }} />
      <div data-board="skeleton" style={{ width: '34%' }} />
      <div data-board="skeleton-row">
        <div data-board="skeleton-panel" style={{ flex: 2 }} />
        <div data-board="skeleton-panel" style={{ flex: 1 }} />
      </div>
      <div data-board="skeleton-panel" style={{ height: 120 }} />
    </div>
  )
}

export function BoardEmpty() {
  return (
    <div data-board="state" data-state="empty">
      <p data-board="state-title">Nothing on the board yet</p>
      <p data-board="state-note">This board is valid but has no content blocks.</p>
    </div>
  )
}

export function BoardError({ message }: { message: string }) {
  return (
    <div data-board="state" data-state="error" role="alert">
      <p data-board="state-title">This board could not be shown</p>
      <p data-board="state-note">{message}</p>
    </div>
  )
}
