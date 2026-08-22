import type { Page, TestInfo } from '@playwright/test'

/* THE SPECS' ONLY WINDOW INTO THE BOARD.
 *
 * Every number a spec asserts comes through here, so there is exactly one
 * definition of each metric and no spec can invent its own. If the bridge is
 * missing the spec fails loudly rather than silently measuring nothing —
 * a harness that reports zeros when it is not attached is worse than no
 * harness, because zeros look like passing invariants.
 */

export interface CanvasMetrics {
  jsWorkP50: number
  jsWorkP75: number
  jsWorkP95: number
  frameIntervalP50: number
  frameIntervalP75: number
  frameIntervalP95: number
  missedFrameCount: number
  missedFrameRate: number
  framesOver16_7ms: number
  frameBudgetMs: number
  framesRecorded: number
  cameraInputToNextPaintP50: number
  cameraInputToNextPaintP95: number
  frontendEventToFirstRevealP50: number
  frontendEventToFirstRevealP95: number
  aiProviderFirstEventP50: number
  aiProviderFirstEventP95: number
  aiProviderFirstEventCount: number
  aiFirstVisibleStepP50: number
  aiFirstVisibleStepP95: number
  aiFirstVisibleStepCount: number
  mountedBlockCount: number
  mountedFutureBlockCount: number
  futureImageRequestCount: number
  futureChartSvgCount: number
  futureSimulationCount: number
  prefetchedStepCount: number
  unsafeHtmlRendered: number
  unsafeCssRendered: number
  arbitraryComponentExecution: number
  duplicateActionApplication: number
  buildMode: 'development' | 'production'
  syntheticTouch: boolean
}

export interface Placement {
  stepId: string
  x: number
  y: number
  width: number
  height: number
  measured: boolean
}

/** Open a board and wait for the harness to attach and the first step to land. */
export async function openBoard(page: Page, path = '/#/canvas'): Promise<void> {
  await page.goto(path)
  await page.waitForFunction(() => Boolean(window.__boardHarness), null, { timeout: 20_000 })
  await page.locator('[data-board="world-step"]').first().waitFor({ timeout: 20_000 })
}

export async function metrics(page: Page): Promise<CanvasMetrics> {
  const m = await page.evaluate(() => {
    if (!window.__boardHarness) throw new Error('__boardHarness is not attached')
    return window.__boardHarness.metrics()
  })
  return m as CanvasMetrics
}

export async function placements(page: Page): Promise<Placement[]> {
  return page.evaluate(() => {
    if (!window.__boardHarness) throw new Error('__boardHarness is not attached')
    return window.__boardHarness.placements()
  }) as Promise<Placement[]>
}

export async function status(page: Page): Promise<string> {
  return page.evaluate(() => window.__boardHarness?.status() ?? 'unregistered')
}

/** Wait for the session to reach a checkpoint (or complete). */
export async function waitForCheckpoint(page: Page, timeout = 30_000): Promise<string> {
  await page.waitForFunction(
    () => {
      const s = window.__boardHarness?.status()
      return s === 'checkpoint' || s === 'complete' || s === 'error'
    },
    null,
    { timeout },
  )
  return status(page)
}

/** Drive Continue through the real control until the lesson ends. */
export async function fastForward(page: Page, maxSteps = 600): Promise<number> {
  return page.evaluate(
    (n) => window.__boardHarness!.fastForward(n),
    maxSteps,
  ) as Promise<number>
}

export async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => window.__boardHarness!.startRecording())
}

export async function stopRecording(page: Page): Promise<void> {
  await page.evaluate(() => window.__boardHarness!.stopRecording())
}

/** Attach a metrics block to the run report under a stable name. */
export async function recordMetrics(
  testInfo: TestInfo,
  name: string,
  m: CanvasMetrics,
): Promise<void> {
  await testInfo.attach(`metrics:${name}`, {
    body: JSON.stringify(
      { project: testInfo.project.name, scenario: name, ...m },
      null,
      2,
    ),
    contentType: 'application/json',
  })
}

declare global {
  interface Window {
    __boardHarness?: {
      startRecording(): void
      stopRecording(): void
      metrics(): unknown
      placements(): unknown
      status(): string
      fastForward(maxSteps?: number): Promise<number>
      raw(): Record<string, { count: number; p50: number; p75: number; p95: number }>
      reset(): void
    }
  }
}
