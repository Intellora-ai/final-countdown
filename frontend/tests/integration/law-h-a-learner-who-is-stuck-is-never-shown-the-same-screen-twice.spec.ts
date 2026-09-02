import { test, expect, type Locator } from '@playwright/test'
import { sheOpensTheApp, sheStartsFresh, sheAsks, thingsSheCanPress, whatSheCanRead } from './person'

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

  test('the second stumble gives her something new to press, and pressing it goes somewhere', async ({ page }) => {
    await sheOpensTheApp(page, '/#/canvas')
    await sheStartsFresh(page, '/#/canvas')

    /*
     * TWO EARLIER SHAPES OF THIS CASE WERE WRONG, AND THE RUNS SAY HOW.
     *
     * Run 11a5fe0a pinned a control count and broke on the two controls that
     * opening the canvas adds by itself. Run eb0edcee compared growth after
     * the first ask with growth after the second, and broke on a control that
     * DISAPPEARED on the second ask (11 -> 13 -> 12): a subtraction the law
     * had not imagined, in a product that had not opened the door at all,
     * because with no model reachable the second ask met a refusal and the
     * door only opened for questions back.
     *
     * So the law now says exactly two things, both about what she can do:
     *
     *   1. after the second stumble there is a control she did not have after
     *      the first -- by its words, not by counting; and
     *   2. pressing it changes the screen -- a door, not a decoration.
     *
     * The other direction -- that ONE stumble is left alone -- is held by the
     * unit test beside the component, where a single ask can be observed
     * without the browser adding controls of its own.
     */
    const first = await sheAsks(page, WHAT_SOMEONE_LOST_TYPES[0] as string)
    const afterFirst = await Promise.all((await thingsSheCanPress(page)).map((c) => c.innerText().catch(() => '')))
    const second = await sheAsks(page, WHAT_SOMEONE_LOST_TYPES[1] as string)
    const controls = await thingsSheCanPress(page)
    const afterSecond = await Promise.all(controls.map((c) => c.innerText().catch(() => '')))

    /* If the product decided to teach her, the law does not apply: she is not
     * stuck any more, and a lesson is the best possible outcome. */
    test.skip(
      first.after.length > 1200 || second.after.length > 1200,
      'the canvas taught one of these after all, so nobody is stuck',
    )

    const seen = new Set(afterFirst.map((t) => t.trim()))
    const fresh = controls.filter((_, i) => !seen.has((afterSecond[i] ?? '').trim()) && (afterSecond[i] ?? '').trim() !== '')
    expect(
      fresh.length,
      'after two asks that named no subject she was given prose and nothing new to press. '
      + `Controls after one ask: ${JSON.stringify(afterFirst)}; after two: ${JSON.stringify(afterSecond)}.`,
    ).toBeGreaterThan(0)

    const before = await whatSheCanRead(page)
    await (fresh[0] as Locator).click()
    await page.waitForTimeout(2500)
    const after = await whatSheCanRead(page)
    expect(after, 'the new control did nothing when pressed: a decoration, not a door').not.toBe(before)
  })
})
