/* THE PROOF HARNESS BRIDGE — DEV-only, and the only thing the browser specs
 * are allowed to read.
 *
 * The Phases 4–7 gates name camelCase metrics. This module is where those
 * names are computed, once, from real evidence — so a spec asserts a number
 * rather than re-deriving one, and two specs cannot disagree about what
 * "missed frame" means.
 *
 * MEASUREMENT HONESTY, STATED SO IT CANNOT DRIFT:
 *
 *   frameInterval*   Time BETWEEN consecutive animation-frame callbacks during
 *                    an explicit recording window. This is frame time.
 *   jsWork*          Sum of instrumented handler durations that occurred
 *                    inside one frame. This is JavaScript callback time. It is
 *                    NOT frame time, is never reported as frame time, and is
 *                    smaller than frameInterval by construction.
 *   missedFrame*     An interval longer than 1.5× the observed median
 *                    interval. The median is the refresh period the machine
 *                    actually delivered, which is the only refresh rate we can
 *                    honestly claim to know. framesOver16_7ms is reported
 *                    alongside as the spec-literal 60Hz count, because on a
 *                    120Hz display those two numbers are legitimately
 *                    different and hiding either one would flatter the report.
 *
 * Everything here compiles to no-ops in production: import.meta.env.DEV is
 * statically false, so the bridge cannot be attached by a page we ship.
 */
import { report, sample, setSampleSink } from './marks'

const DEV: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

/* Handler-duration sample labels that count as JavaScript work inside a frame.
 * A label not on this list is a latency measurement, not frame work, and
 * summing it into jsWork would inflate the number we most want to be true. */
const JS_WORK_LABELS = new Set([
  'camera-frame-js',
  'pan-handler-js',
  'selection-js',
  'minimap-frame-js',
  'connector-measure-js',
])

export interface HarnessPlacement {
  stepId: string
  x: number
  y: number
  width: number
  height: number
  measured: boolean
}

/** What the board tells the harness about itself. All getters, no state copy. */
export interface HarnessBoardRegistration {
  /** Ids of steps the session has RELEASED. Anything rendered but absent from
   * this list is, by definition, a future step that leaked into the tree. */
  getReleasedStepIds: () => string[]
  /** Blocks belonging to released steps, with their declared types. */
  getReleasedBlocks: () => Array<{ id: string; type: string }>
  /** Steps fetched but not released. The spec allows at most one. */
  getPrefetchedStepCount: () => number
  /** World placement rects, for layout/culling assertions. */
  getPlacements: () => HarnessPlacement[]
  /** Session status string, for waiting on a checkpoint. */
  getStatus: () => string
  /** Advance past the current checkpoint. */
  continueNext: () => void
  /** Block types the registry knows how to render. */
  registeredBlockTypes: readonly string[]
}

export interface CanvasMetrics {
  /* Frame + JS work (see the honesty note above). */
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

  /* Interaction latency. */
  cameraInputToNextPaintP50: number
  cameraInputToNextPaintP95: number
  frontendEventToFirstRevealP50: number
  frontendEventToFirstRevealP95: number

  /* AI latency — provider and frontend reported separately, never summed.
   * Zero count means "not measured in this run", not "fast". */
  aiProviderFirstEventP50: number
  aiProviderFirstEventP95: number
  aiProviderFirstEventCount: number
  aiFirstVisibleStepP50: number
  aiFirstVisibleStepP95: number
  aiFirstVisibleStepCount: number

  /* Loading invariants. */
  mountedBlockCount: number
  mountedFutureBlockCount: number
  futureImageRequestCount: number
  futureChartSvgCount: number
  futureSimulationCount: number
  prefetchedStepCount: number

  /* Safety invariants. */
  unsafeHtmlRendered: number
  unsafeCssRendered: number
  arbitraryComponentExecution: number
  duplicateActionApplication: number

  /* Provenance — the report must never imply a build it did not measure. */
  buildMode: 'development' | 'production'
  syntheticTouch: boolean
}

export interface BoardHarness {
  startRecording(): void
  stopRecording(): void
  metrics(): CanvasMetrics
  placements(): HarnessPlacement[]
  status(): string
  /** Press Continue until the lesson completes or the cap is hit. Resolves
   * with the number of steps released. Used by capacity specs; it drives the
   * real control, so it cannot reveal anything a learner could not. */
  fastForward(maxSteps?: number): Promise<number>
  /** Percentile report for any raw sample label. */
  raw(): Record<string, { count: number; p50: number; p75: number; p95: number }>
  reset(): void
}

