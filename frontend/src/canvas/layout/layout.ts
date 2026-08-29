import { REPRESENTATIONS, shapeOf, type Shape } from '../spec/representations'
import type { Block, BlockKind, Lesson } from '../spec/spec'

/**
 * Where things go — decided here, never by the author.
 *
 * A PURE FUNCTION, DELIBERATELY
 * -----------------------------
 * `plan(spec, frame)` takes a lesson and a viewport size and returns
 * placements. No DOM, no measuring, no randomness, no clock. That makes the
 * whole grammar testable without a browser, and it makes the same lesson lay
 * out identically on every machine — which is the only way a visual regression
 * can mean anything.
 *
 * THE ARCHETYPE IS DERIVED FROM THE CONTENT'S SHAPE
 * -------------------------------------------------
 * Not from a field the author sets. A lesson dominated by one simulation wants
 * a different composition from one that is six paragraphs, and the SELECTOR
 * must be able to justify its choice — see `explain` on the returned frame.
 * "Two lessons share an archetype" is fine when their profiles genuinely match.
 */

export const COLUMNS = 12

export type Archetype =
  | 'centrepiece' // one dominant visual, everything else orbits it
  | 'evidence' // a claim plus the data that supports it
  | 'sequence' // a chain the reader walks end to end
  | 'reference' // dense material to scan, not to read
  | 'discourse' // mostly prose, few visuals

export interface Placed {
  id: string
  kind: BlockKind
  band: number
  col: number
  span: number
  /** Rows of the band grid this block asks for. Height is derived, not authored. */
  rows: number
  emphasis: Block['emphasis']
  tone: Block['tone']
}

export interface Frame {
  archetype: Archetype
  /** Why this archetype, in one sentence. A selector that cannot say is broken. */
  explain: string
  columns: number
  blocks: Placed[]
  /** Relations that survived placement, for the connector layer to draw. */
  edges: { from: string; to: string; kind: string }[]
}

export interface Viewport {
  width: number
  height: number
}

/* -------------------------------------------------------------------------- */
/* Profile — what SHAPE is this lesson?                                       */
/* -------------------------------------------------------------------------- */

export interface Profile {
  total: number
  counts: Record<BlockKind, number>
  visual: number
  textual: number
  hasSimulation: boolean
  hasSequence: boolean
  dataHeavy: number
}

const VISUAL: BlockKind[] = ['chart', 'simulation', 'flow', 'equation']
/* `misconception`, `summary` and `reasoning` are read like prose — they are
   sentences the learner works through, not data to scan. Leaving them out of
   this list made a lesson of eight text blocks profile as having one, and the
   selector picked a dense reference grid for something meant to be read. */
const TEXTUAL: BlockKind[] = ['prose', 'callout', 'misconception', 'summary', 'reasoning']

export function profile(spec: Lesson): Profile {
  const counts = {
    prose: 0, callout: 0, metric: 0, equation: 0,
    table: 0, chart: 0, flow: 0, simulation: 0, figure: 0,
    misconception: 0, summary: 0, reasoning: 0,
  } as Record<BlockKind, number>

  for (const block of spec.blocks) counts[block.kind] += 1

  /*
   * A FIGURE COUNTS AS WHAT IT IS FOR, NOT AS "A FIGURE".
   *
   * Lumping all 137 representations into one bucket would make a lesson of
   * three sankeys profile identically to one of three histograms, and the
   * selector would pick the same composition for both. The registry already
   * records each type's INTENT, so a figure contributes to the same tallies a
   * purpose-built block would: a heat map is data-heavy, a flowchart is a
   * sequence, a concept map is structure.
   */
  let figureData = 0
  let figureSequence = 0
  for (const block of spec.blocks) {
    if (block.kind !== 'figure') continue
    const intent = REPRESENTATIONS[block.as].intent
    if (intent === 'compare' || intent === 'trend' || intent === 'distribution' || intent === 'relationship')
      figureData += 1
    if (intent === 'sequence') figureSequence += 1
  }

  return {
    total: spec.blocks.length,
    counts,
    visual: VISUAL.reduce((n, k) => n + counts[k], 0) + counts.figure,
    textual: TEXTUAL.reduce((n, k) => n + counts[k], 0),
    hasSimulation: counts.simulation > 0,
    hasSequence: counts.flow > 0 || figureSequence > 0,
    dataHeavy: counts.table + counts.chart + figureData,
  }
}

