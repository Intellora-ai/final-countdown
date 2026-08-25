import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

import { billBecomesLaw } from '../../src/canvas/lessons/billBecomesLaw'
import { classifierEvaluation } from '../../src/canvas/lessons/classifierEvaluation'
import { gasPressure } from '../../src/canvas/lessons/gasPressure'
import { applyProjectMedia } from './media'

/* ONE DEFINITION OF "THE CANVAS IS READY", SHARED BY BOTH SPECS.
 *
 * The two specs used to carry an `open()` each, and they had drifted: one
 * waited for eight lesson roots and a `data-validated` flag, the other for one
 * root and the same flag. Neither selector exists any more. Both files now
 * reach the canvas through this module, so a change to how readiness is
 * decided is made once instead of twice-and-differently.
 *
 * WHAT REPLACED WHAT.
 * -------------------
 * `/#/canvas/lessons?renderer=v2` rendered a gallery of eight lessons at once
 * and `/#/canvas/gas` rendered a single hand-placed scene. Both paths now
 * redirect to `/#/canvas`, which shows ONE lesson, ONE beat at a time, chosen
 * from a picker. Nothing about "wait for eight lesson roots" survives that, and
 * neither does `[data-canvas="lesson"]` -- the engine stamps `data-kind` on a
 * `.lc-block` and nothing else.
 *
 * WHY EVERY GENERIC CHECK REVEALS THE WHOLE LESSON FIRST.
 * ------------------------------------------------------
 * The gallery's value to a quality sweep was that it put a lot of different
 * content on one page: eight lessons meant eight compositions to census for
 * clipping, tiny type and duplicate ids. A beat-at-a-time view shows one block
 * on first paint, so a sweep that measured the landing state would be
 * measuring roughly a tenth of the product and reporting the result as if it
 * covered all of it. `revealAll` presses Continue until the lesson ends, so the
 * census sees every block the lesson declares -- and `teach()` walks all three
 * lessons, which is the closest honest equivalent of what the gallery gave.
 */

export const ROUTE = '/#/canvas'

/**
 * The three lessons the product ships, paired with the picker label that
 * selects them. The specs read `question`, `blocks.length` and `blocks[].kind`
 * from the imported source rather than restating them, so a lesson edited in
 * `src/` cannot leave a stale expectation behind in `e2e/`.
 */
export const LESSONS = [
  { label: 'Physics', spec: gasPressure },
  { label: 'Civics', spec: billBecomesLaw },
  { label: 'Machine learning', spec: classifierEvaluation },
] as const

export type LessonLabel = (typeof LESSONS)[number]['label']

/**
 * Blocks in the lesson body, excluding any rendered inside an answer.
 *
 * A doubt's answer is itself a lesson and goes through `BlockView`, so it
 * emits `.lc-block` too. The child combinators pin this to the cells the
 * teaching grid owns directly; an answer's blocks sit two levels deeper, inside
 * `.lc-teach__answer > .lc-teach__answer-grid`.
 */
export function bodyBlocks(page: Page): Locator {
  return page.locator('.lc-teach__grid > .lc-teach__cell > .lc-block')
}

/** Open the canvas and wait for the first beat to paint. */
export async function open(page: Page, testInfo: TestInfo): Promise<void> {
  /* Before navigation: the simulation reads the motion preference during its
   * first render, and applying it after paint would exercise the change
   * listener instead of the initial read. Playwright 1.62.1 does not apply
   * project `use.reducedMotion` to the page fixture -- see util/media.ts. */
  await applyProjectMedia(page, testInfo)
  await page.goto(ROUTE)
  await bodyBlocks(page).first().waitFor({ timeout: 30_000 })
}

/**
 * The most beats any lesson may take to end.
 *
 * A ceiling, not an expectation: it exists so a Continue button that never
 * disappears fails the test in seconds instead of hanging until the 90s
 * timeout with nothing to say. The longest lesson in the product cuts into
 * five beats.
 */
const MAX_BEATS = 24

/**
 * Press Continue until the lesson ends. Returns how many times it was pressed.
 *
 * Each press waits for the block count to actually RISE rather than sleeping.
 * A fixed delay here would be the same inverted gate the old readiness check
 * had: on a slow runner the click would be counted before the beat arrived,
 * every census would run on a shorter page, and a slower machine would score
 * better.
 */
/** The one box a learner types into. It both answers the beat's question and
 *  asks one of their own; the TEXT decides which. */
export function answerBox(page: Page) {
  return page.getByRole('textbox', { name: 'Answer the question, or ask one of your own' })
}

/**
 * Answer the beat's closing question, which is how the lesson advances.
 *
 * THERE IS NO CONTINUE BUTTON. A beat already ends with a question, and a
 * button beside it asked the learner to answer and then separately confirm
 * that they had answered. The text below is a plain statement on purpose: a
 * question would be answered where they stand and would NOT advance.
 */
export async function answerBeat(page: Page): Promise<void> {
  await answerBox(page).fill('the earlier part explains this one')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

export async function revealAll(page: Page): Promise<number> {
  const blocks = bodyBlocks(page)
  const end = page.locator('.lc-teach__more[data-end="true"]')

  let answers = 0
  while (answers < MAX_BEATS) {
    if ((await end.count()) > 0) break
    const before = await blocks.count()
    await answerBeat(page)
    await expect
      .poll(() => blocks.count(), { timeout: 10_000 })
      .toBeGreaterThan(before)
    answers += 1
  }

  expect(answers, 'the lesson reached its last beat').toBeLessThan(MAX_BEATS)
  return answers
}

/**
 * Select a lesson and reveal all of it.
 *
 * `exact: true` because "Physics" is also a substring of nothing here but
 * "Machine learning" would match a fuzzy "learning" query, and an accidental
 * partial match is how a sweep silently measures the wrong lesson.
 */
export async function teach(page: Page, label: LessonLabel): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click()
  await bodyBlocks(page).first().waitFor({ timeout: 30_000 })
  await revealAll(page)
  await settle(page)
}

