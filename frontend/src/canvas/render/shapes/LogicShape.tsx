import { tokens } from '../../design/tokens'
import { checkLogic, findCycle } from '../../spec/shapeInvariants'
import type { LogicData, ShapeIssue } from '../../spec/shapeInvariants'

/**
 * The `logic` shape: truthTable · proofTree · derivationTree.
 *
 * TWO DIFFERENT THINGS UNDER ONE SHAPE, AND THAT IS RIGHT
 * ------------------------------------------------------
 * A truth table enumerates assignments; a proof derives statements from
 * statements. They share a shape because they share a payload — `inputs`/`rows`
 * for one, `steps` for the other — and because a lesson that reaches for one
 * usually reaches for the other in the next block. They do not share a layout,
 * so this file has two builders and one refusal path.
 *
 * WHAT `checkLogic` ALREADY REFUSES, AND WHAT IT DOES NOT
 * ------------------------------------------------------
 * It refuses a truth table that is missing rows or has a ragged one, a derived
 * step with no named rule, and a `from` pointing at a step that does not exist.
 * It does NOT refuse a CYCLE, and a proof whose steps justify each other in a
 * ring proves nothing at all — so the cycle check is here, using the same
 * `findCycle` the graph shape uses rather than a second implementation that
 * could disagree with it.
 *
 * It also does not notice a REPEATED ASSIGNMENT. Because all 2^n rows are
 * required, a repeat means some other assignment is missing while the row count
 * still adds up — a table that passes its own completeness check and is not
 * complete. Caught here.
 *
 * The layout is a pure function of the steps: no clock, no randomness, ties
 * broken by the author's order, every generated coordinate rounded to two
 * decimals so a float never serialises differently on two sides of a hydration.
 */

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

function scalar(length: string): number {
  return Number.parseFloat(length)
}

const NODE_W = 168
const NODE_H = 40
const COL_GAP = scalar(tokens.space.xl)
const ROW_GAP = scalar(tokens.space.xxxl)
const ROW_STEP = NODE_H + ROW_GAP
const PAD = scalar(tokens.space.xl)
const LINE_HEIGHT = 13
/** How far the inference bar sits above the statement it concludes. */
const BAR_LIFT = scalar(tokens.space.md)

/**
 * Two decimals is below one device pixel at every scale this canvas allows.
 *
 * Defined here rather than imported from `GraphShape`, which exports the same
 * four lines: `FigureView` loads each shape lazily so a lesson with one diagram
 * does not download the others, and one import would drag the whole graph
 * layout engine into this chunk to reuse a rounding function.
 */
export function round(value: number): number {
  return Math.round(value * 100) / 100
}

/* -------------------------------------------------------------------------- */
/* Truth tables                                                               */
/* -------------------------------------------------------------------------- */

export interface TruthTable {
  inputs: string[]
  rows: boolean[][]
  /** T and F rather than 1 and 0: this is the schoolbook convention. */
  cells: string[][]
}

export const TRUE_MARK = 'T'
export const FALSE_MARK = 'F'

/**
 * Turn the rows into cells, refusing rather than repairing.
 *
 * A ragged row is not a row with a gap in it; it is an assignment to a
 * different number of variables, and there is no honest way to guess which
 * variable the missing value belonged to. Padding it with F would invent a
 * claim about when the expression holds, which is the entire content of a truth
 * table. `checkLogic` rejects it; this refuses to build past that point, so
 * there is no code path where a padded row could reach the screen.
 */
export function buildTruthTable(data: LogicData): TruthTable | null {
  const inputs = data.inputs ?? []
  const rows = data.rows ?? []
  if (inputs.length === 0 || rows.length === 0) return null
  if (rows.some((row) => row.length !== inputs.length)) return null

  return {
    inputs,
    rows,
    cells: rows.map((row) => row.map((value) => (value ? TRUE_MARK : FALSE_MARK))),
  }
}

/**
 * Assignments that appear twice.
 *
 * With all 2^n rows demanded, a duplicate is arithmetic that adds up and a
 * table that does not: n inputs, 2^n rows, and yet an assignment nowhere in it.
 * The row count check cannot see this, which is exactly why it is here.
 */
