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
 *
 * ONE LIMIT WORTH NAMING, BECAUSE IT WAS MEASURED HERE. Removing the input's
 * `aria-label` from the teaching view did NOT turn this suite red: a
 * `placeholder` satisfies axe's `label` rule on its own. Placeholder-only
 * labelling is a real usability problem -- the text disappears the moment
 * someone types, so anyone who loses their place has nothing to read -- and
 * this gate cannot see it. Removing BOTH names does fail, on all three states,
 * which is how the gate was proved able to fail at all.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { settle } from './util/canvas'
import { permittedFor, type Baseline } from './util/baseline'
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
/**
 * EVERY ROUTE A LEARNER CAN REACH. Named, so adding one is a visible diff.
 *
 * This list was three of eight. The five that were missing are not obscure:
 * `/learn/:conceptId` is where a planned concept is taught, `/quick-question`
 * and `/ask` are the two "ask anything" surfaces, `/chapter` is the map, and
 * `/misconception` is where a learner is sent after getting something wrong --
 * which is to say, the moment they are least able to absorb a usability
 * problem. Auditing three routes and reporting "accessibility" was a claim
 * about 37% of the product.
 *
 * The parameterised routes carry ids that were PROBED against the running app,
 * not invented: each of the eight was visited and confirmed to stay at its own
 * URL and render its own content. This file's own history is the reason -- an
 * earlier version used path URLs against a hash router, every route resolved to
 * the same page, and the baseline recorded one page three times and called it
 * three routes.
 */
const ROUTES: readonly { name: string; path: string }[] = [
  { name: 'canvas', path: '/#/canvas' },
  { name: 'practice', path: '/#/practice' },
  { name: 'today', path: '/#/today' },
  { name: 'learn', path: '/#/learn/gas-pressure' },
  { name: 'chapter', path: '/#/chapter/mathematics/number-systems' },
  { name: 'quick-question', path: '/#/quick-question' },
  { name: 'ask', path: '/#/ask' },
  { name: 'misconception', path: '/#/misconception' },
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

/**
 * Wait until nothing on the page is still moving.
 *
 * THE FLAKE THIS EXISTS TO REMOVE, measured across two CI runs of the SAME
 * project on the SAME route:
 *
 *     run 32892684852   [reduced-motion] today: color-contrast  ABSENT
 *     run 32895032118   [reduced-motion] today: color-contrast  PRESENT
 *
 * The first failed the staleness check ("recorded and no longer occurring")
 * and the second failed the violations check ("new violations ... arrived with
 * a change"). Opposite failures, same code, nothing between them but timing.
 *
 * `networkidle` says the NETWORK is quiet. It says nothing about the page: a
 * fade that starts on mount is still running, and an element at 40% opacity
 * fails contrast while the same element at 100% passes. axe therefore reports
 * a different answer depending on when it happens to look.
 *
 * A FIRST ATTEMPT AT THIS BUG WAS WRONG AND IS RECORDED SO IT IS NOT REPEATED:
 * the finding looked project-specific, so the baseline gained a per-project
 * override saying reduced-motion does not see it. The next run saw it. It was
 * never a project fact; it was a clock.
 *
 * `getAnimations()` covers CSS transitions, CSS animations and Web Animations
 * alike, which is what "still moving" actually means here. The timeout is a
 * ceiling, not a sleep: a page that settles in 40ms waits 40ms, and one with a
 * genuinely infinite animation gives up rather than hanging the suite.
 */
async function settled(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => document.getAnimations().every((animation) => animation.playState !== 'running'),
      undefined,
      { timeout: 3000 },
    )
    .catch(() => {
      /* An animation that never finishes is a real thing -- a spinner, a looping
         background. Scanning a page mid-loop is still better than failing the
         a11y run for a reason that has nothing to do with accessibility, and
         the violation set is what gets asserted either way. */
    })
}

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
  await settled(page)
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
 * No Suspense fallback still on screen.
 *
 * `/learn/:conceptId` and `/ask` are `React.lazy` like the canvas, and their
 * fallback is a full-viewport panel reading "Opening the canvas...". Scanning
 * THAT is scanning one div: two elements, no controls, and a clean axe result
 * that says nothing about the route. `networkidle` does not exclude it, because
 * the chunk can have arrived while React has not yet re-rendered.
 *
 * Deliberately NOT `settle`, which the canvas uses: `settle` waits for
 * `.lc-block` elements to hold real content, and `/ask` has no blocks at all
 * until a question is asked, so it would wait its full 30 seconds twice and
 * then fail on a route that was working.
 */
async function pastTheFallback(page: Page): Promise<void> {
  await page
    .waitForFunction(() => !/Opening the canvas/.test(document.body.innerText), undefined, {
      timeout: 15_000,
    })
    .catch(() => {
      /* Left to the assertions. A route stuck on its fallback should be reported
         by what axe and the focus test find there, not by a timeout here that
         hides which route it was. */
    })
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
      await pastTheFallback(page)
      if (route.name === 'canvas') await canvasReady(page)
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

      const permitted = new Set(permittedFor(readBaseline(), route.name, testInfo.project.name))
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
      await pastTheFallback(page)
      if (route.name === 'canvas') await canvasReady(page)

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
      await pastTheFallback(page)
      if (route.name === 'canvas') await canvasReady(page)
      const found = new Set(await scan(page))
      /*
       * PER PROJECT, because the finding is. A violation that only exists while
       * an animation is running is genuinely absent under
       * `prefers-reduced-motion`, and reading one flat list made the staleness
       * check report it stale there while four other projects still saw it.
       */
      for (const id of permittedFor(baseline, route.name, testInfo.project.name)) {
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
