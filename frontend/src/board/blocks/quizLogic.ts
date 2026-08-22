/* THE QUIZ'S RULES, SEPARATED FROM ITS MARKUP.
 *
 * Radiogroup keyboard behaviour is a specification, not a preference: arrows
 * move between options and wrap, Home and End jump to the ends, and the
 * roving tabindex means the group is ONE tab stop rather than four. Getting
 * that wrong is invisible to a mouse and total to a keyboard.
 *
 * It lives here as pure functions so it can be tested without a DOM — the same
 * reason the camera's arithmetic lives apart from its event handlers.
 */

export type QuizIntent =
  | { kind: 'move'; to: number }
  | { kind: 'commit' }
  | { kind: 'none' }

/** What a key means inside a radiogroup of `count` options, with focus on
 *  `index`. Wrapping is the ARIA-recommended behaviour for radio groups. */
export function keyIntent(key: string, index: number, count: number): QuizIntent {
  if (count <= 0) return { kind: 'none' }
  switch (key) {
    /* Both axes move: a radiogroup may be laid out in a row or a column, and
     * the learner does not know which the stylesheet chose. */
    case 'ArrowRight':
    case 'ArrowDown':
      return { kind: 'move', to: (index + 1) % count }
    case 'ArrowLeft':
    case 'ArrowUp':
      return { kind: 'move', to: (index - 1 + count) % count }
    case 'Home':
      return { kind: 'move', to: 0 }
    case 'End':
      return { kind: 'move', to: count - 1 }
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return { kind: 'commit' }
    default:
      return { kind: 'none' }
  }
}

export type OptionState = 'idle' | 'right' | 'wrong' | 'reveal'

/** What one option looks like once an answer has been given.
 *
 * The correct answer is revealed even when the learner chose wrongly: a quiz
 * that only says "no" teaches nothing. `reveal` marks that case so the
 * stylesheet can distinguish "you got this right" from "this was right". */
export function optionState(
  optionId: string,
  isCorrect: boolean,
  picked: string | null,
): OptionState {
  if (picked === null) return 'idle'
  if (optionId === picked) return isCorrect ? 'right' : 'wrong'
  return isCorrect ? 'reveal' : 'idle'
}

/** The text marker beside an option. State must never be carried by colour
 *  alone — this is what a learner who cannot distinguish the borders reads,
 *  and what a screen reader announces. */
export function optionMarker(state: OptionState): string {
  switch (state) {
    case 'right': return '✓'
    case 'wrong': return '✕'
    case 'reveal': return '✓'
    default: return ''
  }
}

/** Announced with the marker, so the two readings agree. */
export function optionMarkerLabel(state: OptionState, isPicked: boolean): string {
  switch (state) {
    case 'right': return 'Your answer, correct'
    case 'wrong': return 'Your answer, incorrect'
    case 'reveal': return isPicked ? 'Correct' : 'The correct answer'
    default: return ''
  }
}

/** Where focus should sit when the group is first reached: the answered
 *  option if there is one, otherwise the first. A restored answer must be
 *  reachable, not stranded behind a tab stop that starts elsewhere. */
export function initialFocusIndex(optionIds: string[], picked: string | null): number {
  if (!picked) return 0
  const i = optionIds.indexOf(picked)
  return i >= 0 ? i : 0
}

/** A quiz needs a question and at least two answers. One option is not a
 *  choice; the validator drops such a block, and this is the second line of
 *  the same rule for anything that reaches the component another way. */
export function isAnswerable(prompt: unknown, optionCount: number): boolean {
  return typeof prompt === 'string' && prompt.trim().length > 0 && optionCount >= 2
}
