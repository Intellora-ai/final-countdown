/* DEV-ONLY INSTRUMENTATION — measurements, or it did not happen.
 *
 * Every mark the product correction names is emitted through here. In
 * production builds the module compiles to no-ops (import.meta.env.DEV is
 * statically false and Vite drops the branches), so the instrument cannot
 * slow down the thing it measures where it matters.
 *
 * The collector keeps raw samples so percentiles are computed from data, not
 * asserted. window.__boardPerf is the proof harness's window into it.
 */

export type MarkName =
  | 'canvas-route-start' | 'shell-visible' | 'session-start'
  | 'step-request-start' | 'first-reveal' | 'step-reveal-complete'
  | 'checkpoint-visible' | 'continue-click' | 'clarification-click'
  | 'next-step-visible' | 'camera-input' | 'camera-frame'
  /* Phase 7 — camera interaction and focus transitions. */
  | 'focus-transition' | 'select-input' | 'reset-input'

/* No vite/client type lib is wired into this tsconfig, so the env probe is
 * defensive: Vite statically replaces import.meta.env.DEV, and the cast keeps
 * the compiler out of an argument it cannot win. */
const DEV: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

interface PerfStore {
  samples: Record<string, number[]>
  add(name: string, ms: number): void
  report(): Record<string, { count: number; p50: number; p75: number; p95: number }>
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

function makeStore(): PerfStore {
  return {
    samples: {},
    add(name, ms) {
      (this.samples[name] ??= []).push(ms)
      if (this.samples[name].length > 2000) this.samples[name].shift()
    },
    report() {
      const out: ReturnType<PerfStore['report']> = {}
      for (const [name, raw] of Object.entries(this.samples) as Array<[string, number[]]>) {
        const s = [...raw].sort((a, b) => a - b)
        out[name] = { count: s.length, p50: percentile(s, 50), p75: percentile(s, 75), p95: percentile(s, 95) }
      }
      return out
    },
  }
}

declare global {
  interface Window { __boardPerf?: PerfStore }
}

function store(): PerfStore | null {
  if (!DEV || typeof window === 'undefined') return null
  return (window.__boardPerf ??= makeStore())
}

export function mark(name: MarkName): void {
  if (!DEV || typeof performance === 'undefined') return
  performance.mark(name)
}

/** Measure from a named mark to now; records the duration sample. */
export function measureFrom(start: MarkName, label: string): void {
  if (!DEV || typeof performance === 'undefined') return
  const entries = performance.getEntriesByName(start, 'mark')
  const last = entries[entries.length - 1]
  if (!last) return
  const ms = performance.now() - last.startTime
  store()?.add(label, ms)
}

/* The harness needs JS work bucketed PER FRAME, which no per-handler sample
 * can answer on its own. Rather than have the harness guess by re-reading the
 * percentile store, every sample is forwarded to an optional sink that the
 * harness installs; it sums the handler durations inside the current frame and
 * closes the bucket on the next rAF. One sample stream, two readers. */
type SampleSink = (label: string, ms: number) => void
let sampleSink: SampleSink | null = null

/** DEV-only: install (or clear) the harness's sample sink. */
export function setSampleSink(next: SampleSink | null): void {
  if (!DEV) return
  sampleSink = next
}

/** Record a raw duration sample (frame times, handler times). */
export function sample(label: string, ms: number): void {
  if (!DEV) return
  store()?.add(label, ms)
  sampleSink?.(label, ms)
}

/** Read percentiles for one label without going through window. */
export function report(): Record<string, { count: number; p50: number; p75: number; p95: number }> {
  return store()?.report() ?? {}
}
