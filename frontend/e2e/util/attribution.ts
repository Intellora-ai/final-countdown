import type { TestInfo } from '@playwright/test'

/* WHERE A BROWSER FAILURE ACTUALLY LIVES.
 *
 * Every Playwright annotation this branch has ever produced -- 49 of them --
 * named `composed-renderer.spec.ts`. That is where the ASSERTION is. It is
 * never where the DEFECT is. A clipped chart annotated the spec line that
 * measured the clipping, and finding the renderer meant reading the dispatch
 * table by hand, every single time.
 *
 * The DOM already knows: `BlockView` stamps `data-kind` on every block it
 * paints, and that attribute IS the dispatch key -- `BlockView`'s switch is
 * exhaustive on it, with a `never` in the default arm. This maps that key to
 * the file that draws it, and `attribute()` hands the result to the reporter
 * through Playwright's own annotation API, so the ::error lands on the module
 * that produced the pixels.
 *
 * WHAT THIS MAP USED TO SAY, AND WHY IT WAS WORTHLESS.
 * ---------------------------------------------------
 * It keyed on `data-renderer` -- a `TextPanel` / `ChartPanel` / `SimulationPanel`
 * vocabulary -- and named six files under `src/canvas/panels/`. That whole
 * directory is gone with the hand-positioned canvas it belonged to. Six of six
 * paths pointed at nothing, so every attribution silently degraded to the
 * fallback and the reporter went back to naming the spec. A map of dead paths
 * is worse than no map: it fails without saying so.
 *
 * KEPT HONEST BY A TEST, FOR REAL THIS TIME. The previous version of this
 * comment cited `renderers.parity.spec`, which does not exist in this
 * repository and cannot be found in its history -- the claim that something
 * held the map to the registry was itself unbacked. `composed-renderer.spec.ts`
 * now carries two checks that are real: every `data-kind` the running canvas
 * emits has an entry here, and every path this file names exists on disk.
 */

/**
 * Block kind -> the module that draws it.
 *
 * Four kinds share `BlockView.tsx` because that file draws them inline rather
 * than delegating: prose, callout, metric and equation are a paragraph, a
 * bordered paragraph, a number and a KaTeX host respectively, and none of them
 * earned a module. Pointing all four at the same file is the truth, not a
 * shortcut.
 */
export const RENDERER_SOURCE: Record<string, string> = {
  prose: 'frontend/src/canvas/render/BlockView.tsx',
  callout: 'frontend/src/canvas/render/BlockView.tsx',
  metric: 'frontend/src/canvas/render/BlockView.tsx',
  equation: 'frontend/src/canvas/render/BlockView.tsx',
  flow: 'frontend/src/canvas/render/FlowView.tsx',
  chart: 'frontend/src/canvas/render/ChartView.tsx',
  table: 'frontend/src/canvas/render/TableView.tsx',
  simulation: 'frontend/src/canvas/render/SimulationView.tsx',
  /* All 137 named representations arrive as one kind. `FigureView` resolves the
     name to a shape and hands it to one of `render/shapes/`; which shape is not
     in the DOM, so this is as precise as an attribution can honestly be. */
  figure: 'frontend/src/canvas/render/FigureView.tsx',
  /* The teaching-shape kinds. All three are drawn by `BlockView` itself, like
     prose and callout — they are structured text, not a chart engine.

     They were added to the schema and to the renderer without arriving here,
     and the gap is exactly what this map exists to prevent: a kind with no
     entry falls through to `RENDERER_FALLBACK`, so every failure in a
     misconception, a summary or a derivation was attributed to `TeachView`
     rather than to the file that drew it. Nothing failed until a lesson
     actually used one. */
  misconception: 'frontend/src/canvas/render/BlockView.tsx',
  summary: 'frontend/src/canvas/render/BlockView.tsx',
  reasoning: 'frontend/src/canvas/render/BlockView.tsx',
}

/**
 * Where an element that belongs to no block was placed.
 *
 * The teaching view owns everything outside a `.lc-block`: the question, the
 * grid the blocks sit in, the checkpoint, and the answer surface a doubt
 * renders into. A failure with no `data-kind` under it is that view's.
 */
export const RENDERER_FALLBACK = 'frontend/src/canvas/teach/TeachView.tsx'

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
export function attribute(testInfo: TestInfo, blockKinds: Iterable<string | null | undefined>): void {
  const files = new Set<string>()
  for (const key of blockKinds) files.add(sourceForRenderer(key))
  for (const file of [...files].sort()) {
    testInfo.annotations.push({ type: SOURCE_ANNOTATION, description: file })
  }
}

/**
 * Name source files directly, for a failure no block kind can locate.
 *
 * `attribute()` resolves the module that drew the pixels, which is the right
 * answer when the drawing is wrong. It is the wrong answer when the DATA is
 * wrong: a chart carrying `data: []` produces a block that "failed" only
 * because the chart contract correctly refused to plot nothing. Annotating
 * `ChartView` would have sent a reader to a file with no bug in it.
 *
 * Deliberately not merged into `attribute()`. That function's contract is
 * "block kind in, renderer file out", and the parity check in
 * `composed-renderer.spec.ts` holds its keys against what the canvas actually
 * emits. Accepting free-form paths there would make that check meaningless.
 */
export function attributeFiles(testInfo: TestInfo, files: readonly string[]): void {
  for (const file of [...new Set(files)].sort()) {
    testInfo.annotations.push({ type: SOURCE_ANNOTATION, description: file })
  }
}

/** One error the PAGE raised, as the reporter reads it. */
export const CAUSE_ANNOTATION = 'canvas-cause'

/**
 * Carry the browser's own error out to the annotation.
 *
 * THE GAP THIS CLOSES. Two specs already listened for `pageerror` and console
 * errors and pushed them into local arrays, used only for in-test assertions.
 * So when React threw and unmounted a subtree, the assertion that ran next
 * reported a perfectly truthful `Received: 0`, GitHub printed that, and the
 * actual `TypeError` sat in an array inside a runner that had already exited.
 *
 * The reader was shown the consequence and never the cause.
 *
 * Deliberately separate from `attribute()` and `attributeFiles()`. Those answer
 * WHERE to look; this answers WHAT WENT WRONG, and merging them would let a
 * cause be mistaken for a file path by anything reading the annotations.
 */
export function attachCause(
  testInfo: TestInfo,
  kind: 'pageerror' | 'console' | 'network',
  text: string,
): void {
  const trimmed = text.trim()
  /* An empty cause would print `WHY crashed — ` and claim a crash it cannot
     describe. Nothing is better than a label with no evidence under it. */
  if (trimmed === '') return
  testInfo.annotations.push({ type: CAUSE_ANNOTATION, description: `${kind}: ${trimmed}` })
}
