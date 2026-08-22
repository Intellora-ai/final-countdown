/* CHART GEOMETRY — every number a chart draws, computed here, DOM-free.
 *
 * The chart components are thin SVG over these functions, which is what makes
 * the charts testable without a browser: the arithmetic that could be wrong
 * lives in pure functions, and the components contain only markup.
 *
 * Inputs are assumed ALREADY VALIDATED — validateBoard() has removed
 * non-finite values before anything here runs. These functions still refuse to
 * emit NaN (a degenerate domain pads itself) because a chart that draws NaN
 * coordinates fails silently, and silent is the one way this board must not fail.
 */

export interface ArcSegment {
  /** SVG path for a ring segment. */
  d: string
  /** Fraction of the whole, 0..1. */
  fraction: number
  startAngle: number
  endAngle: number
}

/* Ring segments for a pie/donut. Angles from 12 o'clock, clockwise. */
export function pieArcs(
  values: number[],
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): ArcSegment[] {
  const total = values.reduce((n, v) => n + v, 0)
  if (!(total > 0)) return []
  let angle = -Math.PI / 2
  return values.map((v) => {
    const frac = v / total
    const start = angle
    /* Cap a full-circle single segment just short of 2π: an SVG arc whose
     * start and end coincide draws nothing at all. */
    const sweep = Math.min(frac * Math.PI * 2, Math.PI * 2 - 0.0001)
    const end = start + sweep
    angle = start + frac * Math.PI * 2
    const large = sweep > Math.PI ? 1 : 0
    const x0 = cx + rOuter * Math.cos(start), y0 = cy + rOuter * Math.sin(start)
    const x1 = cx + rOuter * Math.cos(end), y1 = cy + rOuter * Math.sin(end)
    const x2 = cx + rInner * Math.cos(end), y2 = cy + rInner * Math.sin(end)
    const x3 = cx + rInner * Math.cos(start), y3 = cy + rInner * Math.sin(start)
    const d = [
      `M ${x0.toFixed(2)} ${y0.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
      'Z',
    ].join(' ')
    return { d, fraction: frac, startAngle: start, endAngle: end }
  })
}

export interface LinearScale {
  (value: number): number
  domain: [number, number]
  range: [number, number]
}

/* Linear scale with a padded degenerate domain: every value equal is a real
 * case (bar chart of identical scores), and (v - min) / (max - min) would be
 * 0/0. Padding by ±1 keeps the bars visible and the arithmetic finite. */
export function linearScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): LinearScale {
  let d0 = domainMin, d1 = domainMax
  if (d0 === d1) { d0 -= 1; d1 += 1 }
  const scale = ((value: number) =>
    rangeMin + ((value - d0) / (d1 - d0)) * (rangeMax - rangeMin)) as LinearScale
  scale.domain = [d0, d1]
  scale.range = [rangeMin, rangeMax]
  return scale
}

/* Tick values: round-numbered, includes the ends of the padded domain's span.
 * Deliberately simple — a board chart wants 3-5 ticks, not d3's generality. */
export function ticks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  const step = niceStep(span / count)
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + step / 2; v += step) out.push(round6(v))
  return out
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)))
  const norm = Math.abs(raw) / mag
  const nice = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1
  return nice * mag
}

function round6(v: number): number { return Math.round(v * 1e6) / 1e6 }

/* Polyline path for a line chart. One point yields a bare move — the component
 * renders the marker; a zero-length line would be invisible. */
export function linePath(xs: number[], ys: number[]): string {
  if (!xs.length) return ''
  return xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${ys[i].toFixed(2)}`)
    .join(' ')
}

/** Zero-line position for bar/line charts whose domain spans negatives. */
export function baseline(scale: LinearScale): number {
  const [d0, d1] = scale.domain
  const zero = Math.max(d0, Math.min(d1, 0))
  return scale(zero)
}

/* Fit an axis label into the width one tick actually has.
 *
 * The validator caps labels at 60 characters, which stops a label from being
 * unbounded but does nothing about twelve of them sharing 380 pixels: they
 * overlap into an unreadable smear. Truncation is chosen over rotation because
 * rotating labels changes the rendered HEIGHT of the chart, and step height is
 * what the world layout measures — a chart that resized itself by the length
 * of its longest label would move every step below it.
 *
 * The full label never disappears: callers keep it in a <title> and in the
 * chart's text summary, so the pointer and the screen reader both still get
 * the whole thing.
 */
export function fitLabel(label: string, maxChars: number): string {
  /* Two characters is the floor: one letter plus the ellipsis still says
   * "there was more here", which a bare ellipsis does not. */
  const cap = Math.max(2, Math.floor(maxChars))
  if (label.length <= cap) return label
  return `${label.slice(0, cap - 1)}…`
}