/**
 * Wait until what is on screen is what a learner would see.
 *
 * THE OLD READINESS CHECK INVERTED UNDER LOAD, AND THAT IS THE LESSON THIS
 * FUNCTION IS BUILT AROUND.
 *
 * It waited for a selector that sat OUTSIDE both Suspense boundaries, so it was
 * satisfied by the first synchronous React commit -- before a single dynamic
 * import had been requested. Every assertion downstream is `toBe(0)` or
 * `toEqual([])`, so a page that had not finished loading scored perfectly: a
 * slower runner produced a better result.
 *
 * So every wait below is a LOWER BOUND that an unfinished page cannot satisfy:
 *
 *   1. No Suspense fallback is still mounted. Every lazy renderer sits behind
 *      one, and a mounted fallback is the one piece of scaffolding that proves
 *      a chunk has NOT landed. Both spellings are checked -- `BlockView` gives
 *      its fallback `role="status"`, `FigureView` gives its shapes a plain
 *      `.lc-caption` -- because a census that only knew the first would have
 *      measured a page whose figures had not arrived.
 *   2. Every block has resolved to real content -- a table, an SVG, a canvas,
 *      typeset mathematics, or text.
 *   3. Fonts have loaded, because font metrics decide every effective-size and
 *      every bounding-box measurement made against this page.
 *   4. Two consecutive frames agree about the layout. Cheaper and more honest
 *      than a sleep, and it cannot pass on a blank page because (1) and (2)
 *      already demanded content.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.lc-block [role="status"], .lc-block .lc-caption')].some(
        (el) => /^Loading\b/.test((el.textContent ?? '').trim()),
      ),
    undefined,
    { timeout: 30_000 },
  )

  await page.waitForFunction(
    () => {
      const blocks = [...document.querySelectorAll('.lc-block')]
      if (blocks.length === 0) return false
      return blocks.every(
        (b) =>
          b.querySelector('table, svg, canvas, .katex') !== null ||
          (b.textContent ?? '').replace(/[​-‍﻿]/g, '').trim().length > 0,
      )
    },
    undefined,
    { timeout: 30_000 },
  )

  /* `document.fonts.ready` resolves with the FontFaceSet itself, which is not
   * serialisable across the CDP boundary -- returning it directly hangs the
   * evaluate. Resolve to undefined instead. */
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  await page.waitForFunction(
    () => {
      /* THE BLOCK BOXES ARE NOT ENOUGH ON THEIR OWN.
       *
       * A block's outer box is decided by the grid and is stable from the first
       * commit; the ECharts SVG and the r3f canvas INSIDE it are sized by their
       * own ResizeObservers a frame or two later. Watching only the outer boxes
       * declares a page settled while a chart is still at its mounting width,
       * and a clipping census taken then reports text spilling out of a figure
       * that fits perfectly a moment afterwards. The drawing surfaces are in
       * the signature for that reason. */
      const sig = [...document.querySelectorAll('.lc-block, .lc-block svg, .lc-block canvas')]
        .map((b) => {
          const r = b.getBoundingClientRect()
          return `${Math.round(r.width)}x${Math.round(r.height)}`
        })
        .join(',')
      const w = window as unknown as { __sig?: string; __same?: number }
      if (w.__sig === sig) w.__same = (w.__same ?? 0) + 1
      else {
        w.__sig = sig
        w.__same = 0
      }
      return (w.__same ?? 0) >= 2
    },
    undefined,
    { timeout: 30_000 },
  )
}

/**
 * The section title of every block currently in the lesson body.
 *
 * `firstChild` rather than `textContent`: a simulation's label appends a
 * quiet "Interactive" in a nested span, so the whole element reads
 * "Particle modelInteractive" and an equality test against the authored title
 * would fail on the one block kind that matters most.
 */
export async function shownTitles(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.lc-teach__grid > .lc-teach__cell > .lc-block .lc-section-label__text',
      ),
    ].map((el) => (el.firstChild?.textContent ?? el.textContent ?? '').trim()),
  )
}

/**
 * The text of the teaching chrome, with lesson content removed.
 *
 * WHY THE SUBTRACTION IS NOT OPTIONAL.
 *
 * `data-teach-chrome` marks the checkpoint, the answer surface and the refusal
 * panel -- the software's own voice. But an ANSWER is a lesson, so the answer
 * surface legitimately contains rendered blocks, and one of those blocks may
 * carry a caption like "It catches 55 of 300 frauds". That is the lesson
 * talking about fraud counts, not the software telling a learner they are on
 * part 55 of 300, and a check that cannot tell the two apart is a check that
 * will eventually be deleted for crying wolf. Stripping `.lc-block` subtrees
 * from the clone leaves exactly the words the product wrote.
 */
export async function chromeText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-teach-chrome]')].map((el) => {
      const clone = el.cloneNode(true) as Element
      for (const block of clone.querySelectorAll('.lc-block')) block.remove()
      return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    }),
  )
}
