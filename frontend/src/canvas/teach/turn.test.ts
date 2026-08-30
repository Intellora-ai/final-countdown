/* One box, two meanings.
 *
 * WHY THERE IS NO CONTINUE BUTTON ANY MORE
 *   A beat already ends with a question. Putting a Continue button next to it
 *   asks the learner to answer and then separately confirm they answered,
 *   which is a control that exists to serve the code rather than the person.
 *   So the beat advances when they ANSWER it.
 *
 *   That leaves one input doing two jobs: answering the lesson's question, and
 *   asking one of their own. Nothing may be added to the screen to
 *   disambiguate them -- no toggle, no second box, no radio buttons. The text
 *   itself has to say which it is.
 *
 * THE ORACLE
 *   Not "whatever the classifier returns". A question asks for information; an
 *   answer offers it. English marks that difference with a question mark, with
 *   an interrogative opening word, and with modal inversion -- and those are
 *   exactly the three signals checked below.
 */

import { describe, expect, it } from 'vitest'
import { classifyTurn, strugglingAfter } from './turn'

describe('telling a question from an answer', () => {
  it('treats an explicit question mark as a question', () => {
    expect(classifyTurn('why does that happen?')).toBe('question')
    expect(classifyTurn('is it because the particles move faster?')).toBe('question')
  })

  it('treats a question mark as a question even with NO question word', () => {
    /* MUTATION EVIDENCE. Deleting the question-mark rule killed no test,
     * because every case above also opened with "why" or "is" and was caught by
     * the opener rule instead. A check satisfied by a different rule than the
     * one it names is not checking that rule.
     *
     * These are how a student actually seeks confirmation, and every one of
     * them would otherwise be read as an ANSWER and silently advance the beat. */
    for (const text of [
      'the pressure doubles?',
      'so it gets hotter?',
      '8849?',
      'twice as much?',
      'really?',
      'and the volume stays the same?',
    ]) {
      expect(classifyTurn(text), text).toBe('question')
    }
  })

  it('treats an interrogative opening as a question, mark or no mark', () => {
    /* Students type quickly and drop punctuation. Requiring the mark would
     * send "what does inertia mean" forward as an answer and skip the beat. */
    for (const text of [
      'what does inertia mean', 'why is that', 'how do you know that',
      'when does it stop', 'where does the energy go', 'which one is bigger',
      'who decided that', 'whose idea was this', 'can you explain that again',
      'could you say that differently', 'does that always work',
      'do i need to know this', 'is that the same as pressure',
      'are those two the same', 'should i memorise it', 'would that still work',
      'explain that again', 'i dont understand', "i don't get it", 'what',
    ]) {
      expect(classifyTurn(text), text).toBe('question')
    }
  })

  it('treats a plain statement as an answer', () => {
    for (const text of [
      'the particles hit the walls more often',
      'because the temperature went up',
      'pressure increases',
      '42',
      'it doubles',
      'faster particles, more collisions, higher pressure',
    ]) {
      expect(classifyTurn(text), text).toBe('answer')
    }
  })

  it('does not mistake a statement CONTAINING a question word for a question', () => {
    /* "That is why it rises" is an answer. Scanning anywhere in the string for
     * "why" would send it to the doubt resolver and the beat would never move. */
    for (const text of [
      'that is why it rises',
      'i know what inertia means now',
      'the reason is how the particles move',
      'it depends on where you measure it',
    ]) {
      expect(classifyTurn(text), text).toBe('answer')
    }
  })

  it('treats nothing, and whitespace, as nothing', () => {
    /* An empty submit must not advance the beat: the learner pressed Enter,
     * they did not answer. */
    for (const text of ['', '   ', '\n\t ']) expect(classifyTurn(text)).toBe('empty')
  })

  it('is not fooled by capitals or trailing space', () => {
    expect(classifyTurn('  WHY DOES IT RISE?  ')).toBe('question')
    expect(classifyTurn('  Pressure Rises.  ')).toBe('answer')
  })
})

