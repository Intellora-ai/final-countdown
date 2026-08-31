/**
 * A STUDENT'S WHOLE SESSION, not one call at a time.
 *
 * WHY THIS FILE EXISTS BESIDE student-journey.spec.ts
 * ---------------------------------------------------
 * That file asks "does each screen work". This one asks "does the app still
 * make sense after she has been using it for ten minutes". They are different
 * questions and the second one is where the bugs a student actually meets
 * live: state that survives one action and not two, a day that is stable until
 * you leave and come back, progress that is correct until the laptop is shared.
 *
 * Every step below is something a real person does in order, and the assertion
 * is made AFTER the sequence rather than inside it -- because a journey that
 * passes step by step and is wrong at the end is exactly the failure a
 * single-action test cannot see.
 *
 * THE ROUTES ARE HASH ROUTES, AND THAT IS NOT COSMETIC.
 *     `Root.tsx` mounts a HashRouter. `http://host/today` is NOT the day
 *     screen -- it is the app booting with an empty hash, which lands on
 *     `/today` anyway and makes a broken test look like a passing one. Written
 *     without the `#`, every route assertion here would still go green while
 *     testing the wrong screen. Measured the hard way earlier today.
 *
 * WHAT IS DELIBERATELY ABSENT
 *     No test here asks the tutor for an explanation. `playwright.config.ts`
 *     sets ANTHROPIC_API_KEY=CANARY-e2e-must-not-leak precisely so nothing in
 *     this suite can reach a paid model, so a journey that "gets an answer"
 *     could only be asserting against a stub. The tutor's INPUT behaviour is
 *     covered; its output is not, and pretending otherwise would be the exact
 *     lie this repository refuses.
 */
import { expect, test, type Page } from '@playwright/test'

const TODAY = '/#/today'

/** The rows of her day, which is the one thing every journey below touches. */
const rows = (page: Page) => page.locator('[data-testid="day-row"]')

/** The concept ids on screen, in order. Identity, not appearance. */
async function plannedConcepts(page: Page): Promise<(string | null)[]> {
  await expect(rows(page).first()).toBeVisible()
  return rows(page).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-concept')))
}

async function openToday(page: Page): Promise<void> {
  await page.goto(TODAY)
  await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible()
}

