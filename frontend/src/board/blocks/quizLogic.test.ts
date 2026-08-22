import { describe, it, expect } from 'vitest'
import {
  initialFocusIndex, isAnswerable, keyIntent,
  optionMarker, optionMarkerLabel, optionState,
} from './quizLogic'

/* Keyboard behaviour is a specification, so it is tested as one. Every case
 * here is a rule a keyboard learner depends on and a mouse never exercises.
 */

describe('radiogroup keys', () => {
  it('moves forward on both forward arrows, and wraps at the end', () => {
    expect(keyIntent('ArrowRight', 0, 4)).toEqual({ kind: 'move', to: 1 })
    expect(keyIntent('ArrowDown', 0, 4)).toEqual({ kind: 'move', to: 1 })
    /* Wrapping is the ARIA-recommended behaviour: a radiogroup is a ring. */
    expect(keyIntent('ArrowRight', 3, 4)).toEqual({ kind: 'move', to: 0 })
  })

  it('moves backward on both backward arrows, and wraps at the start', () => {
    expect(keyIntent('ArrowLeft', 2, 4)).toEqual({ kind: 'move', to: 1 })
    expect(keyIntent('ArrowUp', 2, 4)).toEqual({ kind: 'move', to: 1 })
    expect(keyIntent('ArrowUp', 0, 4)).toEqual({ kind: 'move', to: 3 })
  })

  it('answers both axes, because the learner cannot see the flex direction', () => {
    /* The stylesheet may lay the options out in a row or a column. A group
     * that only answered one axis would be half-navigable by accident. */
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      expect(keyIntent(key, 1, 3).kind).toBe('move')
    }
  })

  it('jumps to the ends with Home and End', () => {
    expect(keyIntent('Home', 2, 4)).toEqual({ kind: 'move', to: 0 })
    expect(keyIntent('End', 1, 4)).toEqual({ kind: 'move', to: 3 })
  })

  it('commits on Enter and on either spelling of space', () => {
    expect(keyIntent('Enter', 1, 4)).toEqual({ kind: 'commit' })
    expect(keyIntent(' ', 1, 4)).toEqual({ kind: 'commit' })
    /* Older engines report the space key by name. */
    expect(keyIntent('Spacebar', 1, 4)).toEqual({ kind: 'commit' })
  })

  it('ignores keys that mean something else, so typing is not swallowed', () => {
    for (const key of ['Tab', 'Escape', 'a', 'PageDown', 'Shift']) {
      expect(keyIntent(key, 1, 4), key).toEqual({ kind: 'none' })
    }
  })

  it('does nothing at all with no options', () => {
    expect(keyIntent('ArrowRight', 0, 0)).toEqual({ kind: 'none' })
  })
})

describe('what each option shows once answered', () => {
  it('shows nothing before an answer', () => {
    expect(optionState('a', true, null)).toBe('idle')
    expect(optionState('b', false, null)).toBe('idle')
  })

  it('marks the chosen answer right or wrong', () => {
    expect(optionState('a', true, 'a')).toBe('right')
    expect(optionState('b', false, 'b')).toBe('wrong')
  })

  it('reveals the correct answer even when the learner picked another', () => {
    /* A quiz that only says "no" teaches nothing. */
    expect(optionState('a', true, 'b')).toBe('reveal')
  })

  it('leaves the other wrong answers alone', () => {
    expect(optionState('c', false, 'b')).toBe('idle')
  })

  it('never carries state in colour alone', () => {
    /* Every state that means something has a character AND a label. A learner
     * who cannot distinguish the borders reads the same result. */
    for (const state of ['right', 'wrong', 'reveal'] as const) {
      expect(optionMarker(state).length).toBeGreaterThan(0)
      expect(optionMarkerLabel(state, true).length).toBeGreaterThan(0)
    }
    expect(optionMarker('idle')).toBe('')
  })

  it('distinguishes "you were right" from "this was right"', () => {
    expect(optionMarkerLabel('right', true)).toContain('Your answer')
    expect(optionMarkerLabel('reveal', false)).toContain('The correct answer')
  })
})

describe('where focus starts', () => {
  it('starts at the first option when nothing is answered', () => {
    expect(initialFocusIndex(['a', 'b', 'c'], null)).toBe(0)
  })

  it('starts at a restored answer, so it is not stranded behind the tab stop', () => {
    /* After a reload the group has one tab stop. If it sat on the first option
     * while the answer was the third, the learner would tab into the group and
     * find focus somewhere other than their own answer. */
    expect(initialFocusIndex(['a', 'b', 'c'], 'c')).toBe(2)
  })

  it('falls back to the first option when the record names one that is gone', () => {
    expect(initialFocusIndex(['a', 'b'], 'z')).toBe(0)
  })
})

describe('what counts as a question', () => {
  it('needs a prompt and at least two answers', () => {
    expect(isAnswerable('Which is equivalent to 2/3?', 4)).toBe(true)
    expect(isAnswerable('Which is equivalent to 2/3?', 1)).toBe(false)
    expect(isAnswerable('   ', 4)).toBe(false)
    expect(isAnswerable(undefined, 4)).toBe(false)
    expect(isAnswerable(42, 4)).toBe(false)
  })
})
