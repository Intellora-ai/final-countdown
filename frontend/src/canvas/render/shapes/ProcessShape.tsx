import { ArrowDefs, arrowRef, curvePath, useArrowScope } from '../../design/primitives'
import { tokens } from '../../design/tokens'
import { checkProcess, type ProcessData, type ShapeIssue } from '../../spec/shapeInvariants'

/**
 * The process shape: ordered steps with branches, optionally by actor.
 *
 * flowchart · decisionFlow · swimlane · bpmn · pipeline · valueStream ·
 * serviceBlueprint · sequenceDiagram · reactionDiagram · blockDiagram
 *
 * `checkProcess` already refuses the structural lies — two entries, a dead end,
 * a decision with one outcome, an unlabelled branch. What is left is the
 * drawing, and a process diagram has three ways to mislead in the drawing:
 *
 *   THE COLUMN A STEP LANDS IN.  Layers are the LONGEST path from the start, so
 *   a step reachable both directly and through two others sits after both.
 *   Placed early, its incoming arrow would run backwards past steps it came
 *   through, and the reader would read a loop that is not there.
 *
 *   A LOOP DRAWN LIKE A STEP.  A transition back to an earlier step is real —
 *   "retry", "reject" — but drawn as an ordinary left-to-right arrow it says
 *   the opposite. Back edges are detected, bowed below the row and marked.
 *
 *   AN EDGE THAT CROSSES A LANE IN SILENCE.  A lane is an actor. An arrow that
 *   leaves one lane and arrives in another is a HANDOFF, which is usually where
 *   a process actually goes wrong, and drawing it identically to a within-lane
 *   step hides the most useful thing on the diagram. Every crossing carries
 *   `crossesLane`, is drawn with a handoff marker, and is named in the
 *   description.
 *
 * The layout is a pure function of the steps: no clock, no randomness, ties
 * broken by the author's order. The same process draws the same picture.
 *
 * ARROWHEADS: `ArrowDefs`' marker, and glow by a second wide stroke. The
 * `lc-bloom` filter is never applied to a connector — its region is in
 * percentages of the bounding box, and a same-row connector's box is
 * zero-height, so the arrow paints nothing at all while every attribute reads
 * correct. `flat` is carried on each edge so the hazard stays visible.
 */

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

function scalar(length: string): number {
  return Number.parseFloat(length)
}

const NODE_W = 132
const NODE_H = 48
const COL_GAP = scalar(tokens.space.xxxl) + scalar(tokens.space.xl)
const ROW_GAP = scalar(tokens.space.xl)
const ROW_STEP = NODE_H + ROW_GAP
const LANE_GAP = scalar(tokens.space.xl)
const LANE_LABEL_W = 108
const LINE_HEIGHT = 13
/** How far a back edge bows below its row, so the loop is unmistakable. */
const BACK_DIP = scalar(tokens.space.xxl)

export type NodeShape = 'stadium' | 'rect' | 'diamond'

/**
 * Kind to glyph. Start and end are stadiums, a decision is a diamond, an action
 * is a rectangle — the BPMN/flowchart convention both traditions share, so a
 * reader of either can follow the picture without a key.
 */
export function shapeForKind(kind: ProcessData['steps'][number]['kind']): NodeShape {
  if (kind === 'decision') return 'diamond'
  if (kind === 'start' || kind === 'end') return 'stadium'
  return 'rect'
}

/* -------------------------------------------------------------------------- */
/* Layers                                                                     */
/* -------------------------------------------------------------------------- */

type Step = ProcessData['steps'][number]
type Transition = ProcessData['transitions'][number]

export interface LayerResult {
  layers: Map<string, number>
  /** Transitions that go back to an equal or earlier layer: loops, not steps. */
  backEdges: Set<string>
  /** Steps no transition from the start can reach. */
  unreachable: string[]
}

/**
 * Layer every step, and say which transitions are loops.
 *
 * Two passes on purpose, and neither is a hop count.
 *
 * First a depth-first walk from the entry marks the BACK EDGES: a transition
 * that points at a step still open on the walk's own stack, which is exactly
 * the definition of an edge that closes a cycle. A hop-count test looks
 * tempting and is wrong — with `a → z`, `a → b`, `b → z` both `b` and `z` are
 * one hop from `a`, so `b → z` fails a "must go further" test and gets drawn as
 * a loop even though nothing loops. Measured here: it did.
 *
 * Removing the back edges leaves a DAG, and a longest-path relaxation over it
 * gives the final column. Ties and the order edges are explored in both come
 * from the author's order, so the same process layers the same way every time.
 */
