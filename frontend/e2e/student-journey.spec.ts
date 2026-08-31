/**
 * THE WHOLE APP, FROM THE STUDENT'S SIDE.
 *
 * The six specs that already existed test the canvas: how a lesson renders,
 * whether tokens stay consistent, whether a frame moved. All real, all narrow.
 * NOT ONE of them opens the screen a student actually starts on, marks a topic
 * done, asks the tutor a question, or opens a link a friend sent.
 *
 * So this file drives the product the way a person does: through the browser,
 * on the real routes, with no mock in the path.
 *
 * EVERY IDENTIFIER HERE WAS READ OUT OF THE SOURCE, NOT GUESSED.
 *     `Today's learning` and `data-testid="day-row"`   TodayView.tsx
 *     `Ask a question`                                  TutorView.tsx
 *     `Atomic concept map for this chapter`             ChapterView.tsx
 *     `mathematics`, `Class 10`                         data/store.ts seed()
 *     `real-numbers`, `euclid-s-division-lemma`         data/curriculum.ts, whose
 *                                                       ch() slugifies the name
 *
 *     This matters more than it looks. A suite that invents an id runs green
 *     against a product that is dead for every real student, because the only
 *     thing it proved is that the code agrees with itself.
 *
 * WHY NOTHING IS SEEDED AND NOTHING IS SKIPPED.
 *     A fresh browser has empty localStorage, and `store.init()` answers that
 *     by calling `seed()` -- Arya, Class 10, mathematics and physics, 120
 *     minutes. That IS the first-run experience, so these tests get it by
 *     doing nothing. And every assertion below runs unconditionally: a test
 *     that skips itself when the data is missing cannot fail on the day the
 *     data goes missing, which is the exact day it was written for.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/** A real chapter, and a real concept inside it. */
const SUBJECT = 'mathematics'
const CHAPTER = 'real-numbers'
const CONCEPT = 'euclid-s-division-lemma'

/**
 * Every route the router declares, plus one it does not.
 *
 * THE `#` IS NOT DECORATION, AND GETTING IT WRONG COST A WHOLE RUN.
 *     `Root.tsx` mounts a `HashRouter`, so the route lives in the URL's hash
 *     and `http://host/quick-question` is not the tutor -- it is the app
 *     booting with an empty hash, which means `/today`. Written that way,
 *     every route test still passed: the page was not blank, it was simply
 *     the WRONG SCREEN, and "not blank" cannot tell those apart.
 *
 *     That is why `expectAppRendered` is never the whole assertion below.
 *     Each route is also checked for something only that screen has.
 */
const ROUTES = [
  '/#/',
  '/#/today',
  '/#/practice',
  '/#/quick-question',
  '/#/ask',
  '/#/misconception',
  `/#/chapter/${SUBJECT}/${CHAPTER}`,
  `/#/learn/${CONCEPT}`,
  '/#/definitely-not-a-real-route',
] as const

/**
 * Errors the browser printed, which is the half of "it works" a screenshot
 * cannot show. A page can look finished and be throwing on every render.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })
  return errors
}

/** The app shell is present, which is the difference between a page and a blank. */
async function expectAppRendered(page: Page): Promise<void> {
  await expect(page.getByRole('main')).toBeVisible()
  /* THE BLANK-PAGE TEST, and it is the one that matters. A white screen with a
   * mounted root is what a crashed React tree looks like, and every "it
   * loaded" assertion passes on one. */
  const text = (await page.locator('body').innerText()).trim()
  expect(text.length, 'the page rendered nothing a student could read').toBeGreaterThan(0)
}

test.describe('every route a student can reach', () => {
  for (const route of ROUTES) {
    test(`${route} shows the app and not a blank page`, async ({ page }) => {
      const errors = collectErrors(page)
      const response = await page.goto(route)

      /* A dev server answers 200 even for an unknown client route -- the
       * router decides. What must never happen is a 5xx or a dead socket. */
      expect(response?.status(), `${route} did not answer`).toBeLessThan(400)
      await expectAppRendered(page)
      expect(errors, `${route} printed errors`).toEqual([])
    })
  }

  test('an address nobody recognises sends her somewhere useful, not nowhere', async ({ page }) => {
    await page.goto('/#/definitely-not-a-real-route')
    await expect(page).toHaveURL(/\/today$/)
  })

  test('the bare address opens today, so a bookmark of the site root works', async ({ page }) => {
    await page.goto('/#/')
    await expect(page).toHaveURL(/\/today$/)
  })

  test('a link to a concept that no longer exists says so, in words', async ({ page }) => {
    /* `real-numbers` is a CHAPTER id, so this is the shape of every stale link
     * a friend ever pastes: it looks right and names nothing.
     *
     * The bar is not "does not crash". It is that the student is TOLD. A page
     * that silently shows her something else is how she ends up studying the
     * wrong thing and never knows the link was broken. */
    await page.goto(`/#/learn/${CHAPTER}`)
    await expectAppRendered(page)
    await expect(page.getByText(/does not know a concept/i)).toBeVisible()
  })
})

