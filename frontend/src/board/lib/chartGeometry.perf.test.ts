import { describe, it, expect } from 'vitest'
import { pieArcs, linearScale, ticks, linePath, baseline } from './chartGeometry'

/* THE CHART GEOMETRY BUDGET — 20ms p95 for 100 data points.
 *
 * The real cost of this arithmetic is measured in microseconds, so the spec's
 * 20ms budget carries roughly a thousandfold margin and CI noise cannot cross
 * it. That is precisely why the assertion is hard rather than advisory: it can
 * only fail if someone makes the geometry algorithmically worse — an O(n²)
 * tick loop, string building inside a hot path, an accidental sort per point.
 * A budget that only logs would let that land quietly.
 *
 * If a pathological runner ever trips this, raise SAMPLES first (more samples,
 * tighter percentile) before touching the threshold. Moving the threshold to
 * make a red test green is how a budget stops meaning anything.
 *
 * Data is formula-derived, never random: the same work every run, so a
 * regression is a change in the code rather than a change in the input.
 */

const POINTS = 100
const WARMUP = 10
const SAMPLES = 200
const BUDGET_MS = 20

/* Chart canvas dimensions, matching what the components actually use. */
const W = 460, H = 240, PAD_L = 46, PAD_R = 16, PAD_T = 14, PAD_B = 34

const values = Array.from({ length: POINTS }, (_, i) => 10 + ((i * 37) % 90))
const xs = Array.from({ length: POINTS }, (_, i) => i * 3)
const ys = Array.from({ length: POINTS }, (_, i) => Math.sin(i / 7) * 50 + 60)

function p95(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)
  return s[Math.max(0, idx)]
}

/** Run `work` WARMUP times untimed, then SAMPLES times timed. */
function measure(work: () => void): { p50: number; p95: number; max: number } {
  for (let i = 0; i < WARMUP; i += 1) work()
  const samples: number[] = []
  for (let i = 0; i < SAMPLES; i += 1) {
    const t0 = performance.now()
    work()
    samples.push(performance.now() - t0)
  }
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    p50: sorted[Math.floor(sorted.length / 2)],
    p95: p95(samples),
    max: sorted[sorted.length - 1],
  }
}

describe('chart geometry stays inside its budget at 100 points', () => {
  it(`computes a 100-segment ring under ${BUDGET_MS}ms at p95`, () => {
    const r = measure(() => { pieArcs(values, 110, 110, 88, 56) })
    expect(r.p95).toBeLessThanOrEqual(BUDGET_MS)
  })

  it(`computes a 100-point line under ${BUDGET_MS}ms at p95`, () => {
    const r = measure(() => {
      const x = linearScale(Math.min(...xs), Math.max(...xs), PAD_L, W - PAD_R)
      const lo = Math.min(0, ...ys), hi = Math.max(...ys)
      const y = linearScale(lo, hi, H - PAD_B, PAD_T)
      ticks(lo, hi)
      baseline(y)
      linePath(xs.map((v) => x(v)), ys.map((v) => y(v)))
    })
    expect(r.p95).toBeLessThanOrEqual(BUDGET_MS)
  })

  it(`computes 100 bars under ${BUDGET_MS}ms at p95`, () => {
    const r = measure(() => {
      const lo = Math.min(0, ...values), hi = Math.max(0, ...values)
      const y = linearScale(lo, hi, H - PAD_B, PAD_T)
      const zero = baseline(y)
      ticks(lo, hi)
      const step = (W - PAD_L - PAD_R) / values.length
      const barW = Math.min(56, step * 0.62)
      /* The per-bar arithmetic the component performs inside its map. */
      for (let i = 0; i < values.length; i += 1) {
        const x = PAD_L + step * i + (step - barW) / 2
        const yv = y(values[i])
        void Math.min(yv, zero)
        void Math.max(1, Math.abs(yv - zero))
        void x
      }
    })
    expect(r.p95).toBeLessThanOrEqual(BUDGET_MS)
  })

  it('emits no NaN or Infinity anywhere in a 100-point line path', () => {
    /* Speed is worthless if the output is unusable. The budget test is also
     * the place to prove the fast path is still the correct path. */
    const x = linearScale(Math.min(...xs), Math.max(...xs), PAD_L, W - PAD_R)
    const y = linearScale(Math.min(...ys), Math.max(...ys), H - PAD_B, PAD_T)
    const d = linePath(xs.map((v) => x(v)), ys.map((v) => y(v)))
    expect(d).not.toMatch(/NaN|Infinity/)
    expect(d.startsWith('M ')).toBe(true)
  })

  it('emits no NaN in a 100-segment ring', () => {
    const arcs = pieArcs(values, 110, 110, 88, 56)
    expect(arcs).toHaveLength(POINTS)
    expect(arcs.some((a) => /NaN|Infinity/.test(a.d))).toBe(false)
    const totalFraction = arcs.reduce((n, a) => n + a.fraction, 0)
    expect(totalFraction).toBeCloseTo(1, 6)
  })
})
