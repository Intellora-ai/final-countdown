import { expect, test } from '@playwright/test'

/* THE FOUR BUGS THAT SHIPPED, ASSERTED IN A REAL BROWSER.
 *
 * These live here rather than in vitest for a reason that is itself one of the
 * findings: two of them were COMPUTED-STYLE bugs, and only a browser computes
 * styles. A unit test that greps the stylesheet asserts that a rule was typed,
 * not that it won — and the whole defect was a rule being typed and losing to
 * an element selector further up the cascade. The other two need a live WebGL
 * context and a laid-out element, neither of which exists in jsdom-less vitest.
 *
 * Every assertion is written from the OBSERVED symptom, so each one would have
 * failed on the build that had the bug.
 */

const SCENE = '/#/canvas/gas'
const WORLD_W = 1408
const WORLD_H = 768
const MIN_SCALE = 0.35
const MAX_SCALE = 3

async function openScene(page: import('@playwright/test').Page) {
  await page.goto(SCENE)
  await page.locator('.scene-world').waitFor({ timeout: 20_000 })
}

test.describe('explanation canvas regressions', () => {
  test('headings are sans, not the dashboard serif', async ({ page }) => {
    await openScene(page)
    /* OBSERVED: computed font-family was "Fraunces, Georgia, serif" on both
     * the board title and every panel heading. The scene sets a sans family on
     * its container, but the dashboard styles h1/h2 by ELEMENT, and an element
     * rule beats an inherited value. */
    for (const sel of ['.scene-title', '.sc-title']) {
      const ff = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily)
      /* The FIRST family in the stack is the one that renders. Testing the
       * whole string for /serif/ was wrong: every sans stack ends in the
       * generic `sans-serif`, so the naive pattern matched a correct value. */
      const first = ff.split(',')[0].trim().replace(/["']/g, '')
      expect(first, `${sel} resolved family`).not.toMatch(/^(Fraunces|Georgia|Times|serif)$/i)
      expect(ff, `${sel} font stack`).toMatch(/sans-serif$/)
    }
  })

  test('mathematics keeps the board’s vertical rhythm', async ({ page }) => {
    await openScene(page)
    /* OBSERVED: the equation panel measured 305px tall and pushed PV = nRT
     * down onto the concept map, because KaTeX ships margin:1em on display
     * math — 46px of air at the size the relation is set in. */
    const display = page.locator('.scene .katex-display').first()
    if (await display.count()) {
      const box = await display.evaluate((el) => {
        const s = getComputedStyle(el)
        return { mt: parseFloat(s.marginTop), mb: parseFloat(s.marginBottom) }
      })
      expect(box.mt, 'katex-display margin-top').toBe(0)
      expect(box.mb, 'katex-display margin-bottom').toBe(0)
    }

    const node = page.locator('.scene-node').filter({ hasText: 'Constant V' }).first()
    const h = (await node.boundingBox())?.height ?? 0
    expect(h, 'equation node height').toBeGreaterThan(0)
    expect(h, 'equation node height (was 305px when broken)').toBeLessThan(200)
  })

  test('the board fits its viewport instead of pinning into a corner', async ({ page }, testInfo) => {
    await openScene(page)
    /* OBSERVED: matrix(0.35, 0, 0, 0.35, -246.4, -134.4). Solving the x offset
     * back through (viewW - worldW*scale)/2 gives viewW = 0 — the fit was
     * computed once, from window.innerWidth, before the element had layout.
     *
     * Asserted against the fit the CURRENT viewport should produce, so this is
     * exact at every project size rather than a loose bound. */
    const vp = testInfo.project.use.viewport!
    const expected = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(vp.width / WORLD_W, vp.height / WORLD_H)))

    const m = await page.locator('.scene-world').evaluate((el) => {
      const t = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      return { scale: t.a, x: t.e, y: t.f }
    })
    expect(m.scale, 'world scale').toBeCloseTo(expected, 2)

    /* When the viewport is at least as big as the world, a correct fit centres
     * it — it never offsets negatively. That is the shape of the original bug. */
    if (vp.width >= WORLD_W * expected) expect(m.x).toBeGreaterThanOrEqual(-1)
    if (vp.height >= WORLD_H * expected) expect(m.y).toBeGreaterThanOrEqual(-1)
  })

  test('both WebGL panels acquire a context', async ({ page }) => {
    await openScene(page)
    /* OBSERVED: every <Canvas> threw "Cannot read properties of null (reading
     * 'useMemo')" and both cubes vanished, because r3f had been handed a
     * second React instance. The visible symptom was zero canvases. */
    const canvases = page.locator('.scene canvas')
    await expect(canvases).toHaveCount(2, { timeout: 20_000 })

    const sizes = await canvases.evaluateAll((els) =>
      els.map((el) => ({ w: (el as HTMLCanvasElement).width, h: (el as HTMLCanvasElement).height })),
    )
    for (const s of sizes) {
      expect(s.w, 'canvas backing width').toBeGreaterThan(0)
      expect(s.h, 'canvas backing height').toBeGreaterThan(0)
    }

    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForTimeout(500)
    expect(errors.filter((e) => /useMemo|Invalid hook call/.test(e))).toEqual([])
  })

  test('one variable drives every representation', async ({ page }) => {
    await openScene(page)
    /* The architectural claim, checked through the UI rather than the model:
     * the thermometer, the dial and the graph marker must agree, always. */
    const slider = page.locator('.scene input[type=range]').first()
    /* The dial's own readout, not "Pressure [kPa]" on the graph's y-axis — a
     * text match on /kPa/ alone finds the axis label first. */
    const dial = page.locator('[data-sc="gauge-value"]').first()

    await slider.evaluate((el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(el, '200')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(dial).toHaveText(/73 kPa/, { timeout: 5_000 })

    await slider.evaluate((el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(el, '600')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    /* 3x the temperature is exactly 3x the pressure at constant V and n. */
    await expect(dial).toHaveText(/220 kPa/, { timeout: 5_000 })
  })

  test('the pressure axis is monotonic and evenly spaced', async ({ page }) => {
    await openScene(page)
    /* The reference image's y-axis reads 200, 150, 100, 110. Ticks here come
     * from d3-scale's .nice(), so this asserts the property that choice buys. */
    const ticks = await page.locator('.scene svg text').evaluateAll((els) =>
      els.map((e) => e.textContent ?? '').filter((t) => /^-?\d+(\.\d+)?$/.test(t)).map(Number),
    )
    expect(ticks.length, 'numeric axis labels found').toBeGreaterThan(3)

    /* Split into the two axes by taking the longest ascending run; both axes
     * are independently ascending, so any real axis survives this. */
    const ascendingRuns: number[][] = []
    let run: number[] = []
    for (const t of ticks) {
      if (!run.length || t > run[run.length - 1]) run.push(t)
      else { ascendingRuns.push(run); run = [t] }
    }
    ascendingRuns.push(run)
    const longest = ascendingRuns.sort((a, b) => b.length - a.length)[0]
    expect(longest.length, 'longest ascending tick run').toBeGreaterThanOrEqual(4)

    const steps = longest.slice(1).map((v, i) => v - longest[i])
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 6)
  })
})
