import { calculate } from './math.ts'

// SVG path data is numeric geometry, never markup, URLs, or executable code.
export function validPath(source: string) {
  const tokens = source.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  if (!/^[Mm]$/.test(tokens[0] ?? '') || source.replace(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[\s,]/g, '') || tokens.length > 8000) return false
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
  let index = 0
  while (index < tokens.length) {
    const command = tokens[index++].toUpperCase()
    const numbers: number[] = []
    while (index < tokens.length && !/^[a-z]$/i.test(tokens[index])) numbers.push(Number(tokens[index++]))
    const size = arity[command]
    if (numbers.some(n => !Number.isFinite(n) || Math.abs(n) > 1000000)) return false
    if (size === 0 ? numbers.length !== 0 : numbers.length === 0 || numbers.length % size !== 0) return false
    if (command === 'A') for (let i = 0; i < numbers.length; i += 7) {
      if (numbers[i] < 0 || numbers[i + 1] < 0 || ![0, 1].includes(numbers[i + 3]) || ![0, 1].includes(numbers[i + 4])) return false
    }
  }
  return true
}
export type Plot = { expression: string; x: number; y: number; width: number; height: number; xMin: number; xMax: number; yMin: number; yMax: number }
export function plotPath(plot: Plot) {
  const points: string[] = []
  let pen = '', evaluations = 0, exhausted = false
  const value = (t: number) => {
    if (++evaluations > 4096) { exhausted = true; return undefined }
    try { return calculate(plot.expression, plot.xMin + (plot.xMax - plot.xMin) * t) }
    catch { return undefined }
  }
  const coordinate = (t: number, y: number) => `${(plot.x + t * plot.width).toFixed(3)} ${(plot.y + (plot.yMax - Math.max(plot.yMin, Math.min(plot.yMax, y))) / (plot.yMax - plot.yMin) * plot.height).toFixed(3)}`
  const segment = (a: number, ya: number | undefined, b: number, yb: number | undefined, depth = 0): void => {
    if (exhausted) return
    const middle = (a + b) / 2, ym = value(middle)
    if ((ya === undefined && ym === undefined && yb === undefined) ||
        [ya, ym, yb].every(y => y !== undefined && y < plot.yMin) ||
        [ya, ym, yb].every(y => y !== undefined && y > plot.yMax)) { pen = ''; return }
    // Check curvature before clipping: steep lines are valid; an unresolved
    // jump is a gap. Finite sampling cannot prove continuity for every function.
    if (ya === undefined || ym === undefined || yb === undefined || Math.abs(ym - (ya + yb) / 2) * plot.height / (plot.yMax - plot.yMin) > 0.5) {
      if (depth < 8) { segment(a, ya, middle, ym, depth + 1); segment(middle, ym, b, yb, depth + 1) }
      else pen = ''
      return
    }
    const delta = yb - ya
    const bounds = delta ? [(plot.yMin - ya) / delta, (plot.yMax - ya) / delta].sort((x, y) => x - y) : [0, 1]
    const start = Math.max(0, bounds[0]), end = Math.min(1, bounds[1])
    if (start >= end) { pen = ''; return }
    const from = coordinate(a + (b - a) * start, ya + delta * start)
    const to = coordinate(a + (b - a) * end, ya + delta * end)
    if (from === to) return
    if (pen !== from) points.push(`M${from}`)
    points.push(`L${to}`); pen = to
  }
  let previous = value(0)
  for (let i = 1; i <= 400; i++) {
    const next = value(i / 400)
    segment((i - 1) / 400, previous, i / 400, next)
    if (exhausted) return '' // Do not present a partially evaluated curve as complete.
    previous = next
  }
  return points.join(' ')
}

export function polygonPoints(x: number, y: number, radius: number, sides: number, rotation = -90) {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (rotation + i * 360 / sides) * Math.PI / 180
    return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`
  }).join(' ')
}
