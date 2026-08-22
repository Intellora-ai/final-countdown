import { expect, test } from '@playwright/test'
import { fastForward, metrics, openBoard, waitForCheckpoint } from './util/bridge'
import { applyProjectThrottle, runConditions } from './util/cdp'
import { appendLedger } from './util/report'

/* THE INVARIANTS — the claims that must hold on every board, at every size,
 * in every mode. These are not performance targets that can be tuned; they are
 * statements about what the product is, and a single violation means the
 * teaching contract is broken rather than slow.
 *
 * Every assertion here is a DOM or session fact read through the harness, not
 * a self-report from the code under test.
 */

test.describe('canvas invariants', () => {
  test('at session start, nothing from the future is in the tree', async ({ page }, testInfo) => {
    const throttle = await applyProjectThrottle(page, testInfo)
    await openBoard(page)
    await waitForCheckpoint(page)

    const m = await metrics(page)

    expect(m.mountedFutureBlockCount, 'future blocks must be absent, not hidden').toBe(0)
    expect(m.futureImageRequestCount, 'no image belonging to an unreleased step may be requested').toBe(0)
    expect(m.futureChartSvgCount, 'no future chart may be drawn').toBe(0)
    expect(m.futureSimulationCount, 'no future simulation may be built').toBe(0)
    expect(m.prefetchedStepCount, 'at most one step may be fetched ahead').toBeLessThanOrEqual(1)

    appendLedger({
      scenario: 'invariants:session-start',
      conditions: runConditions(testInfo, throttle),
      metrics: m as unknown as Record<string, unknown>,
      at: new Date().toISOString(),
    })
  })

  test('the board renders nothing unsafe and applies no action twice', async ({ page }, testInfo) => {
    const throttle = await applyProjectThrottle(page, testInfo)
    await openBoard(page)
    await waitForCheckpoint(page)

    /* Walk the whole lesson: a violation that only appears on step four is
     * still a violation, and stopping at step one would miss it. */
    const released = await fastForward(page)
    expect(released, 'the lesson must release at least one step').toBeGreaterThan(0)

    const m = await metrics(page)

    expect(m.unsafeHtmlRendered, 'no script, frame, or inline handler may reach the world').toBe(0)
    expect(m.unsafeCssRendered, 'content may not dictate presentation through inline style').toBe(0)
    expect(m.arbitraryComponentExecution, 'only registry components may render').toBe(0)
    expect(m.duplicateActionApplication, 'no teaching action may be applied twice').toBe(0)
    /* Still true after the whole lesson, not merely at the start. */
    expect(m.mountedFutureBlockCount).toBe(0)
    expect(m.prefetchedStepCount).toBeLessThanOrEqual(1)

    appendLedger({
      scenario: 'invariants:full-lesson',
      conditions: runConditions(testInfo, throttle),
      metrics: { ...(m as unknown as Record<string, unknown>), releasedSteps: released },
      at: new Date().toISOString(),
    })
  })

  test('silence does not advance the lesson', async ({ page }, testInfo) => {
    await applyProjectThrottle(page, testInfo)
    await openBoard(page)
    const first = await waitForCheckpoint(page)
    expect(first).toBe('checkpoint')

    const before = await page.locator('[data-board="world-step"]').count()
    /* The checkpoint has no timeout by design. Waiting is the test. */
    await page.waitForTimeout(3_000)
    const after = await page.locator('[data-board="world-step"]').count()

    expect(after, 'a checkpoint waits forever; it never continues on its own').toBe(before)
    expect(await page.evaluate(() => window.__boardHarness!.status())).toBe('checkpoint')
  })
})
