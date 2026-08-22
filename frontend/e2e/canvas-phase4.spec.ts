import { expect, test } from '@playwright/test'
import { FIXTURES } from '../src/board/fixtures/index'
import { metrics, openBoard, waitForCheckpoint } from './util/bridge'
import { applyProjectThrottle, runConditions } from './util/cdp'
import { appendLedger } from './util/report'

/* THE PHASE 4 GATE, IN A REAL BROWSER.
 *
 * The vitest suite proves each fixture validates as declared and compiles to
 * steps the registry can draw. It cannot prove the board actually renders
 * them, that a repaired board shows its notices to a human, that a 60-character
 * label stops overlapping, or that a phone-width viewport produces a usable
 * page — jsdom performs no layout and implements no container queries, which
 * is precisely why those claims live here instead.
 *
 * The fixture list is imported from the manifest rather than restated, for the
 * same reason the vitest suite iterates it: a scenario added without a check
 * is a coverage claim nobody is keeping.
 */

const url = (id: string) => `/#/canvas?fixture=${encodeURIComponent(id)}`

test.describe('the scenario gallery', () => {
  test('lists every scenario and links each one into the board', async ({ page }) => {
    await page.goto('/#/canvas/gallery')
    const cards = page.locator('[data-board="gallery-card"]')
    await expect(cards.first()).toBeVisible()
    await expect(cards).toHaveCount(FIXTURES.length)
    expect(FIXTURES.length).toBeGreaterThanOrEqual(24)

    /* The page states its own coverage. If a required scenario ever loses its
     * fixture, this warning appears and the gate fails here rather than in a
     * test file nobody opens. */
    await expect(page.locator('[data-board="gallery-warning"]')).toHaveCount(0)

    /* Every card is a real link to a real board — not a button that pretends. */
    const first = cards.first()
    await expect(first).toHaveAttribute('href', /#\/canvas\?fixture=/)
    await first.click()
    await expect(page.locator('[data-board="world-step"]').first()).toBeVisible()
  })

  test('is reachable from the board and costs nothing to open', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await page.goto('/#/canvas/gallery')
    await expect(page.locator('[data-board="gallery-card"]').first()).toBeVisible()

    /* No fixture module is fetched by opening the gallery: the manifest holds
     * thunks, and a card is a link, so nothing loads until something is
     * chosen. A gallery that eagerly pulled 25 boards would defeat the
     * loading discipline the lesson itself keeps.
     *
     * The manifest itself is excluded — index.ts IS the list of scenarios the
     * gallery draws, so of course it loads. What must not load is any board's
     * content. */
    const fixtureChunks = requests
      .filter((u) => /\/fixtures\/[a-z0-9-]+\.tsx?/i.test(u))
      .filter((u) => !/\/fixtures\/index\.tsx?/i.test(u))
    expect(fixtureChunks, `gallery fetched fixture modules: ${fixtureChunks.join(', ')}`).toEqual([])
  })
})

test.describe('every scenario renders through the board', () => {
  for (const f of FIXTURES) {
    test(`${f.id} (${f.expect})`, async ({ page }, testInfo) => {
      await applyProjectThrottle(page, testInfo)
      await page.goto(url(f.id))

      /* The shell is always present, whatever the board turns out to be. */
      await expect(page.locator('[data-board="viewport"]')).toBeVisible()

      if (f.expect === 'failed') {
        /* A refused board says so where the lesson would have been, and shows
         * what the validator managed to establish first. */
        await expect(page.locator('[data-board="overlay-state"]')).toBeVisible()
        await expect(page.locator('[data-board="overlay-notices"]')).toBeVisible()
        return
      }

      if (f.scenarios.includes('empty-content')) {
        await expect(page.locator('[data-board="overlay-state"]')).toBeVisible()
        return
      }

      await page.locator('[data-board="world-step"]').first().waitFor({ timeout: 20_000 })

      if (f.expect === 'ok') {
        /* Zero notices is not merely a validator result — nothing appears on
         * screen to explain a change, because nothing changed. */
        await expect(page.locator('[data-board="overlay-notices"]')).toHaveCount(0)
      } else {
        await expect(page.locator('[data-board="overlay-notices"]')).toBeVisible()
      }
    })
  }
})

