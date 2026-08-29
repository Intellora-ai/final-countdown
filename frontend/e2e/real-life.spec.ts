/**
 * WHAT A HUMAN DOES TO THIS CANVAS, INCLUDING THE UNKIND THINGS.
 *
 * Every test here is the permanent form of something done BY HAND in a real
 * browser during one session. Two of them are regressions for bugs that were
 * shipped and are now fixed; the rest pin behaviour that was found to be
 * correct and had nothing stopping it from silently breaking.
 *
 * The categories are the ones a person actually occupies -- reading a long
 * lesson, asking again because the first answer did not land, admitting they
 * are lost, typing something hostile, typing nothing at all. They are not
 * "signup, login, cart": this product has no account, no session and no
 * purchase, and testing those would be testing an app that does not exist.
 *
 * WHY HERE AND NOT IN A NEW SUITE
 * -------------------------------
 * `e2e/util/canvas.ts` already knows the route, the lesson list, how to open
 * the canvas and how to walk its beats. A second harness beside it would drift
 * from the first the moment either changed, and only one of them would be the
 * one CI runs.
 */
import { expect, test } from '@playwright/test'

import { answerBox, bodyBlocks, open, revealAll } from './util/canvas'

/** Send whatever is in the answer box. */
async function send(page: import('@playwright/test').Page, text: string): Promise<void> {
  await answerBox(page).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

/** The blocks an answer put on screen, named by the lesson they came from. */
async function drawnFrom(page: import('@playwright/test').Page): Promise<string[]> {
  const text = await page.locator('body').innerText()
  return [...text.matchAll(/Drawn from: ([^\n]+)/g)].map((m) => m[1]!.trim())
}

test.describe('a learner reading a lesson', () => {
  test('reaches the end of a long lesson, and is told it has ended', async ({ page }, info) => {
    await open(page, info)

    const before = await bodyBlocks(page).count()
    const beats = await revealAll(page)

    expect(beats, 'a lesson that needed no answers is not cut into beats').toBeGreaterThan(0)
    expect(
      await bodyBlocks(page).count(),
      'the lesson ended with no more content than it started with',
    ).toBeGreaterThan(before)
    await expect(
      page.locator('.lc-teach__more[data-end="true"]'),
      'a learner who reaches the end must be told so, not left guessing',
    ).toBeVisible()
  })

  test('never scrolls sideways, however long the lesson gets', async ({ page }, info) => {
    await open(page, info)
    await revealAll(page)

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, 'the page scrolls horizontally, which CLAUDE.md forbids').toBe(false)
  })
})

test.describe('a learner who did not understand', () => {
  /*
   * THE FEATURE, AS A HUMAN EXPERIENCES IT.
   *
   * Asking twice used to return the identical blocks, because `resolve` was a
   * pure function of (doubt, lesson) and carried no history. Their asking again
   * is the one signal the first answer failed, and it was the one signal the
   * resolver could not see.
   */
  test('asking the same thing twice is answered differently', async ({ page }, info) => {
    await open(page, info)

    /*
     * THE QUESTION IS TAKEN FROM THE LESSON ON SCREEN, NOT HARD-CODED.
     *
     * The first draft asked "what is this about", which is all stopwords, so
     * the resolver correctly declined and the test failed for a reason that had
     * nothing to do with variation. Reading a real word out of the first
     * heading means this works whichever lesson the canvas opens on, and it
     * cannot go stale when that default changes.
     *
     * The LESSON QUESTION, not the first block title. The second draft read the
     * title and picked "ALREADY" out of "START WITH WHAT YOU CAN ALREADY
     * READ" -- a filler word the resolver rightly declines. A lesson question
     * always contains the thing the lesson is about; a section title need not.
     */
    const heading = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    const word = heading
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Za-z]/g, ''))
      .filter((w) => w.length > 4)
      .sort((a, b) => b.length - a.length)[0]
    expect(word, `no usable word in the lesson question: "${heading}"`).toBeTruthy()

    await send(page, `what is ${word}`)
    await expect.poll(async () => (await drawnFrom(page)).length).toBeGreaterThan(0)
    const first = await drawnFrom(page)

    await send(page, `what is ${word}`)
    await expect.poll(async () => (await drawnFrom(page)).length).toBeGreaterThan(first.length)
    const both = await drawnFrom(page)

    expect(
      both[1],
      `the same question was answered with the same blocks twice: "${both[1]}"`,
    ).not.toBe(both[0])
  })

  /*
   * "I don't understand" names nothing -- every word of it is a stopword -- so
   * it used to hit the empty-doubt refusal and be told to name the thing it
   * could not name. That is the worst possible reply to the most important
   * thing a learner ever says.
   */
  test('saying "i dont understand" is answered, not deflected', async ({ page }, info) => {
    await open(page, info)
    await send(page, 'i dont understand')

    const body = page.locator('body')
    await expect(
      body,
      'a learner who said they were lost was asked to be more specific',
    ).not.toContainText('Try naming the thing you are stuck on')
    await expect.poll(async () => (await drawnFrom(page)).length).toBeGreaterThan(0)
  })
})

