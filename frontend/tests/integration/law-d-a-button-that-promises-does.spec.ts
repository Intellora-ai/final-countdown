import { test, expect } from '@playwright/test'
import {
  sheOpensTheApp, whatSheCanRead, thingsSheCanPress, meaningfulWords, addedText,
} from './person'

/**
 * LAW D -- A BUTTON THAT PROMISES SOMETHING, DOES IT.
 *
 * A button labelled "Start" is a promise. When she presses it, the thing must
 * start. Changing the button's own label to "Continue" and moving a status
 * marker is not the thing starting; it is the app agreeing that she pressed a
 * button. She is left looking at the same screen, and the app now believes she
 * has begun something she has never seen.
 *
 * WHAT IT CATCHES, MEASURED BY HAND BEFORE THIS FILE EXISTED.
 *
 * On a chapter page, pressing the one big coloured button flipped its label
 * from "Start concept" to "Continue concept" and flipped a node from NOT
 * STARTED to IN PROGRESS. The address bar did not move. Not one network
 * request was made. No lesson opened. Progress was recorded for something she
 * never read.
 *
 * WHY "the text changed" IS NOT THE TEST. It did change -- by two status
 * words. The law has to be about whether she gained CONTENT, and status words
 * are not content. The screen's own status vocabulary is read off the page
 * rather than being written into this file in advance.
 *
 * NOTHING HERE IS SKIPPED. An earlier draft skipped the second test when no
 * start button sat on the front door, and a skipped test is a test that cannot
 * fail. A learning app with no reachable way to begin learning is not a reason
 * to skip -- it is the most serious finding this file could produce. So it
 * walks until it finds one, and if there is none anywhere, it says so and
 * fails.
 */

/** Content she can actually read and learn from, beyond a promise being logged. */
const CONTENT_A_STARTED_THING_SHOWS = 5

/** A control whose words promise to begin or open something. */
const PROMISES_TO_BEGIN = /\b(start|begin|open|continue|go|launch|practi[sc]e)\b/i

/** The vocabulary an app uses for state rather than for teaching. */
const STATUS_VOCABULARY = /\b(not started|in progress|completed|mastered|started|done|todo)\b/gi

/**
 * Walk the app from the front door until a promise-shaped button appears.
 *
 * Returns where it was found, or null if the whole reachable app offers none.
 */
async function findAPlaceSheCanBegin(page: import('@playwright/test').Page, frontDoor: string) {
  const doorNames: string[] = []
  for (const door of await thingsSheCanPress(page)) {
    const name = (await door.textContent().catch(() => ''))?.trim() ?? ''
    if (name && name.length < 60) doorNames.push(name)
  }

  if (await page.getByRole('button', { name: PROMISES_TO_BEGIN }).count() > 0) {
    return { where: 'the front door', doorNames }
  }

  for (const name of doorNames.slice(0, 12)) {
    await page.goto(frontDoor, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const door = page.getByRole('button', { name, exact: true })
      .or(page.getByRole('link', { name, exact: true })).first()
    if (!(await door.isVisible().catch(() => false))) continue
    await door.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    if (await page.getByRole('button', { name: PROMISES_TO_BEGIN }).count() > 0) {
      return { where: name, doorNames }
    }
  }
  return { where: null, doorNames }
}

test.describe('Law D -- pressing the main button gives her the thing it named', () => {
  test('a button that says it starts something does not just relabel itself', async ({ page }) => {
    await sheOpensTheApp(page, '/')

    const complaints: string[] = []
    const frontDoor = page.url()

    const doorNames: string[] = []
    for (const door of await thingsSheCanPress(page)) {
      const name = (await door.textContent().catch(() => ''))?.trim() ?? ''
      if (name && name.length < 60) doorNames.push(name)
    }

    expect(doorNames.length, 'the front door offered her nothing to press')
      .toBeGreaterThan(0)

    for (const doorName of doorNames.slice(0, 12)) {
      await page.goto(frontDoor, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      const door = page.getByRole('button', { name: doorName, exact: true })
        .or(page.getByRole('link', { name: doorName, exact: true })).first()
      if (!(await door.isVisible().catch(() => false))) continue
      await door.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1500)

      const promises = page.getByRole('button', { name: PROMISES_TO_BEGIN })
      const howMany = Math.min(await promises.count(), 3)

      for (let i = 0; i < howMany; i++) {
        const promise = promises.nth(i)
        if (!(await promise.isVisible().catch(() => false))) continue

        const label = (await promise.textContent())?.trim() ?? ''
        const whereBefore = page.url()
        const before = await whatSheCanRead(page)

        const statusWords = meaningfulWords(
          (before.match(STATUS_VOCABULARY) ?? []).join(' ') + ' ' + label,
        )

        await promise.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(2500)

        const after = await whatSheCanRead(page)

        /* Landing somewhere new is a thing starting. That is enough. */
        if (page.url() !== whereBefore) continue

        const had = meaningfulWords(before)
        const gained = new Set<string>()
        for (const word of meaningfulWords(addedText(before, after))) {
          if (!had.has(word) && !statusWords.has(word)) gained.add(word)
        }

        if (gained.size < CONTENT_A_STARTED_THING_SHOWS) {
          complaints.push(
            `On "${doorName}" she pressed "${label}". The address did not ` +
            `change and she gained ${gained.size} word(s) of real content ` +
            `[${[...gained].join(', ') || 'nothing'}]. The button promised to ` +
            `start something and only changed its own label and a status marker.`,
          )
        }
      }
    }

    expect(
      complaints,
      'A child pressed the main button and the thing it named never appeared:\n\n'
      + complaints.join('\n'),
    ).toEqual([])
  })

  test('it does not record progress for something it never showed her', async ({ page }) => {
    /* THE PAIR. The test above forbids a button that does nothing. This one
     * forbids the more dishonest half of the same defect: the app marking work
     * as begun when the learner was shown nothing to begin. Removing the status
     * change would satisfy this one and still fail the first; never recording
     * anything would fail Law E. The three hold each other honest. */
    await sheOpensTheApp(page, '/')
    const frontDoor = page.url()

    const { where } = await findAPlaceSheCanBegin(page, frontDoor)

    expect(
      where,
      'Walking this whole app from the front door, a child never found a single ' +
      'button offering to start, open or practise anything. There is no way in.',
    ).not.toBeNull()

    const promise = page.getByRole('button', { name: PROMISES_TO_BEGIN }).first()
    const before = await whatSheCanRead(page)
    const whereBefore = page.url()
    const label = (await promise.textContent())?.trim() ?? ''

    await promise.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const after = await whatSheCanRead(page)

    const nowClaimsBegun =
      /\b(in progress|started|continue)\b/i.test(after)
      && !/\b(in progress|started|continue)\b/i.test(before)
    const showedHerSomething =
      page.url() !== whereBefore
      || meaningfulWords(addedText(before, after)).size >= CONTENT_A_STARTED_THING_SHOWS

    if (nowClaimsBegun) {
      expect(
        showedHerSomething,
        `She pressed "${label}" on "${where}". The app now says this is in ` +
        `progress. She was shown nothing. It is recording work she has not done.`,
      ).toBe(true)
    }
  })
})
