import { test, expect } from '@playwright/test'
import { sheOpensTheApp, sheStartsFresh, sheAsks, thingsSheCanPress } from './person'

/**
 * LAW H -- A LEARNER WHO IS STUCK IS NEVER SHOWN THE SAME SCREEN TWICE.
 *
 * WHY THIS LAW EXISTS, AND WHAT IT COST TO LEARN IT.
 *
 * Every law before this one drives a learner who SUCCEEDS. Law A asks a real
 * question and measures what she gained. Law B asks a foreign question and
 * measures that she was told so. Laws C to G follow someone who already knows
 * what to type. Every unit suite does the same. Every end-to-end scene does the
 * same.
 *
 * So when a person opened this canvas on a real machine and typed "hi", then
 * "no", nothing in this repository was looking. The server answered both
 * correctly -- a tutor must not teach "hi" -- and the screen it drew the second
 * time was character-for-character the screen it drew the first time. Eleven
 * consecutive ASK_CLARIFICATION decisions are in that sitting's log. He
 * concluded the product was broken, and from the chair he was right to: two
 * identical screens is what a dead page looks like.
 *
 * Every gate was green on that code. That is the hole this law closes.
 *
 * THE LAW, STATED SO IT CANNOT BE GAMED.
 *
 * It is not "show a help box". A law naming the fix would pass the moment the
 * fix was pasted in and would never notice the next way in to the same trap.
 * The law is about the learner's experience: if she acts, and the product will
 * not do the thing she asked for, the screen must not be identical to the one
 * she was already looking at. Something must prove her words arrived.
 *
 * And the pair, in the other direction, because a law with only one direction
 * is passed by shouting: after the SECOND stumble the screen must also carry a
 * control she can press that leads somewhere. Prose alone is not a way out.
 * An app that changed one word each time would pass the first half and fail
 * the second; an app that dumped a wall of help on every keystroke would pass
 * the second and fail the first, which asserts the FIRST ask is left alone.
 *
 * WHAT IS REAL HERE: a real browser, the real server behind the proxy, the real
 * controller deciding. Nothing is stubbed. The inputs are the two words a real
 * person actually typed.
 */

/**
 * Things a person types when they do not yet know what this is.
 *
 * Not a script of one bug: a greeting, a refusal, a shrug and a plea. Every one
 * of them is a thing a child types into a box they have not been taught to use,
 * and not one of them names a subject -- so the product is RIGHT to ask back at
 * each. The law is about what the asking looks like, never about whether it
 * asks.
 */
const WHAT_SOMEONE_LOST_TYPES = ['hi', 'no', 'idk', 'help me']

test.describe('Law H -- a learner who is stuck is never shown the same screen twice', () => {
  test('two things that name no subject never draw the same screen twice', async ({ page }) => {
    await sheOpensTheApp(page, '/#/canvas')
    await sheStartsFresh(page, '/#/canvas')

    /*
     * SCREENS ARE COLLECTED, THEN COMPARED -- rather than asserting after each
     * ask -- so the failure message can say WHICH two repeated and what they
     * said. A law that fails with "expected true to be false" costs a CI round
     * to interpret, and this repository has paid that price enough times.
     */
    const screens: { typed: string; text: string }[] = []
    for (const typed of WHAT_SOMEONE_LOST_TYPES) {
      const { after } = await sheAsks(page, typed)
      screens.push({ typed, text: after })
      /* Stop the moment the product decides to teach one of these after all --
       * that is a legitimate answer and the run is no longer about being
       * stuck. A lesson is long; a question back is not. */
      if (after.length > 1200) break
    }

    expect(screens.length, 'the canvas never accepted a single ask').toBeGreaterThan(1)

    for (let i = 1; i < screens.length; i++) {
      const previous = screens[i - 1]
      const current = screens[i]
      expect(
        current?.text,
        `typing ${JSON.stringify(current?.typed)} after ${JSON.stringify(previous?.typed)} `
        + 'redrew exactly the same screen. Nothing on it proves the second thing she typed '
        + 'ever arrived, which is what a person reads as a page that has stopped working.',
      ).not.toBe(previous?.text)
    }
  })

  test('the second stumble adds more to press than the first did', async ({ page }) => {
    await sheOpensTheApp(page, '/#/canvas')
    await sheStartsFresh(page, '/#/canvas')

    /*
     * THREE READINGS, TWO GROWTHS, ONE COMPARISON.
     *
     * The first version of this law counted controls before and after ONE ask
     * and allowed a growth of one. It went red in all four browsers on run
     * 11a5fe0a: opening the canvas at all adds two controls (the header's own
     * topic box and its button appear once something has been asked), which
     * has nothing to do with rescue and everything to do with a number the
     * law had no business pinning.
     *
     * So the law no longer pins any count. It compares the two growths:
     *
     *   growth1 = controls after the 1st ask  - controls at the start
     *   growth2 = controls after the 2nd ask  - controls after the 1st
     *
     * and requires growth2 > growth1. That holds both directions at once. An
     * app that dumps help on every keystroke has a large growth1 and a zero
     * growth2, and fails. An app that never helps has a zero growth2, and
     * fails. Only "the second stumble gets something the first did not" passes,
     * and that is the whole law in one inequality, with no magic number.
     */
    const atStart = (await thingsSheCanPress(page)).length
    const first = await sheAsks(page, WHAT_SOMEONE_LOST_TYPES[0] as string)
    const afterFirst = (await thingsSheCanPress(page)).length
    const second = await sheAsks(page, WHAT_SOMEONE_LOST_TYPES[1] as string)
    const afterSecond = (await thingsSheCanPress(page)).length

    /* If the product decided to teach her, the law does not apply: she is not
     * stuck any more, and a lesson is the best possible outcome. */
    test.skip(
      first.after.length > 1200 || second.after.length > 1200,
      'the canvas taught one of these after all, so nobody is stuck',
    )

    const growth1 = afterFirst - atStart
    const growth2 = afterSecond - afterFirst
    expect(
      growth2,
      `the second stumble added ${growth2} controls and the first added ${growth1}. `
      + 'Either she was rescued on her first mistype -- noise for everyone who hit the '
      + 'wrong key -- or her second was met with prose and nothing to press. '
      + `Controls: ${atStart} at start, ${afterFirst} after one ask, ${afterSecond} after two.`,
    ).toBeGreaterThan(growth1)
  })
})
