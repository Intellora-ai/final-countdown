import { test, expect } from '@playwright/test'
import {
  sheOpensTheApp, whatSheCanRead, thingsSheCanPress, meaningfulWords,
} from './person'

/**
 * LAW E -- WORK IS NEVER LOST.
 * LAW F -- SHE IS NEVER STRANDED.
 *
 * Two laws about the same thing: a child's place in the app belongs to her,
 * and neither closing the tab nor pressing back may take it away.
 *
 * These are the laws that only show up in a life, never in a single sitting.
 * A test that opens the app, does one thing and closes cannot see them. It
 * takes a second visit with the same browser, or a real press of the browser's
 * own back button, which is why almost no suite has them and why the bug class
 * survives so long: the app works perfectly every time anyone checks.
 */

test.describe('Law E -- what she did yesterday is still there today', () => {
  test('work survives closing the tab and coming back', async ({ browser }) => {
    /* Visit one: do something the app records. */
    const firstVisit = await browser.newContext()
    const monday = await firstVisit.newPage()
    await sheOpensTheApp(monday, '/')

    const doors = await thingsSheCanPress(monday)
    expect(doors.length, 'the front door offered her nothing to press')
      .toBeGreaterThan(0)

    /* Press her way in and do whatever this app offers, without knowing what
     * that is. Anything it records is a thing it must not lose. */
    let didSomething = false
    for (const door of doors.slice(0, 10)) {
      const name = (await door.textContent().catch(() => ''))?.trim() ?? ''
      if (!name || name.length > 60) continue
      if (!(await door.isVisible().catch(() => false))) continue
      await door.click({ timeout: 5000 }).catch(() => {})
      await monday.waitForTimeout(1200)

      const act = monday.getByRole('button', { name: /\b(start|begin|open|practi[sc]e)\b/i }).first()
      if (await act.isVisible().catch(() => false)) {
        await act.click({ timeout: 5000 }).catch(() => {})
        await monday.waitForTimeout(2000)
        didSomething = true
        break
      }
    }

    expect(
      didSomething,
      'She walked the whole front of this app and found nothing she could do. ' +
      'There is no work for Law E to preserve, which is a finding, not a pass.',
    ).toBe(true)

    const whatMondayLookedLike = await whatSheCanRead(monday)
    const whereSheWas = monday.url()
    const saved = await firstVisit.storageState()
    await firstVisit.close()

    /* Visit two: same person, same browser, next day. */
    const secondVisit = await browser.newContext({ storageState: saved })
    const tuesday = await secondVisit.newPage()
    await sheOpensTheApp(tuesday, whereSheWas)
    await tuesday.waitForTimeout(2000)

    const whatTuesdayLooksLike = await whatSheCanRead(tuesday)

    /* Her progress markers are the proof. If Monday's screen said anything was
     * begun or done, Tuesday's must still say so. */
    const mondayProgress = (whatMondayLookedLike.match(/\b(in progress|completed|mastered|started)\b/gi) ?? []).length
    const tuesdayProgress = (whatTuesdayLooksLike.match(/\b(in progress|completed|mastered|started)\b/gi) ?? []).length

    await secondVisit.close()

    expect(
      tuesdayProgress,
      `On Monday her screen showed ${mondayProgress} progress marker(s). ` +
      `On Tuesday, same browser, same address, it shows ${tuesdayProgress}. ` +
      `Work she did has un-happened.`,
    ).toBeGreaterThanOrEqual(mondayProgress)
  })
})

test.describe('Law F -- back never leaves her on a blank page', () => {
  test('going in and pressing back lands her on a real screen', async ({ page }) => {
    await sheOpensTheApp(page, '/')
    const frontDoor = await whatSheCanRead(page)

    expect(
      meaningfulWords(frontDoor).size,
      'the front door itself was blank',
    ).toBeGreaterThan(3)

    /* Go somewhere. Then press the browser's own back button, which is the
     * most-pressed control on the web and the one apps forget exists. */
    /*
     * RE-QUERIED EVERY ATTEMPT, AND THE PHONE IS WHY. On the mobile layout the
     * navigation sits behind a menu button: the first tap opens the menu (no
     * URL change) and the links it reveals are the doors that actually go
     * somewhere. A list snapshotted once before any click can never contain
     * them, so this law failed on the phone leg -- and only the phone leg --
     * on every run it ever had, reporting "an app with no navigation" about
     * an app whose navigation simply takes two taps. A person's finger works
     * from the screen as it is now; so does this loop.
     */
    let wentSomewhere = false
    for (let attempt = 0; attempt < 10; attempt++) {
      const doors = await thingsSheCanPress(page)
      const door = doors[attempt]
      if (!door) break
      const name = (await door.textContent().catch(() => ''))?.trim() ?? ''
      if (!name || name.length > 60) continue
      const wasAt = page.url()
      await door.click({ timeout: 5000 }).catch(() => {})
      /* POLL FOR THE NAVIGATION, NEVER SLEEP AT IT. A fixed 1500ms judged the
       * router by the machine's speed: on a loaded 4-vCPU runner a hash
       * navigation can land after the sleep, `wentSomewhere` stays false, and
       * the law fails claiming the app has no navigation -- measured exactly
       * once per full run, always on the slowest leg. Waiting for the URL to
       * actually differ asks the real question, and the catch keeps a door
       * that genuinely goes nowhere as a plain false, not a throw. */
      await page.waitForURL((now) => now.toString() !== wasAt, { timeout: 5000 }).catch(() => {})
      if (page.url() !== wasAt) { wentSomewhere = true; break }
    }

    expect(
      wentSomewhere,
      'Nothing on the front door took her anywhere, so back cannot be tested. ' +
      'An app with no navigation is a finding, not a pass.',
    ).toBe(true)

    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(1500)

    const afterBack = await whatSheCanRead(page)
    const title = await page.title()

    expect(
      meaningfulWords(afterBack).size,
      `She pressed back and the page went blank. She is stranded with nothing ` +
      `to read and nothing to press. Title was "${title}", address ${page.url()}.`,
    ).toBeGreaterThan(3)

    expect(
      (await thingsSheCanPress(page)).length,
      'She pressed back and there is nothing on the screen she can press. ' +
      'There is no way out.',
    ).toBeGreaterThan(0)
  })

  test('pressing back many times never strands her', async ({ page }) => {
    /* THE PAIR, and the realistic one. A child who is lost does not press back
     * once, politely. She presses it until something looks familiar. The app
     * has to survive that, and this is where a single-press test would have
     * said everything was fine. */
    await sheOpensTheApp(page, '/')

    const doors = await thingsSheCanPress(page)
    for (const door of doors.slice(0, 6)) {
      if (!(await door.isVisible().catch(() => false))) continue
      await door.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(900)
    }

    const home = new URL(page.url()).origin
    for (let press = 0; press < 8; press++) {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(700)

      /* Leaving the site entirely is ordinary browser behaviour and not this
       * app's fault. Being blank while still ON the app is. */
      if (!page.url().startsWith(home)) break

      const words = await whatSheCanRead(page)
      expect(
        meaningfulWords(words).size,
        `After ${press + 1} press(es) of back she is still on this app ` +
        `(${page.url()}) and the screen is blank.`,
      ).toBeGreaterThan(3)
    }
  })
})