declare global {
  interface Window { __boardHarness?: BoardHarness }
}

/* ── frame + JS-work recorder ─────────────────────────────────────────────── */

let recording = false
let rafId = 0
let lastFrameTs = 0
let frameIntervals: number[] = []
let jsWorkPerFrame: number[] = []
let frameAccumulator = 0

function onFrame(ts: number): void {
  if (!recording) return
  if (lastFrameTs) {
    frameIntervals.push(ts - lastFrameTs)
    /* Close the bucket: everything sampled since the previous frame is the
     * JavaScript work that happened inside this one. */
    jsWorkPerFrame.push(frameAccumulator)
    frameAccumulator = 0
  }
  lastFrameTs = ts
  rafId = requestAnimationFrame(onFrame)
}

function sink(label: string, ms: number): void {
  if (recording && JS_WORK_LABELS.has(label)) frameAccumulator += ms
}

function percentileOf(values: number[], p: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)
  return s[Math.max(0, idx)]
}

function median(values: number[]): number {
  return percentileOf(values, 50)
}

/* ── counters the product increments ─────────────────────────────────────── */

let arbitraryComponentExecution = 0

/** Called if anything ever resolves a component from untrusted payload data.
 * Nothing calls it today, which is the point: the number is a measured zero
 * with a real trigger behind it, not an asserted zero. */
export function noteArbitraryComponent(_type: string): void {
  if (!DEV) return
  arbitraryComponentExecution += 1
}

/* ── image-request accounting ────────────────────────────────────────────── */

let imageResourceUrls: string[] = []
let imageObserver: PerformanceObserver | null = null

function startImageObserver(): void {
  if (!DEV || typeof PerformanceObserver === 'undefined' || imageObserver) return
  try {
    imageObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceResourceTiming
        if (e.initiatorType === 'img' || e.initiatorType === 'image') imageResourceUrls.push(e.name)
      }
    })
    imageObserver.observe({ type: 'resource', buffered: true })
  } catch {
    /* No resource timing here; the DOM audit below still runs. */
    imageObserver = null
  }
}

/* ── DOM audits ──────────────────────────────────────────────────────────── */

const UNSAFE_TAGS = 'script, iframe, object, embed, applet, form[action^="http"]'

/* Inline styles the PRODUCT sets, each traced to the component that sets it.
 * Everything else inside the world is content dictating presentation, which is
 * what the trust model forbids — so this list stays short, and a new entry
 * requires knowing which component added it and why.
 *
 *   left/top/width/height  BoardView WorldStep — world placement, which is
 *                          geometry the layout owns and CSS cannot express.
 *   --camera-*             useCamera — the transform written per frame.
 *   pointer-events         DiagramBlock foreignObject — keeps node labels from
 *                          swallowing the camera's drag.
 *   flex                   BoardStates skeleton — loading placeholder ratios.
 *
 * Note what is NOT here: colour, background, font, transform, position,
 * display, z-index. If content ever smuggles one of those through, this
 * counter rises and the invariant fails, which is the entire point. */
const ALLOWED_STYLE_PROPS = new Set([
  'left', 'top', 'width', 'height',
  '--camera-x', '--camera-y', '--camera-zoom',
  'pointer-events',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis',
])

function worldEl(): HTMLElement | null {
  return document.querySelector('[data-board="world"]')
}

function auditUnsafeHtml(root: HTMLElement | null): number {
  if (!root) return 0
  let count = root.querySelectorAll(UNSAFE_TAGS).length
  /* Inline event handlers: the attribute existing at all is the violation. */
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) count += 1
      if (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) count += 1
      if (attr.name === 'src' && attr.value.trim().toLowerCase().startsWith('javascript:')) count += 1
    }
  }
  return count
}

function auditUnsafeCss(root: HTMLElement | null): number {
  if (!root) return 0
  let count = 0
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const style = (el as HTMLElement).style
    for (let i = 0; i < style.length; i += 1) {
      if (!ALLOWED_STYLE_PROPS.has(style.item(i))) count += 1
    }
  }
  /* A <style> tag inside the world is content shipping a stylesheet. */
  count += root.querySelectorAll('style').length
  return count
}

interface StepAudit {
  mountedBlockCount: number
  futureBlockCount: number
  futureChartSvgCount: number
  futureSimulationCount: number
  futureImageSrcs: string[]
}

