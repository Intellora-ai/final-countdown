import React, { useEffect, useRef, useState } from 'react'
import type { QuizBlock as QuizBlockData } from '../types/learningBoard'
import { useBoardInteraction } from '../teaching/BoardInteractionContext'
import {
  initialFocusIndex, isAnswerable, keyIntent,
  optionMarker, optionMarkerLabel, optionState,
} from './quizLogic'
import { mark, measureFrom } from '../perf/marks'

/* A question the learner answers once.
 *
 * WHAT CHANGED IN PHASE 5, AND WHY EACH PART OF IT.
 *
 * It is a radiogroup, not four buttons. Four buttons are four tab stops, and a
 * keyboard learner had to tab past every wrong answer to reach the right one.
 * A radiogroup is one stop; arrows choose within it. That is the pattern
 * assistive technology already knows how to describe.
 *
 * The lock uses aria-disabled, not disabled. A disabled button is removed from
 * the tab order, so answering used to throw focus back to the top of the page
 * — the learner pressed Enter and lost their place. aria-disabled announces
 * the same thing and keeps the element reachable, so the answer they just gave
 * is still where their focus is. The guard against a second answer moves into
 * the handler, where it is a rule rather than a side effect of the DOM.
 *
 * State is never carried by colour alone: every answered option shows a ✓ or ✕
 * with a label beside it.
 *
 * The answer is reported to the board if a board is listening, and restored
 * from it on mount. WITHOUT a board — a fixture, a test, the gallery — the
 * block keeps its own answer in local state and behaves exactly as before.
 */
export function QuizBlock({ block }: { block: QuizBlockData }) {
  const interaction = useBoardInteraction()
  const options = Array.isArray(block.options) ? block.options : []

  /* Local state is the fallback for a block rendered outside a board. When a
   * board is present its record wins, so a reload restores the answer. */
  const [localPicked, setLocalPicked] = useState<string | null>(null)
  const recorded = interaction?.quizAnswers[block.id]?.optionId ?? null
  const picked = recorded ?? localPicked

  const [focusIndex, setFocusIndex] = useState(() =>
    initialFocusIndex(options.map((o) => o.id), picked))
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  /* Only move focus in response to a key the learner pressed. Stealing focus
   * on mount would yank a reader out of the prompt they were reading. */
  const shouldFocus = useRef(false)

  useEffect(() => {
    if (!shouldFocus.current) return
    shouldFocus.current = false
    refs.current[focusIndex]?.focus()
  }, [focusIndex])

  if (!isAnswerable(block.prompt, options.length)) return null

  const done = picked !== null
  const correct = done && options.find((o) => o.id === picked)?.correct === true

  const choose = (optionId: string, isCorrect: boolean) => {
    /* THE DOUBLE-SUBMISSION GUARD. A rule, not a disabled attribute: an answer
     * given is an answer kept, whatever route the second press arrived by. */
    if (done) return
    mark('quiz-select')
    setLocalPicked(optionId)
    interaction?.answerQuiz(block.id, optionId, isCorrect)
    measureFrom('quiz-select', 'quiz-select-to-feedback')
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const intent = keyIntent(e.key, index, options.length)
    if (intent.kind === 'none') return
    e.preventDefault()
    if (intent.kind === 'move') {
      shouldFocus.current = true
      setFocusIndex(intent.to)
      return
    }
    const o = options[index]
    if (o) choose(o.id, o.correct === true)
  }

  return (
    <div data-board="quiz">
      <p data-board="quiz-prompt" id={`${block.id}-prompt`}>{block.prompt}</p>
      <div
        data-board="quiz-options"
        role="radiogroup"
        aria-labelledby={`${block.id}-prompt`}
      >
        {options.map((o, i) => {
          const state = optionState(o.id, o.correct === true, picked)
          const marker = optionMarker(state)
          return (
            <button
              key={o.id}
              ref={(el) => { refs.current[i] = el }}
              type="button"
              data-board="quiz-option"
              data-state={state}
              role="radio"
              aria-checked={picked === o.id}
              /* One tab stop for the group; arrows move within it. */
              tabIndex={i === focusIndex ? 0 : -1}
              aria-disabled={done || undefined}
              onClick={() => choose(o.id, o.correct === true)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onFocus={() => setFocusIndex(i)}
            >
              <span data-board="quiz-option-label">{o.label}</span>
              {marker && (
                <span data-board="quiz-option-marker" data-state={state}>
                  <span aria-hidden="true">{marker}</span>
                  <span data-board="visually-hidden">
                    {' '}{optionMarkerLabel(state, o.id === picked)}
                  </span>
                </span>
              )}
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
