import type { Page, TestInfo } from '@playwright/test'

/* CPU THROTTLING — the mobile profile's teeth.
 *
 * A 375×800 viewport on a desktop CPU is a phone-shaped lie: the layout is
 * mobile, the machine is not. The spec asks for a 4× CPU-throttled mobile
 * profile, so the mobile project applies one through CDP and every metric it
 * produces is tagged with the rate that produced it.
 *
 * This is emulation, not a device. Nothing here may be reported as real-device
 * evidence; the report writes syntheticTouch and cpuThrottle beside the
 * numbers so a reader cannot mistake one for the other.
 */

export const MOBILE_CPU_THROTTLE = 4

/** Apply the project's CPU throttle, if it declares one. Returns the rate. */
export async function applyProjectThrottle(page: Page, testInfo: TestInfo): Promise<number> {
  const meta = testInfo.project.metadata as { cpuThrottle?: number } | undefined
  const rate = meta?.cpuThrottle ?? 1
  if (rate <= 1) return 1
  try {
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate })
    return rate
  } catch {
    /* A browser without CDP cannot be throttled. Say so by returning 1 so the
     * report never claims a throttle that was not applied. */
    return 1
  }
}

/** Describe the run conditions for the report. */
export function runConditions(testInfo: TestInfo, appliedThrottle: number) {
  const meta = testInfo.project.metadata as { syntheticTouch?: boolean } | undefined
  return {
    project: testInfo.project.name,
    viewport: testInfo.project.use.viewport ?? null,
    reducedMotion: testInfo.project.use.reducedMotion ?? 'no-preference',
    hasTouch: Boolean(testInfo.project.use.hasTouch),
    syntheticTouch: Boolean(meta?.syntheticTouch),
    cpuThrottle: appliedThrottle,
    realDevice: false,
  }
}