/**
 * Pick the composition, and say why.
 *
 * Ordered most-specific first. A simulation is the strongest signal there is —
 * it is the one block a reader will spend a minute inside — so it claims the
 * composition before anything else gets a vote.
 */
export function selectArchetype(p: Profile): { archetype: Archetype; explain: string } {
  if (p.hasSimulation)
    return {
      archetype: 'centrepiece',
      explain: `a simulation is present, and it is the block the reader will spend longest inside, so it takes the centre and the other ${p.total - 1} blocks orbit it`,
    }

  if (p.dataHeavy >= 2 && p.dataHeavy >= p.textual)
    return {
      archetype: 'reference',
      explain: `${p.dataHeavy} data blocks against ${p.textual} of prose — this is material to scan, so it lays out as a dense grid rather than a reading column`,
    }

  if (p.hasSequence && p.counts.flow >= 1 && p.visual >= p.textual)
    return {
      archetype: 'sequence',
      explain: `a flow drives the lesson, so blocks run in reading order along the chain rather than competing for the centre`,
    }

  if (p.dataHeavy >= 1 && p.textual >= 1)
    return {
      archetype: 'evidence',
      explain: `a claim (${p.textual} prose) paired with ${p.dataHeavy} data block(s) — the data sits beside what it supports, not below it`,
    }

  return {
    archetype: 'discourse',
    explain: `mostly prose (${p.textual} of ${p.total}), so it reads as a single measured column instead of a grid`,
  }
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                  */
/* -------------------------------------------------------------------------- */

/** How much horizontal room a kind WANTS, before the frame gets a say. */
const NATURAL_SPAN: Record<BlockKind, number> = {
  simulation: 6, chart: 6, table: 8, flow: 12,
  equation: 5, prose: 6, callout: 4, metric: 3, figure: 6,
  /* A misconception is two short lines set against each other. It needs the
     width to put them side by side rather than stacked, which is the entire
     point of showing the wrong form next to the right one. */
  misconception: 8,
  /* A summary is the widest thing on the page: the progression reads as one
     left-to-right run, and wrapping it back onto a second line breaks the
     sense of an order. */
  summary: 12,
  /* A justification is read down the page, one step per line, with the reason
     beside each step. It needs the width for that second column. */
  reasoning: 10,
}

/** How many grid rows a kind needs. Height is derived from kind, never authored. */
const NATURAL_ROWS: Record<BlockKind, number> = {
  simulation: 4, chart: 3, table: 3, flow: 2,
  equation: 2, prose: 2, callout: 2, metric: 1, figure: 3,
  /* Wrong, right, and the reason: three short rows. */
  misconception: 2,
  summary: 2,
  /* Taller than anything else: every step gets its own line. */
  reasoning: 4,
}

/**
 * A figure's footprint comes from its SHAPE, not from `kind: 'figure'`.
 *
 * All 137 representations arrive as one block kind, but a sankey and a waffle
 * want wildly different room. Sizing them alike would give the sankey a column
 * it cannot use and the waffle a hall to rattle around in. The shape is the
 * best available signal and the author never has to think about it.
 */
const SHAPE_SPAN: Record<Shape, number> = {
  series: 6, distribution: 6, parts: 4, matrix: 6,
  graph: 8, process: 12, flowWeighted: 12, intervals: 12,
  hierarchy: 6, tabular: 8, geometry: 5, logic: 5,
}

const SHAPE_ROWS: Record<Shape, number> = {
  series: 3, distribution: 3, parts: 3, matrix: 4,
  graph: 4, process: 3, flowWeighted: 3, intervals: 3,
  hierarchy: 4, tabular: 3, geometry: 3, logic: 2,
}

/** The room a block wants, reading through to a figure's shape. */
function footprint(block: Block): { span: number; rows: number } {
  if (block.kind === 'figure') {
    const shape = shapeOf(block.as)
    return { span: SHAPE_SPAN[shape], rows: SHAPE_ROWS[shape] }
  }
  return { span: NATURAL_SPAN[block.kind], rows: NATURAL_ROWS[block.kind] }
}

const EMPHASIS_BOOST: Record<Block['emphasis'], number> = {
  primary: 2,
  supporting: 0,
  aside: -1,
}

/**
 * Lay the lesson out.
 *
 * NARROW FRAMES COLLAPSE TO ONE COLUMN, THEY DO NOT SHRINK TEXT.
 * "Make it smaller so it fits" is never the answer — the frame gets fewer
 * columns and blocks stack, which keeps every word at its designed size.
 */
export function plan(spec: Lesson, viewport: Viewport): Frame {
  const p = profile(spec)
  const { archetype, explain } = selectArchetype(p)

  const narrow = viewport.width < 900
  const columns = narrow ? 1 : COLUMNS

  const blocks: Placed[] = []
  let band = 0
  let cursor = 0

  /* Centrepiece hoists its simulation to the first band alone, so nothing
     shares a row with the thing the lesson is about. */
  const ordered =
    archetype === 'centrepiece'
      ? [...spec.blocks].sort((a, b) =>
          a.kind === 'simulation' ? -1 : b.kind === 'simulation' ? 1 : 0,
        )
      : spec.blocks

  /*
   * A DERIVATION STACKS; IT DOES NOT SIT ALONGSIDE.
   *
   * `PV = nRT` declares `derives` from `P ∝ T`. Laid out by width alone they
   * landed side by side, and side-by-side reads as "here are two facts" when
   * the author said "this one comes FROM that one". Reading order carries the
   * argument, so a derived block goes directly BENEATH its source, in the same
   * column and at the same width.
   *
   * This is the relations field doing real layout work rather than decorating
   * the spec — which is the whole reason the author states relationships
   * instead of positions.
   */
  const derivedOf = new Map<string, string[]>()
  const isDerived = new Set<string>()
  for (const relation of spec.relations) {
    if (relation.kind !== 'derives') continue
    // `from` derives FROM `to`, so `to` is the source and owns the stack.
    const children = derivedOf.get(relation.to)
    if (children) children.push(relation.from)
    else derivedOf.set(relation.to, [relation.from])
    isDerived.add(relation.from)
  }

  const byId = new Map(ordered.map((b) => [b.id, b]))

  for (const block of ordered) {
    const { span: naturalSpan, rows } = footprint(block)

    if (narrow) {
      blocks.push({
        id: block.id, kind: block.kind, band: band++, col: 0, span: 1, rows,
        emphasis: block.emphasis, tone: block.tone,
      })
      continue
    }

    let span = clamp(naturalSpan + EMPHASIS_BOOST[block.emphasis], 2, COLUMNS)

    // A flow always gets the full width: a wrapped causal chain reads as two
    // unrelated chains, which is worse than a long one.
    if (block.kind === 'flow') span = COLUMNS
    // The centrepiece's simulation is never squeezed beside something else.
    if (archetype === 'centrepiece' && block.kind === 'simulation') span = Math.max(span, 7)

    /* A derived block is placed BY its source, below. Skip it here or it would
       be laid out twice. */
    if (isDerived.has(block.id)) continue

    const children = (derivedOf.get(block.id) ?? [])
      .map((id) => byId.get(id))
      .filter((b): b is Block => b !== undefined)

    /*
     * A STACK OWNS ITS BANDS.
     *
     * The first version placed the derived block at `source.band + rows` and
     * left the cursor alone, on the theory that a new band was free. It was
     * not: the cursor kept filling bands independently and the stacked equation
     * landed on top of the table. `noCollision` caught it, which is exactly
     * what that invariant is for.
     *
     * So the whole stack is claimed at once — break to a fresh band, place the
     * source and every child beneath it, then advance past all of them. No
     * other block can be assigned into those bands because the cursor has
     * already moved beyond them.
     */
    if (children.length > 0) {
      if (cursor > 0) {
        band += 1
        cursor = 0
      }

      blocks.push({
        id: block.id, kind: block.kind, band, col: 0, span, rows,
        emphasis: block.emphasis, tone: block.tone,
      })

      /*
       * THE WALK IS TRANSITIVE, BECAUSE DERIVATION IS.
       *
       * A flat loop over `children` placed the source and one generation below
       * it, and stopped. Anything derived from a DERIVED block was skipped by
       * `isDerived` at the top of the loop and then never placed by anyone —
       * so it vanished from the frame entirely. Measured on gas pressure:
       * `ideal-gas-law` derives from `proportionality`, which derives from
       * `causal-chain`, and the chart came out with twelve of thirteen blocks
       * at three of five widths. No invariant caught it — `noCollision` and
       * `noAccidentalVoid` both check what IS placed, and a block that is
       * simply absent collides with nothing and leaves no hole.
       *
       * Losing content silently is the one outcome the layout may never have.
       * `seen` guards a cycle: `a derives b, b derives a` is a spec a model can
       * emit, and it would otherwise spin here forever.
       */
      let childBand = band + rows
      const seen = new Set<string>([block.id])
      const pending = [...children]
      while (pending.length > 0) {
        const child = pending.shift()
        if (child === undefined || seen.has(child.id)) continue
        seen.add(child.id)

        const childRows = footprint(child).rows
        blocks.push({
          id: child.id, kind: child.kind, band: childBand, col: 0, span, rows: childRows,
          emphasis: child.emphasis, tone: child.tone,
        })
        childBand += childRows

        /* Depth first: what a child derives belongs directly beneath it, not
           after its siblings. Reading order is the argument. */
        const below = (derivedOf.get(child.id) ?? [])
          .map((id) => byId.get(id))
          .filter((b): b is Block => b !== undefined)
        pending.unshift(...below)
      }

      band = childBand
      cursor = 0
      continue
    }

    if (cursor + span > COLUMNS) {
      band += 1
      cursor = 0
    }

    blocks.push({
      id: block.id, kind: block.kind, band, col: cursor, span, rows,
      emphasis: block.emphasis, tone: block.tone,
    })
    cursor += span

    if (cursor >= COLUMNS) {
      band += 1
      cursor = 0
    }
  }

  const placedIds = new Set(blocks.map((b) => b.id))
  const edges = spec.relations
    .filter((r) => placedIds.has(r.from) && placedIds.has(r.to))
    .map((r) => ({ from: r.from, to: r.to, kind: r.kind }))

  return { archetype, explain, columns, blocks, edges }
}

/* -------------------------------------------------------------------------- */
/* Invariants — never paint a failing frame                                   */
/* -------------------------------------------------------------------------- */

export interface CheckResult {
  name: string
  ok: boolean
  offenders: string[]
}

/** No block may claim more columns than the frame has. */
export function noOverflow(frame: Frame): CheckResult {
  const offenders = frame.blocks
    .filter((b) => b.col < 0 || b.span < 1 || b.col + b.span > frame.columns)
    .map((b) => b.id)
  return { name: 'noOverflow', ok: offenders.length === 0, offenders }
}

/** No two blocks in a band may occupy the same column. */
export function noCollision(frame: Frame): CheckResult {
  const offenders: string[] = []
  const byBand = new Map<number, Placed[]>()
  for (const block of frame.blocks) {
    const list = byBand.get(block.band)
    if (list) list.push(block)
    else byBand.set(block.band, [block])
  }

  for (const blocks of byBand.values()) {
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const a = blocks[i]!
        const b = blocks[j]!
        if (a.col < b.col + b.span && b.col < a.col + a.span) offenders.push(a.id, b.id)
      }
    }
  }
  return { name: 'noCollision', ok: offenders.length === 0, offenders: [...new Set(offenders)] }
}

