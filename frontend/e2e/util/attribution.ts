import type { TestInfo } from '@playwright/test'

/* WHERE A BROWSER FAILURE ACTUALLY LIVES.
 *
 * Every Playwright annotation this branch has ever produced -- 49 of them --
 * named `composed-renderer.spec.ts`. That is where the ASSERTION is. It is
 * never where the DEFECT is. A clipped chart annotated the spec line that
 * measured the clipping, and finding ChartPanel.tsx meant reading the contract
 * registry by hand, every single time.
 *
 * The DOM already knows: LessonRenderer stamps `data-renderer` on every block
 * with the key the contract resolved. This maps that key to the file, and
 * `attribute()` hands it to the reporter through Playwright's own annotation
 * API, so the ::error lands on the panel that drew the pixels.
 *
 * KEPT HONEST BY A TEST. `renderers.parity.spec` asserts this map's keys equal
 * `rendererKeys()` exactly, so adding a renderer without adding its path is a
 * failure rather than a silent fallback to the spec line.
 */

export const RENDERER_SOURCE: Record<string, string> = {
  TextPanel: 'frontend/src/canvas/panels/TextPanel.tsx',
  TablePanel: 'frontend/src/canvas/panels/TablePanelAdapter.tsx',
  ChartPanel: 'frontend/src/canvas/panels/ChartPanel.tsx',
  EquationPanel: 'frontend/src/canvas/panels/EquationPanelAdapter.tsx',
  DiagramPanel: 'frontend/src/canvas/panels/DiagramPanel.tsx',
  SimulationPanel: 'frontend/src/canvas/panels/SimulationPanel.tsx',
}

/** Where a block with no renderer, or an unknown one, is decided. */
export const RENDERER_FALLBACK = 'frontend/src/canvas/renderer/LessonRenderer.tsx'

export function sourceForRenderer(key: string | null | undefined): string {
  return (key && RENDERER_SOURCE[key]) || RENDERER_FALLBACK
}

/** One suspected source file, as the reporter reads it. */
export const SOURCE_ANNOTATION = 'canvas-source'

/**
 * Name the files a failure implicates, so the reporter can annotate THEM.
 *
 * Call it before the assertion, not after: a failed `expect` throws, and an
 * attribution added after the throw never runs. Adding it unconditionally is
 * correct and free -- the reporter only reads attributions from tests that
 * actually failed.
 */
export function attribute(testInfo: TestInfo, rendererKeys: Iterable<string | null | undefined>): void {
  const files = new Set<string>()
  for (const key of rendererKeys) files.add(sourceForRenderer(key))
  for (const file of [...files].sort()) {
    testInfo.annotations.push({ type: SOURCE_ANNOTATION, description: file })
  }
}

/**
 * Name source files directly, for a failure no renderer key can locate.
 *
 * `attribute()` resolves the panel that drew the pixels, which is the right
 * answer when the drawing is wrong. It is the wrong answer when the DATA is
 * wrong: the gas lesson's chart carried `data: []`, and the block that
 * "failed" was ChartPanel correctly refusing to plot nothing. Annotating
 * ChartPanel would have sent a reader to a file with no bug in it.
 *
 * Deliberately not merged into `attribute()`. That function's contract is
 * "renderer key in, panel file out", and `renderers.parity.spec` holds its map
 * exactly equal to the registry's keys. Accepting free-form paths there would
 * make the map's completeness unprovable.
 */
export function attributeFiles(testInfo: TestInfo, files: readonly string[]): void {
  for (const file of [...new Set(files)].sort()) {
    testInfo.annotations.push({ type: SOURCE_ANNOTATION, description: file })
  }
}
