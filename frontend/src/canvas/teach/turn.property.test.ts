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

/**
 * What people type when they are not answering: greetings, noise, filler.
 *
 * `ok`, `okay`, `k` AND `a` WERE REMOVED, AND THE EXPECTATION WAS WRONG, NOT
 * THE CODE. Every checkpoint `beats.ts` writes is a yes/no question -- "Did
 * that land?", "Does that follow?", "Making sense so far?" -- and "ok" is how a
 * person says yes to one. This file asserted that the reply the screen had just
 * asked for must never advance the lesson, so a learner who answered correctly
 * was told "I didn't catch that" and the beat never moved.
 *
 * The removal is not a weakening. The pair below is new and STRICTER: it pins
 * the direction this list must never cross again.
 *
 * `a` goes for a nearer reason -- it is a plausible answer to any question
 * offering lettered options, and it only appeared here because a `length <= 2`
 * rule needed something to justify it.
 *
 * WHAT STAYS. A greeting is not an answer to anything, and no question this
 * product asks is answered by "hi". That distinction is the whole content of
 * this list, and it is why the list cannot simply be deleted.
 */
const NOT_AN_ANSWER = fc.constantFrom(
  'hi',
  'hey',
  'hello',
  'yo',
  'sup',
  'lol',
  'hmm',
  'huh',
  'idk',
  'asdf',
  'test',
  '...',
  'thanks',
  'nice',
  'cool',
)

/**
 * The replies the product's OWN questions ask for.
 *
 * Not a guess about English. `beats.ts` authors every checkpoint, and all
 * fifteen strings it can produce are closed yes/no questions, so this is the
 * set of things a learner is being invited to type. Whatever else the noise
 * list grows to hold, it may never hold one of these.
 */
const THE_REPLY_THE_QUESTION_ASKED_FOR = fc.constantFrom(
  'yes',
  'no',
  'yeah',
  'yep',
  'nope',
  'sure',
  'ok',
  'okay',
  'k',
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

  it('never refuses the reply its own question asked for', () => {
    /*
     * THE GUARD THAT WAS MISSING, and its absence is what let ten valid answers
     * into the filler list at once.
     *
     * The direction matters more than the count. Noise getting through wastes
     * one beat and the learner can still ask a question. A refused answer
     * strands them: the beat will not move, the screen says it did not catch
     * what they typed, and typing it more clearly does not help because it was
     * never unclear.
     *
     * So this asserts the SAFE direction, and it is the one the earlier fix
     * crossed without noticing.
     */
    fc.assert(
      fc.property(THE_REPLY_THE_QUESTION_ASKED_FOR, (typed) => {
        expect(
          classifyTurn(typed),
          `"${typed}" answers a yes/no checkpoint and was refused, stranding the learner`,
        ).toBe('answer')
      }),
      { numRuns: 200 },
    )
  })

  it('still calls a question a question', () => {
    /* The other pair. The three signals the file already documents must keep
       working: a question mark, an opening interrogative, and a plea. */
    for (const q of ['what is pressure?', 'why does it rise', 'i dont get it', 'explain that again']) {
      expect(classifyTurn(q), `a question stopped being one: "${q}"`).toBe('question')
    }
  })
})
