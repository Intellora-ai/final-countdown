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
  let previous: number | undefined
  for (let i = 0; i <= 400; i++) {
    const x = plot.xMin + (plot.xMax - plot.xMin) * i / 400
    try {
      const y = calculate(plot.expression, x)
      if (y < plot.yMin || y > plot.yMax) { previous = undefined; continue }
      const px = plot.x + i / 400 * plot.width
      const py = plot.y + (plot.yMax - y) / (plot.yMax - plot.yMin) * plot.height
      const move = previous === undefined || Math.abs(py - previous) > plot.height / 2
      points.push(`${move ? 'M' : 'L'}${px.toFixed(3)} ${py.toFixed(3)}`)
      previous = py
    } catch { previous = undefined }
  }
  return points.join(' ')
}

export function polygonPoints(x: number, y: number, radius: number, sides: number, rotation = -90) {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (rotation + i * 360 / sides) * Math.PI / 180
    return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`
  }).join(' ')
}