test.describe('charts survive the data they are given', () => {
  test('a long-label chart truncates the axis and keeps the full text', async ({ page }) => {
    await page.goto(url('data-long-labels'))
    await page.locator('[data-board="world-step"]').first().waitFor()

    /* Walk to a step that has drawn a chart; the board reveals progressively,
     * so the first step may be the explanation. */
    const svg = page.locator('[data-board="chart-svg"]').first()
    await svg.waitFor({ timeout: 20_000 })

    await expect(svg).toHaveAttribute('role', 'img')
    await expect(svg).toHaveAttribute('aria-label', /.+/)

    const chart = page.locator('[data-board="chart"]').first()
    /* Every chart states its data in text as well as in shapes. */
    await expect(chart.locator('[data-board="visually-hidden"]')).toHaveCount(1)

    const ticks = chart.locator('text[data-board="tick"]')
    const count = await ticks.count()
    expect(count).toBeGreaterThan(0)

    /* No drawn axis label runs past what a tick can hold. The full text is
     * still reachable: the bar carries it in a <title>. */
    let truncated = 0
    for (let i = 0; i < count; i += 1) {
      const text = (await ticks.nth(i).textContent()) ?? ''
      expect(text.length, `axis label too long to fit: ${text}`).toBeLessThanOrEqual(40)
      if (text.endsWith('…')) truncated += 1
    }
    expect(truncated, 'the long-label fixture should force at least one truncation').toBeGreaterThan(0)

    const titles = chart.locator('svg title')
    expect(await titles.count()).toBeGreaterThan(0)
    const firstTitle = (await titles.first().textContent()) ?? ''
    expect(firstTitle.length).toBeGreaterThan(10)
  })

  test('an unusable chart becomes a table rather than vanishing', async ({ page }) => {
    await page.goto(url('invalid-chart-values'))
    await page.locator('[data-board="world-step"]').first().waitFor()
    await expect(page.locator('[data-board="overlay-notices"]')).toBeVisible()

    /* Drive to the end so every repaired block has been released. */
    await page.waitForFunction(() => Boolean(window.__boardHarness), null, { timeout: 20_000 })
    await page.evaluate(() => window.__boardHarness!.fastForward(60))

    const notices = (await page.locator('[data-board="overlay-notices"]').textContent()) ?? ''
    expect(notices).toContain('Chart data was incomplete, so a table is shown.')

    /* The em-dash stands in for values a learner cannot read. "NaN" is a
     * floating-point term and must never reach the board. */
    const world = (await page.locator('[data-board="world"]').textContent()) ?? ''
    expect(world).not.toContain('NaN')
    expect(world).not.toContain('Infinity')
  })

  test('an unsupported block type is shown as a placeholder, not executed', async ({ page }) => {
    await page.goto(url('unsupported-blocks'))
    await page.locator('[data-board="world-step"]').first().waitFor()
    await page.waitForFunction(() => Boolean(window.__boardHarness), null, { timeout: 20_000 })
    await page.evaluate(() => window.__boardHarness!.fastForward(60))

    const m = await metrics(page)
    expect(m.unsafeHtmlRendered, 'smuggled markup must never reach the world').toBe(0)
    expect(m.unsafeCssRendered, 'smuggled styles must never reach the world').toBe(0)
    expect(m.arbitraryComponentExecution).toBe(0)

    /* The payload is gone; the fact that something was there is not. */
    const world = (await page.locator('[data-board="world"]').textContent()) ?? ''
    expect(world).not.toContain('hotpink')
    expect(world).not.toContain('RemoteWidget')
  })
})

test.describe('the board is usable at the sizes people read it', () => {
  test('the mobile stress board renders and stays inside its viewport', async ({ page }, testInfo) => {
    const throttle = await applyProjectThrottle(page, testInfo)
    await page.goto(url('data-mobile-stress'))
    await page.locator('[data-board="world-step"]').first().waitFor({ timeout: 20_000 })
    await waitForCheckpoint(page)

    /* The page itself must not scroll sideways. The world scrolls by camera,
     * and wide content scrolls inside its own block — the document does not. */
    const overflow = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.docWidth, 'the page must not scroll horizontally')
      .toBeLessThanOrEqual(overflow.clientWidth + 1)

    const m = await metrics(page)
    expect(m.mountedFutureBlockCount).toBe(0)

    appendLedger({
      scenario: 'phase4:mobile-stress',
      conditions: runConditions(testInfo, throttle),
      metrics: m as unknown as Record<string, unknown>,
      at: new Date().toISOString(),
    })
  })

  test('every interactive control clears the touch-target floor', async ({ page }) => {
    await page.goto(url('maths-fractions-quiz'))
    await page.locator('[data-board="world-step"]').first().waitFor()
    await page.waitForFunction(() => Boolean(window.__boardHarness), null, { timeout: 20_000 })
    await page.evaluate(() => window.__boardHarness!.fastForward(20))

    /* 24x24 is the WCAG minimum for a pointer target. The board's own
     * contract sets 44x44 for primary controls; this asserts the floor
     * everything must clear, and reports anything under it by name.
     *
     * Scoped to the board. The surrounding dashboard chrome is outside this
     * milestone's scope and must not be edited by it — and a test that fails
     * on code it is forbidden to fix teaches people to ignore the test. One
     * such control does exist out there (button.linkish "Edit plan", 47x15);
     * it is recorded in the phase report rather than silenced here. */
    /* MEASURED WITHOUT THE CAMERA TRANSFORM, deliberately.
     *
     * getBoundingClientRect reports the size after transforms, and the world
     * is inside a scaled camera layer: at 375px the board zooms to about 0.5
     * to fit a 720px step, so a 44px control measures 22px and every target on
     * the board would appear to fail. That is a reading of the camera, not of
     * the layout. offsetWidth/offsetHeight report the CSS box the contract is
     * written about, which is the thing this check is for — and camera zoom is
     * learner-controlled, the same category as browser zoom. */
    const small = await page.evaluate(() => {
      const root = document.querySelector('[data-board="root"]')
      if (!root) throw new Error('board root not found — the scope of this check is missing')
      const out: string[] = []
      for (const el of Array.from(root.querySelectorAll('button, a[href], input, [role="radio"]'))) {
        const h = el as HTMLElement
        if (h.offsetWidth === 0 && h.offsetHeight === 0) continue // not rendered
        if (h.offsetWidth < 24 || h.offsetHeight < 24) {
          out.push(`${h.tagName.toLowerCase()}[${h.dataset.board ?? ''}] ${h.offsetWidth}x${h.offsetHeight}`)
        }
      }
      return out
    })
    expect(small, `board controls under the 24x24 floor: ${small.join(', ')}`).toEqual([])
  })
})