export function repeatedAssignments(rows: readonly boolean[][]): number[] {
  const seen = new Map<string, number>()
  const repeats: number[] = []
  rows.forEach((row, index) => {
    const key = row.map((value) => (value ? '1' : '0')).join('')
    if (seen.has(key)) repeats.push(index)
    else seen.set(key, index)
  })
  return repeats
}

/* -------------------------------------------------------------------------- */
/* Proof and derivation trees                                                 */
/* -------------------------------------------------------------------------- */

type Step = NonNullable<LogicData['steps']>[number]

export interface ProofNode {
  id: string
  statement: string
  lines: string[]
  rule: string | null
  from: string[]
  /** Longest chain from a step that rests on nothing. Never a hop count. */
  depth: number
  x: number
  y: number
  width: number
  height: number
  cx: number
  cy: number
  /** Rests on nothing: a premise, an axiom, or a grammar's start symbol. */
  leaf: boolean
  /** Nothing rests on it: what the proof actually concludes. */
  final: boolean
}

export interface ProofEdge {
  from: string
  to: string
  d: string
}

/** The Gentzen bar: premises above, conclusion below, rule named at the end. */
export interface InferenceBar {
  of: string
  x1: number
  x2: number
  y: number
  rule: string
}

export interface ProofLayout {
  nodes: ProofNode[]
  edges: ProofEdge[]
  bars: InferenceBar[]
  width: number
  height: number
  depth: number
  /** More than one thing concluded, which a single proof does not do. */
  finals: string[]
}

/**
 * How deep each step sits.
 *
 * LONGEST CHAIN, NOT SHORTEST. A step used both directly and through two
 * intermediate steps must be drawn below both of them, or its own supporting
 * line would run upward past steps that already fed it and the reader would see
 * a justification flowing backwards. `from` edges are guaranteed acyclic by the
 * time this runs — `buildLogic` refuses a cycle before laying anything out — so
 * the relaxation terminates.
 */
export function depthsOf(steps: readonly Step[]): Map<string, number> {
  const known = new Set(steps.map((s) => s.id))
  const depth = new Map<string, number>()
  for (const step of steps) depth.set(step.id, 0)

  for (let pass = 0; pass < steps.length; pass += 1) {
    let moved = false
    for (const step of steps) {
      let deepest = 0
      for (const parent of step.from ?? []) {
        if (!known.has(parent)) continue
        deepest = Math.max(deepest, (depth.get(parent) ?? 0) + 1)
      }
      if (deepest > (depth.get(step.id) ?? 0)) {
        depth.set(step.id, deepest)
        moved = true
      }
    }
    if (!moved) break
  }
  return depth
}

/**
 * Place the steps.
 *
 * A PROOF IS A DAG, NOT A TREE — one lemma can support two conclusions — so the
 * tidy-tree contour walk the hierarchy shape uses does not apply: it assumes
 * every node has exactly one parent and would place a shared lemma twice.
 * Layered placement instead. Within a row, each step wants to sit over the
 * middle of what it rests on; the row is then sorted by that wish and swept
 * left to right pushing anything that would overlap. Both the wish and the
 * sweep are order-stable, so the same proof draws the same picture.
 */
