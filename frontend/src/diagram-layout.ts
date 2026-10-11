import { Graph, layout, type GraphLabel, type NodeLabel, type EdgeLabel } from '@dagrejs/dagre'
import type { Lesson } from './lesson'
import { wrapText, fontMeasure } from './text-layout'

type Diagram = Extract<Lesson['blocks'][number], { kind: 'diagram' }>
export function diagramLayout(block: Diagram) {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true })
  graph.setGraph({ rankdir: 'TB', nodesep: 45, ranksep: 65, marginx: 30, marginy: 30 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of block.nodes) {
    const rows = wrapText(node.label, 250, fontMeasure(25, true)).length
    const details = node.detail ? wrapText(node.detail, 250, fontMeasure(19)).length : 0
    graph.setNode(node.id, { width: 280, height: Math.max(92, 28 + rows * 32 + details * 25) })
  }
  block.edges.forEach((edge, i) => graph.setEdge(edge.from, edge.to, edge.label
    ? { width: 180, height: 24 * wrapText(edge.label, 168, fontMeasure(20)).length + 12 } : {}, String(i)))
  layout(graph)
  return {
    width: graph.graph().width!, height: graph.graph().height!,
    nodes: block.nodes.map(node => { const n = graph.node(node.id)!; return { ...node, x: n.x!, y: n.y!, width: n.width, height: n.height } }),
    edges: block.edges.map((edge, i) => { const e = graph.edge({ v: edge.from, w: edge.to, name: String(i) })!; return { ...edge, points: e.points!, x: e.x, y: e.y, height: e.height } }),
  }
}
