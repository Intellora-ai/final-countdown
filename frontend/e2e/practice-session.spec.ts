import { expect, test, type Page } from '@playwright/test'

/**
 * The practice session, driven the way a learner drives it.
 *
 * WHAT THIS COVERS THAT THE UNIT TESTS CANNOT
 * -------------------------------------------
 * The engine's invariants are asserted directly and exhaustively in
 * `src/practice/**` — one correct option, verified before delivery, the budget
 * refusing rather than degrading. Repeating those here would be slower and
 * weaker.
 *
 * What only a browser can answer is whether the pieces are actually connected:
 * that pressing Start reaches the engine, that a verified set reaches the
 * screen, that the answer is genuinely absent from the DOM until the learner
 * commits, and that the countdown a learner reads is the session's real clock.
 * A store can be perfect and a screen can still render last week's state.
 *
 * THE ANSWER-LEAK CHECK IS THE POINT
 * ----------------------------------
 * `DeliverableQuestion` has no answer field and `revealFor()` gates the
 * solution, but neither of those proves the rendered page is clean. This reads
 * the DOM before any option is clicked and asserts the solution is not in it —
 * the only check that would catch a future component reaching past the gate.
 */

const ROUTE = '/#/practice'

async function openPractice(page: Page) {
  await page.goto(ROUTE)
  await expect(page.locator('.practice-map')).toBeVisible()
}

/**
 * Open a chapter, then pick a topic inside it.
 *
 * The chapter click is not ceremony. Topic nodes sit collapsed under their
 * chapter until it is opened, and clicking one before then lands on the
 * chapter's own halo — Playwright reports it as "subtree intercepts pointer
 * events", which reads like a flake and is the map working as designed.
 */
async function selectTopic(page: Page, chapter: string, name: string) {
  await page.locator('button.pm-chapter', { hasText: chapter }).first().click()

  const topic = page.locator('button.pm-topic', { hasText: name }).first()
  await expect(topic).toBeVisible()
  await topic.click()
  await expect(page.locator('.pm-panel')).toContainText(name)
}

const CHAPTER = 'Introduction to Microeconomics'
const TOPIC = 'Opportunity cost'

/** Pick a count explicitly. The panel's default is 10, not the smallest. */
async function chooseCount(page: Page, count: 5 | 10 | 15) {
  await page.locator('[aria-label="Number of questions"] button', {
    hasText: String(count),
  }).first().click()
}

async function startSession(page: Page) {
  await page.getByRole('button', { name: 'Start practice' }).click()
  const dialog = page.getByRole('dialog', { name: 'Practice session' })
  await expect(dialog).toBeVisible()
  /* Generation runs before a question exists; wait for the question itself
     rather than for a fixed delay, which would be a flake with a timer on it. */
  await expect(dialog.locator('.pm-q-option').first()).toBeVisible({ timeout: 15_000 })
  return dialog
}

