import { expect, test, type Page } from '@playwright/test'

import { gasPressure } from '../src/canvas/lessons/gasPressure'
import { attribute, attributeFiles } from './util/attribution'
import {
  answerBeat,
  answerBox,
  LESSONS,
  bodyBlocks,
  chromeText,
  open,
  settle,
  shownTitles,
  teach,
} from './util/canvas'

/* THE BUGS THAT SHIPPED, RE-DECIDED AGAINST THE ENGINE THAT REPLACED THE SCENE
 * -- AND THE TEACHING MODEL, WHICH NOTHING HAD EVER LOOKED AT.
 *
 * This file pinned `const SCENE = '/#/canvas/gas'` and every test went there.
 * That path now redirects to `/#/canvas`, so each guard had to be re-decided
 * rather than re-pointed: a guard is worth keeping only if the PROPERTY it
 * defends still exists, and a guard silently aimed at a redirect is worse than
 * no guard, because a green row reads as evidence.
 *
 * KEPT, because the defect each describes is still possible:
 *
 *   every declared block reaches the screen   -- a beat that drops a block
 *     presents a lesson missing its conclusion and nothing else notices.
 *     Re-pointed: the old version named four block ids from a deleted lesson
 *     file and looked for `[data-canvas="invariant-refusal"]`. Both are gone.
 *     The kinds are now read out of the lesson SOURCE, so editing a lesson
 *     cannot leave a stale expectation here.
 *
 *   the question appears exactly once         -- it once rendered as an <h1> by
 *     the route and as an <h2> by the renderer, and 155 assertions across five
 *     projects missed it because not one of them counted.
 *
 *   headings are sans, not the dashboard serif -- `src/styles/tokens/base.css`
 *     styles h1..h6 BY ELEMENT, and an element rule beats an inherited value.
 *     The canvas renders under that same stylesheet, so the collision is
 *     unchanged. THIS TEST CURRENTLY FAILS; see the note on it.
 *
 *   mathematics keeps the vertical rhythm     -- display math with margins on
 *     it pushed the relation onto the panel below. KaTeX styles `.katex-display`
 *     itself, so a version bump can put the margin back.
 *
 *   the simulation renders a stage it can afford, with no duplicate React --
 *     every <Canvas> once threw "Cannot read properties of null (reading
 *     'useMemo')" and the cubes vanished, because r3f had been handed a second
 *     React instance. The symptom was zero canvases.
 *
 *   one control moves every readout that depends on it -- the architectural
 *     claim, checked through the UI rather than the model.
 *
 *   the axis is monotonic and evenly spaced   -- the reference image's y-axis
 *     reads 200, 150, 100, 110. Still the defect to prevent, and the DOM check
 *     is not the same as `ChartView.test.ts`: that one asserts the option the
 *     component computes, this one asserts the ticks a browser actually drew.
 *
 * DELETED, with the reason recorded rather than the assertion quietly dropped:
 *
 *   THE EQUATION BLOCK'S 260px HEIGHT BOUND, which lived inside the KaTeX test.
 *   It read `[data-block-id="law"]` -- an attribute the engine does not emit --
 *   and 260 was calibrated against a hand-placed panel in a fixed-size world.
 *   The block now sits in a reflowing grid whose height is a function of the
 *   viewport, so there is no honest number to put in its place. The margin
 *   assertions, which are what actually caught the bug, are untouched.
 *
 *   THE VIEWPORT-DERIVED 3D BRANCH in the simulation test. It computed
 *   `expect3D = viewport.width > 900 && !reducedMotion` because the old
 *   contract chose the dimension for the learner. The engine does not: 2D/3D is
 *   a toggle in the route bar, available at every width. Asserting a derivation
 *   the product no longer performs would have been asserting the absence of a
 *   feature. Replaced by something stronger -- BOTH stages are exercised, at
 *   every project viewport, because both are reachable at every width.
 *
 * ADDED: the teaching model. `/#/canvas` shows one beat, keeps what came
 * before, answers a doubt without advancing, and never tells the learner how
 * many parts are left. Not one of those had a browser assertion.
 *
 * WHY THE NEW TESTS ARE IN THIS FILE AND NOT A NEW ONE. The gate at
 * `.github/workflows/learning-canvas-frontend.yml` names its two spec files
 * literally. A third file would have run locally, passed, and been dark in CI
 * -- the exact failure this whole exercise exists to undo.
 */

