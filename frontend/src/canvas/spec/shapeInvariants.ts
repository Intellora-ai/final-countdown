import type { Shape } from './representations'

/**
 * The invariants, one set per data shape.
 *
 * WHY THESE HANG OFF THE SHAPE AND NOT THE CHART NAME
 * ---------------------------------------------------
 * "A pie cannot show negative parts" is not a fact about pies. It is a fact
 * about parts-of-a-whole, and it is equally true of a treemap, a waffle, a
 * funnel and a marimekko. Attached to the name it would be written five times
 * and forgotten on the sixth. Attached to the shape, every named type that uses
 * that shape inherits it and none can opt out.
 *
 * THE BAR FOR INCLUSION
 * ---------------------
 * A rule belongs here only if breaking it makes the chart WRONG — it states
 * something untrue about the data. Rules about ugliness belong to the design
 * system, and rules about taste belong to nobody.
 *
 * Each check returns issues rather than throwing, so one broken block costs one
 * block and a reader is told what was wrong instead of shown a blank page.
 */

export interface ShapeIssue {
  path: string
  message: string
  /**
   * `reject` refuses the block. `warn` renders it and says so.
   *
   * The split matters: a pie whose parts sum to 87% is probably an author
   * error worth stopping for, but a histogram with a slightly odd bin count is
   * a judgement call, and refusing it would make the tool tiresome to use.
   */
  level: 'reject' | 'warn'
}

const EPSILON = 0.005

/* -------------------------------------------------------------------------- */
/* series — named runs of (x, y) over a shared axis                           */
/* -------------------------------------------------------------------------- */

export interface SeriesData {
  series: { name: string; points: { x: number | string; y: number }[] }[]
  /** Declared true when x is a continuous quantity rather than a category. */
  continuousX?: boolean
  /** Set when the named type stacks (stacked bar, stacked area, streamgraph). */
  stacked?: boolean
}

