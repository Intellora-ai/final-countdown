import { expect, test } from '@playwright/test'
import { metrics, openBoard, waitForCheckpoint } from './util/bridge'
import { applyProjectThrottle, runConditions } from './util/cdp'
import { appendLedger } from './util/report'

/* THE PHASE 5 GATE — learner controls, and a lesson that remembers.
 *
 * Persistence is the part that cannot be proved in a unit test: the store's
 * logic is covered there, but "does a reload actually put the learner back"
 * involves a real page, real localStorage, and a real second load. That is
 * this file's job.
 */

const CHEM = '/#/canvas?fixture=change-of-state'
const QUIZ = '/#/canvas?fixture=maths-fractions-quiz'

/* Every test starts from a learner who has never opened this board.
 *
 * ONCE PER CONTEXT, NOT ONCE PER NAVIGATION. addInitScript runs again on every
 * load, including the reload that the resume tests depend on — clearing there
 * would delete the very record the test is about to check for, and the product
 * would be blamed for starting the lesson over. The sessionStorage flag
 * survives a reload within the tab, so the wipe happens on the first load and
 * never again. */
async function clearProgress(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem('__canvas_test_cleared')) {
        window.localStorage.removeItem('learning-canvas/progress/v1')
        window.sessionStorage.setItem('__canvas_test_cleared', '1')
      }
    } catch { /* private mode */ }
  })
}

test.describe('the lesson remembers where the learner was', () => {
  test('a reload resumes at the step reached, not at the beginning', async ({ page }, testInfo) => {
    const throttle = await applyProjectThrottle(page, testInfo)
    await clearProgress(page)
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)

    /* Walk forward through the real control, twice. */
    await page.evaluate(() => window.__boardHarness!.fastForward(3))
    await waitForCheckpoint(page)
    const before = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-board="world-step"]'))
        .map((el) => (el as HTMLElement).dataset.stepId))
    expect(before.length, 'the walk should have released several steps').toBeGreaterThan(1)

    /* A reload is the honest test: same URL, fresh page, nothing in memory. */
    await page.reload()
    await page.waitForFunction(() => Boolean(window.__boardHarness), null, { timeout: 20_000 })
    await waitForCheckpoint(page)

    const after = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-board="world-step"]'))
        .map((el) => (el as HTMLElement).dataset.stepId))

    expect(after, 'the resumed board should hold the same steps').toEqual(before)

    /* And it resumed rather than replaying: a restored lesson lands at a
     * checkpoint with everything already shown. */
    expect(await page.evaluate(() => window.__boardHarness!.status())).toBe('checkpoint')

    const m = await metrics(page)
    expect(m.mountedFutureBlockCount, 'resuming must not mount anything ahead').toBe(0)
    expect(m.duplicateActionApplication, 'a resumed step must not be released twice').toBe(0)

    appendLedger({
      scenario: 'phase5:resume',
      conditions: runConditions(testInfo, throttle),
      metrics: { ...(m as unknown as Record<string, unknown>), stepsRestored: after.length },
      at: new Date().toISOString(),
    })
  })

  test('a first visit starts at step one', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)
    const steps = await page.locator('[data-board="world-step"]').count()
    expect(steps, 'nothing saved means the lesson begins at the beginning').toBe(1)
  })

  test('one logical position produces one stored write', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)

    /* Sit still. Re-renders happen — the camera settles, the checkpoint timer
     * fires — and none of them is a new position. */
    const first = await page.evaluate(() => window.localStorage.getItem('learning-canvas/progress/v1'))
    await page.waitForTimeout(1500)
    const second = await page.evaluate(() => window.localStorage.getItem('learning-canvas/progress/v1'))

    expect(first, 'a position should have been saved').not.toBeNull()
    /* Byte-identical: not merely "no new step", but no rewritten timestamp
     * either. updatedAt is excluded from the comparison that gates a write. */
    expect(second).toBe(first)
  })

  test('the position is scoped to the board, so two lessons do not overwrite each other', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)
    await page.evaluate(() => window.__boardHarness!.fastForward(2))
    await waitForCheckpoint(page)

    await openBoard(page, QUIZ)
    await waitForCheckpoint(page)

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('learning-canvas/progress/v1')
      return raw ? JSON.parse(raw) : null
    })
    const keys = Object.keys(stored?.records ?? {})
    expect(keys.some((k) => k.endsWith('/change-of-state')), 'chemistry position kept').toBe(true)
    expect(keys.some((k) => k.endsWith('/maths-fractions-quiz')), 'quiz position kept').toBe(true)
    expect(stored.version, 'the version travels inside the envelope').toBe(1)
  })

  test('unreadable storage does not stop the lesson', async ({ page }) => {
    /* A learner with a corrupt record should meet a lesson, not a crash. */
    await page.addInitScript(() => {
      try { window.localStorage.setItem('learning-canvas/progress/v1', '{ not json') } catch { /* ignore */ }
    })
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)
    expect(await page.locator('[data-board="world-step"]').count()).toBe(1)
  })
})

