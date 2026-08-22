import type {
  RepresentationContract, CapacityProfile, DisclosurePlan, Invariant, DegradationPlan,
} from '../types'
import { Issues, isObj, isStr, isArr, unknownKey, appearanceKeysDeep } from '../validate'
import { shapeFor } from '../../layout/flow'

/* DIAGRAM — nodes and the relationships between them.
 *
 * The contract that was missing when the engine met a real question. The 2008
 * lesson's seven-step causal chain resolved to `null` because no contract
 * claimed `diagram`, and the flow layout it needed had been built and tested
 * two steps earlier. All that was absent was the shell that connects them.
 *
 * A lesson supplies node LABELS and from/to IDS. It never supplies a position,
 * a path or a curvature — layout/flow.ts computes all of it from the node boxes
 * plus the token constants, which is why an arrow in a physics lesson and an
 * arrow in a history lesson are the same arrow.
 */

const KEYS = ['nodes', 'edges', 'caption'] as const
const NODE_KEYS = ['id', 'label', 'detail', 'group', 'emphasis'] as const
const EDGE_KEYS = ['from', 'to', 'kind', 'label'] as const

export type EdgeKind = 'causes' | 'supports' | 'precedes' | 'contrasts-with' | 'reference'
const EDGE_KINDS: EdgeKind[] = ['causes', 'supports', 'precedes', 'contrasts-with', 'reference']

export interface DiagramNodeData {
  id: string
  label: string
  detail?: string
  group?: string
  emphasis?: boolean
}

export interface DiagramEdgeData {
  from: string
  to: string
  kind?: EdgeKind
  label?: string
}

export interface DiagramPayload {
  nodes: DiagramNodeData[]
  edges: DiagramEdgeData[]
  caption?: string
}

export type NormalizedDiagram = DiagramPayload

