import { expect, it } from 'vitest'
import { validPath, plotPath } from '../src/drawing'
import { calculate } from '../src/math'
import { lessonSchema } from '../src/lesson'

it.each([
  'M0 0 L20 20 Z', 'm 0,0 10,20 -10,-20 z', 'M0 0C10 0 10 20 20 20 S30 40 40 20',
  'M0 0 Q10 20 30 0 T60 0', 'M1e2 -2e1 H300 V40', 'M0 0 A20 20 0 0 1 40 40',
])('accepts general path geometry %s', d => expect(validPath(d)).toBe(true))
it.each(['<script>alert(1)</script>', 'M0 0 L20', 'L0 0', 'MNaN 0', 'M1e999 0', 'M0 0 Z20 20', 'M0 0 A20 20 0 2 1 40 40', 'M0 0 url(https://test)', 'M0 0 X2 2'])('rejects malformed or executable geometry %s', d => expect(validPath(d)).toBe(false))
it.each([[-20, 20], [20, -20], [-20, -20]])('rejects each independent negative arc radius (%s, %s)', (rx, ry) => expect(validPath(`M0 0 A${rx} ${ry} 0 0 1 40 40`)).toBe(false))
it.each([
  ['sin(pi/2)', 1], ['cos(0)', 1], ['abs(-3)', 3], ['sqrt(9)', 3], ['ln(e)', 1], ['exp(0)', 1], ['-2^2', -4], ['2^-2', 0.25], ['2*x + 1', 7], ['x**2', 9], ['-x**2', -9],
] as const)('computes %s without model-supplied samples', (source, result) => expect(calculate(source, 3)).toBeCloseTo(result))
it.each(['Math.sin(x)', 'constructor(1)', 'alert(1)', 'x;1', 'sqrt(-1)', '1/0', 'sin(1', '9'.repeat(201)])('refuses unsafe or undefined expression %s', source => expect(() => calculate(source, 2)).toThrow())
const plot = { expression: 'x', x: 10, y: 20, width: 400, height: 200, xMin: -2, xMax: 2, yMin: -2, yMax: 2 }
it('maps a linear graph to the declared coordinate system', () => {
  const path = plotPath(plot)
  expect(path.startsWith('M10.000 220.000')).toBe(true)
  expect(path.endsWith('L410.000 20.000')).toBe(true)
})
it('breaks curves at undefined points instead of connecting across a pole', () => {
  const path = plotPath({ ...plot, expression: '1/x', yMin: -10, yMax: 10 })
  expect(path.match(/M/g)).toHaveLength(2)
  expect(path).not.toMatch(/NaN|Infinity/)
})
const decoded = (path: string) => Array.from(path.matchAll(/([ML])([-\d.]+) ([-\d.]+)/g), match => ({ command: match[1], x: Number(match[2]), y: Number(match[3]) }))
it.each([
  ['x', 199.9, 300, 200.1, 0],
  ['3*x+0.007', 199.733, 300, 199.8, 0],
  ['-2*x+0.003', 200.1, 0, 200.2, 300],
] as const)('clips the visible segment of %s even when the window falls between samples', (expression, x1, y1, x2, y2) => {
  const points = decoded(plotPath({ ...plot, expression, x: 0, y: 0, width: 400, height: 300, yMin: -.001, yMax: .001 }))
  expect(points.length).toBeGreaterThan(1)
  expect(points[0]).toEqual({ command: 'M', x: x1, y: y1 })
  expect(points.at(-1)).toEqual({ command: 'L', x: x2, y: y2 })
})
it('clips narrow nonlinear boundaries accurately rather than treating a curve as a wide straight chord', () => {
  const points = decoded(plotPath({ ...plot, expression: '(x-0.0025)^2', x: 0, y: 0, width: 400, height: 300, xMin: -1, xMax: 1, yMin: 0, yMax: .000001 }))
  expect(points.length).toBeGreaterThan(1)
  expect(points[0].x).toBeCloseTo(200.3, 2)
  expect(points[0].y).toBe(0)
  expect(points.at(-1)!.x).toBeCloseTo(200.7, 2)
  expect(points.at(-1)!.y).toBe(0)
})
it.each([
  ['0.001/(x-0.001)', [0.001]],
  ['0.001*tan(x)', [-Math.PI / 2, Math.PI / 2]],
] as const)('does not draw across off-grid poles of %s, even when endpoint jumps are small', (expression, poles) => {
  const points = decoded(plotPath({ ...plot, expression, yMin: -10, yMax: 10 }))
  expect(points.length).toBeGreaterThan(1)
  expect(points.filter(point => point.command === 'M')).toHaveLength(poles.length + 1)
  for (let i = 1; i < points.length; i++) if (points[i].command === 'L') {
    const left = -2 + (points[i - 1].x - 10) / 100
    const right = -2 + (points[i].x - 10) / 100
    expect(poles.some(pole => left < pole && right > pole)).toBe(false)
  }
})
it('omits isolated zero-length intersections and entirely offscreen functions', () => {
  expect(plotPath({ ...plot, expression: 'x^2', yMin: -1, yMax: 0 })).toBe('')
  expect(plotPath({ ...plot, expression: '100' })).toBe('')
})
it('keeps calculated curves within their plot window across functions and ranges', () => {
  for (const expression of ['x^2', 'sin(x)', 'abs(x)', 'sqrt(x)', 'ln(x)', '1/x']) {
    const path = plotPath({ ...plot, expression })
    const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    expect(numbers.length).toBeGreaterThan(0)
    for (let i = 0; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(10); expect(numbers[i]).toBeLessThanOrEqual(410)
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(20); expect(numbers[i + 1]).toBeLessThanOrEqual(220)
    }
  }
})
it('rejects reversed plot domains and malformed paths at the model boundary', () => {
  const base = { explanation: 'A curve', blocks: [{ kind: 'scene', title: 'Plot', elements: [{ type: 'plot', ...plot, xMax: -3 }] }] }
  expect(lessonSchema.safeParse(base).success).toBe(false)
  base.blocks[0].elements = [{ type: 'path', d: '<svg onload=alert(1)>' }] as unknown as typeof base.blocks[0]['elements']
  expect(lessonSchema.safeParse(base).success).toBe(false)
})