function auditSteps(releasedIds: Set<string>): StepAudit {
  const root = worldEl()
  const out: StepAudit = {
    mountedBlockCount: 0,
    futureBlockCount: 0,
    futureChartSvgCount: 0,
    futureSimulationCount: 0,
    futureImageSrcs: [],
  }
  if (!root) return out
  for (const step of Array.from(root.querySelectorAll('[data-board="world-step"]'))) {
    const stepId = (step as HTMLElement).dataset.stepId ?? ''
    const cells = step.querySelectorAll('[data-board="cell"]')
    out.mountedBlockCount += cells.length
    /* A step element whose id the session never released is a future step in
     * the tree — every block inside it is mounted early. */
    if (stepId && !releasedIds.has(stepId)) {
      out.futureBlockCount += cells.length
      /* Selectors matched against what the blocks actually emit today:
       * charts wrap their <svg> in [data-board="chart"], the particle box
       * renders [data-board="sim"]. Asserting an attribute the product does
       * not set would produce a zero that means nothing. */
      out.futureChartSvgCount += step.querySelectorAll('[data-board="chart"] svg').length
      out.futureSimulationCount += step.querySelectorAll('[data-board="sim"]').length
      for (const img of Array.from(step.querySelectorAll('img'))) {
        out.futureImageSrcs.push((img as HTMLImageElement).getAttribute('src') ?? '')
      }
    }
  }
  return out
}

/* ── registration + install ──────────────────────────────────────────────── */

let registration: HarnessBoardRegistration | null = null

/** DEV-only: the board hands the harness its getters. Returns an unregister. */
export function registerBoardHarness(reg: HarnessBoardRegistration): () => void {
  if (!DEV) return () => {}
  registration = reg
  install()
  return () => { if (registration === reg) registration = null }
}

function emptyMetrics(): CanvasMetrics {
  return {
    jsWorkP50: 0, jsWorkP75: 0, jsWorkP95: 0,
    frameIntervalP50: 0, frameIntervalP75: 0, frameIntervalP95: 0,
    missedFrameCount: 0, missedFrameRate: 0, framesOver16_7ms: 0,
    frameBudgetMs: 0, framesRecorded: 0,
    cameraInputToNextPaintP50: 0, cameraInputToNextPaintP95: 0,
    frontendEventToFirstRevealP50: 0, frontendEventToFirstRevealP95: 0,
    aiProviderFirstEventP50: 0, aiProviderFirstEventP95: 0, aiProviderFirstEventCount: 0,
    aiFirstVisibleStepP50: 0, aiFirstVisibleStepP95: 0, aiFirstVisibleStepCount: 0,
    mountedBlockCount: 0, mountedFutureBlockCount: 0,
    futureImageRequestCount: 0, futureChartSvgCount: 0, futureSimulationCount: 0,
    prefetchedStepCount: 0,
    unsafeHtmlRendered: 0, unsafeCssRendered: 0,
    arbitraryComponentExecution: 0, duplicateActionApplication: 0,
    buildMode: DEV ? 'development' : 'production',
    syntheticTouch: false,
  }
}