const physics = LESSONS[0]
const civics = LESSONS[1]

/** P = nRT/V with n = 1 mol and V = 24 L, the constants the lesson declares. */
const P_AT_200K = '69.3' // 8.314 * 200 / 24 = 69.28
const P_AT_600K = '207.9' // 8.314 * 600 / 24 = 207.85

/* -------------------------------------------------------------------------- */
/* The shipped defects                                                        */
/* -------------------------------------------------------------------------- */

test.describe('explanation canvas regressions', () => {
  for (const lesson of LESSONS) {
    test(`${lesson.label}: every declared block reaches the screen, and none is refused`, async ({ page }, testInfo) => {
      attributeFiles(testInfo, [
        'frontend/src/canvas/teach/beats.ts',
        'frontend/src/canvas/teach/TeachView.tsx',
      ])
      await open(page, testInfo)
      await teach(page, lesson.label)

      const kinds = await bodyBlocks(page).evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-kind')),
      )
      /* Compared as an ORDERED list, not a count. A beat derivation that
       * reordered blocks would keep the count and break the argument. */
      expect(kinds, 'kinds rendered, in order').toEqual(lesson.spec.blocks.map((b) => b.kind))

      /* A REFUSAL AND A GAP ARE NOT THE SAME THING, AND THE DOM SAYS WHICH.
       *
       * `role="alert"` marks the refusals that mean something is WRONG: a
       * lesson that failed validation, a cut that failed `checkBeats`, a frame
       * that failed `checkFrame`, a figure whose data contradicts its own type.
       * None of those may ever appear, and that is what this asserts.
       *
       * `FigureView` also renders a `.lc-refusal` WITHOUT `role="alert"` for a
       * shape it has no renderer for yet. That is a feature that has not been
       * built, not a defect, and it deliberately carries no alert role because
       * nothing went wrong. Asserting zero of those here would be asserting a
       * roadmap, and the roadmap moves: when this was written the civics lesson
       * showed four of them and an hour later it showed none, because the
       * remaining shapes landed. The check below is written to be true on both
       * sides of that change. */
      const refused = await page.locator('.lc-refusal[role="alert"]').allTextContents()
      expect(refused, 'blocks refused as wrong').toEqual([])

      /* A placeholder must still name what is missing. A blank one would be
       * indistinguishable from a renderer that crashed. */
      const placeholders = await page.locator('.lc-refusal:not([role="alert"]) h2').allTextContents()
      for (const text of placeholders) {
        expect(text.trim(), 'an unimplemented shape names itself').toMatch(/^No renderer yet for \S+/)
      }
    })

    test(`${lesson.label}: the lesson question appears exactly once`, async ({ page }, testInfo) => {
      attributeFiles(testInfo, [
        'frontend/src/canvas/CanvasRoute.tsx',
        'frontend/src/canvas/teach/TeachView.tsx',
      ])
      await open(page, testInfo)
      await teach(page, lesson.label)

      /* SHIPPED, AND CAUGHT BY LOOKING AT A SCREENSHOT RATHER THAN BY A TEST.
       * The route rendered the question as its own <h1> while the renderer
       * rendered the same string as the lesson's <h2>, so the page opened with
       * the question printed twice. 155 browser assertions across five projects
       * passed: they checked that headings are sans, that every block renders
       * and that nothing refuses. Not one of them counted. */
      const heads = await page.evaluate(() =>
        [...document.querySelectorAll('h1, h2, h3')].map((h) => (h.textContent ?? '').trim()),
      )
      const hits = heads.filter((t) => t === lesson.spec.question)
      expect(hits.length, `headings were: ${JSON.stringify(heads)}`).toBe(1)
    })
  }

  test('headings are sans, not the dashboard serif', async ({ page }, testInfo) => {
    /* OBSERVED, AND STILL TRUE ON `/#/canvas`: the lesson question computes to
     * "Fraunces, Georgia, serif". `src/styles/tokens/base.css:17` sets
     * `font-family: var(--font-display)` on h1..h6 BY ELEMENT; `.lc-teach` sets
     * a sans family on the container and an element rule beats an inherited
     * value, so the canvas's own family never reaches its own <h1>.
     *
     * The fix belongs in the canvas stylesheet -- a family on `.lc-question`
     * and `.lc-refusal h2`, which is where this annotation points. The
     * dashboard's rule is out of scope and must not be edited to satisfy the
     * canvas. */
    attributeFiles(testInfo, ['frontend/src/canvas/design/canvas.css'])
    await open(page, testInfo)
    await settle(page)

    const families = await page.evaluate(() =>
      [...document.querySelectorAll('.lc-root h1, .lc-root h2, .lc-root h3')].map((h) => ({
        tag: h.tagName,
        text: (h.textContent ?? '').slice(0, 40),
        stack: getComputedStyle(h).fontFamily,
      })),
    )
    expect(families.length, 'headings found').toBeGreaterThan(0)

    for (const h of families) {
      /* The FIRST family in the stack is the one that renders. Testing the
       * whole string for /serif/ was wrong: every sans stack ends in the
       * generic `sans-serif`, so the naive pattern matched a correct value. */
      const first = h.stack.split(',')[0].trim().replace(/["']/g, '')
      expect(first, `${h.tag} "${h.text}" resolved family`)
        .not.toMatch(/^(Fraunces|Georgia|Times|serif)$/i)
      expect(h.stack, `${h.tag} "${h.text}" font stack`).toMatch(/sans-serif$/)
    }
  })

  test('mathematics keeps the board’s vertical rhythm', async ({ page }, testInfo) => {
    attribute(testInfo, ['equation'])
    await open(page, testInfo)
    await teach(page, physics.label)

    /* OBSERVED: the equation panel measured 305px tall and pushed PV = nRT down
     * onto the panel below, because display math carried 1em of margin --
     * 46px of air at the size the relation is set in. KaTeX styles
     * `.katex-display` itself, so this survives a version bump only by being
     * checked. */
    const displays = page.locator('.katex-display')
    const n = await displays.count()
    expect(n, 'rendered display equations').toBeGreaterThan(0)

    for (let i = 0; i < n; i++) {
      const box = await displays.nth(i).evaluate((el) => {
        const s = getComputedStyle(el)
        return { mt: Number.parseFloat(s.marginTop), mb: Number.parseFloat(s.marginBottom) }
      })
      expect(box.mt, `katex-display[${i}] margin-top`).toBe(0)
      expect(box.mb, `katex-display[${i}] margin-bottom`).toBe(0)
    }
  })

  test('the simulation renders a stage its viewport can afford', async ({ page }, testInfo) => {
    attribute(testInfo, ['simulation'])
    attributeFiles(testInfo, ['frontend/src/canvas/render/GasScene3D.tsx'])

    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await open(page, testInfo)
    /*
     * THE LESSON IS NAMED, NOT ASSUMED.
     *
     * These two tests used `open()` alone and read whatever lesson the picker
     * opens by default. That was Physics until two reference lessons were added
     * ahead of it in the catalogue, at which point both quietly began measuring
     * a maths lesson that has no simulation in it — the block locator found
     * nothing and the failure pointed at the renderer.
     *
     * A test whose subject depends on catalogue ORDER is a test that can lose
     * its subject without anyone editing it. It says which lesson it means now.
     */
    await teach(page, physics.label)

    const block = page.locator('.lc-block[data-kind="simulation"]').first()
    await expect(block).toBeVisible()

    /* THE 2D STAGE IS THE DEFAULT, AND IT MUST DEPICT SOMETHING.
     * Not an empty box: no WebGL, but still a picture of the particles. */
    const marks = await block.locator('svg *').count()
    expect(marks, '2D stage draws something').toBeGreaterThan(0)
    await expectFits(block, 'svg', '2D stage')

    /* Interactive in every case. A simulation nobody can move is a diagram, and
     * the count comes from the lesson so adding a control cannot silently pass. */
    const sim = gasPressure.blocks.find((b) => b.kind === 'simulation')
    const controls = sim && 'controls' in sim ? sim.controls.length : 0
    expect(controls, 'the lesson declares controls').toBeGreaterThan(0)
    await expect(block.locator('input[type=range]')).toHaveCount(controls)

    /* THE 3D STAGE IS A TOGGLE, NOT A DERIVATION -- so it is exercised at every
     * viewport this suite runs, including 375px, because a learner can reach it
     * at every viewport. three.js arrives as a lazy chunk on first use. */
    await page.getByRole('button', { name: '3D', exact: true }).click()
    const canvases = block.locator('canvas')
    await expect(canvases).toHaveCount(1, { timeout: 30_000 })
    const size = await canvases.first().evaluate((el) => ({
      w: (el as HTMLCanvasElement).width,
      h: (el as HTMLCanvasElement).height,
    }))
    expect(size.w, 'canvas backing width').toBeGreaterThan(0)
    expect(size.h, 'canvas backing height').toBeGreaterThan(0)
    await expectFits(block, 'canvas', '3D stage')

    /* OBSERVED: every <Canvas> threw "Cannot read properties of null (reading
     * 'useMemo')" and the cubes vanished, because r3f had been handed a second
     * React instance. The symptom was zero canvases, so the count above is the
     * first half of this check and the error census is the second. */
    expect(errors.filter((e) => /useMemo|Invalid hook call/.test(e))).toEqual([])

    /* Back to 2D: a toggle that only goes one way is a trap. */
    await page.getByRole('button', { name: '2D', exact: true }).click()
    await expect(canvases).toHaveCount(0)
    expect(await block.locator('svg *').count(), '2D stage returns').toBeGreaterThan(0)
  })

  test('one control moves every readout that depends on it', async ({ page }, testInfo) => {
    attribute(testInfo, ['simulation'])
    await open(page, testInfo)
    /* Named for the reason given above. */
    await teach(page, physics.label)

    /* The architectural claim, checked through the UI rather than the model:
     * move temperature, and every readout derived from it must agree.
     *
     * The numbers are stated here rather than imported from `gasModel`, on
     * purpose: importing `pressureKPa` would make this test agree with the
     * implementation by construction and it would survive the formula being
     * wrong. 8.314 * 200 / 24 and 8.314 * 600 / 24 are arithmetic anyone can
     * check, and the exact 3x below is the physics, not the code. */
    const block = page.locator('.lc-block[data-kind="simulation"]').first()

    const sim = gasPressure.blocks.find((b) => b.kind === 'simulation')
    const controlKeys = sim && 'controls' in sim ? sim.controls.map((c) => c.key) : []
    const tempAt = controlKeys.indexOf('temperature')
    expect(tempAt, 'the lesson declares a temperature control').toBeGreaterThanOrEqual(0)
    const slider = block.locator('input[type=range]').nth(tempAt)
    await expect(slider).toBeVisible()

    const setTemp = async (v: string) => {
      await slider.evaluate((el: HTMLInputElement, val) => {
        /* React listens on the native setter, so assigning `.value` directly
         * updates the DOM and leaves the component's state behind. */
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        set.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, v)
    }

    await setTemp('200')
    await expect.poll(async () => (await readouts(page)).K, { timeout: 5_000 }).toBe('200')
    await expect.poll(async () => (await readouts(page)).kPa, { timeout: 5_000 }).toBe(P_AT_200K)

    await setTemp('600')
    /* 3x the temperature is exactly 3x the pressure at constant V and n. */
    await expect.poll(async () => (await readouts(page)).K, { timeout: 5_000 }).toBe('600')
    await expect.poll(async () => (await readouts(page)).kPa, { timeout: 5_000 }).toBe(P_AT_600K)

    expect(Number(P_AT_600K)).toBeCloseTo(Number(P_AT_200K) * 3, 1)
  })

  test('the pressure axis is monotonic and evenly spaced', async ({ page }, testInfo) => {
    attribute(testInfo, ['chart'])
    await open(page, testInfo)
    await teach(page, physics.label)

    /* The reference image's y-axis reads 200, 150, 100, 110. ECharts' interval
     * scale picks the ticks -- nothing in `ChartView` hands it an array -- so
     * this asserts the property that choice is supposed to buy, in the DOM.
     *
     * Scoped to ONE chart block by its authored title. The gas lesson draws two
     * charts, and the pie's "60%" slice labels are numbers that would join the
     * census and break the run-splitting below. */
    const chartBlock = page
      .locator('.lc-block[data-kind="chart"]')
      .filter({ hasText: 'Pressure vs temperature' })
    await expect(chartBlock).toHaveCount(1)

    const ticks = await chartBlock.locator('svg text').evaluateAll((els) =>
      els
        .map((e) => (e.textContent ?? '').trim())
        .filter((t) => /^-?\d+(\.\d+)?$/.test(t))
        .map(Number),
    )
    expect(ticks.length, 'numeric axis labels found').toBeGreaterThan(3)

    /* Split into the two axes by taking the longest ascending run; both axes
     * are independently ascending, so any real axis survives this. */
    const runs: number[][] = []
    let run: number[] = []
    for (const t of ticks) {
      if (!run.length || t > run[run.length - 1]) run.push(t)
      else { runs.push(run); run = [t] }
    }
    runs.push(run)
    const longest = runs.sort((a, b) => b.length - a.length)[0]
    expect(longest.length, `longest ascending tick run of ${JSON.stringify(ticks)}`)
      .toBeGreaterThanOrEqual(4)

    const steps = longest.slice(1).map((v, i) => v - longest[i])
    for (const s of steps) expect(s, `tick steps were ${JSON.stringify(steps)}`).toBeCloseTo(steps[0], 6)
  })
})

/* -------------------------------------------------------------------------- */
/* The teaching model                                                         */
/* -------------------------------------------------------------------------- */

test.describe('the lesson is taught, not printed', () => {
  for (const lesson of LESSONS) {
    test(`${lesson.label}: only the opening beat is on screen at first`, async ({ page }, testInfo) => {
      attributeFiles(testInfo, ['frontend/src/canvas/teach/beats.ts'])
      await open(page, testInfo)
      await page.getByRole('button', { name: lesson.label, exact: true }).click()
      await settle(page)

      const declared = lesson.spec.blocks
      const shown = await bodyBlocks(page).count()
      expect(shown, 'blocks on screen before any Continue').toBeGreaterThan(0)
      expect(shown, `the lesson declares ${declared.length} blocks and printed all of them`)
        .toBeLessThan(declared.length)

      const titles = await shownTitles(page)
      expect(titles, 'the first block is what a learner meets')
        .toContain(declared[0].title)
      /* The LAST block, specifically: every lesson here cuts into at least
       * three beats, so its closing block cannot legitimately be on screen
       * before a single Continue has been pressed. */
      expect(titles, 'a later beat leaked into the opening one')
        .not.toContain(declared[declared.length - 1].title)

      await expect(page.locator('.lc-teach__more')).toHaveText('There is more after this.')
    })

    test(`${lesson.label}: answering adds the next beat and keeps the last one`, async ({ page }, testInfo) => {
      attributeFiles(testInfo, ['frontend/src/canvas/teach/TeachView.tsx'])
      await open(page, testInfo)
      await page.getByRole('button', { name: lesson.label, exact: true }).click()
      await settle(page)

      const before = await bodyBlocks(page).count()
      const openingTitles = await shownTitles(page)

      /* Answering is what advances the lesson now. The Continue button is gone:
       * a beat already ends with a question, and a button beside it asked the
       * learner to answer and then separately confirm that they had. */
      await answerBeat(page)
      await expect.poll(() => bodyBlocks(page).count(), { timeout: 10_000 })
        .toBeGreaterThan(before)
      await settle(page)

      /* CUMULATIVE, NOT A SLIDESHOW. This is the assertion that separates the
       * teaching model from a carousel: what the learner already read is still
       * in front of them when they are asked about it. */
      const after = await shownTitles(page)
      for (const title of openingTitles) {
        expect(after, `"${title}" was dropped when the next beat arrived`).toContain(title)
      }
    })

    test(`${lesson.label}: the end asks what is unclear instead of advancing further`, async ({ page }, testInfo) => {
      attributeFiles(testInfo, ['frontend/src/canvas/teach/beats.ts'])
      await open(page, testInfo)
      await teach(page, lesson.label)

      /* No Continue button anywhere in the lesson any more, at any beat. */
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0)
      /* The box stays, because the last beat asks what is still unclear and the
       * learner must be able to answer THAT. */
      await expect(answerBox(page)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()

      const more = page.locator('.lc-teach__more')
      await expect(more).toHaveAttribute('data-end', 'true')
      await expect(more).toHaveText('That is the end of this lesson.')

      const closing = (await page.locator('.lc-teach__question').textContent() ?? '').trim()
      expect(closing, 'the closing checkpoint is a question').toMatch(/\?$/)
      expect(closing, 'the closing checkpoint asks about what did not land')
        .toMatch(/unclear|cleared up|not adding up/i)
    })
  }

  test('asking a doubt answers it without advancing the lesson', async ({ page }, testInfo) => {
    attributeFiles(testInfo, [
      'frontend/src/canvas/teach/doubt.ts',
      'frontend/src/canvas/teach/TeachView.tsx',
    ])
    await open(page, testInfo)
    await settle(page)

    const before = await bodyBlocks(page).count()
    const checkpointBefore = await page.locator('.lc-teach__question').textContent()

    await answerBox(page)
      .fill('what is pressure')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const answer = page.locator('.lc-teach__answer')
    await expect(answer).toHaveCount(1, { timeout: 10_000 })
    await expect(answer).not.toHaveClass(/lc-teach__answer--refusal/)
    /* An answer is a lesson, so it renders through the same machinery. If it
     * came out empty the feature would be a label with nothing under it. */
    expect(
      await answer.locator('.lc-block').count(),
      'the answer drew something',
    ).toBeGreaterThan(0)

    /* THE POINT OF THE FEATURE: there is no route from a doubt to the next
     * beat. The body is untouched and the same checkpoint is asked again. */
    expect(await bodyBlocks(page).count(), 'the lesson advanced while answering').toBe(before)
    expect(await page.locator('.lc-teach__question').textContent()).toBe(checkpointBefore)
    await expect(page.locator('.lc-teach__more')).toHaveText('There is more after this.')
    await expect(answerBox(page)).toBeVisible()
  })

  test('a question the lesson cannot answer ESCALATES, and is never a dead end', async ({ page }, testInfo) => {
    attributeFiles(testInfo, ['frontend/src/canvas/teach/doubt.ts'])
    await open(page, testInfo)
    await settle(page)

    const before = await bodyBlocks(page).count()

    /* A QUESTION, not gibberish. The old version typed "zzzz qqqq wubbleflarp"
     * to provoke a refusal, and with one box that string is an ANSWER -- it
     * carries no question mark and no question word -- so it advanced the beat
     * and never reached the resolver at all. The input has to express what the
     * test is about. */
    await answerBox(page).fill('what is wubbleflarp?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    /* NO REFUSAL UI ANY MORE, and that is what this test now pins. The lesson
     * resolver still refuses -- it answers only out of material the author
     * wrote, which is why it cannot write a wrong answer -- but a learner who
     * has just admitted confusion is the worst possible audience for "I cannot
     * answer that", so the refusal escalates instead of ending the
     * conversation. */
    await expect(page.locator('.lc-teach__answer--refusal')).toHaveCount(0)

    /* And something was said back. This route mounts the canvas without a
     * question service, so the escalation cannot complete here -- the learner
     * is told THAT, which is a different and honest thing from a dead end. */
    const reply = page.locator('.lc-teach__asked')
    await expect(reply).toHaveCount(1, { timeout: 15_000 })
    expect((await reply.textContent() ?? '').trim().length, 'the reply says something')
      .toBeGreaterThan(20)

    /* A question never advances the lesson. That is the whole point of asking
     * where you stand. */
    expect(await bodyBlocks(page).count(), 'a question advanced the lesson').toBe(before)
    await expect(answerBox(page)).toBeVisible()
  })

  test('an answer advances the lesson even when it is a poor one', async ({ page }, testInfo) => {
    /* A DELIBERATE CHOICE, written down so it is not mistaken for an oversight.
     * The screen does not grade. A learner who types something wrong has still
     * answered, and the lesson moves on; what notices they are struggling is
     * how often they ASK, not whether they are right. Refusing to advance would
     * turn every beat into a gate they can fail. */
    attributeFiles(testInfo, ['frontend/src/canvas/teach/turn.ts'])
    await open(page, testInfo)
    await settle(page)

    const before = await bodyBlocks(page).count()
    await answerBox(page).fill('zzzz qqqq wubbleflarp')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    await expect.poll(() => bodyBlocks(page).count(), { timeout: 10_000 }).toBeGreaterThan(before)
  })

  test('switching lessons starts the new one at its beginning', async ({ page }, testInfo) => {
    attributeFiles(testInfo, ['frontend/src/canvas/CanvasRoute.tsx'])
    await open(page, testInfo)
    await teach(page, physics.label)
    expect(await bodyBlocks(page).count()).toBe(physics.spec.blocks.length)

    await page.getByRole('button', { name: civics.label, exact: true }).click()
    await settle(page)

    /* Position is state, and state must not survive a change of subject. A
     * learner who picks civics after finishing physics must not land three
     * beats into a lesson they have not begun. */
    const declared = civics.spec.blocks
    expect(await bodyBlocks(page).count(), 'the new lesson opened partway through')
      .toBeLessThan(declared.length)

    const titles = await shownTitles(page)
    expect(titles).toContain(declared[0].title)
    expect(titles).not.toContain(declared[declared.length - 1].title)

    await expect(answerBox(page)).toBeVisible()
    await expect(page.locator('.lc-teach__more')).toHaveText('There is more after this.')
    await expect(page.locator('h1')).toHaveText(civics.spec.question)
  })

  test('the learner is never shown a step count', async ({ page }, testInfo) => {
    attributeFiles(testInfo, [
      'frontend/src/canvas/teach/contract.ts',
      'frontend/src/canvas/teach/beats.ts',
    ])
    await open(page, testInfo)

    /* TWO PATTERNS, TWO SCOPES, AND THE SCOPES ARE THE WHOLE CRAFT OF THIS TEST.
     *
     * "step 3" cannot appear in this product's content, so it is checked
     * against the WHOLE page -- an aria-label is exactly the crack a step
     * number slips through, and a page-wide sweep sees those.
     *
     * "n of m" is different: the machine-learning lesson's own caption reads
     * "It catches 55 of 300 frauds", which is the lesson talking about fraud
     * counts. So that pattern is checked only against the teaching CHROME with
     * lesson content subtracted -- see `chromeText`. Widening it to the page
     * would fail on correct content, and the test would be deleted for crying
     * wolf, which is how a rule like this actually dies. */
    const COUNTS = /\b\d+\s*(of|\/)\s*\d/i
    const STEPS = /\bstep\s*\d/i

    for (const lesson of LESSONS) {
      await page.getByRole('button', { name: lesson.label, exact: true }).click()
      await settle(page)

      /* Every beat, not just the first and last: a count that only appears in
       * the middle of a lesson is still a count. */
      for (let beat = 0; beat < 24; beat++) {
        const chrome = await chromeText(page)
        for (const text of chrome) {
          expect(text, `${lesson.label} chrome names a position`).not.toMatch(COUNTS)
          expect(text, `${lesson.label} chrome names a step`).not.toMatch(STEPS)
        }

        const body = await page.evaluate(() => document.body.innerText)
        expect(body, `${lesson.label} page names a step`).not.toMatch(STEPS)

        if ((await page.locator('.lc-teach__more[data-end="true"]').count()) > 0) break
        const before = await bodyBlocks(page).count()
        await answerBeat(page)
        await expect.poll(() => bodyBlocks(page).count(), { timeout: 10_000 })
          .toBeGreaterThan(before)
      }

      /* And once more with an answer on screen, because an answer is chrome
       * that carries a whole rendered lesson inside it. */
      await answerBox(page)
        .fill('why')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      /* Either shape of reply counts: the lesson's own answer, or the prose
         reply an escalation produces. Both are chrome this law must cover. */
      await expect(page.locator('.lc-teach__answer, .lc-teach__asked'))
        .toHaveCount(1, { timeout: 10_000 })
      for (const text of await chromeText(page)) {
        expect(text, `${lesson.label} answer chrome names a position`).not.toMatch(COUNTS)
        expect(text, `${lesson.label} answer chrome names a step`).not.toMatch(STEPS)
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The simulation's readouts, keyed by their unit.
 *
 * Keyed by unit rather than read positionally, because `block.readouts` is the
 * author's emphasis and reordering it is a lesson edit, not a regression.
 */
async function readouts(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const block = document.querySelector('.lc-block[data-kind="simulation"]')
    const out: Record<string, string> = {}
    if (!block) return out
    for (const value of block.querySelectorAll('.lc-metric__value')) {
      const unit = (value.nextElementSibling?.textContent ?? '').trim()
      if (unit) out[unit] = (value.textContent ?? '').trim()
    }
    return out
  })
}

/**
 * A stage must sit inside the block that owns it.
 *
 * "The size its viewport can afford" is not a pixel count -- the frame reflows,
 * so any number written here would be calibrated against one viewport and wrong
 * on the other four. What is true at every width is that the stage is drawn,
 * and that it does not spill past the column the planner gave it.
 */
async function expectFits(
  block: ReturnType<Page['locator']>,
  selector: string,
  what: string,
): Promise<void> {
  /* MEASURE A STAGE THAT HAS FINISHED SIZING ITSELF, OR MEASURE NOTHING.
   *
   * react-three-fiber mounts a <canvas> at the HTML default 300x150 and resizes
   * it from a ResizeObserver one frame later. Measured on mobile-375: 300x150
   * at mount, 213x133 once the observer runs -- so a test that measured on
   * arrival reported a 70px overhang against a stage that fits perfectly. That
   * is the same class of mistake as the readiness check that passed on an empty
   * page, just pointed the other way: an assertion that fires before the
   * subject exists tells you about the harness, not the product.
   *
   * Two consecutive identical boxes, then measure. */
  let previous = ''
  await expect
    .poll(
      async () => {
        const sig = await block.evaluate((host, sel) => {
          const stage = host.querySelector(sel)
          if (!stage) return 'absent'
          const r = stage.getBoundingClientRect()
          return `${Math.round(r.width)}x${Math.round(r.height)}`
        }, selector)
        const stable = sig !== 'absent' && sig === previous
        previous = sig
        return stable
      },
      { timeout: 20_000 },
    )
    .toBe(true)

  const fit = await block.evaluate((host, sel) => {
    const stage = host.querySelector(sel)
    if (!stage) return null
    const a = stage.getBoundingClientRect()
    const b = host.getBoundingClientRect()
    return { w: a.width, h: a.height, overhang: Math.round(a.right - b.right) }
  }, selector)

  expect(fit, `${what} is present`).not.toBeNull()
  expect(fit!.w, `${what} width`).toBeGreaterThan(0)
  expect(fit!.h, `${what} height`).toBeGreaterThan(0)
  expect(fit!.overhang, `${what} spills past its block by ${fit!.overhang}px`).toBeLessThanOrEqual(1)
}