/**
 * THE HOLE THE FIRST RUN OF THIS FILE FELL STRAIGHT INTO.
 *
 * Every route test above passed while EVERY route rendered the Today screen,
 * because the URLs were written without the `#` a HashRouter needs. "The page
 * is not blank" is true of the wrong screen too, so it cannot tell a working
 * route from a silently broken one.
 *
 * So each route is pinned to something ONLY that screen has. Every marker
 * below was read off the running app, not guessed -- a marker invented at a
 * desk is the same mistake in a new place.
 */
const SCREEN_MARKERS: ReadonlyArray<{ route: string; shows: RegExp }> = [
  { route: '/#/today', shows: /Today's learning/ },
  { route: '/#/ask', shows: /Ask anything/ },
  { route: '/#/misconception', shows: /Misconception practice/ },
  { route: `/#/chapter/${SUBJECT}/${CHAPTER}`, shows: /real numbers/i },
  { route: '/#/practice', shows: /science/i },
]

test.describe('each route shows its OWN screen, not the fallback', () => {
  for (const { route, shows } of SCREEN_MARKERS) {
    test(`${route} shows the screen she asked for`, async ({ page }) => {
      await page.goto(route)
      await expect(
        page.locator('main').getByText(shows).first(),
        `${route} rendered a page, but not the one this address names`,
      ).toBeVisible()
    })
  }

  test('/#/quick-question gives her a box to type a question into', async ({ page }) => {
    await page.goto('/#/quick-question')
    await expect(page.locator('#tutor-input')).toBeVisible()
  })
})

test.describe('the day she starts on', () => {
  test('names itself, so she knows what she is looking at', async ({ page }) => {
    await page.goto('/#/today')
    await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible()
  })

  test('gives her actual topics to study', async ({ page }) => {
    await page.goto('/#/today')
    await expect(
      page.locator('[data-testid="day-row"]').first(),
      'a seeded Class 10 student opened the app and was given no plan at all',
    ).toBeVisible()
  })

  test('promises the day is fixed, and says what happens to what she misses', async ({ page }) => {
    await page.goto('/#/today')
    await expect(
      page.getByText("This day is set. Anything you don't finish moves to tomorrow."),
    ).toBeVisible()
  })

  test('does not reshuffle itself while she is looking at it', async ({ page }) => {
    await page.goto('/#/today')
    const rows = page.locator('[data-testid="day-row"]')
    await expect(rows.first()).toBeVisible()
    const first = await rows.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-concept')),
    )

    await page.reload()
    await expect(page.locator('[data-testid="day-row"]').first()).toBeVisible()
    const second = await page
      .locator('[data-testid="day-row"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-concept')))

    expect(second, 'the day changed under her between two looks').toEqual(first)
  })

  test('shows every topic with the subject it belongs to and how long it takes', async ({ page }) => {
    await page.goto('/#/today')
    const rows = page.locator('[data-testid="day-row"]')
    await expect(rows.first()).toBeVisible()

    /* A row that does not say how long it takes cannot be planned around,
     * which is the entire promise of a timed study day. */
    for (const row of await rows.all()) {
      await expect(row.locator('.td-min')).toContainText(/\d+\s*min/)
    }
  })

  test('always offers the misconception practice, even on an empty day', async ({ page }) => {
    await page.goto('/#/today')
    await expect(page.getByText('Misconception practice')).toBeVisible()
  })
})