test.describe('a whole study morning, in order', () => {
  test('she opens her day, starts a topic, comes back, and finishes it', async ({ page }) => {
    await openToday(page)
    const planned = await plannedConcepts(page)
    const first = planned[0]

    // She starts the first topic. This must take her to THAT lesson, not a list.
    await rows(page).first().getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(new RegExp(`#/learn/${first}$`))

    // She goes back, the way a person does.
    await page.goBack()
    await expect(page).toHaveURL(/#\/today$/)
    await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible()

    // Her day did not rearrange itself while she was away.
    expect(await plannedConcepts(page), 'the plan changed while she was in a lesson').toEqual(
      planned,
    )

    // She marks it done, and the app either takes it or says why.
    const done = rows(page).first().getByRole('button', { name: /^Done/ })
    await done.click()
    await expect(async () => {
      const disabled = await done.isDisabled().catch(() => false)
      const explained = await page.locator('[role="alert"]').count()
      expect(disabled || explained > 0).toBe(true)
    }).toPass({ timeout: 10_000 })
  })

  test('the day holds still across three separate visits', async ({ page }) => {
    /* "This day is set" is a promise the product makes in words on the screen.
       A plan that reshuffles between visits breaks it silently -- she comes
       back to finish something and it is simply not there any more. */
    await openToday(page)
    const first = await plannedConcepts(page)

    await page.goto('/#/quick-question')
    await openToday(page)
    const second = await plannedConcepts(page)

    await page.reload()
    const third = await plannedConcepts(page)

    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  test('she wanders the whole app and her day is still hers at the end', async ({ page }) => {
    await openToday(page)
    const before = await plannedConcepts(page)

    for (const route of ['/#/practice', '/#/ask', '/#/misconception', '/#/quick-question']) {
      await page.goto(route)
      await expect(page.getByRole('main').first()).toBeVisible()
    }

    await openToday(page)
    expect(await plannedConcepts(page), 'her day did not survive a walk round the app').toEqual(
      before,
    )
  })
})

test.describe('the machine is shared, which school machines are', () => {
  test("a second student's fresh start does not inherit the first one's progress", async ({
    browser,
  }) => {
    /* Two contexts is what two people on one laptop actually is: separate
       storage, same app. If progress leaked between them, one student would be
       marked as having finished work she never saw. */
    const first = await browser.newContext()
    const second = await browser.newContext()
    try {
      const a = await first.newPage()
      await a.goto(TODAY)
      await expect(a.getByRole('heading', { name: "Today's learning" })).toBeVisible()
      const rowA = a.locator('[data-testid="day-row"]').first()
      await expect(rowA).toBeVisible()
      await rowA.getByRole('button', { name: /^Done/ }).click()

      const b = await second.newPage()
      await b.goto(TODAY)
      await expect(b.getByRole('heading', { name: "Today's learning" })).toBeVisible()
      const rowB = b.locator('[data-testid="day-row"]').first()
      await expect(rowB).toBeVisible()

      /* The second student's first row must still be hers to do. */
      await expect(
        rowB.getByRole('button', { name: /^Done/ }),
        "the second student's topic was already marked finished",
      ).toBeEnabled()
    } finally {
      await first.close()
      await second.close()
    }
  })

  test('clearing the browser leaves a usable app, not a broken one', async ({ page }) => {
    await openToday(page)
    await page.evaluate(() => {
      try {
        localStorage.clear()
      } catch {
        /* a browser that refuses to clear is still a browser she is using */
      }
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible()
    await expect(rows(page).first()).toBeVisible()
  })
})

test.describe('the session survives the things that actually go wrong', () => {
  test('a refresh in the middle of any screen returns her to that screen', async ({ page }) => {
    for (const route of [TODAY, '/#/practice', '/#/quick-question', '/#/ask']) {
      await page.goto(route)
      await page.reload()
      await expect(page).toHaveURL(new RegExp(route.replace('/#/', '#/') + '$'))
      await expect(page.getByRole('main').first()).toBeVisible()
      const text = (await page.locator('body').innerText()).trim()
      expect(text.length, `${route} came back empty after a refresh`).toBeGreaterThan(0)
    }
  })

  test('the network dying mid-session does not lose the screen she is on', async ({ page }) => {
    await openToday(page)
    await page.context().setOffline(true)
    try {
      await page.locator('[data-testid="day-row"]').first()
        .getByRole('button', { name: /^Done/ })
        .click()
      /* Offline is not a reason to show a blank page. She must still see her
         day, and be told if the mark did not save -- never silently dropped. */
      await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible()
    } finally {
      await page.context().setOffline(false)
    }
  })

  test('the planner going down mid-session is explained, not disguised as an empty day', async ({
    page,
  }) => {
    await openToday(page)
    await expect(rows(page).first()).toBeVisible()

    await page.route('**/api/day', (route) => route.abort('failed'))
    await page.reload()

    await expect(page.getByRole('main').first()).toBeVisible()
    await expect(
      page.getByText('Nothing left for today', { exact: false }),
      'she was told she had finished when the planner was simply unreachable',
    ).toHaveCount(0)
  })

  test('opening the same day in two tabs does not corrupt either', async ({ context }) => {
    const one = await context.newPage()
    const two = await context.newPage()
    try {
      await one.goto(TODAY)
      await two.goto(TODAY)
      await expect(one.getByRole('heading', { name: "Today's learning" })).toBeVisible()
      await expect(two.getByRole('heading', { name: "Today's learning" })).toBeVisible()

      const inOne = await one.locator('[data-testid="day-row"]')
        .evaluateAll((n) => n.map((e) => e.getAttribute('data-concept')))
      const inTwo = await two.locator('[data-testid="day-row"]')
        .evaluateAll((n) => n.map((e) => e.getAttribute('data-concept')))
      expect(inTwo, 'two tabs disagreed about what today is').toEqual(inOne)
    } finally {
      await one.close()
      await two.close()
    }
  })
})

test.describe('she is not always on a laptop, and not always using a mouse', () => {
  test('the whole day is usable at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await openToday(page)
    await expect(rows(page).first()).toBeVisible()

    /* THE PHONE FAILURE THAT LOOKS LIKE NOTHING: the page scrolls sideways.
       Content is reachable, so every "is it visible" assertion passes, and the
       student is dragging the screen left and right to read one sentence. */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the day scrolls sideways on a phone').toBeLessThanOrEqual(1)
  })

  test('a student using only the keyboard can reach and press a control', async ({ page }) => {
    await openToday(page)
    await expect(rows(page).first()).toBeVisible()

    const start = rows(page).first().getByRole('button', { name: 'Start' })
    await start.focus()
    await expect(start, 'the Start button cannot take keyboard focus').toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/learn\//)
  })

  test('every control on the day has a name a screen reader can announce', async ({ page }) => {
    await openToday(page)
    await expect(rows(page).first()).toBeVisible()

    const names = await page.locator('main button').evaluateAll((nodes) =>
      nodes.map((n) => (n.getAttribute('aria-label') ?? n.textContent ?? '').trim()),
    )
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name.length, 'a button on the day screen announces nothing').toBeGreaterThan(0)
    }
  })
})
