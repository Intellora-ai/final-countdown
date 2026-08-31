import { test, expect } from '@playwright/test'
import {
  sheOpensTheApp, sheStartsFresh, whatSheCanRead, choicesSheIsOffered, lessonsSheIsOffered,
  theBoxSheTypesIn, sheAsks, wordsSheGained, meaningfulWords,
} from './person'

/**
 * LAW B -- IT MUST NOT TEACH WHAT IT DOES NOT KNOW.
 *
 * A tutor that answers everything is worse than one that answers less, because
 * a child cannot tell the two apart. When she asks something outside the
 * subject, the honest outcome is being told so. Producing a body of material
 * about it anyway is inventing, and inventing to a child who has just admitted
 * she is confused is the worst moment to do it.
 *
 * THIS IS THE SAME INSTRUMENT AS LAW A, POINTED THE OTHER WAY, AND THAT IS THE
 * POINT.
 *
 * Law A fails when a question gains her too FEW new words. This one fails when
 * a question gains her too MANY. One measurement, two directions, and a fix
 * that games either one breaks the other: an app that echoes everything passes
 * B and fails A; an app that fetches an article for everything passes A and
 * fails B. Only actually knowing the difference passes both. That is the pair
 * CLAUDE.md requires, built into the shape of the law rather than bolted on.
 *
 * WHAT IT CATCHES, MEASURED BY HAND BEFORE THIS FILE EXISTED.
 *
 * Asked "how do i bake a chocolate cake?" inside a physics lesson about gas
 * pressure, the canvas returned a Wikipedia article on Malaysian no-bake fridge
 * cake. `features/tutor.feature` in this repository says the tutor must say it
 * does not cover that and must invent nothing. `TeachView.tsx:606` says "No
 * refusal branch, and that is the point of this phase." Those two cannot both
 * stand, and the child is the one who loses.
 *
 * The suite this replaces asserted the reply was longer than 20 characters and
 * called it "the reply says something". A cake article says something.
 */

/**
 * Subjects from ordinary life, far from any school curriculum this app teaches.
 *
 * This list is not the scenario -- WHICH subject gets used is decided at
 * runtime, by taking the first one that shares no word with the lesson on
 * screen. On a cookery lesson the cake entry is skipped automatically. The list
 * is a supply of foreign material, not a script.
 */
const ORDINARY_LIFE = [
  'how do i bake a chocolate birthday cake',
  'who won the football world cup final',
  'what should i feed my pet rabbit',
  'how do i change a flat bicycle tyre',
  'what time does the last train leave',
  'how do i knit a woollen scarf',
]

/**
 * A refusal is short. This is the most new words one can honestly need.
 *
 * "This lesson does not cover that -- it is about why heating a gas raises its
 * pressure" is roughly eight meaningful words, most already on screen. Twenty
 * five is a generous ceiling that no refusal reaches and no fetched article
 * stays under.
 */
const MOST_NEW_WORDS_A_HONEST_REFUSAL_NEEDS = 25