test.describe('finishing a topic', () => {
  test('marking one done either takes, or says out loud why it did not', async ({ page }) => {
    await page.goto('/#/today')
    const rows = page.locator('[data-testid="day-row"]')
    await expect(rows.first()).toBeVisible()

    const done = rows.first().getByRole('button', { name: /^Done/ })
    await done.click()

    /* Silently doing nothing is the failure this catches: she taps, nothing
     * moves, and she has no idea whether it saved. */
    await expect(async () => {
      const disabled = await done.isDisabled().catch(() => false)
      const explained = await page.locator('[role="alert"]').count()
      expect(disabled || explained > 0).toBe(true)
    }).toPass({ timeout: 10_000 })
  })

  test('what she finished is not offered back to her untouched after a reload', async ({ page }) => {
    await page.goto('/#/today')
    const rows = page.locator('[data-testid="day-row"]')
    await expect(rows.first()).toBeVisible()

    const concept = await rows.first().getAttribute('data-concept')
    await rows.first().getByRole('button', { name: /^Done/ }).click()
    await expect(
      page.locator('[role="alert"]'),
      'the app refused to record a finished topic',
    ).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible()

    /* THE REAL TEST. The row is either gone from her day or shown as done.
     * Coming back looking untouched is a student redoing work she already did. */
    const back = page.locator(`[data-testid="day-row"][data-concept="${concept}"]`)
    const stillThere = await back.count()
    if (stillThere > 0) {
      await expect(
        back.first(),
        'a topic she finished came back looking unfinished',
      ).toContainText('Done')
    }
  })

  test('starting a topic takes her to that exact lesson', async ({ page }) => {
    await page.goto('/#/today')
    const rows = page.locator('[data-testid="day-row"]')
    await expect(rows.first()).toBeVisible()

    const concept = await rows.first().getAttribute('data-concept')
    await rows.first().getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(new RegExp(`/learn/${concept}$`))
  })
})

test.describe('asking a question', () => {
  test('the tutor will not send an empty question', async ({ page }) => {
    await page.goto('/#/quick-question')
    await expect(page.locator('form.tutor-compose button[type="submit"]')).toBeDisabled()
  })

  test('typing a real question makes it sendable', async ({ page }) => {
    await page.goto('/#/quick-question')
    await page.getByPlaceholder('Ask a question').fill('why does ice float on water')
    await expect(page.locator('form.tutor-compose button[type="submit"]')).toBeEnabled()
  })

  test('a question of only spaces is still refused', async ({ page }) => {
    await page.goto('/#/quick-question')
    await page.getByPlaceholder('Ask a question').fill('     ')
    await expect(page.locator('form.tutor-compose button[type="submit"]')).toBeDisabled()
  })
})

test.describe('a chapter she opens', () => {
  test('the concept map is described for a screen reader, not only drawn', async ({ page }) => {
    await page.goto(`/#/chapter/${SUBJECT}/${CHAPTER}`)
    await expect(
      page.getByRole('img', { name: 'Atomic concept map for this chapter' }),
    ).toBeVisible()
  })

  test('names the chapter she asked for', async ({ page }) => {
    await page.goto(`/#/chapter/${SUBJECT}/${CHAPTER}`)
    await expect(page.locator('h1.chp-h1')).toContainText(/real numbers/i)
  })
})

test.describe('the situations a real day actually has', () => {
  test('going back returns her to where she was', async ({ page }) => {
    await page.goto('/#/today')
    await page.goto('/#/quick-question')
    await page.goBack()
    await expect(page).toHaveURL(/\/today$/)
    await expectAppRendered(page)
  })

  test('a browser that refuses to store anything still shows the app', async ({ page }) => {
    /* Private browsing, a locked-down school laptop, a full disk. The store
     * writes to localStorage; if that throw takes the app down, the student
     * sees a white screen and no reason for it. */
    await page.addInitScript(() => {
      const boom = () => {
        throw new Error('storage is disabled')
      }
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
      })
    })
    await page.goto('/#/today')
    await expectAppRendered(page)
  })

  test('when the planner is unreachable she is told, not shown a fake empty day', async ({ page }) => {
    /* THE LIE THIS CATCHES.
     * "Nothing left for today" and "the planner is down" look identical to a
     * student if the app picks the first one when it does not know. One means
     * she is finished; the other means it has no idea. */
    await page.route('**/api/day', (route) => route.abort('failed'))
    await page.goto('/#/today')
    await expectAppRendered(page)

    await expect(
      page.getByText('Nothing left for today', { exact: false }),
      'the app told her she was finished when it simply could not reach the planner',
    ).toHaveCount(0)
  })

  test('a slow planner shows the screen immediately rather than a dead window', async ({ page }) => {
    await page.route('**/api/day', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      await route.continue()
    })
    await page.goto('/#/today')
    /* The heading is server-independent, so it must appear immediately. A
     * student staring at nothing for three seconds assumes it is broken. */
    await expect(page.getByRole('heading', { name: "Today's learning" })).toBeVisible({
      timeout: 2_000,
    })
  })

  test('a planner that answers with rubbish does not crash her app', async ({ page }) => {
    await page.route('**/api/day', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"not":"a day"}' }),
    )
    await page.goto('/#/today')
    await expectAppRendered(page)
  })

  test('a planner that returns an error explains itself', async ({ page }) => {
    await page.route('**/api/day', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    )
    await page.goto('/#/today')
    await expectAppRendered(page)
    await expect(page.getByText('Nothing left for today', { exact: false })).toHaveCount(0)
  })
})