export function layerSteps(steps: readonly Step[], transitions: readonly Transition[]): LayerResult {
  const ids = new Set(steps.map((s) => s.id))
  const out = new Map<string, Transition[]>()
  for (const step of steps) out.set(step.id, [])
  for (const transition of transitions)
    if (ids.has(transition.from) && ids.has(transition.to)) out.get(transition.from)?.push(transition)

  const entry = steps.find((s) => s.kind === 'start') ?? steps[0]

  /* Reachability, for the "this step is not in the flow" warning. */
  const reached = new Set<string>()
  if (entry !== undefined) {
    const queue: string[] = [entry.id]
    reached.add(entry.id)
    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined) break
      for (const transition of out.get(id) ?? []) {
        if (reached.has(transition.to)) continue
        reached.add(transition.to)
        queue.push(transition.to)
      }
    }
  }

  /* 0 unseen · 1 open on the stack · 2 finished. */
  const state = new Map<string, 0 | 1 | 2>()
  const backEdges = new Set<string>()

  const walk = (id: string): void => {
    state.set(id, 1)
    for (const transition of out.get(id) ?? []) {
      const seen = state.get(transition.to) ?? 0
      if (seen === 1) backEdges.add(`${transition.from}>${transition.to}`)
      else if (seen === 0) walk(transition.to)
    }
    state.set(id, 2)
  }

  if (entry !== undefined) walk(entry.id)
  /* Anything the entry cannot reach still needs its edges classified, or a loop
     inside an orphaned component would spin the relaxation below. */
  for (const step of steps) if ((state.get(step.id) ?? 0) === 0) walk(step.id)

  const forward = transitions.filter(
    (transition) =>
      ids.has(transition.from) &&
      ids.has(transition.to) &&
      !backEdges.has(`${transition.from}>${transition.to}`),
  )

  /* Longest path over the forward edges. They strictly increase the hop count,
     so the relaxation is guaranteed to terminate. */
  const layers = new Map<string, number>()
  for (const step of steps) layers.set(step.id, 0)
  for (let pass = 0; pass < steps.length; pass += 1) {
    let moved = false
    for (const transition of forward) {
      const candidate = (layers.get(transition.from) ?? 0) + 1
      if (candidate > (layers.get(transition.to) ?? 0)) {
        layers.set(transition.to, candidate)
        moved = true
      }
    }
    if (!moved) break
  }

  const unreachable = steps.filter((s) => !reached.has(s.id)).map((s) => s.id)
  /* An unreachable step has no honest column, so it is parked past the end
     rather than drawn as though the flow arrived there. */
  const deepest = Math.max(0, ...steps.filter((s) => reached.has(s.id)).map((s) => layers.get(s.id) ?? 0))
  for (const id of unreachable) layers.set(id, deepest + 1)

  return { layers, backEdges, unreachable }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export interface ProcessNode {
  id: string
  label: string
  lines: string[]
  kind: Step['kind']
  shape: NodeShape
  lane: string
  layer: number
  subRow: number
  x: number
  y: number
  width: number
  height: number
  cx: number
  cy: number
  reachable: boolean
}

export interface ProcessEdge {
  from: string
  to: string
  label: string | null
  d: string
  /** A transition to an equal or earlier layer: a loop, drawn as one. */
  back: boolean
  /** A handoff between actors. Never drawn like a step inside one lane. */
  crossesLane: boolean
  fromLane: string
  toLane: string
  /** Zero-height bounding box. NO percentage-region filter may touch this. */
  flat: boolean
  labelX: number
  labelY: number
}

export interface ProcessLaneBand {
  name: string
  y: number
  height: number
  rows: number
}

export interface ProcessLayout {
  nodes: ProcessNode[]
  edges: ProcessEdge[]
  lanes: ProcessLaneBand[]
  width: number
  height: number
  layers: number
  unreachable: string[]
  /** Every handoff, in words, for the description and the caption. */
  handoffs: string[]
}

