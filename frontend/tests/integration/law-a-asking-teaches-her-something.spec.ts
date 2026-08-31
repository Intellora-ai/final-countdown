import { test, expect } from '@playwright/test'
import {
  sheOpensTheApp, sheStartsFresh, choicesSheIsOffered, lessonsSheIsOffered,
  theSubjectOnScreen, theBoxSheTypesIn, sheAsks, wordsSheGained, meaningfulWords,
} from './person'

/**
 * LAW A -- NOTHING NEW, NOTHING LEARNED.
 *
 * A child only asks a question because she is stuck. If what comes back is
 * made entirely of words she was already looking at, she has learned nothing,
 * however confidently it is presented. That is the law. It is about her, not
 * about the program.
 *
 * WHY THIS IS WRITTEN AS A LAW AND NOT AS A SCENARIO.
 *
 * Nothing below names a lesson, a subject or a word. The test asks the running
 * app which lessons it offers, reads the words off the screen it is given, and
 * builds its questions out of what it found. A lesson added next year is
 * covered the day it ships and no one edits this file. A scenario -- "open the
 * gas lesson, ask about kinetic energy" -- would pass forever the moment
 * someone renamed the lesson, and would never have covered the other five.
 *
 * WHAT IT CATCHES, MEASURED BY HAND BEFORE THIS FILE EXISTED.
 *
 * Asked "what is kinetic energy?" the canvas answered with the causal-chain
 * diagram already on the screen, under the heading "IN ANSWER TO YOUR
 * QUESTION". Every word of that reply was already visible. Words gained: zero.
 *
 * The suite this replaces asserted `answer.locator('.lc-block').count() > 0`
 * and called it "the answer drew something". Re-drawing what she was already
 * looking at satisfies that. It cannot satisfy this.
 */

/** A real explanation of a term introduces at least this many new words. */
const NEW_WORDS_A_REAL_ANSWER_INTRODUCES = 3

/**
 * How many terms to try per lesson.
 *
 * More than one, because a single term could be lucky in either direction.
 */
const TERMS_PER_LESSON = 3

/**
 * Pick terms out of THE SUBJECT THIS LESSON SAYS IT IS ABOUT.
 *
 * WHY NOT THE WHOLE SCREEN, WHICH IS WHAT THIS DID FIRST. Taking the longest
 * words anywhere on the page produced "what is checkpoint?", "what is
 * available?", "what is themselves?" and "what is houseagrees?" -- the app's
 * own chrome, ordinary English, and two words the browser had glued together
 * across inline elements. The law then failed the product for not defining
 * them. A law that asks a nonsense question and calls the answer a defect is
 * not a hard test, it is a broken one, and it buries the real findings.
 *
 * The lesson's own heading is the honest source. It is the sentence the lesson
 * puts at the top to say what it teaches, so every content word in it is
 * something the lesson has taken responsibility for. "Why does increasing
 * temperature increase pressure in a gas?" yields temperature, pressure, gas.
 * Those are fair to ask about. "Checkpoint" never was.
 *
 * Longest-first among those stays, because it is deterministic: a random pick
 * would make a failure unreproducible, and an unreproducible failure gets
 * dismissed as flake.
 */
function termsThisLessonClaims(subject: string, howMany: number): string[] {
  return [...meaningfulWords(subject)]
    .filter((w) => w.length >= 5)
    .sort((a, b) => (b.length - a.length) || a.localeCompare(b))
    .slice(0, howMany)
}

test.describe('Law A -- when she asks, she learns something she did not already have', () => {
  test('every lesson this app offers can answer a question about its own words', async ({ page }) => {
    await sheOpensTheApp(page, '/#/canvas')

    const choices = choicesSheIsOffered(page)
    const lessons = await lessonsSheIsOffered(page)

    /* NOT VACUOUS. A run that found no lessons and no box would sail through
     * every assertion below without testing anything, and would look identical
     * to a clean pass. It has to fail loudly instead. */
    expect(lessons.length, 'this app offered no lessons to a person at all')
      .toBeGreaterThan(0)
    await expect(
      theBoxSheTypesIn(page),
      'there was nowhere for a stuck child to ask anything',
    ).toBeVisible()

    const complaints: string[] = []

    for (const i of lessons) {
      /* Switch lesson the way she would: press the one she wants. */
      const lessonButton = choices.nth(i)
      const lessonName = (await lessonButton.textContent())?.trim() || `lesson ${i + 1}`
      await lessonButton.click()
      await page.waitForTimeout(2000)

      const subject = await theSubjectOnScreen(page)
      const terms = termsThisLessonClaims(subject, TERMS_PER_LESSON)

      expect(terms.length, `"${lessonName}" never said what it was about`)
        .toBeGreaterThan(0)

      for (const term of terms) {
        /* A FRESH SCREEN PER QUESTION, AND THIS IS A MEASUREMENT FIX, NOT A
         * SOFTENING. The assertion below is untouched: every question must
         * still earn its own new words.
         *
         * Without the reload, question two's "before" contains question one's
         * reply. Two honest identical replies -- which is what a learner gets
         * when the same thing is unavailable twice -- would then score zero new
         * words on the second, and the law would report a defect that is really
         * an artefact of asking three questions in one sitting. A child asks
         * one thing at a time; the measurement now matches that.
         *
         * FRESH, not merely reloaded: this app remembers her conversation, so a
         * plain reload brings the previous question and its reply straight back
         * out of storage. See `sheStartsFresh`. */
        await sheStartsFresh(page, '/#/canvas')
        await lessonButton.click()
        await page.waitForTimeout(2000)

        const question = `what is ${term}?`
        const { before, after } = await sheAsks(page, question)
        const gained = wordsSheGained(before, after, question)

        if (gained.size < NEW_WORDS_A_REAL_ANSWER_INTRODUCES) {
          complaints.push(
            `"${lessonName}" -- she asked "${question}" and gained ${gained.size} new ` +
            `word(s): [${[...gained].join(', ') || 'nothing at all'}]. ` +
            `Everything it said back was already on her screen.`,
          )
        }
      }
    }

    expect(
      complaints,
      'A child asked what a word means and was handed back what she was ' +
      'already looking at. She is still stuck, and the screen implied she was ' +
      'answered:\n\n' + complaints.join('\n'),
    ).toEqual([])
  })

  test('she is never told her question was answered when nothing was added', async ({ page }) => {
    /* THE PAIR. The test above can only fail. This one can only pass when the
     * app is honest, and it is the half that stops "say nothing at all" from
     * becoming a way to satisfy Law A. Silence is not a legal answer either:
     * a screen that claims to have answered has to have said something. */
    await sheOpensTheApp(page, '/#/canvas')
    await expect(theBoxSheTypesIn(page)).toBeVisible()

    const [term] = termsThisLessonClaims(await theSubjectOnScreen(page), 1)
    expect(term, 'this lesson never said what it was about').toBeTruthy()

    const question = `what is ${term}?`
    const { before, after, added } = await sheAsks(page, question)

    const claimsToHaveAnswered = /in answer to your question|here is the answer|answer[:\s]/i
      .test(added)
    const actuallySaidSomethingNew =
      wordsSheGained(before, after, question).size >= NEW_WORDS_A_REAL_ANSWER_INTRODUCES

    if (claimsToHaveAnswered) {
      expect(
        actuallySaidSomethingNew,
        `The screen told her "${added.slice(0, 120)}..." -- it announced an ` +
        `answer. An announcement of an answer that adds no new word is the ` +
        `screen telling a child she has been helped when she has not.`,
      ).toBe(true)
    }
  })
})