test.describe('Law B -- asked something it does not teach, it says so and invents nothing', () => {
  test('no lesson answers a question from outside its subject', async ({ page }) => {
    await sheOpensTheApp(page, '/#/canvas')

    const choices = choicesSheIsOffered(page)
    /* LESSONS, NOT EVERY PICK-ONE CONTROL. An earlier version walked all
     * `aria-pressed` buttons and so probed the 2D/3D view toggle as though it
     * were two more lessons, reporting the same lesson three times. */
    const lessons = await lessonsSheIsOffered(page)

    expect(lessons.length, 'this app offered no lessons to a person at all')
      .toBeGreaterThan(0)
    await expect(theBoxSheTypesIn(page)).toBeVisible()

    const complaints: string[] = []

    for (const i of lessons) {
      /* A FRESH SCREEN PER LESSON, AND THIS IS A MEASUREMENT FIX, NOT A
       * SOFTENING -- the same one Law A needed, for the same reason. An honest
       * refusal is worded the same way every time, so the second lesson's
       * refusal is already on screen from the first and scores zero new words.
       * That is the measurement seeing double, not the product going quiet.
       *
       * FRESH, not merely reloaded -- this app remembers her conversation. */
      await sheStartsFresh(page, '/#/canvas')
      const lessonButton = choices.nth(i)
      const lessonName = (await lessonButton.textContent())?.trim() || `lesson ${i + 1}`
      await lessonButton.click()
      await page.waitForTimeout(2000)

      const onScreen = await whatSheCanRead(page)
      const lessonWords = meaningfulWords(onScreen)

      /* Pick a subject this lesson provably does not contain. Decided here,
       * from what is on the screen, not chosen in advance by whoever wrote
       * this file. */
      const foreign = ORDINARY_LIFE.find(
        (q) => [...meaningfulWords(q)].every((w) => !lessonWords.has(w)),
      )

      expect(
        foreign,
        `every everyday subject overlapped "${lessonName}", so this lesson ` +
        `could not be probed. Add a further-away subject to ORDINARY_LIFE.`,
      ).toBeTruthy()
      if (!foreign) continue

      const { before, after, added } = await sheAsks(page, foreign)
      const invented = wordsSheGained(before, after, foreign)

      if (invented.size > MOST_NEW_WORDS_A_HONEST_REFUSAL_NEEDS) {
        complaints.push(
          `"${lessonName}" -- she asked "${foreign}", a subject with not one ` +
          `word in this lesson, and it produced ${invented.size} new words of ` +
          `material about it. It taught her something it does not know.\n` +
          `    what appeared: "${added.slice(0, 260)}..."`,
        )
      }

      /* AND SHE MUST NOT BE LEFT WITH HER OWN QUESTION AND NOTHING ELSE.
       *
       * STRENGTHENED AFTER THE FACT, AND SAYING SO RATHER THAN PRESENTING IT AS
       * A FIX. The first version of this check asked only whether the screen
       * changed at all. It passed, and the product was still wrong: with the
       * web search correctly refused, the screen printed `You asked: "how do i
       * bake a chocolate cake?"` and then nothing, because `TeachView` chose its
       * renderer by WHO answered rather than by WHAT came back and dropped the
       * refusal sentence unread. I found that by hand, in a browser, not from
       * this file -- which means the law had a hole, and a law with a hole gets
       * closed rather than congratulated.
       *
       * An echo is not a reply. Gaining zero words means every word on screen
       * was already there or was hers, so nothing was said to her at all. */
      if (invented.size === 0) {
        complaints.push(
          `"${lessonName}" -- she asked "${foreign}" and got back nothing but ` +
          `her own question. Not one word was said to her. She cannot tell ` +
          `whether it refused, failed, or ignored her.\n` +
          `    what appeared: "${added.slice(0, 200)}"`,
        )
      }
    }

    expect(
      complaints,
      'A tutor produced teaching material on subjects it does not teach, or ' +
      'left a child with silence:\n\n' + complaints.join('\n'),
    ).toEqual([])
  })

  test('a question made of nonsense is not answered as though it were real', async ({ page }) => {
    /* Nonsense is the cleanest possible case: there is no honest answer
     * anywhere, so any body of material coming back is invention with nothing
     * to hide behind. */
    await sheOpensTheApp(page, '/#/canvas')
    await expect(theBoxSheTypesIn(page)).toBeVisible()

    const question = 'what is a florbulent quandrix and how do i grow one'
    const { before, after, added } = await sheAsks(page, question)
    const invented = wordsSheGained(before, after, question)

    expect(
      invented.size,
      `She asked about something that does not exist and got ${invented.size} ` +
      `new words back:\n"${added.slice(0, 260)}..."\n` +
      `There is no honest source for any of it.`,
    ).toBeLessThanOrEqual(MOST_NEW_WORDS_A_HONEST_REFUSAL_NEEDS)

    /* The other side of the same band. Nonsense must not be answered at
     * length, and must not be met with an echo either -- a child who typed
     * something she half-made-up needs to be told it is not a thing, not left
     * looking at her own words. */
    expect(
      invented.size,
      `She asked about something that does not exist and got back nothing but ` +
      `her own question:\n"${added.slice(0, 200)}"\nNot one word was said to her.`,
    ).toBeGreaterThan(0)
  })
})