export function checkSeries(data: SeriesData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  const names = data.series.map((s) => s.name)
  if (new Set(names).size !== names.length)
    issues.push({ path: `${at}.series`, message: 'two series share a name; a legend cannot tell them apart', level: 'reject' })

  data.series.forEach((s, i) => {
    if (s.points.length === 0)
      issues.push({ path: `${at}.series[${i}]`, message: 'a series with no points draws nothing but still claims a legend entry', level: 'reject' })

    for (const [j, p] of s.points.entries()) {
      if (!Number.isFinite(p.y))
        issues.push({ path: `${at}.series[${i}].points[${j}].y`, message: 'not a finite number', level: 'reject' })
    }

    /*
     * A LINE THROUGH UNSORTED POINTS DRAWS A LIE.
     * Connecting (3,·) to (1,·) to (2,·) produces a zig-zag that the reader
     * takes for real structure. The renderer must not silently sort either —
     * that would hide an author error rather than report it.
     */
    if (data.continuousX) {
      const xs = s.points.map((p) => Number(p.x))
      const sorted = xs.every((x, k) => k === 0 || x >= (xs[k - 1] ?? x))
      if (!sorted)
        issues.push({ path: `${at}.series[${i}].points`, message: 'x values are not in order; a line drawn through them implies structure that is not in the data', level: 'reject' })
    }

    /* Stacking negatives puts a segment below the baseline while the ones above
       it still claim to sum to the total. The stack stops meaning anything. */
    if (data.stacked && s.points.some((p) => p.y < 0))
      issues.push({ path: `${at}.series[${i}]`, message: 'a stacked chart cannot contain negative values', level: 'reject' })
  })

  /* Stacks are read across series at each x, so a missing x in one series
     silently shifts every segment above it. */
  if (data.stacked && data.series.length > 1) {
    const first = new Set((data.series[0]?.points ?? []).map((p) => String(p.x)))
    data.series.slice(1).forEach((s, i) => {
      const missing = [...first].filter((x) => !s.points.some((p) => String(p.x) === x))
      if (missing.length > 0)
        issues.push({ path: `${at}.series[${i + 1}]`, message: `stacked series must share every x; missing ${missing.slice(0, 3).join(', ')}`, level: 'reject' })
    })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* distribution — raw samples; the chart derives the summary                  */
/* -------------------------------------------------------------------------- */

export interface DistributionData {
  groups: { name: string; samples: number[] }[]
  /** Stated by the author when the chart bins or smooths. */
  binWidth?: number
  bandwidth?: number
  variant: 'histogram' | 'boxPlot' | 'violin' | 'density' | 'strip' | 'beeswarm' | 'ridgeline' | 'quantile' | 'qqPlot' | 'populationPyramid' | 'shapSummary'
}

/** A box plot draws five summary statistics; below this they are not meaningful. */
const MIN_FOR_BOX = 5
const MIN_FOR_SMOOTH = 20

export function checkDistribution(data: DistributionData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  data.groups.forEach((g, i) => {
    if (g.samples.length === 0)
      issues.push({ path: `${at}.groups[${i}]`, message: 'no samples', level: 'reject' })
    if (g.samples.some((s) => !Number.isFinite(s)))
      issues.push({ path: `${at}.groups[${i}].samples`, message: 'contains a non-finite sample', level: 'reject' })

    if (data.variant === 'boxPlot' && g.samples.length < MIN_FOR_BOX)
      issues.push({ path: `${at}.groups[${i}]`, message: `a box plot summarises five statistics; ${g.samples.length} samples cannot support them`, level: 'reject' })

    /* A smooth curve over eight points draws a shape the data does not have.
       The reader cannot tell an estimate from a measurement. */
    if ((data.variant === 'violin' || data.variant === 'density' || data.variant === 'ridgeline') && g.samples.length < MIN_FOR_SMOOTH)
      issues.push({ path: `${at}.groups[${i}]`, message: `smoothing ${g.samples.length} samples implies detail that is not in the data`, level: 'warn' })
  })

  /* Bin width and bandwidth CHANGE THE ANSWER. An unstated one means the reader
     cannot know whether the shape is in the data or in the choice. */
  if (data.variant === 'histogram' && data.binWidth === undefined)
    issues.push({ path: `${at}.binWidth`, message: 'bin width changes the shape a histogram reports; state it', level: 'warn' })
  if ((data.variant === 'density' || data.variant === 'violin') && data.bandwidth === undefined)
    issues.push({ path: `${at}.bandwidth`, message: 'bandwidth changes the shape a density curve reports; state it', level: 'warn' })

  if (data.variant === 'populationPyramid' && data.groups.length !== 2)
    issues.push({ path: `${at}.groups`, message: 'a population pyramid compares exactly two groups', level: 'reject' })

  return issues
}

/* -------------------------------------------------------------------------- */
/* parts — labelled parts that make one whole                                 */
/* -------------------------------------------------------------------------- */

export interface PartsData {
  parts: { label: string; value: number }[]
  /** When given, the parts must sum to it. Omitted means they define the whole. */
  whole?: number
  variant: 'pie' | 'donut' | 'waffle' | 'waterfall' | 'funnel' | 'marimekko' | 'stackedBar'
}

/** Past this, angle comparison stops working and slices need a legend to read. */
const MAX_SLICES = 7

export function checkParts(data: PartsData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  /* Waterfall is the one variant where a negative is the POINT — it shows a
     decrease. Everywhere else a negative part of a whole is meaningless. */
  const negativesAllowed = data.variant === 'waterfall'

  data.parts.forEach((p, i) => {
    if (!Number.isFinite(p.value))
      issues.push({ path: `${at}.parts[${i}].value`, message: 'not a finite number', level: 'reject' })
    else if (p.value < 0 && !negativesAllowed)
      issues.push({ path: `${at}.parts[${i}].value`, message: `a ${data.variant} cannot show a negative part of a whole`, level: 'reject' })
  })

  const labels = data.parts.map((p) => p.label)
  if (new Set(labels).size !== labels.length)
    issues.push({ path: `${at}.parts`, message: 'two parts share a label', level: 'reject' })

  /* The parts-of-a-whole claim is falsifiable, so it is checked. Slices that
     sum to 87% of the stated whole mean 13% is unaccounted for and the chart
     is quietly wrong. */
  if (data.whole !== undefined) {
    const sum = data.parts.reduce((n, p) => n + p.value, 0)
    if (Math.abs(sum - data.whole) > Math.abs(data.whole) * EPSILON)
      issues.push({ path: `${at}.parts`, message: `parts sum to ${sum}, not the stated whole ${data.whole}`, level: 'reject' })
  }

  if (data.parts.length > MAX_SLICES && (data.variant === 'pie' || data.variant === 'donut'))
    issues.push({ path: `${at}.parts`, message: `${data.parts.length} slices cannot be compared by angle; group the tail into "other" or use a bar`, level: 'warn' })

  /* A funnel claims each stage is a SUBSET of the one before. A stage that
     grows is not a funnel, it is a different chart. */
  if (data.variant === 'funnel') {
    for (let i = 1; i < data.parts.length; i += 1) {
      const prev = data.parts[i - 1]?.value ?? 0
      const here = data.parts[i]?.value ?? 0
      if (here > prev)
        issues.push({ path: `${at}.parts[${i}]`, message: 'a funnel stage cannot be larger than the stage before it', level: 'reject' })
    }
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* matrix — a rectangular grid with row and column keys                       */
/* -------------------------------------------------------------------------- */

export interface MatrixData {
  rows: string[]
  columns: string[]
  /** values[r][c]. Null means genuinely absent, which is different from zero. */
  values: (number | null)[][]
  symmetric?: boolean
  variant: 'heatMap' | 'correlationMatrix' | 'confusionMatrix' | 'adjacencyMatrix' | 'missingDataMap' | 'hexbin' | 'contour' | 'pairPlot' | 'riskHeatMap' | 'decisionBoundary'
}

export function checkMatrix(data: MatrixData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  /* A ragged matrix renders as a grid with holes that look like data. */
  if (data.values.length !== data.rows.length)
    issues.push({ path: `${at}.values`, message: `${data.values.length} value rows for ${data.rows.length} row labels`, level: 'reject' })

  data.values.forEach((row, r) => {
    if (row.length !== data.columns.length)
      issues.push({ path: `${at}.values[${r}]`, message: `${row.length} values for ${data.columns.length} columns`, level: 'reject' })
    row.forEach((v, c) => {
      if (v !== null && !Number.isFinite(v))
        issues.push({ path: `${at}.values[${r}][${c}]`, message: 'not a finite number', level: 'reject' })
    })
  })

  if (data.symmetric) {
    if (data.rows.length !== data.columns.length)
      issues.push({ path: `${at}`, message: 'a symmetric matrix must be square', level: 'reject' })
    else
      for (let r = 0; r < data.values.length; r += 1)
        for (let c = r + 1; c < (data.values[r]?.length ?? 0); c += 1)
          if (data.values[r]?.[c] !== data.values[c]?.[r])
            issues.push({ path: `${at}.values[${r}][${c}]`, message: 'declared symmetric but is not', level: 'reject' })
  }

  /* Correlation is bounded. A value outside it is an arithmetic error, and a
   * diverging colour scale would render it as "extremely correlated". */
  if (data.variant === 'correlationMatrix')
    data.values.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v !== null && (v < -1 || v > 1))
          issues.push({ path: `${at}.values[${r}][${c}]`, message: `correlation ${v} is outside [-1, 1]`, level: 'reject' })
      }),
    )

  /* A confusion matrix's axes are the same class list, in the same order.
     Different orders silently transpose precision and recall. */
  if (data.variant === 'confusionMatrix') {
    if (data.rows.length !== data.columns.length || data.rows.some((r, i) => r !== data.columns[i]))
      issues.push({ path: `${at}`, message: 'a confusion matrix needs identical class lists on both axes, in the same order', level: 'reject' })
    if (data.values.flat().some((v) => v !== null && (v < 0 || !Number.isInteger(v))))
      issues.push({ path: `${at}.values`, message: 'confusion matrix cells are counts: non-negative integers', level: 'reject' })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* graph — nodes and edges                                                    */
/* -------------------------------------------------------------------------- */

export interface GraphData {
  nodes: { id: string; label: string; group?: string }[]
  edges: { from: string; to: string; label?: string; weight?: number }[]
  directed?: boolean
  /** Declared by the author; if true, a cycle is a contradiction, not a warning. */
  acyclic?: boolean
  bipartite?: boolean
  variant: string
}

export function checkGraph(data: GraphData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  const ids = new Set<string>()
  data.nodes.forEach((n, i) => {
    if (ids.has(n.id))
      issues.push({ path: `${at}.nodes[${i}].id`, message: `duplicate id "${n.id}"`, level: 'reject' })
    ids.add(n.id)
  })

  data.edges.forEach((e, i) => {
    if (!ids.has(e.from))
      issues.push({ path: `${at}.edges[${i}].from`, message: `no node "${e.from}"`, level: 'reject' })
    if (!ids.has(e.to))
      issues.push({ path: `${at}.edges[${i}].to`, message: `no node "${e.to}"`, level: 'reject' })
    if (e.weight !== undefined && !Number.isFinite(e.weight))
      issues.push({ path: `${at}.edges[${i}].weight`, message: 'not a finite number', level: 'reject' })
  })

  /* An isolated node renders as a word floating beside a diagram with no
     explanation of why it is there. */
  const touched = new Set(data.edges.flatMap((e) => [e.from, e.to]))
  for (const node of data.nodes)
    if (!touched.has(node.id))
      issues.push({ path: `${at}.nodes`, message: `"${node.id}" has no edges and would float unexplained`, level: 'warn' })

  /*
   * A DECLARED DAG WITH A CYCLE IS A CONTRADICTION, NOT A LAYOUT PROBLEM.
   * Bayesian networks, dependency graphs, build orders and fault trees all
   * depend on acyclicity for their MEANING — a cycle means "A depends on B
   * depends on A", which no layout can honestly draw.
   */
  if (data.acyclic) {
    const cycle = findCycle(data.nodes.map((n) => n.id), data.edges)
    if (cycle)
      issues.push({ path: `${at}.edges`, message: `declared acyclic but contains a cycle: ${cycle.join(' → ')}`, level: 'reject' })
  }

  if (data.bipartite) {
    const conflict = findBipartiteConflict(data.nodes.map((n) => n.id), data.edges)
    if (conflict)
      issues.push({ path: `${at}.edges`, message: `declared bipartite but "${conflict}" cannot be placed in either set`, level: 'reject' })
  }

  return issues
}

/** The first cycle found, as a readable path, or null. */
export function findCycle(ids: string[], edges: { from: string; to: string }[]): string[] | null {
  const out = new Map<string, string[]>()
  for (const id of ids) out.set(id, [])
  for (const e of edges) out.get(e.from)?.push(e.to)

  const state = new Map<string, 0 | 1 | 2>() // unseen | on stack | done
  const stack: string[] = []

  const walk = (id: string): string[] | null => {
    state.set(id, 1)
    stack.push(id)
    for (const next of out.get(id) ?? []) {
      const s = state.get(next) ?? 0
      if (s === 1) return [...stack.slice(stack.indexOf(next)), next]
      if (s === 0) {
        const found = walk(next)
        if (found) return found
      }
    }
    stack.pop()
    state.set(id, 2)
    return null
  }

  for (const id of ids) if ((state.get(id) ?? 0) === 0) {
    const found = walk(id)
    if (found) return found
  }
  return null
}

/** Two-colour the graph; returns the first node that cannot be coloured. */
export function findBipartiteConflict(ids: string[], edges: { from: string; to: string }[]): string | null {
  const adjacent = new Map<string, string[]>()
  for (const id of ids) adjacent.set(id, [])
  for (const e of edges) {
    adjacent.get(e.from)?.push(e.to)
    adjacent.get(e.to)?.push(e.from)
  }

  const colour = new Map<string, 0 | 1>()
  for (const start of ids) {
    if (colour.has(start)) continue
    colour.set(start, 0)
    const queue = [start]
    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined) break
      const mine = colour.get(id) ?? 0
      for (const next of adjacent.get(id) ?? []) {
        if (!colour.has(next)) {
          colour.set(next, mine === 0 ? 1 : 0)
          queue.push(next)
        } else if (colour.get(next) === mine) {
          return next
        }
      }
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* hierarchy — strict containment                                             */
/* -------------------------------------------------------------------------- */

export interface HierarchyData {
  nodes: { id: string; label: string; parent: string | null; value?: number }[]
  /** Treemaps and sunbursts size by value; a parent must equal its children. */
  sizedByValue?: boolean
  variant: string
}

export function checkHierarchy(data: HierarchyData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  const ids = new Set(data.nodes.map((n) => n.id))
  const roots = data.nodes.filter((n) => n.parent === null)

  if (roots.length === 0)
    issues.push({ path: `${at}.nodes`, message: 'no root: every node claims a parent, so this is a cycle, not a hierarchy', level: 'reject' })
  if (roots.length > 1)
    issues.push({ path: `${at}.nodes`, message: `${roots.length} roots; a hierarchy has exactly one`, level: 'reject' })

  data.nodes.forEach((n, i) => {
    if (n.parent !== null && !ids.has(n.parent))
      issues.push({ path: `${at}.nodes[${i}].parent`, message: `no node "${n.parent}"`, level: 'reject' })
    if (n.parent === n.id)
      issues.push({ path: `${at}.nodes[${i}]`, message: 'a node cannot be its own parent', level: 'reject' })
  })

  const cycle = findCycle(
    data.nodes.map((n) => n.id),
    data.nodes.filter((n) => n.parent !== null).map((n) => ({ from: n.id, to: n.parent as string })),
  )
  if (cycle)
    issues.push({ path: `${at}.nodes`, message: `parent chain forms a cycle: ${cycle.join(' → ')}`, level: 'reject' })

  /* A treemap's area IS the claim. If a parent's rectangle does not equal the
     sum of its children, the picture contradicts its own arithmetic. */
  if (data.sizedByValue) {
    const childrenOf = new Map<string, typeof data.nodes>()
    for (const n of data.nodes) {
      if (n.parent === null) continue
      const list = childrenOf.get(n.parent)
      if (list) list.push(n)
      else childrenOf.set(n.parent, [n])
    }
    for (const node of data.nodes) {
      const children = childrenOf.get(node.id)
      if (!children || children.length === 0 || node.value === undefined) continue
      const sum = children.reduce((n, c) => n + (c.value ?? 0), 0)
      if (Math.abs(sum - node.value) > Math.abs(node.value) * EPSILON)
        issues.push({ path: `${at}`, message: `"${node.id}" is ${node.value} but its children sum to ${sum}`, level: 'reject' })
    }
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* flowWeighted — weighted movement between stages                            */
/* -------------------------------------------------------------------------- */

export interface FlowWeightedData {
  nodes: { id: string; label: string }[]
  links: { from: string; to: string; value: number }[]
  /** False for a deliberately leaky diagram (drop-off, loss, attrition). */
  conserved?: boolean
  variant: 'sankey' | 'alluvial' | 'chord'
}

export function checkFlowWeighted(data: FlowWeightedData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []
  const ids = new Set(data.nodes.map((n) => n.id))

  data.links.forEach((l, i) => {
    if (!ids.has(l.from)) issues.push({ path: `${at}.links[${i}].from`, message: `no node "${l.from}"`, level: 'reject' })
    if (!ids.has(l.to)) issues.push({ path: `${at}.links[${i}].to`, message: `no node "${l.to}"`, level: 'reject' })
    if (!Number.isFinite(l.value) || l.value < 0)
      issues.push({ path: `${at}.links[${i}].value`, message: 'flow must be a finite, non-negative quantity', level: 'reject' })
  })

  const cycle = findCycle(data.nodes.map((n) => n.id), data.links)
  if (cycle && data.variant === 'sankey')
    issues.push({ path: `${at}.links`, message: `a sankey flows one way; this cycles: ${cycle.join(' → ')}`, level: 'reject' })

  /*
   * CONSERVATION IS THE SANKEY'S ONE CLAIM.
   * The ribbon widths say "this much went in, this much came out". Where they
   * disagree and the author has not said the diagram is lossy, the picture is
   * asserting something arithmetically false.
   */
  if (data.conserved) {
    const inflow = new Map<string, number>()
    const outflow = new Map<string, number>()
    for (const l of data.links) {
      outflow.set(l.from, (outflow.get(l.from) ?? 0) + l.value)
      inflow.set(l.to, (inflow.get(l.to) ?? 0) + l.value)
    }
    for (const node of data.nodes) {
      const into = inflow.get(node.id)
      const out = outflow.get(node.id)
      if (into === undefined || out === undefined) continue // a source or a sink
      if (Math.abs(into - out) > Math.max(into, out) * EPSILON)
        issues.push({ path: `${at}`, message: `"${node.id}" takes ${into} and passes on ${out}; declare the diagram lossy or fix the flows`, level: 'reject' })
    }
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* intervals — items with a start and an end                                  */
/* -------------------------------------------------------------------------- */

export interface IntervalsData {
  items: { id: string; label: string; start: number; end: number; lane?: string; dependsOn?: string[] }[]
  variant: 'gantt' | 'timeline'
}

export function checkIntervals(data: IntervalsData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []
  const ids = new Set(data.items.map((i) => i.id))

  data.items.forEach((item, i) => {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end))
      issues.push({ path: `${at}.items[${i}]`, message: 'start and end must be finite', level: 'reject' })
    else if (item.end < item.start)
      issues.push({ path: `${at}.items[${i}]`, message: 'ends before it starts', level: 'reject' })

    for (const dep of item.dependsOn ?? []) {
      if (!ids.has(dep)) {
        issues.push({ path: `${at}.items[${i}].dependsOn`, message: `no item "${dep}"`, level: 'reject' })
        continue
      }
      /* A bar that starts before the thing it depends on is a schedule that
         cannot happen. The chart would draw it anyway, quite cheerfully. */
      const source = data.items.find((x) => x.id === dep)
      if (source && item.start < source.end)
        issues.push({ path: `${at}.items[${i}]`, message: `starts before "${dep}" finishes, but depends on it`, level: 'warn' })
    }
  })

  const cycle = findCycle(
    data.items.map((i) => i.id),
    data.items.flatMap((i) => (i.dependsOn ?? []).map((d) => ({ from: i.id, to: d }))),
  )
  if (cycle)
    issues.push({ path: `${at}.items`, message: `dependencies cycle: ${cycle.join(' → ')}`, level: 'reject' })

  return issues
}

/* -------------------------------------------------------------------------- */
/* process — ordered steps with branches                                      */
/* -------------------------------------------------------------------------- */

export interface ProcessData {
  steps: { id: string; label: string; kind: 'start' | 'action' | 'decision' | 'end'; lane?: string }[]
  transitions: { from: string; to: string; label?: string }[]
  variant: string
}

export function checkProcess(data: ProcessData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []
  const ids = new Set(data.steps.map((s) => s.id))

  data.transitions.forEach((t, i) => {
    if (!ids.has(t.from)) issues.push({ path: `${at}.transitions[${i}].from`, message: `no step "${t.from}"`, level: 'reject' })
    if (!ids.has(t.to)) issues.push({ path: `${at}.transitions[${i}].to`, message: `no step "${t.to}"`, level: 'reject' })
  })

  const starts = data.steps.filter((s) => s.kind === 'start')
  if (starts.length !== 1)
    issues.push({ path: `${at}.steps`, message: `${starts.length} start steps; a process has exactly one entry`, level: 'reject' })
  if (!data.steps.some((s) => s.kind === 'end'))
    issues.push({ path: `${at}.steps`, message: 'no end step; the reader is left inside the process', level: 'reject' })

  const outgoing = new Map<string, number>()
  for (const t of data.transitions) outgoing.set(t.from, (outgoing.get(t.from) ?? 0) + 1)

  for (const step of data.steps) {
    const out = outgoing.get(step.id) ?? 0

    /* A decision with one exit is not a decision. It is an action wearing a
       diamond, and it tells the reader a choice exists where none does. */
    if (step.kind === 'decision' && out < 2)
      issues.push({ path: `${at}.steps`, message: `decision "${step.id}" has ${out} outcome(s); a decision needs at least two`, level: 'reject' })

    /* A dead end is the failure mode that strands a reader mid-flow. */
    if (step.kind !== 'end' && out === 0)
      issues.push({ path: `${at}.steps`, message: `"${step.id}" has no way out and is not an end step`, level: 'reject' })
  }

  /* Unlabelled branches leave the reader unable to tell which way to go. */
  if (data.steps.some((s) => s.kind === 'decision')) {
    const decisionIds = new Set(data.steps.filter((s) => s.kind === 'decision').map((s) => s.id))
    data.transitions.forEach((t, i) => {
      if (decisionIds.has(t.from) && !t.label)
        issues.push({ path: `${at}.transitions[${i}]`, message: 'a branch out of a decision must say which case it is', level: 'reject' })
    })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* logic — truth tables and proof trees                                       */
/* -------------------------------------------------------------------------- */

export interface LogicData {
  variant: 'truthTable' | 'proofTree' | 'derivationTree'
  inputs?: string[]
  rows?: boolean[][]
  steps?: { id: string; statement: string; rule?: string; from?: string[] }[]
}

export function checkLogic(data: LogicData, at: string): ShapeIssue[] {
  const issues: ShapeIssue[] = []

  if (data.variant === 'truthTable') {
    const n = data.inputs?.length ?? 0
    const expected = 2 ** n
    /* A truth table with missing rows is not a smaller table; it is an
       incomplete claim about when the expression holds. */
    if ((data.rows?.length ?? 0) !== expected)
      issues.push({ path: `${at}.rows`, message: `${n} inputs need all ${expected} rows; found ${data.rows?.length ?? 0}`, level: 'reject' })
    data.rows?.forEach((row, i) => {
      if (row.length !== n)
        issues.push({ path: `${at}.rows[${i}]`, message: `${row.length} values for ${n} inputs`, level: 'reject' })
    })
  }

  if (data.variant === 'proofTree' || data.variant === 'derivationTree') {
    const ids = new Set((data.steps ?? []).map((s) => s.id))
    data.steps?.forEach((step, i) => {
      /* A step without a named rule is an assertion, and a proof made of
         assertions proves nothing. */
      if (!step.rule && (step.from?.length ?? 0) > 0)
        issues.push({ path: `${at}.steps[${i}]`, message: 'a derived step must name the rule it used', level: 'reject' })
      for (const ref of step.from ?? [])
        if (!ids.has(ref))
          issues.push({ path: `${at}.steps[${i}].from`, message: `no step "${ref}"`, level: 'reject' })
    })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

export type ShapeData =
  | ({ shape: 'series' } & SeriesData)
  | ({ shape: 'distribution' } & DistributionData)
  | ({ shape: 'parts' } & PartsData)
  | ({ shape: 'matrix' } & MatrixData)
  | ({ shape: 'graph' } & GraphData)
  | ({ shape: 'hierarchy' } & HierarchyData)
  | ({ shape: 'flowWeighted' } & FlowWeightedData)
  | ({ shape: 'intervals' } & IntervalsData)
  | ({ shape: 'process' } & ProcessData)
  | ({ shape: 'logic' } & LogicData)

/** Run the invariants for whichever shape this is. */
export function checkShape(data: ShapeData, at: string): ShapeIssue[] {
  switch (data.shape) {
    case 'series': return checkSeries(data, at)
    case 'distribution': return checkDistribution(data, at)
    case 'parts': return checkParts(data, at)
    case 'matrix': return checkMatrix(data, at)
    case 'graph': return checkGraph(data, at)
    case 'hierarchy': return checkHierarchy(data, at)
    case 'flowWeighted': return checkFlowWeighted(data, at)
    case 'intervals': return checkIntervals(data, at)
    case 'process': return checkProcess(data, at)
    case 'logic': return checkLogic(data, at)
    default: {
      const exhaustive: never = data
      return exhaustive
    }
  }
}

/** Shapes with no data-level invariants: they are drawn constructions. */
export const UNCHECKED_SHAPES: Shape[] = ['tabular', 'geometry']
