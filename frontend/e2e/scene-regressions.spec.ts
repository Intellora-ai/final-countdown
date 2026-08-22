import { expect, test } from '@playwright/test'
import { attribute, attributeFiles } from './util/attribution'
import { applyProjectMedia, prefersReducedMotion } from './util/media'

/* THE BUGS THAT SHIPPED, ASSERTED AGAINST THE ENGINE THAT REPLACED THE SCENE.
 *
 * These guards were written against GasPressureScene: 331 lines of hand-placed
 * panels reading a 75-line table of absolute pixel coordinates. Phase 5 deleted
 * that scene and pointed /canvas/gas at the composed renderer, so every guard
 * had to be re-decided rather than re-pointed. A guard is worth keeping only if
 * the PROPERTY it defends still exists; two of the seven defended properties of
 * the old architecture itself.
 *
 * KEPT, because the defect they describe is still possible:
 *   headings are sans          -- the dashboard styles h1/h2 BY ELEMENT, and an
 *                                 element rule beats an inherited value. The
 *                                 composed route renders under the same
 *                                 stylesheet, so the collision is unchanged.
 *   katex vertical rhythm      -- KaTeX still ships margin:1em on display math.
 *   WebGL context acquired     -- r3f still dies on a second React instance.
 *   one variable drives all    -- the architectural claim, now through the
 *                                 simulation contract instead of a hand-wired
 *                                 store.
 *   axis monotonic and even    -- the reference image's y-axis reads 200, 150,
 *                                 100, 110. Still the defect to prevent.
 *
 * REMOVED, with the reason recorded rather than the test quietly dropped:
 *
 *   "the extracted primitives render exactly what the CSS did" asserted exact
 *   computed values on [data-canvas="section-title"|"section-sub"|"badge"|
 *   "scene-label"|"panel"]. A browser probe of the migrated route returns 0 for
 *   all five. Those primitives were extracted FROM scene.css FOR that scene;
 *   the composed panels read tokens directly. Nothing renders them any more, so
 *   the test had no subject. Keeping it pointed at the old route would have
 *   been a guard on a page no user can reach.
 *
 *   "the board fits its viewport instead of pinning into a corner" solved
 *   matrix(0.35,0,0,0.35,-246.4,-134.4) back through (viewW - worldW*scale)/2
 *   to prove the fit was computed before layout. It asserts a 1408x768 world
 *   scaled by a CSS transform. The composed renderer has no world and no
 *   transform: it reflows on a twelve-column grid, which is the entire point of
 *   the replacement. The property that replaced it -- content stays reachable
 *   and readable as the viewport shrinks -- is asserted in
 *   composed-renderer.spec.ts across five viewport projects.
 *
 * ADDED: the migration's own acceptance criterion. Before the gas lesson's
 * chart carried real data it declared `data: []`, and the chart contract
 * correctly refused to draw a relationship with no points -- so the migration
 * would have traded a working P-T graph for a refusal box while every other
 * guard here still passed. Nothing asserted "no block refused". Now something
 * does.
 */

const SCENE = '/#/canvas/gas'

/** P = nRT/V with n = 1 mol and V = 24 L, the constants the lesson declares. */
const P_AT_200K = 69   // 8.314 * 200 / 24 = 69.28
const P_AT_600K = 208  // 8.314 * 600 / 24 = 207.85

async function openScene(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
) {
  /* Before navigation: the contract reads the motion preference during the
   * first render, and applying it after paint would exercise the resize path
   * instead of the initial one. */
  await applyProjectMedia(page, testInfo)
  await page.goto(SCENE)
  await page.locator('[data-canvas="lesson"]').waitFor({ timeout: 30_000 })
  /* Wait for the measured pass, not the first paint. The renderer paints a
   * predicted frame, measures it, then repairs -- asserting against the
   * prediction would be asserting against a frame no learner sees. */
  await page.waitForFunction(
    () => document.querySelector('[data-canvas="lesson"]')?.getAttribute('data-validated') === 'true',
    null, { timeout: 30_000 },
  )
  await page.locator('[data-canvas="block"]').first().waitFor({ timeout: 30_000 })
}