/** An edge may not point at a block that was not placed. */
export function noOrphanEdge(frame: Frame): CheckResult {
  const placed = new Set(frame.blocks.map((b) => b.id))
  const offenders = frame.edges
    .filter((e) => !placed.has(e.from) || !placed.has(e.to))
    .map((e) => `${e.from}->${e.to}`)
  return { name: 'noOrphanEdge', ok: offenders.length === 0, offenders }
}

/**
 * No band may be mostly empty while a later band is full.
 *
 * A half-used band reads as a mistake rather than as breathing room, and it is
 * the visible symptom of a placement bug upstream.
 */
export function noAccidentalVoid(frame: Frame): CheckResult {
  if (frame.columns === 1) return { name: 'noAccidentalVoid', ok: true, offenders: [] }

  const used = new Map<number, number>()
  for (const b of frame.blocks) used.set(b.band, (used.get(b.band) ?? 0) + b.span)

  const bands = [...used.keys()].sort((a, b) => a - b)
  const last = bands[bands.length - 1]
  const offenders = bands
    .filter((band) => band !== last && (used.get(band) ?? 0) < frame.columns / 2)
    .map((band) => `band ${band}`)

  return { name: 'noAccidentalVoid', ok: offenders.length === 0, offenders }
}

export function checkFrame(frame: Frame): CheckResult[] {
  return [noOverflow(frame), noCollision(frame), noOrphanEdge(frame), noAccidentalVoid(frame)]
}

/** True when every invariant holds. The render gate. */
export function frameIsSafe(frame: Frame): boolean {
  return checkFrame(frame).every((c) => c.ok)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