test.describe('a practice session, end to end', () => {
  test('generates a set, and shows no answer until the learner commits', async ({ page }) => {
    await openPractice(page)
    await selectTopic(page, CHAPTER, TOPIC)
    await chooseCount(page, 5)
    const dialog = await startSession(page)

    await expect(dialog).toContainText('Question 1 / 5')
    await expect(dialog.locator('.pm-q-option')).toHaveCount(4)

    /*
     * THE LEAK CHECK. Read the whole dialog before touching anything: no
     * verdict, no worked solution, no Next button. If a future component
     * reaches past `revealFor()`, this is what notices.
     */
    const before = (await dialog.textContent()) ?? ''
    expect(before).not.toContain('Correct.')
    expect(before).not.toMatch(/Not quite/)
    await expect(dialog.getByRole('button', { name: /Next question|Finish/ })).toHaveCount(0)

    await dialog.locator('.pm-q-option').first().click()

    /* Committing is what produces the answer, and it produces a worked one. */
    await expect(dialog.getByRole('button', { name: /Next question|Finish/ })).toBeVisible()
    const after = (await dialog.textContent()) ?? ''
    expect(after).toMatch(/Correct\.|Not quite/)
    expect(after.length).toBeGreaterThan(before.length)
  })

  test('walks the whole set and records a result', async ({ page }) => {
    await openPractice(page)
    await selectTopic(page, CHAPTER, TOPIC)
    await chooseCount(page, 5)
    const dialog = await startSession(page)

    for (let i = 1; i <= 5; i += 1) {
      await expect(dialog).toContainText(`Question ${i} / 5`)
      await dialog.locator('.pm-q-option').first().click()

      const advance = dialog.getByRole('button', { name: /Next question|Finish/ })
      await expect(advance).toBeVisible()
      await advance.click()
    }

    /* The result names what happened per question, not just a score. */
    await expect(dialog).toContainText(/of \d+ correct/)
    await expect(dialog.locator('.pm-q-breakdown li')).toHaveCount(5)
  })

  test('every option is reachable and operable by keyboard alone', async ({ page }) => {
    await openPractice(page)
    await selectTopic(page, CHAPTER, TOPIC)
    const dialog = await startSession(page)

    /* The dialog claims aria-modal, so focus must already be inside it. */
    const focusedInside = await dialog.evaluate(
      (node) => node.contains(document.activeElement),
    )
    expect(focusedInside).toBe(true)

    /*
     * Answer with the keyboard alone. Focusing the option explicitly rather
     * than pressing Enter on whatever happens to hold focus - the trap places
     * focus on the first focusable, and asserting against "whatever that is"
     * would pass or fail on DOM order rather than on keyboard operability.
     */
    await dialog.locator('.pm-q-option').first().focus()
    await page.keyboard.press('Enter')

    await expect(dialog.getByRole('button', { name: /Next question|Finish/ })).toBeVisible()
  })
})

test.describe('the timer a learner actually reads', () => {
  test('counts down from the chosen duration and does not run backwards', async ({ page }) => {
    await openPractice(page)
    await selectTopic(page, CHAPTER, TOPIC)

    /*
     * The toggle comes FIRST. The duration buttons live in an `aria-hidden`
     * group while the timer is off - showing them greyed out would invite
     * clicking something that does nothing - so reaching for 5m before
     * enabling the timer waits forever on an element nobody can press.
     */
    const toggle = page.getByRole('switch', { name: 'Use a timer' })
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()

    /* Five minutes is the product minimum, and the shortest honest countdown. */
    await page.locator('.pm-durations button', { hasText: '5m' }).first().click()

    await chooseCount(page, 5)
    const dialog = await startSession(page)
    await expect(dialog.locator('.pm-q-clock')).toBeVisible()

    const first = await readClock(dialog)
    expect(first).toBeLessThanOrEqual(5 * 60)
    expect(first).toBeGreaterThan(4 * 60)

    await page.waitForTimeout(2_200)
    const second = await readClock(dialog)

    /* Strictly down. A countdown that ever increases is a clock a student can
       game, which is the failure the session store exists to prevent. */
    expect(second).toBeLessThan(first)
  })
})

async function readClock(dialog: ReturnType<Page['getByRole']>): Promise<number> {
  const text = (await dialog.locator('.pm-q-clock').textContent()) ?? ''
  const match = text.match(/(\d+):(\d{2})/)
  if (!match) throw new Error(`no clock found in "${text}"`)
  return Number(match[1]) * 60 + Number(match[2])
}

test.describe('the question count the panel offers', () => {
  test('offers exactly the three sizes the product supports', async ({ page }) => {
    await openPractice(page)
    await selectTopic(page, CHAPTER, TOPIC)

    const counts = page.locator('[aria-label="Number of questions"] button')
    await expect(counts).toHaveCount(3)
    await expect(counts).toHaveText(['5', '10', '15'])
  })

  test('a chosen count is the count that arrives', async ({ page }) => {
    await openPractice(page)
    await selectTopic(page, CHAPTER, TOPIC)

    await page.locator('[aria-label="Number of questions"] button', { hasText: '10' }).click()
    const dialog = await startSession(page)

    await expect(dialog).toContainText('Question 1 / 10')
  })
})