export function layoutProof(steps: readonly Step[]): ProofLayout {
  const depth = depthsOf(steps)
  const deepest = Math.max(0, ...steps.map((s) => depth.get(s.id) ?? 0))

  const rows: Step[][] = Array.from({ length: deepest + 1 }, () => [])
  steps.forEach((step) => rows[depth.get(step.id) ?? 0]?.push(step))

  const centre = new Map<string, number>()

  /*
   * ROWS ARE NOT RE-CENTRED AFTERWARDS, AND THAT IS DELIBERATE.
   * The first version shifted each row to the middle of the frame, which looked
   * tidier and quietly broke the one property that matters: a conclusion's
   * position is the average of its premises' positions, so shifting its row by
   * a different amount from theirs moved it off the middle of what it rests on.
   * The barycentre already centres each row over the one below it; anything
   * further is decoration bought with a lie.
   */
  for (const row of rows) {
    const wanted = row.map((step, index) => {
      const parents = (step.from ?? [])
        .map((id) => centre.get(id))
        .filter((value): value is number => value !== undefined)
      return {
        step,
        index,
        /* A step with nothing beneath it has no preference, so it takes its
           declared slot; the author's order is the only honest tie-break. */
        wish: parents.length === 0 ? index * (NODE_W + COL_GAP) : parents.reduce((a, b) => a + b, 0) / parents.length,
      }
    })

    wanted.sort((a, b) => a.wish - b.wish || a.index - b.index)

    let cursor = Number.NEGATIVE_INFINITY
    for (const item of wanted) {
      const x = Math.max(item.wish, cursor)
      centre.set(item.step.id, x)
      cursor = x + NODE_W + COL_GAP
    }
  }

  const xs = [...centre.values()]
  const minX = xs.length === 0 ? 0 : Math.min(...xs)
  const maxX = xs.length === 0 ? 0 : Math.max(...xs)
  const width = maxX - minX + NODE_W + PAD * 2

  const usedBy = new Map<string, number>()
  for (const step of steps)
    for (const parent of step.from ?? []) usedBy.set(parent, (usedBy.get(parent) ?? 0) + 1)

  const nodes: ProofNode[] = steps.map((step) => {
    const level = depth.get(step.id) ?? 0
    const x = round((centre.get(step.id) ?? 0) - minX + PAD)
    const y = round(level * ROW_STEP + PAD)
    return {
      id: step.id,
      statement: step.statement,
      lines: wrapStatement(step.statement),
      rule: step.rule ?? null,
      from: [...(step.from ?? [])],
      depth: level,
      x,
      y,
      width: NODE_W,
      height: NODE_H,
      cx: round(x + NODE_W / 2),
      cy: round(y + NODE_H / 2),
      leaf: (step.from ?? []).length === 0,
      final: (usedBy.get(step.id) ?? 0) === 0,
    }
  })

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges: ProofEdge[] = []
  const bars: InferenceBar[] = []

  for (const node of nodes) {
    const parents = node.from
      .map((id) => byId.get(id))
      .filter((parent): parent is ProofNode => parent !== undefined)
    if (parents.length === 0) continue

    for (const parent of parents)
      edges.push({
        from: parent.id,
        to: node.id,
        d: supportPath(
          { x: parent.cx, y: parent.y + parent.height },
          { x: node.cx, y: node.y - BAR_LIFT },
        ),
      })

    /* The bar spans everything it rests on, not just the box beneath it. A bar
       drawn only over the conclusion would say the step follows from one thing
       when it follows from three. */
    const left = Math.min(node.x, ...parents.map((p) => p.x))
    const right = Math.max(node.x + node.width, ...parents.map((p) => p.x + p.width))
    bars.push({
      of: node.id,
      x1: round(left),
      x2: round(right),
      y: round(node.y - BAR_LIFT),
      rule: node.rule ?? '',
    })
  }

  return {
    nodes,
    edges,
    bars,
    width: round(width),
    height: round(deepest * ROW_STEP + NODE_H + PAD * 2),
    depth: deepest + 1,
    finals: nodes.filter((node) => node.final).map((node) => node.id),
  }
}

/**
 * A support line, bowed vertically.
 *
 * The control points push along Y rather than X, because a proof reads top to
 * bottom: a horizontally-bowed curve between two steps one row apart swings out
 * sideways and crosses whatever sits between them.
 */
export function supportPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const reach = Math.max(scalar(tokens.space.md), Math.abs(to.y - from.y) * 0.45)
  return `M ${round(from.x)} ${round(from.y)} C ${round(from.x)} ${round(from.y + reach)}, ${round(to.x)} ${round(to.y - reach)}, ${round(to.x)} ${round(to.y)}`
}