function computeMetrics(): CanvasMetrics {
  const m = emptyMetrics()
  const raw = report()

  const refresh = median(frameIntervals)
  const budget = refresh > 0 ? refresh * 1.5 : 0
  m.frameBudgetMs = budget
  m.framesRecorded = frameIntervals.length
  m.frameIntervalP50 = percentileOf(frameIntervals, 50)
  m.frameIntervalP75 = percentileOf(frameIntervals, 75)
  m.frameIntervalP95 = percentileOf(frameIntervals, 95)
  m.missedFrameCount = budget > 0 ? frameIntervals.filter((v) => v > budget).length : 0
  m.missedFrameRate = frameIntervals.length ? m.missedFrameCount / frameIntervals.length : 0
  m.framesOver16_7ms = frameIntervals.filter((v) => v > 16.7).length

  m.jsWorkP50 = percentileOf(jsWorkPerFrame, 50)
  m.jsWorkP75 = percentileOf(jsWorkPerFrame, 75)
  m.jsWorkP95 = percentileOf(jsWorkPerFrame, 95)

  const camera = raw['camera-input-to-paint']
  if (camera) { m.cameraInputToNextPaintP50 = camera.p50; m.cameraInputToNextPaintP95 = camera.p95 }
  const reveal = raw['event-to-first-reveal']
  if (reveal) { m.frontendEventToFirstRevealP50 = reveal.p50; m.frontendEventToFirstRevealP95 = reveal.p95 }
  const aiProvider = raw['ai-provider-first-event']
  if (aiProvider) {
    m.aiProviderFirstEventP50 = aiProvider.p50
    m.aiProviderFirstEventP95 = aiProvider.p95
    m.aiProviderFirstEventCount = aiProvider.count
  }
  const aiVisible = raw['ai-first-visible-step']
  if (aiVisible) {
    m.aiFirstVisibleStepP50 = aiVisible.p50
    m.aiFirstVisibleStepP95 = aiVisible.p95
    m.aiFirstVisibleStepCount = aiVisible.count
  }

  const releasedIds = registration?.getReleasedStepIds() ?? []
  const releasedSet = new Set(releasedIds)
  const audit = auditSteps(releasedSet)
  m.mountedBlockCount = audit.mountedBlockCount
  m.mountedFutureBlockCount = audit.futureBlockCount
  m.futureChartSvgCount = audit.futureChartSvgCount
  m.futureSimulationCount = audit.futureSimulationCount
  m.prefetchedStepCount = registration?.getPrefetchedStepCount() ?? 0

  /* An image request counts as "future" when nothing released asked for it.
   * Released fixtures use data: URIs, which never become resource entries, so
   * any network image at all is already suspicious — but the comparison is
   * done against released srcs rather than assumed, so a legitimate released
   * network image would not be miscounted. */
  const releasedImgSrcs = new Set(
    Array.from(document.querySelectorAll('[data-board="world-step"] img'))
      .filter((img) => {
        const step = (img as HTMLElement).closest('[data-board="world-step"]') as HTMLElement | null
        const id = step?.dataset.stepId ?? ''
        return id !== '' && releasedSet.has(id)
      })
      .map((img) => (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src),
  )
  m.futureImageRequestCount =
    imageResourceUrls.filter((url) => !releasedImgSrcs.has(url)).length + audit.futureImageSrcs.length

  const root = worldEl()
  m.unsafeHtmlRendered = auditUnsafeHtml(root)
  m.unsafeCssRendered = auditUnsafeCss(root)

  /* A block whose declared type is neither registered nor the explicit
   * unknown placeholder would mean something outside the registry rendered. */
  const known = new Set(registration?.registeredBlockTypes ?? [])
  const foreign = (registration?.getReleasedBlocks() ?? []).filter(
    (b) => !known.has(b.type) && b.type !== 'unknown',
  ).length
  m.arbitraryComponentExecution = arbitraryComponentExecution + foreign

  /* The same step id released twice means one teaching action was applied
   * twice — the duplicate the spec forbids. */
  m.duplicateActionApplication = releasedIds.length - new Set(releasedIds).size

  return m
}

function install(): void {
  if (!DEV || typeof window === 'undefined') return
  if (window.__boardHarness) return
  setSampleSink(sink)
  startImageObserver()
  window.__boardHarness = {
    startRecording() {
      frameIntervals = []
      jsWorkPerFrame = []
      frameAccumulator = 0
      lastFrameTs = 0
      recording = true
      if (!rafId) rafId = requestAnimationFrame(onFrame)
    },
    stopRecording() {
      recording = false
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    },
    metrics: computeMetrics,
    placements: () => registration?.getPlacements() ?? [],
    status: () => registration?.getStatus() ?? 'unregistered',
    async fastForward(maxSteps = 600) {
      const reg = registration
      if (!reg) return 0
      let guard = 0
      while (guard < maxSteps) {
        const status = reg.getStatus()
        if (status === 'complete' || status === 'error') break
        if (status === 'checkpoint') { reg.continueNext(); guard += 1 }
        await new Promise((r) => setTimeout(r, 0))
      }
      return reg.getReleasedStepIds().length
    },
    raw: () => report(),
    reset() {
      frameIntervals = []
      jsWorkPerFrame = []
      frameAccumulator = 0
      lastFrameTs = 0
      imageResourceUrls = []
      arbitraryComponentExecution = 0
    },
  }
}

/** Record one input→paint latency. Kept here so the double-rAF rule lives
 * beside the metric that depends on it: the first frame is when the work is
 * scheduled, the second is when the compositor has shown it. Measuring the
 * handler alone would report a number that no learner ever experiences.
 *
 * Every caller passes the timestamp of the INPUT, not of the handler's end. */
export function sampleInputToPaint(inputTs: number, label = 'camera-input-to-paint'): void {
  if (!DEV) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sample(label, performance.now() - inputTs)
    })
  })
}

/** The camera's own input→paint channel — the name the metrics map reads. */
export function sampleCameraInputToPaint(inputTs: number): void {
  sampleInputToPaint(inputTs, 'camera-input-to-paint')
}
