/* HOW A BLOCK REPORTS AN INTERACTION WITHOUT KNOWING WHERE IT GOES.
 *
 * Blocks receive exactly one prop — `block` — and the registry keeps it that
 * way on purpose: a component that took a store, a dispatch or a session would
 * be a component that could only be rendered by a board that had one. The
 * fixtures, the tests and the gallery all render blocks without any of that.
 *
 * So interaction arrives by context, and the DEFAULT IS NULL. A quiz rendered
 * without a board around it keeps its own answer in local state and behaves
 * exactly as it did before this existed. Nothing about a block's contract
 * changed; a board can now overhear it.
 */
import React, { createContext, useContext } from 'react'
import type { QuizAnswerRecord } from '../progress/types'

export interface BoardInteraction {
  /** Answers already given, restored across a reload. */
  quizAnswers: Record<string, QuizAnswerRecord>
  /** Record an answer. Called once per question; a second call for the same
   *  block is ignored by the recorder. */
  answerQuiz: (blockId: string, optionId: string, correct: boolean) => void
  /** Which diagram node is selected, if any, and how to change it. */
  selectedNodeId: string | null
  selectNode: (nodeId: string | null) => void
}

const BoardInteractionContext = createContext<BoardInteraction | null>(null)

export function BoardInteractionProvider(
  { value, children }: { value: BoardInteraction; children: React.ReactNode },
) {
  return (
    <BoardInteractionContext.Provider value={value}>
      {children}
    </BoardInteractionContext.Provider>
  )
}

/** Null when a block is rendered outside a board. Callers must handle that —
 *  it is the normal case in tests and in the gallery, not an error. */
export function useBoardInteraction(): BoardInteraction | null {
  return useContext(BoardInteractionContext)
}