/** Two lines maximum. A third means the statement wants its own block. */
export function wrapStatement(statement: string): string[] {
  const words = statement.split(' ')
  if (words.length <= 3) return [statement]
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

/* -------------------------------------------------------------------------- */
/* The build                                                                  */
/* -------------------------------------------------------------------------- */

export interface LogicTable {
  ok: true
  variant: LogicData['variant']
  form: 'table'
  table: TruthTable
  caption: string
  warnings: string[]
}

export interface LogicProof {
  ok: true
  variant: LogicData['variant']
  form: 'proof'
  layout: ProofLayout
  caption: string
  warnings: string[]
}

export interface LogicRefusal {
  ok: false
  variant: LogicData['variant']
  problems: ShapeIssue[]
  warnings: string[]
}

export type LogicResult = LogicTable | LogicProof | LogicRefusal

export function buildLogic(data: LogicData, at = 'logic'): LogicResult {
  const issues = checkLogic(data, at)
  const problems = issues.filter((i) => i.level === 'reject')
  const warnings = issues.filter((i) => i.level === 'warn').map((i) => `${i.path} — ${i.message}`)

  if (data.variant === 'truthTable') {
    if (data.steps !== undefined && data.steps.length > 0)
      warnings.push(`${at}.steps — a truth table has no derivation; the steps are ignored`)

    for (const index of repeatedAssignments(data.rows ?? []))
      problems.push({
        path: `${at}.rows[${index}]`,
        message:
          'this assignment already appears above; with every one of the 2^n rows required, a repeat means one assignment is missing entirely',
        level: 'reject',
      })

    if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

    const table = buildTruthTable(data)
    if (table === null)
      return {
        ok: false,
        variant: data.variant,
        problems: [
          ...problems,
          { path: `${at}.rows`, message: 'no inputs or no rows, so there is no table', level: 'reject' },
        ],
        warnings,
      }

    /*
     * THE COLUMN THIS SHAPE DOES NOT HAVE.
     * `rows` carries exactly one value per input and nothing else, so there is
     * nowhere for the expression's own value to live. The table below is a
     * complete enumeration of the assignments and says nothing about what the
     * expression evaluates to under them. Drawing a result column would mean
     * inventing the results.
     */
    warnings.push(
      `${at}.rows — this shape carries one value per input and no result column, so the table enumerates the assignments without saying what the expression evaluates to`,
    )

    return {
      ok: true,
      variant: data.variant,
      form: 'table',
      table,
      caption: `${table.inputs.length} input${table.inputs.length === 1 ? '' : 's'}, all ${table.rows.length} assignments.`,
      warnings,
    }
  }

  const steps = data.steps ?? []
  if (steps.length === 0)
    problems.push({ path: `${at}.steps`, message: 'a derivation with no steps derives nothing', level: 'reject' })

  /*
   * THE CHECK `checkLogic` DOES NOT MAKE.
   * A step justified by a step that is itself justified by the first is not a
   * proof, it is a ring — and every statement in it is unsupported. It cannot
   * be drawn either: there is no depth to give any of its members. Refused,
   * with the ring named, rather than broken somewhere arbitrary and drawn.
   */
  const cycle = findCycle(
    steps.map((step) => step.id),
    steps.flatMap((step) => (step.from ?? []).map((parent) => ({ from: parent, to: step.id }))),
  )
  if (cycle !== null)
    problems.push({
      path: `${at}.steps`,
      message: `these steps justify each other in a ring, so none of them is supported: ${cycle.join(' → ')}`,
      level: 'reject',
    })

  if (problems.length > 0) return { ok: false, variant: data.variant, problems, warnings }

  const layout = layoutProof(steps)

  if (layout.finals.length > 1)
    warnings.push(
      `${at}.steps — ${layout.finals.length} steps have nothing resting on them (${layout.finals.join(', ')}); a single derivation concludes one thing`,
    )

  if (data.variant === 'derivationTree')
    warnings.push(
      `${at} — this shape carries no grammar, so whether each expansion is a production of one cannot be checked; that claim is the author's`,
    )

  const leaves = layout.nodes.filter((node) => node.leaf).length
  return {
    ok: true,
    variant: data.variant,
    form: 'proof',
    layout,
    caption: `${leaves} step${leaves === 1 ? '' : 's'} rest${leaves === 1 ? 's' : ''} on nothing; ${layout.depth} level${layout.depth === 1 ? '' : 's'} of derivation. ${describeLogic(data)}`,
    warnings,
  }
}

/** The logic as a sentence, for anyone who cannot see the diagram. */
export function describeLogic(data: LogicData): string {
  if (data.variant === 'truthTable') {
    const inputs = (data.inputs ?? []).join(', ')
    const rows = (data.rows ?? [])
      .slice(0, 16)
      .map((row) => row.map((value) => (value ? TRUE_MARK : FALSE_MARK)).join(' '))
    return `truthTable over ${inputs}: ${rows.join('; ')}.`
  }

  const byId = new Map((data.steps ?? []).map((step) => [step.id, step.statement]))
  const lines = (data.steps ?? []).slice(0, 24).map((step) => {
    const from = (step.from ?? []).map((id) => byId.get(id) ?? id)
    if (from.length === 0) return `${step.statement} is given`
    return `${step.statement} follows from ${from.join(' and ')} by ${step.rule ?? 'an unnamed rule'}`
  })
  return `${data.variant}: ${lines.join('; ')}.`
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

export function LogicShape({ data, at }: { data: LogicData; at?: string }) {
  const built = buildLogic(data, at)

  if (!built.ok)
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

  if (built.form === 'table') {
    const { table } = built
    return (
      <div>
        <div className="lc-table-wrap">
          <table className="lc-table">
            <caption className="lc-sr-only">{describeLogic(data)}</caption>
            <thead>
              <tr>
                {table.inputs.map((input, i) => (
                  <th key={`${input}-${i}`} scope="col">
                    {input}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.cells.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    /* Aligned by the design system's numeric rule. T and F are
                       one glyph each, and a column of them reads as a pattern
                       only when every glyph stacks over the one above it. */
                    <td key={c} data-numeric="true">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lc-caption">{built.caption}</p>
        <Warnings warnings={built.warnings} />
      </div>
    )
  }

  const { layout } = built
  const gentzen = data.variant === 'proofTree'

  return (
    <div>
      <svg
        className="lc-flow"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={describeLogic(data)}
      >
        {/*
          NO `lc-bloom` ANYWHERE BELOW. Its region is in percentages of the
          object bounding box, and an inference bar is horizontal, so its box is
          zero-height: 500% of zero is zero and the bar would paint nothing at
          all while every attribute read correct. Glow is a second wide stroke.
        */}
        {layout.edges.map((edge, i) => (
          <path key={`glow-${i}`} className="lc-flow__link-glow" d={edge.d} />
        ))}
        {layout.edges.map((edge, i) => (
          <path key={`edge-${i}`} className="lc-flow__link" d={edge.d} />
        ))}

        {/* A proof tree gets the Gentzen bar and a derivation tree does not:
            the bar means "everything above this line entails what is below",
            which is a claim about entailment that a grammar expansion is not
            making. */}
        {gentzen &&
          layout.bars.map((bar) => (
            <g key={`bar-${bar.of}`}>
              <line
                x1={bar.x1}
                y1={bar.y}
                x2={bar.x2}
                y2={bar.y}
                stroke={tokens.color.accent}
                strokeWidth={tokens.stroke.thin}
              />
              {bar.rule !== '' && (
                <text
                  className="lc-flow__node"
                  x={bar.x2 + scalar(tokens.space.xs)}
                  y={bar.y + scalar(tokens.space.xs)}
                  textAnchor="start"
                  fill={tokens.color.inkFaint}
                >
                  {bar.rule}
                </text>
              )}
            </g>
          ))}

        {layout.nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={tokens.radius.md}
              fill="none"
              stroke={node.final ? tokens.color.result : tokens.color.lineStrong}
              strokeWidth={node.final ? tokens.stroke.thick : tokens.stroke.hair}
            />
            <text
              className={node.final ? 'lc-flow__node lc-flow__node--emph' : 'lc-flow__node'}
              x={node.cx}
              y={round(node.cy - ((node.lines.length - 1) * LINE_HEIGHT) / 2 + 4)}
              textAnchor="middle"
            >
              {node.lines.map((line, i) => (
                <tspan key={i} x={node.cx} dy={i === 0 ? 0 : LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
            </text>
            {/* A derivation tree names its rule on the step itself, since it
                has no bar to hang the name off. */}
            {!gentzen && node.rule !== null && (
              <text
                className="lc-flow__node"
                x={node.cx}
                y={round(node.y - scalar(tokens.space.xs))}
                textAnchor="middle"
                fill={tokens.color.inkFaint}
              >
                {node.rule}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="lc-caption">{built.caption}</p>
      <Warnings warnings={built.warnings} />
    </div>
  )
}

/**
 * What the figure could not say, said in words underneath it.
 *
 * A warning is not an error — the figure is correct as far as it goes — but a
 * reader who is not told what it omits will assume it omits nothing, and that
 * assumption is how a truth table with no result column gets read as one.
 */
function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="lc-caption">
      {warnings.map((warning, i) => (
        <li key={i}>{warning}</li>
      ))}
    </ul>
  )
}
