/**
 * P12-T1/T2 — axe-core across a real journey, not a first paint.
 *
 * CLAUDE.md's "Verification honesty" section has said plainly for a while that
 * there is no accessibility tooling here. This is that gap.
 *
 * WHY THE JOURNEY AND NOT THE LANDING
 * -----------------------------------
 * A scan of a freshly-loaded page is the most flattering possible measurement.
 * The violations that actually hurt people appear AFTER interaction: a dialog
 * that traps focus, an error message with no accessible name, a control that
 * loses its label once disabled, a live region that never announces.
 *
 * So every route is scanned at three states -- loaded, after keyboard traversal,
 * and after the viewport narrows to a phone -- and the focus journey is asserted
 * separately, because "can a keyboard user move through this at all" is not a
 * question axe answers.
 *
 * WHY A BASELINE AND NOT A CLEAN BILL OF HEALTH
 * --------------------------------------------
 * A first axe run on any real application finds violations. Failing on all of
 * them makes the gate red from day one, and a gate that is always red gets
 * switched off within a week. Failing on NEW ones records the debt visibly and
 * lets the number only go down.
 *
 * `ci/baselines/a11y.json` is that register: committed, diffable, and checked
 * for staleness so a fixed violation cannot sit there quietly re-permitting
 * itself.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED
 * --------------------------------
 * axe detects a minority of real accessibility problems -- roughly a third, by
 * its own documentation. A green run means "no automatically-detectable
 * violation outside the baseline". It does not mean the route is accessible,
 * and nothing here says otherwise.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { settle } from './util/canvas'
import { applyProjectMedia } from './util/media'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE = resolve(HERE, '../../ci/baselines/a11y.json')

/**
 * Set to regenerate. Never set in CI, and asserted absent below.
 *
 * A gate that rewrites its own expected values on every run cannot fail.
 */
const UPDATING = process.env['A11Y_UPDATE_BASELINE'] === '1'

/* HASH URLS, and this was a real defect before it was a detail.
   The app uses a hash router, so `/canvas` serves index.html and the router
   falls back to `#/today`. The first version of these specs used path URLs and
   every route resolved to the SAME page: the accessibility baseline recorded
   one page three times and called it three routes. Measured by probe:
   `page.goto('/canvas')` ended at `http://127.0.0.1:5183/canvas#/today`. */
/** The routes a learner reaches. Named, so adding one is a visible diff. */
const ROUTES: readonly { name: string; path: string }[] = [
  { name: 'canvas', path: '/#/canvas' },
  { name: 'practice', path: '/#/practice' },
  { name: 'today', path: '/#/today' },
]

/**
 * WCAG 2.1 A and AA only.
 *
 * `best-practice` is excluded deliberately: those are axe's opinions rather than
 * the standard, and mixing them in makes the number unarguable-with, which is
 * how a gate stops being read.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** How many tab presses count as "traversed". */
const TAB_DEPTH = 12

type Baseline = Record<string, string[]>

function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline
  } catch {
    // A missing baseline means "nothing permitted yet": every violation is new
    // and the run fails loudly. Deliberately not an error, so a fresh checkout
    // is told what to record rather than how to configure something.
    return {}
  }
}

async function scan(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return [...new Set(results.violations.map((v) => v.id))].sort()
}

/** Where focus is now, as something a human can read in a failure message. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    const tag = el.tagName.toLowerCase()
    const label =
      el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''
    return label ? `${tag}:${label}` : tag
  })
}

/**
 * Wait until the route has actually RENDERED, not merely finished loading.
 *
 * `CanvasRoute` is `React.lazy`, so `networkidle` fires while the Suspense
 * fallback is still on screen. The first version of this file scanned that
 * fallback and reported a clean canvas -- a measurement of a spinner.
 *
 * Waiting on the CONDITION (the lesson toggle exists) rather than on a duration
 * is also what keeps this off the law gate's list of timing races.
 */
/**
 * Wait until the ROUTE has finished rendering, not merely finished loading.
 *
 * MEASURED FLAKE, NOT A PRECAUTION.
 * `today: color-contrast` was reported by axe on some runs and not others, on
 * the same commit and the same machine. Rate before this wait, running the
 * staleness check six times under `reduced-motion`: 2 passed, 4 failed. The two
 * outcomes look like a project difference if you sample each project once,
 * which is exactly the wrong conclusion this measurement prevented.
 *
 * The cause is that `networkidle` says the requests stopped, not that the page
 * finished. The dashboard shell already publishes the real signal --
 * `App.tsx` sets `data-curriculum="loading"` and flips it to `"ready"` -- and
 * every assertion in this file counts violations, so a page scanned early
 * simply reports a DIFFERENT number rather than an obviously broken one.
 *
 * A condition, never a duration: waiting on a number here would be the same
 * race with a stopwatch attached.
 */