test.describe('a learner typing something unkind', () => {
  /* Script injection. React escapes by default, and this is what proves it
     stays that way when someone changes how an answer is rendered. */
  test('a script tag is shown as text and never executed', async ({ page }, info) => {
    await open(page, info)
    await page.evaluate(() => {
      ;(window as unknown as { __pwned?: number }).__pwned = 0
    })

    await send(page, '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">')

    const pwned = await page.evaluate(
      () => (window as unknown as { __pwned?: number }).__pwned ?? 0,
    )
    expect(pwned, 'a learner’s input executed as script').toBe(0)
    expect(
      await page.locator('main script, main img').count(),
      'a learner’s input was injected into the document as markup',
    ).toBe(0)
  })

  test('an empty send changes nothing and raises nothing', async ({ page }, info) => {
    await open(page, info)
    const before = await bodyBlocks(page).count()

    await send(page, '')
    await send(page, '     ')

    expect(await bodyBlocks(page).count(), 'blank input was treated as a question').toBe(before)
    await expect(page.locator('body')).toBeVisible()
  })

  test('a very long question does not break the layout', async ({ page }, info) => {
    await open(page, info)
    await send(page, 'why '.repeat(700).trim())

    await expect(page.locator('body')).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, 'a long question made the page scroll sideways').toBe(false)
  })

  test('emoji and non-latin text are accepted as typed', async ({ page }, info) => {
    await open(page, info)
    const box = answerBox(page)
    await box.fill('日本語 😀 логарифм')
    await expect(box).toHaveValue('日本語 😀 логарифм')
  })
})

test.describe('what must never be shown to a learner', () => {
  /*
   * THE REGRESSION THAT MATTERS MOST.
   *
   * On the logarithms lesson, "what is the base" was answered with:
   *
   *     "BASE jumping is the activity of jumping from fixed objects, using a
   *      parachute to descend to the ground."
   *
   * alongside links to Base_pair, Free_base and The_Base -- the last of which
   * is a violent extremist organisation. The query was the single word "base",
   * because the lesson the question was asked inside was never consulted.
   *
   * The unit tests cover the query and the aboutness gate. This covers the only
   * thing a learner actually experiences: what ends up on the screen.
   */
  test('an ambiguous word is not answered from the wrong subject', async ({ page }, info) => {
    await open(page, info)

    /* Ask enough times that the lesson runs out and the web rung is reached --
       which is exactly the path that produced BASE jumping. */
    for (let i = 0; i < 5; i += 1) {
      await send(page, 'what is the base')
      await page.waitForTimeout(400)
    }

    const body = await page.locator('body').innerText()
    expect(
      /parachute|BASE jumping/i.test(body),
      'a learner reading a lesson was shown an article about BASE jumping',
    ).toBe(false)
    expect(
      /wiki\/The_Base/.test(body),
      'a link to a violent extremist group was shown to a learner',
    ).toBe(false)
  })
})