export const diagramContract: RepresentationContract<DiagramPayload, NormalizedDiagram> = {
  kind: 'diagram',
  renderer: 'DiagramPanel',

  validate(payload) {
    const issues = new Issues()
    if (!isObj(payload)) return issues.fail('', 'A diagram payload must be an object.')

    const bad = unknownKey(payload, KEYS)
    if (bad) return issues.fail(bad, `Unrecognised field '${bad}'. Unknown fields are refused, not stripped.`)

    const appearance = appearanceKeysDeep(payload)
    if (appearance) {
      return issues.fail(appearance, `'${appearance}' carries appearance. A diagram states nodes and relationships; the layout computes every coordinate.`)
    }

    if (!isArr(payload.nodes) || !payload.nodes.length) {
      return issues.fail('nodes', 'A diagram needs at least one node.')
    }

    const nodes: DiagramNodeData[] = []
    const seen = new Set<string>()
    payload.nodes.forEach((n, i) => {
      if (!isObj(n)) { issues.repair(`nodes[${i}]`, 'A node was not an object and was omitted.'); return }
      const nk = unknownKey(n, NODE_KEYS)
      if (nk) { issues.repair(`nodes[${i}].${nk}`, `Node carried unrecognised '${nk}' and was omitted.`); return }
      if (!isStr(n.id) || !isStr(n.label)) { issues.repair(`nodes[${i}]`, 'A node needed an id and a label.'); return }
      if (seen.has(n.id)) { issues.repair(`nodes[${i}]`, `Duplicate node id '${n.id}' was omitted.`); return }
      seen.add(n.id)
      nodes.push({
        id: n.id, label: n.label,
        ...(isStr(n.detail) ? { detail: n.detail } : {}),
        ...(isStr(n.group) ? { group: n.group } : {}),
        ...(n.emphasis === true ? { emphasis: true } : {}),
      })
    })
    if (!nodes.length) return issues.fail('nodes', 'A diagram had no usable nodes.')

    /* AN EDGE TO A NODE THAT DOES NOT EXIST IS DROPPED AND REPORTED.
     * The layout validator's noOrphanConnector check refuses a frame with a
     * dangling edge, so letting one through here would guarantee a repair pass
     * later for a problem that is visible right now. */
    const edges: DiagramEdgeData[] = []
    const raw = isArr(payload.edges) ? payload.edges : []
    raw.forEach((e, i) => {
      if (!isObj(e)) { issues.repair(`edges[${i}]`, 'An edge was not an object and was omitted.'); return }
      const ek = unknownKey(e, EDGE_KEYS)
      if (ek) { issues.repair(`edges[${i}].${ek}`, `Edge carried unrecognised '${ek}' and was omitted.`); return }
      if (!isStr(e.from) || !isStr(e.to)) { issues.repair(`edges[${i}]`, 'An edge needed a from and a to.'); return }
      if (!seen.has(e.from)) { issues.repair(`edges[${i}].from`, `'${e.from}' is not a node in this diagram; the connector was dropped.`); return }
      if (!seen.has(e.to)) { issues.repair(`edges[${i}].to`, `'${e.to}' is not a node in this diagram; the connector was dropped.`); return }
      if (e.from === e.to) { issues.repair(`edges[${i}]`, `'${e.from}' pointed at itself; the connector was dropped.`); return }

      let kind = e.kind as EdgeKind | undefined
      if (kind !== undefined && EDGE_KINDS.indexOf(kind) < 0) {
        issues.repair(`edges[${i}].kind`, `Unrecognised relationship '${String(e.kind)}'; drawn as a plain connector.`)
        kind = undefined
      }
      edges.push({
        from: e.from, to: e.to,
        ...(kind ? { kind } : {}),
        ...(isStr(e.label) ? { label: e.label } : {}),
      })
    })

    return issues.ok({
      nodes, edges,
      ...(isStr(payload.caption) ? { caption: payload.caption } : {}),
    })
  },

  normalize(payload) { return payload },

  fitness(n) {
    /* A diagram earns its place when there are RELATIONSHIPS. Nodes with no
     * edges is a list wearing boxes, and a list reads better as prose. */
    if (!n.edges.length) return 0.2
    if (n.nodes.length < 2) return 0.15
    const density = n.edges.length / n.nodes.length
    /* A fully connected mesh is unreadable however it is drawn. */
    if (density > 4) return 0.35
    return Math.min(0.92, 0.65 + density * 0.12)
  },

  capacity(n, ctx): CapacityProfile {
    const shape = shapeFor(n.nodes.length)
    /* A horizontal row wants width; a vertical column does not. */
    const pref = shape === 'row' ? 12 : shape === 'serpentine' ? 12 : 6
    return {
      unit: 'nodes',
      demand: n.nodes.length,
      supply: ctx.viewport.width > 900 ? 14 : 8,
      span: { min: 6, pref, max: 12 },
      rows: { min: 3, pref: shape === 'column' ? 8 : 4, max: 12 },
    }
  },

  disclosure(n, ctx): DisclosurePlan[] {
    const cap = this.capacity(n, ctx)
    if (n.nodes.length <= cap.supply) return []
    /* Past fourteen nodes the flow groups into phases. The nodes are all still
     * placed — grouping changes what is EXPANDED, never what exists. */
    return [{
      strategy: 'progressive_disclosure',
      initiallyVisible: cap.supply,
      reachableVia: 'expand',
      notice: `${n.nodes.length} steps, grouped into phases. Each opens in place.`,
    }]
  },

  derive(n) {
    /* The renderer is handed the SHAPE decision, not left to make it — so the
     * capacity profile and the drawing can never disagree about whether this
     * is a row or a column. */
    return {
      shape: shapeFor(n.nodes.length),
      nodeCount: n.nodes.length,
      edgeCount: n.edges.length,
    }
  },

  invariants(n): Invariant[] {
    const ids = new Set(n.nodes.map((x) => x.id))
    const dangling = n.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to))
    return [
      { name: 'hasNodes', holds: n.nodes.length > 0 },
      { name: 'everyEdgeResolves', holds: dangling.length === 0,
        detail: 'A connector pointing at a node that was never placed is the one thing a diagram may not do.' },
      { name: 'uniqueNodeIds', holds: ids.size === n.nodes.length },
    ]
  },

  degrade(n): DegradationPlan | null {
    /* Boxes with no relationships between them is a list, and a list is prose. */
    if (!n.edges.length) {
      return {
        to: 'text',
        reason: 'Nodes with no relationships are a list, not a diagram.',
        payload: { paragraphs: n.nodes.map((x) => (x.detail ? `${x.label}: ${x.detail}` : x.label)) },
      }
    }
    return null
  },
}