async function shellReady(page: Page): Promise<void> {
  /* 1. The shell says the curriculum arrived. */
  await page.locator('[data-curriculum="ready"]').waitFor({ state: 'attached', timeout: 30_000 })

  /* 2. Nothing is still announcing that it is loading. A skeleton and its real
        content do not have the same colours, and axe scores whichever it finds. */
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="status"], .lc-caption')].some((el) =>
        /^Loading\b/.test((el.textContent ?? '').trim()),
      ),
    undefined,
    { timeout: 30_000 },
  )

  /* 3. Fonts, because font metrics decide what overlaps what. */
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  /* 4. Two consecutive frames agree about the layout. Cheaper and more honest
        than a sleep, and it cannot pass on a blank page because (1) and (2)
        already demanded content. */
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const measure = () => document.body.getBoundingClientRect().height
        const first = measure()
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(measure() === first)))
      }),
    undefined,
    { timeout: 30_000 },
  )
}

async function canvasReady(page: Page): Promise<void> {
  /* `settle`, not a bespoke wait. The first version of this function waited for
     the Lesson toggle, which sits OUTSIDE both Suspense boundaries -- so it was
     satisfied before a single lazy chunk had landed, and axe scanned a page
     whose figures had not arrived. Every assertion here counts violations, so
     an unfinished page scores BETTER: a slower runner would have produced a
     cleaner baseline. `settle` waits for no mounted fallback, real content in
     every block, fonts loaded, and two frames that agree. */
  await settle(page)
}

const collected: Baseline = {}

test.describe('accessibility across a journey', () => {
  for (const route of ROUTES) {
    test(`${route.name} stays within the baseline through load, keyboard and mobile`, async ({
      page,
    }, testInfo) => {
      /* STATE 1 -- loaded. */
      await applyProjectMedia(page, testInfo)
    await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      if (route.name === 'canvas') await canvasReady(page)
      else await shellReady(page)
      const onLoad = await scan(page)

      /* STATE 2 -- after a keyboard user has moved through it. Disabled
         controls losing their accessible name, and dialogs that take focus,
         only appear once something has been focused. */
      for (let i = 0; i < TAB_DEPTH; i++) await page.keyboard.press('Tab')
      const afterKeyboard = await scan(page)

      /* STATE 3 -- on a phone. Collapsed navigation and off-canvas panels are
         different DOM, so they are a different scan. */
      await page.setViewportSize({ width: 375, height: 812 })
      await page.waitForLoadState('networkidle')
      const onMobile = await scan(page)

      const found = [...new Set([...onLoad, ...afterKeyboard, ...onMobile])].sort()
      collected[route.name] = found

      if (UPDATING) return

      const permitted = new Set(readBaseline()[route.name] ?? [])
      const added = found.filter((id) => !permitted.has(id))

      expect(
        added,
        `New accessibility violations on ${route.path}.\n` +
          `Not in ci/baselines/a11y.json, so they arrived with a change.\n` +
          `  on load:        ${onLoad.join(', ') || '(none)'}\n` +
          `  after keyboard: ${afterKeyboard.join(', ') || '(none)'}\n` +
          `  on mobile:      ${onMobile.join(', ') || '(none)'}`,
      ).toEqual([])
    })

    test(`${route.name} moves keyboard focus off the body`, async ({ page }, testInfo) => {
      /* A separate question axe does not answer: can a keyboard user get INTO
         the page at all? A route where Tab never leaves `body` is unusable
         without a mouse and reports zero axe violations while doing it. */
      await applyProjectMedia(page, testInfo)
    await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      if (route.name === 'canvas') await canvasReady(page)
      else await shellReady(page)

      const start = await focused(page)
      expect(start).toBe('body')

      await page.keyboard.press('Tab')
      const first = await focused(page)

      expect(
        first,
        `Tab did not move focus on ${route.path}. A keyboard user cannot ` +
          `reach anything here, and axe reports nothing about it.`,
      ).not.toBe('body')
    })
  }

  test('the baseline records nothing that is already fixed', async ({ page }, testInfo) => {
    /* Staleness, and it decays in the direction that matters. A register that
       only grows re-permits a violation the moment it returns, because the
       entry nobody deleted is still sitting there.

       An early return rather than a marker: a marker would make this test
       unable to fail, which is the shape the whole file argues against. */
    if (UPDATING) return

    const baseline = readBaseline()
    const stale: string[] = []
    for (const route of ROUTES) {
      await applyProjectMedia(page, testInfo)
    await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      if (route.name === 'canvas') await canvasReady(page)
      else await shellReady(page)
      const found = new Set(await scan(page))
      for (const id of baseline[route.name] ?? []) {
        if (!found.has(id)) stale.push(`${route.name}: ${id}`)
      }
    }

    expect(
      stale,
      'Recorded in ci/baselines/a11y.json and no longer occurring.\n' +
        'Remove them in the same change that fixed them.',
    ).toEqual([])
  })

  test('the baseline is not being rewritten by this run', () => {
    /* The gate protecting the other gates. `A11Y_UPDATE_BASELINE=1` makes every
       assertion above return early, so a CI job with it set would report green
       over an unmeasured application. */
    expect(process.env['A11Y_UPDATE_BASELINE']).not.toBe('1')
  })

  test.afterAll(() => {
    if (!UPDATING) return
    writeFileSync(BASELINE, `${JSON.stringify(collected, null, 2)}\n`, 'utf8')
    process.stdout.write(`wrote ${BASELINE}\n`)
  })
})