describe('the reply the checkpoint asked for', () => {
  /*
   * THE CHECKPOINT IS A YES/NO QUESTION. EVERY ONE OF THEM.
   *
   * `beats.ts` writes the question itself, and all fifteen strings it can
   * produce are closed:
   *
   *     ASK_BY_TONE   "Did that land?"  "That is the result -- is it clear?"
   *     ASK_BY_FORM   "Does that follow?"  "Making sense so far?"
   *                   "Can you see that in the numbers?"
   *     UNNAMED_NEXT  "There is a bit more -- shall we carry on?"
   *
   * So "yes" and "no" are not noise. They are the answer the screen asked for,
   * and `beats.ts:444` says as much of the depth offer: "Saying no here loses
   * them nothing." A classifier that refuses them tells a learner who answered
   * correctly that they did not answer at all, and the beat never moves.
   *
   * That is worse than the defect it was written to fix. Noise advancing wastes
   * one beat and the learner can still ask; a refused answer strands them with
   * no way forward.
   */
  it('accepts the yes and no a yes/no question asks for', () => {
    for (const text of ['yes', 'no', 'yeah', 'yep', 'nope', 'sure', 'ok', 'okay']) {
      expect(classifyTurn(text), text).toBe('answer')
    }
  })

  /*
   * A SHORT WORD IS NOT AN EMPTY ONE.
   *
   * The length rule refused every two-letter token that was not a digit, which
   * is most of the notation a science lesson asks about by name.
   */
  it('accepts a short answer that is a real one', () => {
    for (const text of ['pi', 'pH', 'Na', 'eV', 'up', 'CO']) {
      expect(classifyTurn(text), text).toBe('answer')
    }
  })

  /*
   * WHAT IS STILL REFUSED, AND WHY IT NEEDS NO VOCABULARY.
   *
   * "The learner typed no word at all" is a fact about the string -- it holds
   * for every language, every alphabet and every emoji nobody has thought of.
   * A list of greetings is a guess about English maintained by hand, and the
   * same guess cannot separate "hi" from "yes" because nothing lexical does.
   */
  it('refuses a submit that contains no word at all', () => {
    for (const text of ['...', '!!!', '---', '???'.replace(/\?/g, '.'), '\u{1F44B}', '\u{1F600}\u{1F600}']) {
      expect(classifyTurn(text), JSON.stringify(text)).toBe('unclear')
    }
  })
})

describe('noticing that a learner is struggling', () => {
  /* THE POINT: depth is added when the student ASKS for it and automatically
   * when their answers show a gap. Nothing on screen says "difficulty"; this
   * is the automatic half. */

  it('does not call a confident run struggling', () => {
    expect(strugglingAfter({ questionsAsked: 0, emptyAnswers: 0, beatsSeen: 3 })).toBe(false)
    expect(strugglingAfter({ questionsAsked: 1, emptyAnswers: 0, beatsSeen: 4 })).toBe(false)
  })

  it('calls repeated questions on the same lesson struggling', () => {
    expect(strugglingAfter({ questionsAsked: 3, emptyAnswers: 0, beatsSeen: 2 })).toBe(true)
  })

  it('counts asking more often than advancing as struggling', () => {
    /* Two questions across two beats is one per beat: the lesson is not
     * landing, whatever the raw count is. */
    expect(strugglingAfter({ questionsAsked: 2, emptyAnswers: 0, beatsSeen: 1 })).toBe(true)
  })

  it('counts repeated empty submits as struggling', () => {
    /* Pressing Enter on an empty box, twice, is someone stuck for what to say. */
    expect(strugglingAfter({ questionsAsked: 0, emptyAnswers: 2, beatsSeen: 3 })).toBe(true)
  })

  it('never divides by zero on the very first beat', () => {
    /* HONEST NOTE ON MUTATION. Removing the explicit `beatsSeen === 0` guard
     * survives, and it is an EQUIVALENT mutant rather than a hole: without the
     * guard, 0/0 is NaN and `NaN >= 2` is false, and n/0 for n > 0 is Infinity
     * which is true -- the same two answers the guard gives. The guard is kept
     * because reading it should not require knowing that. */
    expect(strugglingAfter({ questionsAsked: 0, emptyAnswers: 0, beatsSeen: 0 })).toBe(false)
    expect(strugglingAfter({ questionsAsked: 5, emptyAnswers: 0, beatsSeen: 0 })).toBe(true)
  })
})