export function layoutProcess(data: ProcessData): ProcessLayout {
  const { layers, backEdges, unreachable } = layerSteps(data.steps, data.transitions)
  const layerOf = (id: string): number => layers.get(id) ?? 0

  /* Lanes in first-appearance order. Sorting them would reorder the actors,
     and in a swimlane the order of the actors is part of the argument. */
  const laneNames: string[] = []
  for (const step of data.steps) {
    const lane = step.lane ?? ''
    if (!laneNames.includes(lane)) laneNames.push(lane)
  }
  const named = laneNames.some((lane) => lane !== '')
  const left = named ? LANE_LABEL_W : 0

  /* A step's row within its lane: the next free slot in that (lane, layer). */
  const filled = new Map<string, number>()
  const placement = new Map<string, { lane: string; layer: number; subRow: number }>()
  for (const step of data.steps) {
    const lane = step.lane ?? ''
    const layer = layerOf(step.id)
    const key = `${lane}|${layer}`
    const subRow = filled.get(key) ?? 0
    filled.set(key, subRow + 1)
    placement.set(step.id, { lane, layer, subRow })
  }

  const rowsPerLane = new Map<string, number>()
  for (const lane of laneNames) {
    let rows = 1
    for (const [key, count] of filled) if (key.startsWith(`${lane}|`)) rows = Math.max(rows, count)
    rowsPerLane.set(lane, rows)
  }

  const laneTop = new Map<string, number>()
  const lanes: ProcessLaneBand[] = []
  let y = 0
  for (const lane of laneNames) {
    const rows = rowsPerLane.get(lane) ?? 1
    const height = rows * ROW_STEP
    laneTop.set(lane, y)
    lanes.push({ name: lane, y, height, rows })
    y += height + (named ? LANE_GAP : 0)
  }

  const nodes: ProcessNode[] = data.steps.map((step) => {
    const where = placement.get(step.id) ?? { lane: '', layer: 0, subRow: 0 }
    const x = left + where.layer * (NODE_W + COL_GAP)
    const top = (laneTop.get(where.lane) ?? 0) + where.subRow * ROW_STEP
    return {
      id: step.id,
      label: step.label,
      lines: wrapLabel(step.label),
      kind: step.kind,
      shape: shapeForKind(step.kind),
      lane: where.lane,
      layer: where.layer,
      subRow: where.subRow,
      x,
      y: top,
      width: NODE_W,
      height: NODE_H,
      cx: x + NODE_W / 2,
      cy: top + NODE_H / 2,
      reachable: !unreachable.includes(step.id),
    }
  })

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const handoffs: string[] = []

  const edges: ProcessEdge[] = []
  for (const transition of data.transitions) {
    const from = byId.get(transition.from)
    const to = byId.get(transition.to)
    /* The shape's own check has already refused an unknown endpoint; this keeps
       the renderer total rather than throwing on data it was handed anyway. */
    if (from === undefined || to === undefined) continue

    const back = backEdges.has(`${transition.from}>${transition.to}`)
    const crossesLane = from.lane !== to.lane

    const start = back
      ? { x: from.cx, y: from.y + from.height }
      : { x: from.x + from.width, y: from.cy }
    const end = back ? { x: to.cx, y: to.y + to.height } : { x: to.x, y: to.cy }

    if (crossesLane)
      handoffs.push(`${from.label} (${from.lane || 'unassigned'}) hands off to ${to.label} (${to.lane || 'unassigned'})`)

    edges.push({
      from: transition.from,
      to: transition.to,
      label: transition.label ?? null,
      d: back ? backPath(start, end) : curvePath(start, end),
      back,
      crossesLane,
      fromLane: from.lane,
      toLane: to.lane,
      flat: !back && start.y === end.y,
      labelX: round((start.x + end.x) / 2, 2),
      /* Lifted off the line, because a label sitting on a flat connector is
         unreadable and a flat connector is the common case. */
      labelY: round((start.y + end.y) / 2 - scalar(tokens.space.sm), 2) + (back ? BACK_DIP : 0),
    })
  }

  const widest = Math.max(0, ...nodes.map((node) => node.x + node.width))
  const tallest = Math.max(ROW_STEP, ...nodes.map((node) => node.y + node.height))

  return {
    nodes,
    edges,
    lanes,
    width: widest + scalar(tokens.space.lg),
    height: tallest + BACK_DIP + scalar(tokens.space.lg),
    layers: Math.max(1, ...nodes.map((node) => node.layer + 1)),
    unreachable,
    handoffs,
  }
}

