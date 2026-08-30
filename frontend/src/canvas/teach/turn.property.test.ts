import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { classifyTurn } from './turn'

/*
 * POINTING FROM THE INPUT SPACE INWARD, WHICH NO OTHER GATE HERE DOES.
 *
 * Every frontend gate on this repository checks the code against itself:
 * typecheck asks whether it matches its own types, lint its own style, the unit
 * tests their own expectations, mutation whether those expectations are tight,
 * visual whether it looks like it looked before, reachability whether it runs.
 * Six questions, all internal. None of them asks WHAT A PERSON WILL ACTUALLY
 * TYPE.
 *
 * The mutation gate is the strongest of them and is blind here BY
 * CONSTRUCTION: it can only mutate code that exists, and the defect below is an
 * ABSENCE. There is no branch to flip.
 *
 * THE DEFECT. `classifyTurn` ends `return 'answer'`. It recognises a question
 * three ways -- a question mark, an opening interrogative, a plea -- and
 * everything else falls through to being treated as an ANSWER, which ADVANCES
 * the lesson. So "hi" advances it. "ok" advances it. "asdf" advances it. The
 * learner said nothing and the lecture moved on, and nothing on screen or in
 * CI reports that anything went wrong -- the pixels are correct.
 *
 * That is a verdict with no evidence behind it: a default arm wearing a
 * decision's clothes. The fix is a fourth outcome that is INERT -- it does not
 * advance, it asks back.
 */

/** What people type when they are not answering: greetings, noise, filler. */
const NOT_AN_ANSWER = fc.constantFrom(
  'hi',
  'hey',
  'hello',
  'ok',
  'okay',
  'k',
  'yo',
  'sup',
  'lol',
  'hmm',
  'huh',
  'idk',
  'asdf',
  'test',
  'a',
  '...',
  'thanks',
  'nice',
  'cool',
)

describe('what a person actually types', () => {
  it('does not treat a greeting or noise as an answer to the beat', () => {
    /*
     * THE PROPERTY. None of these is an answer to anything, and treating one
     * as an answer advances a lesson the learner has not engaged with. The
     * classifier does not have to KNOW what they meant -- it has to decline to
     * claim they answered.
     */
    fc.assert(
      fc.property(NOT_AN_ANSWER, (typed) => {
        expect(
          classifyTurn(typed),
          `"${typed}" was accepted as an answer and advanced the lesson`,
        ).not.toBe('answer')
      }),
      { numRuns: 200 },
    )
  })

  it('does not treat whitespace-padded noise as an answer either', () => {
    /* The same input a real box produces: people paste, people leave spaces. */
    fc.assert(
      fc.property(NOT_AN_ANSWER, fc.stringMatching(/^[ \t]{0,4}$/), (typed, pad) => {
        expect(classifyTurn(`${pad}${typed}${pad}`)).not.toBe('answer')
      }),
      { numRuns: 200 },
    )
  })

  it('still calls a real answer an answer', () => {
    /*
     * THE PAIR, and it is what stops the fix being "return unclear always".
     * A learner who genuinely answers must advance, or the lesson can never
     * move and the cure is worse than the defect.
     */
    for (const real of [
      'because the pressure rises when the gas is heated',
      'it doubles every time you add one',
      'the base case is the branch that returns without calling itself',
      'three',
      '8',
    ]) {
      expect(classifyTurn(real), `a real answer was refused: "${real}"`).toBe('answer')
    }
  })

  it('still calls a question a question', () => {
    /* The other pair. The three signals the file already documents must keep
       working: a question mark, an opening interrogative, and a plea. */
    for (const q of ['what is pressure?', 'why does it rise', 'i dont get it', 'explain that again']) {
      expect(classifyTurn(q), `a question stopped being one: "${q}"`).toBe('question')
    }
  })
})
