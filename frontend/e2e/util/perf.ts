import type { Page } from '@playwright/test'
import { startRecording, stopRecording } from './bridge'

/* SCRIPTED GESTURES — the same motion every run, so a p95 comparison across
 * runs is a comparison of the product rather than of how the mouse moved.
 *
 * Real pointer events through Playwright's input pipeline, not synthetic
 * dispatches: a JS-dispatched PointerEvent would skip the browser's own hit
 * testing and compositor path, which is most of what these numbers measure.
 */

export interface DragOptions {
  /** Steps in the drag; more steps means more pointermove events. */
  steps?: number
  /** Distance in CSS pixels. */
  dx?: number
  dy?: number
}

/** Drag the world from the middle of the viewport. Returns after pointerup. */
export async function dragCamera(page: Page, opts: DragOptions = {}): Promise<void> {
  const { steps = 24, dx = 320, dy = 180 } = opts
  const viewport = page.locator('[data-board="viewport"]')
  const box = await viewport.boundingBox()
  if (!box) throw new Error('viewport has no box — cannot drag')

  /* Start away from the centre so the press lands on empty board rather than
   * on a step's interactive content, which would suppress the pan. */
  const startX = box.x + box.width * 0.2
  const startY = box.y + box.height * 0.8

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy, { steps })
  await page.mouse.up()
}

/** Wheel-zoom over the viewport centre, alternating in and out. */
export async function wheelZoom(page: Page, ticks = 8): Promise<void> {
  const viewport = page.locator('[data-board="viewport"]')
  const box = await viewport.boundingBox()
  if (!box) throw new Error('viewport has no box — cannot zoom')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, i % 2 === 0 ? -120 : 120)
    await page.waitForTimeout(40)
  }
}

/** Record frames across a scripted interaction. */
export async function recordDuring(page: Page, action: () => Promise<void>): Promise<void> {
  await startRecording(page)
  try {
    await action()
    /* Let the last frames land before the recorder closes; without this the
     * final interval is truncated and the p95 flatters itself. */
    await page.waitForTimeout(200)
  } finally {
    await stopRecording(page)
  }
}

/** A camera exercise long enough for percentiles to mean something. */
export async function exerciseCamera(page: Page): Promise<void> {
  await recordDuring(page, async () => {
    await dragCamera(page, { dx: 340, dy: 200, steps: 30 })
    await dragCamera(page, { dx: -300, dy: -160, steps: 30 })
    await wheelZoom(page, 6)
    await dragCamera(page, { dx: 220, dy: -140, steps: 24 })
  })
}
