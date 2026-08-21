import React, { useState } from 'react'
import type { QuizBlock as QuizBlockData } from '../types/learningBoard'

/* A question preview with LOCAL state only.
 *
 * Selecting an option reveals correctness and the explanation — that loop is
 * the block's pedagogy and needs no persistence. What this block deliberately
 * does NOT do in Phase 1B: touch the store, write attempts, or claim anything
 * about the learner. Progress is observed evidence, and a fixture rendering a
 * quiz is not observing anyone. The store wiring is a later phase's single,
 * explicit addition.
 */
export function QuizBlock({ block }: { block: QuizBlockData }) {
  const [picked, setPicked] = useState<string | null>(null)
  const options = Array.isArray(block.options) ? block.options : []
  if (!String(block.prompt ?? '').trim() || options.length < 2) return null
  const done = picked !== null
  const correct = done && options.find((o) => o.id === picked)?.correct === true

  return (
    <div data-board="quiz">
      <p data-board="quiz-prompt">{block.prompt}</p>
      <div data-board="quiz-options" role="group" aria-label="Answer options">
        {options.map((o) => {
          const state = !done ? 'idle' : o.id === picked ? (o.correct ? 'right' : 'wrong') : o.correct ? 'reveal' : 'idle'
          return (
            <button
              key={o.id}
              type="button"
              data-board="quiz-option"
              data-state={state}
              disabled={done}
              onClick={() => setPicked(o.id)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {done && (
        <p data-board="quiz-verdict" data-correct={correct ? 'true' : 'false'} role="status">
          {correct ? 'Correct.' : 'Not quite.'}
          {block.explanation ? ' ' + block.explanation : ''}
        </p>
      )}
    </div>
  )
}
