import type { Page, TestInfo } from '@playwright/test'

/* THE PROJECT THAT DECLARED A PREFERENCE AND NEVER APPLIED IT.
 *
 * playwright.config.ts declares a `reduced-motion` project with
 * `use: { ..., reducedMotion: 'reduce' }`. Measured in Playwright 1.62.1, that
 * option does not reach the page the `page` fixture hands the test:
 *
 *   project.use.reducedMotion            'reduce'      <- declared
 *   matchMedia(...).matches on the page  false         <- not applied
 *   page.emulateMedia({reducedMotion})   true          <- works
 *   browser.newContext({reducedMotion})  true          <- works
 *
 * So the reduced-motion project was running as a second copy of desktop-1440.
 * Every assertion in it passed for the same reason the desktop ones did, and
 * the accessibility dimension it exists to cover was never exercised. That is
 * worse than not having the project: a green row in the matrix reads as
 * evidence, and there was none behind it.
 *
 * It also hid a real product defect. `viewport.reducedMotion` is read twice by
 * the simulation contract -- `fitness` drops to 0.4, `derive` chooses a 2D
 * stage, stops animation and sets particles to zero -- and nothing in
 * production ever wrote it. With the project silently not emulating, no
 * browser test could have caught that. Both are fixed: LessonRenderer now
 * subscribes to prefers-reduced-motion, and this helper makes the emulation
 * real.
 *
 * Called from each spec's open helper BEFORE navigation, because the contract
 * reads the preference during the first render and a preference applied after
 * paint would test the resize path instead of the initial one.
 */
export async function applyProjectMedia(page: Page, testInfo: TestInfo): Promise<void> {
  const declared = testInfo.project.use.reducedMotion
  if (declared) await page.emulateMedia({ reducedMotion: declared })
}

/** What the project asked for, for tests that must branch on it. */
export function prefersReducedMotion(testInfo: TestInfo): boolean {
  return testInfo.project.use.reducedMotion === 'reduce'
}
