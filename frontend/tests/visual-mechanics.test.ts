import { expect, it } from 'vitest'
import { diagramLayout } from '../src/diagram-layout'
import { polygonPoints } from '../src/drawing'
import { lessonSchema } from '../src/lesson'

it('computes exact regular polygon geometry across side counts, rotations and scales', () => {
  for (const sides of [3, 4, 5, 6, 12, 100]) for (const rotation of [-90, 0, 47]) for (const radius of [1, 50, 900]) {
    const points = polygonPoints(30, 70, radius, sides, rotation).split(' ').map(p => p.split(',').map(Number))
    expect(points).toHaveLength(sides)
    const distances = points.map(([x, y]) => Math.hypot(x - 30, y - 70))
    distances.forEach(distance => expect(distance).toBeCloseTo(radius, 9))
    const lengths = points.map(([x, y], i) => Math.hypot(x - points[(i + 1) % sides][0], y - points[(i + 1) % sides][1]))
    lengths.forEach(length => expect(length).toBeCloseTo(lengths[0], 9))
  }
})
it.each([
  [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }],
  [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }],
  [{ from: 'a', to: 'a', label: 'Self reference' }, { from: 'a', to: 'b' }, { from: 'a', to: 'b', label: 'Another relationship' }],
  [],
].map(edges => ({ edges })))('lays out branches, cycles, parallel connections and disconnected nodes without overlapping nodes', ({ edges }) => {
  const block = { kind: 'diagram' as const, title: 'Relationships', nodes: [{ id: 'a', label: 'A long label that needs several lines to stay readable', detail: 'Explanation '.repeat(20) }, { id: 'b', label: 'Second' }, { id: 'c', label: 'Third' }], edges }
  const drawing = diagramLayout(block)
  for (const [i, node] of drawing.nodes.entries()) {
    expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true)
    expect(node.x - node.width / 2).toBeGreaterThanOrEqual(0)
    expect(node.x + node.width / 2).toBeLessThanOrEqual(drawing.width)
    for (const other of drawing.nodes.slice(i + 1)) {
      expect(Math.abs(node.x - other.x) >= (node.width + other.width) / 2 || Math.abs(node.y - other.y) >= (node.height + other.height) / 2).toBe(true)
    }
  }
  for (const edge of drawing.edges) {
    expect(edge.points.length).toBeGreaterThan(1)
    expect(edge.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  }
})
it('supports diagrams beyond the old eight-node cap with a finite layout', () => {
  const nodes = Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` }))
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }))
  const value = lessonSchema.parse({ explanation: 'A longer process', blocks: [{ kind: 'diagram', title: 'Sequence', nodes, edges }] })
  const block = value.blocks[0]
  if (block.kind !== 'diagram') throw Error('Not a diagram')
  const drawing = diagramLayout(block)
  expect(drawing.nodes).toHaveLength(25)
  expect(drawing.height).toBeGreaterThan(0)
})
it.each([2, 3.5, 101, NaN])('rejects invalid polygon side count %s', sides => {
  expect(lessonSchema.safeParse({ explanation: 'A shape', blocks: [{ kind: 'scene', title: 'Shape', elements: [{ type: 'polygon', x: 0, y: 0, radius: 20, sides }] }] }).success).toBe(false)
})