test.describe('explanation canvas regressions', () => {
  test('every declared element renders, and none of them refuses', async ({ page }, testInfo) => {
    attributeFiles(testInfo, [
      'frontend/src/canvas/lessons/acceptance.ts',
      'frontend/src/canvas/renderer/LessonRenderer.tsx',
    ])
    await openScene(page, testInfo)

    const state = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('[data-canvas="block"]')]
      return {
        ids: blocks.map((b) => b.getAttribute('data-block-id')),
        refused: blocks
          .filter((b) => b.querySelector('[data-canvas="invariant-refusal"]'))
          .map((b) => b.getAttribute('data-block-id')),
        unrenderable: blocks
          .filter((b) => b.querySelector('[data-canvas="unrenderable"]'))
          .map((b) => b.getAttribute('data-block-id')),
      }
    })

    /* The four elements the lesson declares. Named individually so a silently
     * dropped block fails here rather than passing a count check. */
    expect(state.ids.sort()).toEqual(['box', 'chain', 'graph', 'law'])
    expect(state.refused, 'blocks whose invariants refused').toEqual([])
    expect(state.unrenderable, 'blocks with no renderer').toEqual([])
  })

  test('headings are sans, not the dashboard serif', async ({ page }, testInfo) => {
    attributeFiles(testInfo, ['frontend/src/canvas/design/tokens.ts'])
    await openScene(page, testInfo)
    /* OBSERVED: computed font-family was "Fraunces, Georgia, serif" on the
     * board title and every panel heading. The scene set a sans family on its
     * container, but the dashboard styles h1/h2 BY ELEMENT, and an element rule
     * beats an inherited value. The composed route renders under the same
     * stylesheet, so the collision is unchanged. */
    const families = await page.evaluate(() =>
      [...document.querySelectorAll('h1, h2, h3')].map((h) => ({
        tag: h.tagName,
        text: (h.textContent ?? '').slice(0, 30),
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
    attribute(testInfo, ['EquationPanel'])
    await openScene(page, testInfo)
    /* OBSERVED: the equation panel measured 305px tall and pushed PV = nRT down
     * onto the panel below, because KaTeX ships margin:1em on display math --
     * 46px of air at the size the relation is set in. */
    const displays = page.locator('.katex-display')
    const n = await displays.count()
    expect(n, 'rendered display equations').toBeGreaterThan(0)

    for (let i = 0; i < n; i++) {
      const box = await displays.nth(i).evaluate((el) => {
        const s = getComputedStyle(el)
        return { mt: parseFloat(s.marginTop), mb: parseFloat(s.marginBottom) }
      })
      expect(box.mt, `katex-display[${i}] margin-top`).toBe(0)
      expect(box.mb, `katex-display[${i}] margin-bottom`).toBe(0)
    }

    /* The height bound the margin bug blew through. Asserted on the equation
     * BLOCK, which is what the grid has to place. */
    const h = (await page.locator('[data-block-id="law"]').boundingBox())?.height ?? 0
    expect(h, 'equation block height').toBeGreaterThan(0)
    expect(h, 'equation block height (was 305px when the margins leaked)').toBeLessThan(260)
  })

  test('the simulation renders the stage its viewport can afford', async ({ page }, testInfo) => {
    attribute(testInfo, ['SimulationPanel'])
    attributeFiles(testInfo, [
      'frontend/src/canvas/panels/ParticleBox3D.tsx',
      'frontend/src/canvas/contract/representations/simulation.ts',
    ])
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openScene(page, testInfo)

    /* THE FIRST VERSION OF THIS TEST ASSERTED ONE CANVAS EVERYWHERE AND WAS
     * WRONG. simulation.ts derives `dimension: wide && !reduced ? '3D' : '2D'`
     * with `wide = viewport.width > 900`, because a WebGL context costs a
     * 215 KB chunk that is not worth it on a phone and is not honest under
     * reduced motion. So the correct expectation is a FUNCTION of the project,
     * and asserting a constant made square-900 and mobile-375 fail against
     * behaviour that was right.
     *
     * Running that first version is also what exposed a real defect:
     * reduced-motion rendered the animated 3D box exactly like desktop,
     * because `viewport.reducedMotion` was declared in the context type, read
     * twice by the contract, and never written by anything in production. The
     * accommodation was dead. LessonRenderer now subscribes to
     * prefers-reduced-motion, so this assertion has something real to check. */
    const vp = testInfo.project.use.viewport!
    const reduced = prefersReducedMotion(testInfo)
    const expect3D = vp.width > 900 && !reduced

    const stage = page.locator('[data-canvas="simulation"]')
    await expect(stage).toHaveAttribute('data-dimension', expect3D ? '3D' : '2D', { timeout: 30_000 })

    const canvases = page.locator('[data-block-id="box"] canvas')
    if (expect3D) {
      /* OBSERVED: every <Canvas> threw "Cannot read properties of null
       * (reading 'useMemo')" and the cubes vanished, because r3f had been
       * handed a second React instance. The symptom was zero canvases. */
      await expect(canvases).toHaveCount(1, { timeout: 30_000 })
      const size = await canvases.first().evaluate((el) => ({
        w: (el as HTMLCanvasElement).width, h: (el as HTMLCanvasElement).height,
      }))
      expect(size.w, 'canvas backing width').toBeGreaterThan(0)
      expect(size.h, 'canvas backing height').toBeGreaterThan(0)
    } else {
      /* The 2D fallback must be a real stage, not an empty box: no WebGL, but
       * still something that depicts the particles. */
      await expect(canvases).toHaveCount(0)
      const marks = await page.locator('[data-canvas="simulation-stage"] svg *').count()
      expect(marks, '2D stage draws something').toBeGreaterThan(0)
    }

    /* Interactive in every case. A simulation nobody can move is a diagram. */
    await expect(page.locator('[data-block-id="box"] input[type=range]')).toHaveCount(1)

    await page.waitForTimeout(500)
    expect(errors.filter((e) => /useMemo|Invalid hook call/.test(e))).toEqual([])
  })

  test('one variable drives every representation', async ({ page }, testInfo) => {
    attribute(testInfo, ['SimulationPanel'])
    attributeFiles(testInfo, ['frontend/src/canvas/contract/representations/simulation.ts'])
    await openScene(page, testInfo)
    /* The architectural claim, checked through the UI rather than the model:
     * move temperature, and every readout that depends on it must agree.
     *
     * The expected numbers changed with the migration and that is the point.
     * The legacy scene's hardcoded GAS_MODEL gave 73 and 220 kPa; the lesson
     * now DECLARES n = 1 mol and V = 24 L, so nRT/V gives 69 and 208. The
     * physics moved out of the engine and into the lesson, which is what Phase
     * 4 was for -- these constants are the evidence it actually happened. */
    const slider = page.locator('[data-block-id="box"] input[type=range]').first()
    await expect(slider).toBeVisible()

    /* The dial's own readout, not the graph's y-axis label -- a text match on
     * /kPa/ alone finds the axis first. */
    const pressure = page.locator('[data-sc="gauge-value"]').filter({ hasText: 'kPa' }).first()

    const setTemp = async (v: string) => {
      await slider.evaluate((el: HTMLInputElement, val) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        set.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, v)
    }

    await setTemp('200')
    await expect(pressure).toHaveText(new RegExp(`${P_AT_200K}\\s*kPa`), { timeout: 5_000 })

    await setTemp('600')
    /* 3x the temperature is exactly 3x the pressure at constant V and n. */
    await expect(pressure).toHaveText(new RegExp(`${P_AT_600K}\\s*kPa`), { timeout: 5_000 })
    expect(P_AT_600K).toBe(P_AT_200K * 3 + 1) // 69*3 = 207, +1 from rounding 207.85
  })

  test('the pressure axis is monotonic and evenly spaced', async ({ page }, testInfo) => {
    attribute(testInfo, ['ChartPanel'])
    await openScene(page, testInfo)
    /* The reference image's y-axis reads 200, 150, 100, 110. Ticks here come
     * from d3-scale's .nice(), so this asserts the property that choice buys.
     *
     * Scoped to the graph BLOCK. The legacy version read every `.scene svg
     * text` on the page, which swept in the causal chain's node labels and
     * survived only because none of them parse as numbers. */
    const ticks = await page.locator('[data-block-id="graph"] svg text').evaluateAll((els) =>
      els.map((e) => (e.textContent ?? '').trim())
        .filter((t) => /^-?\d+(\.\d+)?$/.test(t)).map(Number),
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
    expect(longest.length, 'longest ascending tick run').toBeGreaterThanOrEqual(4)

    const steps = longest.slice(1).map((v, i) => v - longest[i])
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 6)
  })
})
