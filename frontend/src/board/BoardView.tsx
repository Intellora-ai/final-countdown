import React from 'react'
import { BlackboardShell } from './shell/BlackboardShell'
import { BoardRenderer } from './renderer/BoardRenderer'
import { CHANGE_OF_STATE_BOARD, CHANGE_OF_STATE_EYEBROW } from './fixtures/change-of-state'

/* THE ROUTE — and the shape every future board will arrive in.
 *
 * The important line is the last one. `BoardRenderer` is handed a LearningBoard
 * and nothing else: no component tree, no JSX, no per-block special case. When
 * a generated board replaces the fixture in a later phase, THIS FILE DOES NOT
 * CHANGE — only where the object comes from does. Building the fixture path
 * through the real renderer, rather than hand-rendering three components for
 * speed, is the entire reason Phase 1 is worth doing before Phase 2.
 *
 * Phase 1 has one board and one path to it. Empty, loading and error states
 * arrive with the validator, because until there is a validator there is
 * nothing that can legitimately produce them.
 */
export function BoardView() {
  const board = CHANGE_OF_STATE_BOARD

  return (
    <BlackboardShell
      eyebrow={CHANGE_OF_STATE_EYEBROW}
      title={board.title}
      subtitle={board.subtitle}
    >
      <BoardRenderer board={board} />
    </BlackboardShell>
  )
}