/**
 * A loop, bowed below the row.
 *
 * `curvePath`'s control points push HORIZONTALLY, so a back edge drawn with it
 * between two points at the same height would be a flat S laid over the row it
 * came from — visually identical to a forward step. This cubic pushes downward
 * instead, so a loop looks like a loop.
 */
export function backPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dip = BACK_DIP
  return `M ${round(from.x, 2)} ${round(from.y, 2)} C ${round(from.x, 2)} ${round(from.y + dip, 2)}, ${round(to.x, 2)} ${round(to.y + dip, 2)}, ${round(to.x, 2)} ${round(to.y, 2)}`
}

/** Two lines maximum. A third means the label is a sentence, not a step. */
export function wrapLabel(label: string): string[] {
  const words = label.split(' ')
  if (words.length <= 2) return [label]
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface ProcessChart {
  ok: true
  variant: string
  layout: ProcessLayout
  caption: string
  warnings: string[]
}

export interface ProcessRefusal {
  ok: false
  variant: string
  problems: ShapeIssue[]
  warnings: string[]
}

export type ProcessResult = ProcessChart | ProcessRefusal

export function buildProcess(data: ProcessData, at = 'process'): ProcessResult {
  const issues = checkProcess(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  const layout = layoutProcess(data)

  for (const id of layout.unreachable)
    warnings.push(`${at}.steps — "${id}" cannot be reached from the entry; it is drawn past the end rather than in the flow`)

  warnings.push(...variantWarnings(data, layout, at))

  const parts: string[] = []
  if (layout.handoffs.length > 0)
    parts.push(`${layout.handoffs.length} lane handoff${layout.handoffs.length === 1 ? '' : 's'}: ${layout.handoffs.join('; ')}`)
  const loops = layout.edges.filter((e) => e.back).length
  if (loops > 0) parts.push(`${loops} transition${loops === 1 ? '' : 's'} loop back and ${loops === 1 ? 'is' : 'are'} drawn bowed below the row`)

  return {
    ok: true,
    variant: data.variant,
    layout,
    caption: `${parts.join('. ')}${parts.length > 0 ? '. ' : ''}${describeProcess(data)}`,
    warnings,
  }
}

/**
 * What each named type needs that this shape does not carry.
 *
 * Said as a warning rather than drawn as though it were there: a value stream
 * map without wait times is missing the finding it exists for, and a diagram
 * that looks complete is worse than one that says what it is missing.
 */
function variantWarnings(data: ProcessData, layout: ProcessLayout, at: string): string[] {
  const named = layout.lanes.some((lane) => lane.name !== '')
  const out: string[] = []

  if (!named && (data.variant === 'swimlane' || data.variant === 'serviceBlueprint'))
    out.push(`${at}.steps — a ${data.variant} needs actors; no step declares a lane, so this is drawn as a plain flow`)

  if (data.variant === 'sequenceDiagram' && !named)
    out.push(`${at}.steps — a sequence diagram's lifelines are its participants; no step declares a lane, so there are none to draw`)

  if (data.variant === 'serviceBlueprint' && named)
    out.push(`${at} — the line of visibility separates two named lanes, and this shape does not say which; every lane boundary is drawn the same`)

  if (data.variant === 'valueStream')
    out.push(`${at} — this shape carries no durations, so wait time is not shown; a value stream map without wait times omits its usual finding`)

  if (data.variant === 'bpmn')
    out.push(`${at} — drawn as the BPMN core only: events, tasks and gateways. Message flows, sub-processes and boundary events are not in this shape`)

  if (data.variant === 'reactionDiagram')
    out.push(`${at} — whether the equation balances cannot be checked from steps and transitions; that claim is the author's`)

  if (data.variant === 'pipeline' && layout.layers === layout.nodes.length)
    out.push(`${at}.transitions — every step is in its own column, so nothing is drawn as running in parallel`)

  return out
}

export function describeProcess(data: ProcessData): string {
  const byId = new Map(data.steps.map((s) => [s.id, s.label]))
  const steps = data.transitions.map(
    (t) => `${byId.get(t.from) ?? t.from}${t.label ? ` (${t.label})` : ''} → ${byId.get(t.to) ?? t.to}`,
  )
  return `${data.variant}: ${steps.join('; ')}.`
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

export function ProcessShape({ data, at }: { data: ProcessData; at?: string }) {
  /* One scope per mounted diagram: two of these on a page would otherwise
     share an SVG id, and every arrowhead would resolve to the first. */
  const arrowScope = useArrowScope()

  const built = buildProcess(data, at)

  if (!built.ok) {
    return (
      <div className="lc-refusal" role="alert">
        <h2>This {data.variant} was not drawn</h2>
        <ul>
          {built.problems.map((problem, i) => (
            <li key={i}>
              <code>{problem.path}</code> — {problem.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const { layout } = built
  const named = layout.lanes.some((lane) => lane.name !== '')

  return (
    <div>
      <svg
        className="lc-flow"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={describeProcess(data)}
      >
        <ArrowDefs scope={arrowScope} />

        {/* Lanes as bands, not boxes: a band is the ground an actor's steps
            stand on. A box around each lane would read as a container. */}
        {named &&
          layout.lanes.map((lane) => (
            <g key={`lane-${lane.name}`}>
              <rect
                x={0}
                y={lane.y}
                width={layout.width}
                height={lane.height}
                fill={tokens.color.surfaceLift}
                fillOpacity={0.35}
                rx={scalar(tokens.radius.sm)}
              />
              <text
                className="lc-flow__node"
                x={scalar(tokens.space.sm)}
                y={lane.y + LINE_HEIGHT}
                textAnchor="start"
              >
                {lane.name}
              </text>
            </g>
          ))}

        {/*
          GLOW BY DOUBLE STROKE. The `lc-bloom` filter's region is a percentage
          of the bounding box, and a same-row connector's box is zero-height, so
          filtering it paints nothing while the stroke reads perfectly correct.
        */}
        {layout.edges.map((edge, i) => (
          <path key={`glow-${i}`} className="lc-flow__link-glow" d={edge.d} />
        ))}
        {layout.edges.map((edge, i) => (
          <path
            key={`edge-${i}`}
            className="lc-flow__link"
            d={edge.d}
            markerEnd={arrowRef(arrowScope)}
            strokeDasharray={
              edge.back ? `${scalar(tokens.space.xs)} ${scalar(tokens.space.xs)}` : undefined
            }
          />
        ))}

        {/* A handoff between actors gets its own mark. An arrow that crosses a
            lane drawn exactly like one that does not is the failure this
            renderer exists to avoid. */}
        {layout.edges
          .filter((edge) => edge.crossesLane)
          .map((edge, i) => (
            <circle
              key={`handoff-${i}`}
              cx={edge.labelX}
              cy={edge.labelY + scalar(tokens.space.sm)}
              r={scalar(tokens.space.xs)}
              fill={tokens.color.warning}
            >
              <title>{`handoff: ${edge.fromLane || 'unassigned'} → ${edge.toLane || 'unassigned'}`}</title>
            </circle>
          ))}

        {layout.edges.map((edge, i) =>
          edge.label === null ? null : (
            <text
              key={`label-${i}`}
              className="lc-flow__node"
              x={edge.labelX}
              y={edge.labelY}
              textAnchor="middle"
            >
              {edge.label}
            </text>
          ),
        )}

        {layout.nodes.map((node) => (
          <g key={node.id} opacity={node.reachable ? 1 : 0.45}>
            {node.shape === 'diamond' ? (
              <polygon
                points={`${node.cx},${node.y} ${node.x + node.width},${node.cy} ${node.cx},${node.y + node.height} ${node.x},${node.cy}`}
                fill="none"
                stroke={tokens.color.accent}
                strokeWidth={scalar(tokens.stroke.thin)}
              />
            ) : (
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={node.shape === 'stadium' ? node.height / 2 : scalar(tokens.radius.md)}
                fill="none"
                stroke={node.kind === 'end' ? tokens.color.result : tokens.color.accent}
                strokeWidth={
                  node.kind === 'end' ? scalar(tokens.stroke.thick) : scalar(tokens.stroke.thin)
                }
              />
            )}
            <text className="lc-flow__node" x={node.cx} y={node.cy} textAnchor="middle">
              {node.lines.map((line, i) => (
                <tspan key={i} x={node.cx} dy={i === 0 ? 0 : LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>
      <p className="lc-caption">{built.caption}</p>
    </div>
  )
}