test.describe('the quiz answers to a keyboard', () => {
  test('is one tab stop, and arrows choose within it', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, QUIZ)
    await page.evaluate(() => window.__boardHarness!.fastForward(4))
    const group = page.locator('[role="radiogroup"]').first()
    await group.waitFor({ timeout: 20_000 })

    const options = group.locator('[role="radio"]')
    await expect(options).toHaveCount(4)

    /* Exactly one option is reachable by Tab; the rest are reached by arrow. */
    const tabbable = await group.locator('[role="radio"][tabindex="0"]').count()
    expect(tabbable, 'a radiogroup is ONE tab stop, not four').toBe(1)

    await options.first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const focusedIndex = await group.evaluate((el) => {
      const radios = Array.from(el.querySelectorAll('[role="radio"]'))
      return radios.indexOf(document.activeElement as Element)
    })
    expect(focusedIndex, 'two forward presses should land on the third option').toBe(2)
  })

  test('answers on Enter, keeps focus, and refuses a second answer', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, QUIZ)
    await page.evaluate(() => window.__boardHarness!.fastForward(4))
    const group = page.locator('[role="radiogroup"]').first()
    await group.waitFor({ timeout: 20_000 })
    const options = group.locator('[role="radio"]')

    await options.nth(1).focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('[data-board="quiz-verdict"]')).toBeVisible()
    await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true')

    /* THE FOCUS POINT. A `disabled` button leaves the tab order, which threw
     * the learner back to the top of the page at the exact moment they
     * answered. aria-disabled says the same thing and keeps them where they
     * are. */
    const stillFocused = await group.evaluate((el) => {
      const radios = Array.from(el.querySelectorAll('[role="radio"]'))
      return radios.indexOf(document.activeElement as Element)
    })
    expect(stillFocused, 'focus must not be thrown away by answering').toBe(1)

    /* A second attempt changes nothing. */
    await options.nth(2).click({ force: true })
    await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect(options.nth(2)).toHaveAttribute('aria-checked', 'false')
  })

  test('states the result in text, never in colour alone', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, QUIZ)
    await page.evaluate(() => window.__boardHarness!.fastForward(4))
    const group = page.locator('[role="radiogroup"]').first()
    await group.waitFor({ timeout: 20_000 })

    await group.locator('[role="radio"]').first().click()
    await expect(page.locator('[data-board="quiz-verdict"]')).toBeVisible()

    /* Whatever the learner picked, a marker and a spoken label appear. */
    const markers = group.locator('[data-board="quiz-option-marker"]')
    expect(await markers.count()).toBeGreaterThan(0)
    const text = (await group.textContent()) ?? ''
    expect(/Your answer|correct answer/i.test(text)).toBe(true)
  })

  test('an answer survives a reload', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, QUIZ)
    await page.evaluate(() => window.__boardHarness!.fastForward(4))
    const group = page.locator('[role="radiogroup"]').first()
    await group.waitFor({ timeout: 20_000 })
    await group.locator('[role="radio"]').nth(1).click()
    await expect(page.locator('[data-board="quiz-verdict"]')).toBeVisible()

    await page.reload()
    await page.waitForFunction(() => Boolean(window.__boardHarness), null, { timeout: 20_000 })
    await waitForCheckpoint(page)

    /* The verdict is back without the learner answering again — the record
     * carries the choice, and the block reads it. */
    await expect(page.locator('[data-board="quiz-verdict"]').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[role="radio"][aria-checked="true"]').first()).toBeVisible()
  })
})

test.describe('the learner controls do what they say', () => {
  test('a checkpoint waits, and Continue is the only thing that moves it', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)
    const before = await page.locator('[data-board="world-step"]').count()

    await page.waitForTimeout(2500)
    expect(await page.locator('[data-board="world-step"]').count()).toBe(before)

    await page.getByRole('button', { name: /continue|move forward|show me/i }).first().click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-board="world-step"]').length > n,
      before, { timeout: 20_000 },
    )
  })

  test('a clarification adds to the board without deleting what is there', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, CHEM)
    await waitForCheckpoint(page)
    const before = await page.locator('[data-board="world-step"]').count()

    await page.getByRole('button', { name: /explain again/i }).first().click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-board="world-step"]').length > n,
      before, { timeout: 20_000 },
    )

    /* The original stays. A clarification is an addition, not a replacement —
     * the learner can still read what confused them. */
    const after = await page.locator('[data-board="world-step"]').count()
    expect(after).toBe(before + 1)
  })

  test('changing pace mid-reveal takes effect on the step being read', async ({ page }) => {
    await clearProgress(page)
    await openBoard(page, CHEM)
    /* Catch the very first reveal in flight rather than waiting for it. */
    await page.locator('[data-board="world-step"]').first().waitFor()
    await page.getByRole('button', { name: /^calm$/i }).first().click()

    /* The control reports its own state, and the lesson still completes — a
     * re-timed step must not strand the reveal partway. */
    await expect(page.getByRole('button', { name: /^calm$/i }).first())
      .toHaveAttribute('data-active', 'true')
    await waitForCheckpoint(page)
  })
})
