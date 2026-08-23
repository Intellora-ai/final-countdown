import { ArrowDefs } from '../../design/primitives'
import { tokens } from '../../design/tokens'

/**
 * The `geometry` shape: a drawn construction, described by what it is made of.
 *
 * numberLine · coordinatePlane · geometricFigure · vectorDiagram · vennDiagram ·
 * eulerDiagram · logicCircuit · freeBodyDiagram · circuitSchematic ·
 * experimentalSetup
 *
 * THE PAYLOAD CARRIES NO COORDINATES, AND THAT IS THE POINT
 * ---------------------------------------------------------
 * An element states a `kind`, a `label`, and a `relation` written in words —
 * "at the origin", "on AB", "downward". Laws 2 and 3 forbid the author from
 * saying where anything goes or how big it is, exactly as `plan()` forbids it
 * for page layout. So this file's whole job is to turn meaning into position.
 *
 * WHERE THAT WORKS, AND WHERE IT HONESTLY DOES NOT
 * ------------------------------------------------
 * A vector with `magnitude` and `angleDegrees` is fully determined: it is drawn
 * exactly, to scale. A triangle given as three labelled points and three lines
 * is determined up to placement, so it gets a canonical placement and the page
 * says it is not to scale. A circuit given as a list of components is NOT
 * determined at all — nothing in this shape says which terminal joins which —
 * and inventing the wiring would publish a different circuit. Those three
 * variants render an honest "not drawn here" panel that still lists every
 * element, because the standing rule is never to paint a failing frame and
 * never to lose content.
 *
 * Anything stated that cannot be placed is reported ON THE PAGE, under
 * `unplaced`. A figure that quietly drops an element is worse than one that
 * admits it, because the reader cannot tell the difference between "absent from
 * the data" and "absent from the drawing".
 *
 * PURE AND DETERMINISTIC
 * ----------------------
 * No DOM measurement, no clock, no `Math.random`. Every generated coordinate is
 * rounded to two decimal places: float serialisation differs between one
 * renderer and another, and a `d` attribute that reads `12.100000000000001`
 * server-side and `12.1` client-side is a hydration mismatch that costs a whole
 * afternoon to find.
 */

/* -------------------------------------------------------------------------- */
/* The data                                                                   */
/* -------------------------------------------------------------------------- */

export type GeometryKind =
  | 'point'
  | 'line'
  | 'vector'
  | 'arc'
  | 'set'
  | 'body'
  | 'force'
  | 'component'
  | 'axis'
  | 'region'

export interface GeometryElement {
  id: string
  kind: GeometryKind
  label: string
  /** A SEMANTIC anchor in words. Never pixels. */
  relation?: string
  magnitude?: number
  angleDegrees?: number
}

/**
 * Declared here rather than in `shapeInvariants.ts` because `geometry` is one of
 * the two `UNCHECKED_SHAPES` — it has no arithmetic to be wrong about, so it has
 * no invariant module to hang a type off.
 */
export interface GeometryData {
  variant: string
  elements: GeometryElement[]
}

/* -------------------------------------------------------------------------- */
/* Families                                                                   */
/* -------------------------------------------------------------------------- */

export type GeometryFamily =
  | 'numberLine'
  | 'coordinatePlane'
  | 'vectors'
  | 'sets'
  | 'figure'
  | 'undrawn'

/**
 * Ten names, five drawing strategies, and one deliberate gap.
 *
 * A free-body diagram and a vector diagram are the same construction — arrows
 * from one point, scaled by magnitude, aimed by angle — so they share a builder
 * and differ only in what each is expected to carry. A Venn and an Euler are
 * both circles-for-sets, but a Venn draws every intersection by definition
 * while an Euler draws only the ones the author states, which is why they split
 * inside `buildSets` rather than into two families.
 */
export const GEOMETRY_FAMILY: Record<string, GeometryFamily> = {
  numberLine: 'numberLine',
  coordinatePlane: 'coordinatePlane',
  vectorDiagram: 'vectors',
  freeBodyDiagram: 'vectors',
  vennDiagram: 'sets',
  eulerDiagram: 'sets',
  geometricFigure: 'figure',
  logicCircuit: 'undrawn',
  circuitSchematic: 'undrawn',
  experimentalSetup: 'undrawn',
}

/**
 * Why the three undrawn ones are undrawn, in the words a maintainer needs.
 *
 * All three fail on the same thing: this shape lists PARTS and says nothing
 * about how they join. For a triangle that is survivable, because "A, B, C and
 * the segments between them" determines the picture up to placement. For a
 * circuit it is fatal — a netlist is the circuit, and a schematic drawn from a
 * component list is a picture of a different circuit that looks authoritative.
 */
export const UNDRAWN_REASON: Record<string, string> = {
  circuitSchematic:
    'a schematic is its netlist, and this shape carries no connections — only a list of components. Drawing plausible wiring would publish a different circuit.',
  logicCircuit:
    'a logic circuit needs a gate type per element and a wire list; this shape has neither, so the gates could not be told apart and the wiring would be invented.',
  experimentalSetup:
    'an apparatus drawing needs a glyph per piece of equipment and a spatial arrangement; this shape has no vocabulary for either, and no way to show the control condition.',
}

export function geometryFamilyFor(variant: string): GeometryFamily {
  return GEOMETRY_FAMILY[variant] ?? 'undrawn'
}

/* -------------------------------------------------------------------------- */
/* Marks — everything drawable, in one union                                  */
/* -------------------------------------------------------------------------- */

/**
 * A role is a JOB, resolved to a token by the renderer. No builder ever names a
 * colour or a width, so Law 4 holds by construction rather than by review.
 */
export type MarkRole = 'axis' | 'tick' | 'primary' | 'muted' | 'result'

export type Mark =
  | { kind: 'segment'; id: string; x1: number; y1: number; x2: number; y2: number; role: MarkRole }
  | { kind: 'arrow'; id: string; x1: number; y1: number; x2: number; y2: number; role: MarkRole }
  | { kind: 'dot'; id: string; x: number; y: number; r: number; role: MarkRole }
  | { kind: 'circle'; id: string; cx: number; cy: number; r: number; role: MarkRole }
  | { kind: 'rect'; id: string; x: number; y: number; w: number; h: number; role: MarkRole }
  | { kind: 'arc'; id: string; cx: number; cy: number; r: number; d: string; role: MarkRole }
  | {
      kind: 'label'
      id: string
      x: number
      y: number
      text: string
      anchor: 'start' | 'middle' | 'end'
      role: MarkRole
    }

export interface Extent {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * A mark's bounding box, used by the tests to prove nothing leaves the frame.
 *
 * An arc reports its whole CIRCLE, which over-states it. That is deliberate: a
 * bound that is too generous can only make the "inside the viewBox" test
 * stricter, and a bound computed from the endpoints alone would miss the bulge
 * and quietly let a real overflow through.
 *
 * A label reports its anchor only. Text width cannot be known without measuring,
 * and measuring is what this renderer is not allowed to do — so labels are
 * placed pointing inward instead, and the anchor is what can honestly be
 * checked.
 */
export function extentOf(mark: Mark): Extent {
  switch (mark.kind) {
    case 'segment':
    case 'arrow':
      return {
        minX: Math.min(mark.x1, mark.x2),
        minY: Math.min(mark.y1, mark.y2),
        maxX: Math.max(mark.x1, mark.x2),
        maxY: Math.max(mark.y1, mark.y2),
      }
    case 'dot':
      return { minX: mark.x - mark.r, minY: mark.y - mark.r, maxX: mark.x + mark.r, maxY: mark.y + mark.r }
    case 'circle':
    case 'arc':
      return {
        minX: mark.cx - mark.r,
        minY: mark.cy - mark.r,
        maxX: mark.cx + mark.r,
        maxY: mark.cy + mark.r,
      }
    case 'rect':
      return { minX: mark.x, minY: mark.y, maxX: mark.x + mark.w, maxY: mark.y + mark.h }
    case 'label':
      return { minX: mark.x, minY: mark.y, maxX: mark.x, maxY: mark.y }
    default: {
      const exhaustive: never = mark
      return exhaustive
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The result                                                                 */
/* -------------------------------------------------------------------------- */

export interface Figure {
  width: number
  height: number
  viewBox: string
  marks: Mark[]
}

/** Something the author stated that this renderer could not place, and why. */
export interface Unplaced {
  id: string
  label: string
  reason: string
}

export interface GeometryDrawn {
  ok: true
  variant: string
  family: GeometryFamily
  figure: Figure
  unplaced: Unplaced[]
  warnings: string[]
  note: string
  description: string
}

export interface GeometryUndrawn {
  ok: false
  variant: string
  family: GeometryFamily
  reason: string
  elements: GeometryElement[]
  warnings: string[]
}

export type GeometryResult = GeometryDrawn | GeometryUndrawn

/* -------------------------------------------------------------------------- */
/* Frame geometry                                                             */
/* -------------------------------------------------------------------------- */

/* SVG user units inside a viewBox, on the same footing as the other shapes'.
   The frames are CONSTANTS rather than fitted to the content, so "nothing is
   drawn outside the viewBox" is a claim a test can falsify. A frame computed
   from the marks it contains would make that test true by definition and prove
   nothing at all. */
const PAD = 32
const FRAME_W = 480
const FRAME_H = 300
const LINE_H = 150

/** Room reserved outside a placed point for its own label. */
const LABEL_GAP = 12
const LABEL_LINE = 15

const CX = FRAME_W / 2
const CY = FRAME_H / 2

/** Half the plotting area, less the room a point's label needs beyond it. */
const HALF_X = CX - PAD - LABEL_GAP
const HALF_Y = CY - PAD - LABEL_GAP

/** The longest an arrow may be, so tip plus label still clears the padding. */
const ARROW_MAX = 100
const ARROW_UNSCALED = 54
const BODY_W = 96
const BODY_H = 36

const NUMBER_LINE_Y = 88
const TICK = 5
const TICK_LABEL_DY = 20
/** A fourth point at one spot has nowhere left to stack; it is named instead. */
const MAX_STACK = 3

const DOT_R = 4
const FIGURE_R = 100
const ARC_R = 24

/* -------------------------------------------------------------------------- */
/* Numbers                                                                    */
/* -------------------------------------------------------------------------- */

/** Two decimals is below one device pixel at every scale this canvas allows. */
export function round(value: number): number {
  return Math.round(value * 100) / 100
}

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * A tick step from the 1-2-5 family.
 *
 * Ticks that are not round numbers are worse than no ticks: the reader spends
 * their attention decoding the axis instead of reading the figure, and a step
 * of 0.30000000000000004 is a float artefact presented as a measurement.
 */
export function niceStep(span: number, target: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const rough = span / Math.max(1, target)
  const power = Math.floor(Math.log10(rough))
  const base = 10 ** power
  for (const multiple of [1, 2, 5]) if (base * multiple >= rough) return base * multiple
  return base * 10
}

/** How many decimals a step needs, so 0.1 + 0.2 never reaches an axis label. */
function decimalsFor(step: number): number {
  return Math.max(0, Math.min(6, -Math.floor(Math.log10(step))))
}

/**
 * Evenly spaced tick values covering `[min, max]`.
 *
 * Each value is rebuilt from `first + i * step` and then snapped to the step's
 * own precision, rather than accumulated. Accumulating drifts, and drift on an
 * axis is how a chart once shipped a y-axis reading 200, 150, 100, 110.
 */
export function ticksOver(min: number, max: number, target: number): { value: number; text: string }[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return []
  const step = niceStep(max - min, target)
  const dp = decimalsFor(step)
  const first = Math.ceil(min / step) * step
  const out: { value: number; text: string }[] = []
  for (let i = 0; i < 200; i += 1) {
    const raw = first + i * step
    if (raw > max + step / 1000) break
    const value = Number(raw.toFixed(dp))
    out.push({ value, text: value.toFixed(dp) })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Semantic parsing — meaning in, position out                                */
/* -------------------------------------------------------------------------- */

const COORD_PAIR = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/
const ANY_NUMBER = /-?\d+(?:\.\d+)?/g
const ORIGIN = /\borigin\b/i

/**
 * A direction word that fixes an ABSOLUTE angle, and only those.
 *
 * "downward" is a direction. "down the incline", "normal to the surface" and
 * "parallel to AB" are not — they are directions relative to something this
 * shape never states, and resolving them to a number would be the renderer
 * inventing the incline's angle. The guard below is why: without it, "down the
 * incline" matches "down" and the arrow points at the floor, confidently and
 * wrongly.
 */
const RELATIVE_TO_SOMETHING =
  /\b(incline|slope|surface|plane|ramp|normal|parallel|perpendicular|along|toward|towards|tangent|radial|axis)\b/i

const DIRECTIONS: [RegExp, number][] = [
  [/\b(up|upward|upwards|north|northward)\b/i, 90],
  [/\b(down|downward|downwards|south|southward)\b/i, 270],
  [/\b(left|leftward|leftwards|west|westward)\b/i, 180],
  [/\b(right|rightward|rightwards|east|eastward)\b/i, 0],
]

/** Degrees counter-clockwise from the positive x axis, or null if not stated. */
export function directionFrom(text: string | undefined): number | null {
  if (text === undefined) return null
  if (RELATIVE_TO_SOMETHING.test(text)) return null
  for (const [pattern, degrees] of DIRECTIONS) if (pattern.test(text)) return degrees
  return null
}

/** The first `(x, y)` in the text, or the origin when the text names it. */
export function coordsFrom(text: string | undefined): { x: number; y: number } | null {
  if (text === undefined) return null
  const pair = COORD_PAIR.exec(text)
  if (pair) {
    const x = Number(pair[1])
    const y = Number(pair[2])
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
  }
  if (ORIGIN.test(text)) return { x: 0, y: 0 }
  return null
}

/** Every number in the text, in order. Used for values and for intervals. */
export function numbersIn(text: string | undefined): number[] {
  if (text === undefined) return []
  return [...text.matchAll(ANY_NUMBER)].map((m) => Number(m[0])).filter((n) => Number.isFinite(n))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Which of the given names a relation mentions, in the order they appear.
 *
 * A ONE-LETTER NAME NEEDS ITS OWN RULE. Geometry writes the segment from A to B
 * as "AB", so a word boundary — the obvious choice — finds neither name. Made
 * boundary-free instead, "A" then matches the "a" of "at the origin" and the
 * figure grows a segment nobody drew. So a single-character name is matched
 * case-SENSITIVELY and must not sit against a lower-case letter on either side:
 * "AB" and "angle at A" both resolve, "at" and "Angle" do not.
 */
export function namesIn(text: string | undefined, names: readonly string[]): string[] {
  if (text === undefined) return []
  const found: { name: string; at: number }[] = []

  for (const name of names) {
    if (name.length === 0) continue
    const escaped = escapeRegExp(name)
    const pattern =
      name.length === 1
        ? new RegExp(`(?<!\\p{Ll})${escaped}(?!\\p{Ll})`, 'u')
        : new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu')
    const match = pattern.exec(text)
    if (match) found.push({ name, at: match.index })
  }

  found.sort((a, b) => a.at - b.at || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return found.map((f) => f.name)
}

/* -------------------------------------------------------------------------- */
/* The entry point                                                            */
/* -------------------------------------------------------------------------- */

export function buildGeometry(data: GeometryData, at = 'geometry'): GeometryResult {
  const family = geometryFamilyFor(data.variant)
  const warnings = variantWarnings(data, at)

  if (family === 'undrawn')
    return {
      ok: false,
      variant: data.variant,
      family,
      reason:
        UNDRAWN_REASON[data.variant] ??
        'this renderer has no strategy for that representation, and a plausible-looking guess would be a wrong figure.',
      elements: data.elements,
      warnings,
    }

  if (data.elements.length === 0)
    return {
      ok: false,
      variant: data.variant,
      family,
      reason: 'the construction has no elements, so there is nothing to place.',
      elements: [],
      warnings,
    }

  const built =
    family === 'numberLine'
      ? buildNumberLine(data)
      : family === 'coordinatePlane'
        ? buildCoordinatePlane(data)
        : family === 'vectors'
          ? buildVectors(data)
          : family === 'sets'
            ? buildSets(data)
            : buildFigure(data)

  if (!built.ok) return { ...built, variant: data.variant, family, warnings }

  return {
    ok: true,
    variant: data.variant,
    family,
    figure: built.figure,
    unplaced: built.unplaced,
    warnings,
    note: built.note,
    description: describeGeometry(data),
  }
}

/** What a builder hands back before the variant-level framing is added. */
interface Built {
  ok: true
  figure: Figure
  unplaced: Unplaced[]
  note: string
}
interface NotBuilt {
  ok: false
  reason: string
  elements: GeometryElement[]
}
type BuildOutcome = Built | NotBuilt

function frame(width: number, height: number, marks: Mark[]): Figure {
  return { width, height, viewBox: `0 0 ${width} ${height}`, marks }
}

/**
 * What each named type needs that this shape does not carry, taken from the
 * registry's own `avoidWhen`. Said out loud rather than drawn as though it were
 * there — a number line without a marked scale is not a smaller number line, it
 * is a picture that cannot be read.
 */
function variantWarnings(data: GeometryData, at: string): string[] {
  const out: string[] = []
  const kinds = new Set(data.elements.map((e) => e.kind))

  if (data.variant === 'coordinatePlane' && !kinds.has('axis'))
    out.push(`${at}.elements — no axis element names the axes, so neither carries a unit`)

  if (data.variant === 'vectorDiagram' && !kinds.has('axis'))
    out.push(`${at}.elements — no axis element states the frame of reference these vectors are measured in`)

  if (data.variant === 'freeBodyDiagram') {
    const bodies = data.elements.filter((e) => e.kind === 'body').length
    if (bodies === 0)
      out.push(`${at}.elements — no body element, so nothing is shown as isolated from its surroundings`)
    if (bodies > 1)
      out.push(`${at}.elements — ${bodies} bodies; a free-body diagram isolates one, and only the first is drawn at the origin`)
  }

  if (data.variant === 'geometricFigure' && data.elements.some((e) => finite(e.magnitude)))
    out.push(`${at}.elements — lengths are stated but this figure is drawn at a canonical placement, NOT to scale`)

  if (data.variant === 'vennDiagram') {
    const sets = data.elements.filter((e) => e.kind === 'set').length
    if (sets > 3)
      out.push(`${at}.elements — ${sets} sets; a Venn beyond three needs ellipses this renderer does not draw`)
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* numberLine                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A value on the line, from whatever the author gave.
 *
 * `magnitude` first because it is the unambiguous field; then a number written
 * into the relation ("at 3", "at -2.5"); then the origin by name; and finally
 * the label itself, because a point on a number line is very often labelled
 * with the number it sits at.
 */
function valueOn(element: GeometryElement): number | null {
  if (finite(element.magnitude)) return element.magnitude
  if (element.relation !== undefined && ORIGIN.test(element.relation)) return 0
  const fromRelation = numbersIn(element.relation)
  if (fromRelation.length > 0) return fromRelation[0] ?? null
  const fromLabel = numbersIn(element.label)
  return fromLabel.length === 1 ? (fromLabel[0] ?? null) : null
}

function buildNumberLine(data: GeometryData): BuildOutcome {
  const unplaced: Unplaced[] = []
  const points: { element: GeometryElement; value: number }[] = []
  const spans: { element: GeometryElement; from: number; to: number }[] = []

  for (const element of data.elements) {
    /* An axis element names the line itself — "temperature in °C" — rather than
       marking a position on it. It becomes the caption, not a dot. */
    if (element.kind === 'axis') continue

    if (element.kind === 'line' || element.kind === 'region') {
      const ends = numbersIn(element.relation)
      if (ends.length >= 2) {
        const a = ends[0] ?? 0
        const b = ends[1] ?? 0
        spans.push({ element, from: Math.min(a, b), to: Math.max(a, b) })
        continue
      }
    }

    const value = valueOn(element)
    if (value === null) {
      unplaced.push({
        id: element.id,
        label: element.label,
        reason: 'no magnitude, and the relation names no value on the line',
      })
      continue
    }
    points.push({ element, value })
  }

  const values = [...points.map((p) => p.value), ...spans.flatMap((s) => [s.from, s.to])]
  if (values.length === 0)
    return {
      ok: false,
      reason: 'nothing states a position on the line, so there is no scale to draw.',
      elements: data.elements,
    }

  const [min, max] = domainFor(values)
  const scale = (value: number): number =>
    PAD + ((value - min) / (max - min)) * (FRAME_W - PAD * 2)

  const marks: Mark[] = [
    { kind: 'segment', id: 'axis', x1: PAD, y1: NUMBER_LINE_Y, x2: FRAME_W - PAD, y2: NUMBER_LINE_Y, role: 'axis' },
    /* Both ends carry the system's one arrowhead: a number line continues, and
       a bare segment claims it stops at the last tick. */
    { kind: 'arrow', id: 'axis-left', x1: PAD + TICK * 2, y1: NUMBER_LINE_Y, x2: PAD, y2: NUMBER_LINE_Y, role: 'axis' },
    {
      kind: 'arrow',
      id: 'axis-right',
      x1: FRAME_W - PAD - TICK * 2,
      y1: NUMBER_LINE_Y,
      x2: FRAME_W - PAD,
      y2: NUMBER_LINE_Y,
      role: 'axis',
    },
  ]

  for (const tick of ticksOver(min, max, 8)) {
    const x = round(scale(tick.value))
    marks.push({ kind: 'segment', id: `tick-${tick.text}`, x1: x, y1: NUMBER_LINE_Y - TICK, x2: x, y2: NUMBER_LINE_Y + TICK, role: 'tick' })
    marks.push({
      kind: 'label',
      id: `tick-label-${tick.text}`,
      x,
      y: NUMBER_LINE_Y + TICK_LABEL_DY,
      text: tick.text,
      anchor: 'middle',
      role: 'muted',
    })
  }

  /* An interval sits ABOVE the line rather than on it, because a bar drawn over
     the axis hides the very ticks that say what it covers. */
  for (const span of spans) {
    const x1 = round(scale(span.from))
    const x2 = round(scale(span.to))
    marks.push({ kind: 'segment', id: `span-${span.element.id}`, x1, y1: NUMBER_LINE_Y - TICK - 3, x2, y2: NUMBER_LINE_Y - TICK - 3, role: 'result' })
    marks.push({ kind: 'dot', id: `span-a-${span.element.id}`, x: x1, y: NUMBER_LINE_Y, r: DOT_R, role: 'result' })
    marks.push({ kind: 'dot', id: `span-b-${span.element.id}`, x: x2, y: NUMBER_LINE_Y, r: DOT_R, role: 'result' })
    marks.push({
      kind: 'label',
      id: `span-label-${span.element.id}`,
      x: round((x1 + x2) / 2),
      y: NUMBER_LINE_Y - TICK - LABEL_LINE,
      text: span.element.label,
      anchor: 'middle',
      role: 'result',
    })
  }

  /* Two points at one value would print their labels on top of each other, so
     labels stack upward. Four deep runs out of frame, and the fourth is named
     in the unplaced list rather than drawn over its neighbour. */
  const stacked = new Map<number, number>()
  for (const point of points) {
    const x = round(scale(point.value))
    marks.push({ kind: 'dot', id: `point-${point.element.id}`, x, y: NUMBER_LINE_Y, r: DOT_R, role: 'primary' })

    const level = stacked.get(x) ?? 0
    stacked.set(x, level + 1)
    if (level >= MAX_STACK) {
      unplaced.push({
        id: point.element.id,
        label: point.element.label,
        reason: `${MAX_STACK} labels already sit at ${point.value}; a fourth would print over them`,
      })
      continue
    }
    marks.push({
      kind: 'label',
      id: `point-label-${point.element.id}`,
      x,
      y: NUMBER_LINE_Y - TICK - LABEL_LINE * (level + 1),
      text: point.element.label,
      anchor: 'middle',
      role: 'primary',
    })
  }

  const axisName = data.elements.find((e) => e.kind === 'axis')?.label
  return {
    ok: true,
    figure: frame(FRAME_W, LINE_H, marks),
    unplaced,
    note: `${axisName ? `${axisName}. ` : ''}The scale runs from ${round(min)} to ${round(max)}; every point is placed at the value it states.`,
  }
}

/**
 * The window the line shows.
 *
 * Zero is included when it is already close — a number line that omits the
 * origin reads as a fragment — but NOT when the data sits far from it, because
 * stretching to reach zero from 1000..1005 collapses the five values the figure
 * exists to separate.
 */
export function domainFor(values: number[]): [number, number] {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  if (min > 0 && min <= span) min = 0
  if (max < 0 && max >= -span) max = 0
  const padding = (max - min) * 0.12
  return [min - padding, max + padding]
}

/* -------------------------------------------------------------------------- */
/* coordinatePlane                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A point in the plane, from coordinates or from polar form.
 *
 * `(2, 3)` is the written convention and needs no interpretation. A point given
 * as a magnitude and an angle is equally determined, and refusing it would mean
 * refusing every polar statement an author can make.
 */
function planePointFor(element: GeometryElement): { x: number; y: number } | null {
  const written = coordsFrom(element.relation) ?? coordsFrom(element.label)
  if (written) return written
  if (finite(element.magnitude) && finite(element.angleDegrees)) {
    const radians = (element.angleDegrees * Math.PI) / 180
    return { x: element.magnitude * Math.cos(radians), y: element.magnitude * Math.sin(radians) }
  }
  return null
}

function buildCoordinatePlane(data: GeometryData): BuildOutcome {
  const unplaced: Unplaced[] = []
  const points: { element: GeometryElement; x: number; y: number }[] = []
  const axes = data.elements.filter((e) => e.kind === 'axis')

  for (const element of data.elements) {
    if (element.kind === 'axis') continue
    const point = planePointFor(element)
    if (point === null) {
      unplaced.push({
        id: element.id,
        label: element.label,
        reason: 'the relation states no (x, y) pair, and there is no magnitude-and-angle to derive one from',
      })
      continue
    }
    points.push({ element, ...point })
  }

  /* An empty plane is still a plane: the axes, the origin and the quadrants are
     the lesson often enough that refusing here would be the wrong call. */
  const reach = Math.max(1, ...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
  const step = niceStep(reach * 2, 8)
  const extent = Math.max(step, Math.ceil(reach / step) * step)

  /*
   * ONE SCALE FOR BOTH AXES, ALWAYS.
   * Stretching x to fill the wider frame would make a right angle look acute
   * and a circle look like an ellipse — the plane would be lying about shape,
   * which is the one thing a coordinate plane is for. The frame is wider than
   * it is tall, so the extra width shows MORE x, at the same scale.
   */
  const scale = HALF_Y / extent
  const visibleX = HALF_X / scale
  const toScreenX = (x: number): number => CX + x * scale
  const toScreenY = (y: number): number => CY - y * scale

  const marks: Mark[] = [
    { kind: 'segment', id: 'x-axis', x1: PAD, y1: CY, x2: FRAME_W - PAD, y2: CY, role: 'axis' },
    { kind: 'segment', id: 'y-axis', x1: CX, y1: PAD, x2: CX, y2: FRAME_H - PAD, role: 'axis' },
  ]

  for (const tick of ticksOver(-visibleX, visibleX, 8)) {
    if (tick.value === 0) continue
    const x = round(toScreenX(tick.value))
    marks.push({ kind: 'segment', id: `xt-${tick.text}`, x1: x, y1: CY - TICK, x2: x, y2: CY + TICK, role: 'tick' })
    marks.push({ kind: 'label', id: `xtl-${tick.text}`, x, y: CY + TICK_LABEL_DY, text: tick.text, anchor: 'middle', role: 'muted' })
  }
  for (const tick of ticksOver(-extent, extent, 6)) {
    if (tick.value === 0) continue
    const y = round(toScreenY(tick.value))
    marks.push({ kind: 'segment', id: `yt-${tick.text}`, x1: CX - TICK, y1: y, x2: CX + TICK, y2: y, role: 'tick' })
    marks.push({ kind: 'label', id: `ytl-${tick.text}`, x: CX - TICK * 2, y: y + 4, text: tick.text, anchor: 'end', role: 'muted' })
  }

  /* Quadrants named where they are, so a lesson can refer to "the third
     quadrant" and the reader can find it without a key. */
  const quadrants: [string, number, number][] = [
    ['I', CX + HALF_X * 0.92, CY - HALF_Y * 0.92],
    ['II', CX - HALF_X * 0.92, CY - HALF_Y * 0.92],
    ['III', CX - HALF_X * 0.92, CY + HALF_Y * 0.92],
    ['IV', CX + HALF_X * 0.92, CY + HALF_Y * 0.92],
  ]
  for (const [name, x, y] of quadrants)
    marks.push({ kind: 'label', id: `quadrant-${name}`, x: round(x), y: round(y), text: name, anchor: 'middle', role: 'muted' })

  const [xAxis, yAxis] = namedAxes(axes)
  if (xAxis)
    marks.push({ kind: 'label', id: 'x-axis-label', x: FRAME_W - PAD, y: CY - LABEL_GAP, text: xAxis, anchor: 'end', role: 'muted' })
  if (yAxis)
    marks.push({ kind: 'label', id: 'y-axis-label', x: CX + LABEL_GAP, y: PAD, text: yAxis, anchor: 'start', role: 'muted' })

  for (const point of points) {
    const x = round(toScreenX(point.x))
    const y = round(toScreenY(point.y))
    marks.push({ kind: 'dot', id: `point-${point.element.id}`, x, y, r: DOT_R, role: 'primary' })
    /* The label leans back toward the middle of the frame, so a point at the
       edge of the plotting area never pushes its own text out of the picture. */
    const toward = x > CX ? -1 : 1
    marks.push({
      kind: 'label',
      id: `point-label-${point.element.id}`,
      x: round(x + toward * LABEL_GAP * 0.7),
      y: round(y + (y > CY ? LABEL_LINE : -LABEL_GAP * 0.7)),
      text: point.element.label,
      anchor: toward > 0 ? 'start' : 'end',
      role: 'primary',
    })
  }

  return {
    ok: true,
    figure: frame(FRAME_W, FRAME_H, marks),
    unplaced,
    note: `Both axes are at the same scale, so shape and angle are true. Ticks every ${step}.`,
  }
}

/**
 * Which axis element labels x and which labels y.
 *
 * Matched on the words first, because an author writing "y — pressure (kPa)"
 * has said which one it is and ordering it second would be the renderer
 * overruling them. Declaration order is only the fallback.
 */
export function namedAxes(axes: readonly GeometryElement[]): [string | null, string | null] {
  const says = (element: GeometryElement, pattern: RegExp): boolean =>
    pattern.test(element.label) || pattern.test(element.relation ?? '')

  const horizontal = axes.find((a) => says(a, /\b(x|horizontal|abscissa)\b/i))
  const vertical = axes.find((a) => says(a, /\b(y|vertical|ordinate)\b/i))
  if (horizontal || vertical) return [horizontal?.label ?? null, vertical?.label ?? null]

  return [axes[0]?.label ?? null, axes[1]?.label ?? null]
}

/* -------------------------------------------------------------------------- */
/* vectorDiagram · freeBodyDiagram                                            */
/* -------------------------------------------------------------------------- */

const ARROW_KINDS = new Set<GeometryKind>(['vector', 'force', 'component'])

function buildVectors(data: GeometryData): BuildOutcome {
  const unplaced: Unplaced[] = []
  const arrows: { element: GeometryElement; degrees: number; magnitude: number | null }[] = []
  const bodies = data.elements.filter((e) => e.kind === 'body')

  for (const element of data.elements) {
    if (element.kind === 'body' || element.kind === 'axis') continue
    if (!ARROW_KINDS.has(element.kind)) {
      unplaced.push({
        id: element.id,
        label: element.label,
        reason: `a ${element.kind} has no direction, and this diagram places things by direction alone`,
      })
      continue
    }

    const degrees = finite(element.angleDegrees) ? element.angleDegrees : directionFrom(element.relation)
    if (degrees === null) {
      unplaced.push({
        id: element.id,
        label: element.label,
        reason:
          'no angle, and the relation gives no absolute direction — a direction stated relative to a surface or an incline needs that surface’s angle, which this shape does not carry',
      })
      continue
    }
    arrows.push({ element, degrees, magnitude: finite(element.magnitude) ? element.magnitude : null })
  }

  if (arrows.length === 0)
    return {
      ok: false,
      reason: 'no element states a direction, so there is no arrow whose angle would be true.',
      elements: data.elements,
    }

  const largest = Math.max(0, ...arrows.map((a) => Math.abs(a.magnitude ?? 0)))
  const marks: Mark[] = []

  /*
   * The body is drawn FIRST and the arrows start at the origin, on top of it.
   * That is the notation: in a free-body diagram every force acts at the centre
   * of mass, so an arrow that began at the box's edge would be claiming a point
   * of application the physics does not have.
   */
  const body = bodies[0]
  if (body !== undefined) {
    marks.push({ kind: 'rect', id: `body-${body.id}`, x: CX - BODY_W / 2, y: CY - BODY_H / 2, w: BODY_W, h: BODY_H, role: 'muted' })
    marks.push({ kind: 'label', id: `body-label-${body.id}`, x: CX, y: CY + 4, text: body.label, anchor: 'middle', role: 'muted' })
  }
  for (const extra of bodies.slice(1))
    unplaced.push({
      id: extra.id,
      label: extra.label,
      reason: 'a free-body diagram isolates one body; only the first is at the origin',
    })

  for (const arrow of arrows) {
    const radians = (arrow.degrees * Math.PI) / 180
    /* Screen y grows downward while an angle grows counter-clockwise, so the
       sine is negated. Miss this and every diagram is mirrored about the x
       axis — which looks plausible and is wrong. */
    const dx = Math.cos(radians)
    const dy = -Math.sin(radians)

    const scaled =
      arrow.magnitude === null || largest <= 0
        ? ARROW_UNSCALED
        : (Math.abs(arrow.magnitude) / largest) * ARROW_MAX
    const length = Math.max(TICK * 2, scaled)

    const tipX = round(CX + dx * length)
    const tipY = round(CY + dy * length)
    marks.push({
      kind: 'arrow',
      id: `vector-${arrow.element.id}`,
      x1: CX,
      y1: CY,
      x2: tipX,
      y2: tipY,
      role: arrow.magnitude === null ? 'muted' : 'primary',
    })
    marks.push({
      kind: 'label',
      id: `vector-label-${arrow.element.id}`,
      x: round(CX + dx * (length + LABEL_GAP)),
      y: round(CY + dy * (length + LABEL_GAP) + 4),
      text: arrow.element.label,
      anchor: 'middle',
      role: arrow.magnitude === null ? 'muted' : 'primary',
    })
  }

  const unscaled = arrows.filter((a) => a.magnitude === null).length
  const parts = [
    largest > 0
      ? `Lengths are to scale: the longest arrow is ${round(largest)}.`
      : 'No magnitude is stated, so every arrow is drawn the same length and length carries no information.',
  ]
  if (unscaled > 0 && largest > 0)
    parts.push(`${unscaled} arrow${unscaled === 1 ? '' : 's'} state no magnitude and ${unscaled === 1 ? 'is' : 'are'} drawn at a fixed length, so only ${unscaled === 1 ? 'its' : 'their'} direction is meant.`)

  return { ok: true, figure: frame(FRAME_W, FRAME_H, marks), unplaced, note: parts.join(' ') }
}

/* -------------------------------------------------------------------------- */
/* vennDiagram · eulerDiagram                                                 */
/* -------------------------------------------------------------------------- */

const CONTAINED_IN = /\b(inside|within|subset of|contained in|part of|belongs to)\b/i
const DISJOINT_FROM = /\b(disjoint|separate from|outside|apart from|exclusive of)\b/i

/** Circle centres for one, two and three sets — the arrangements that exist. */
export function vennCircles(count: number): { cx: number; cy: number; r: number }[] {
  if (count === 1) return [{ cx: CX, cy: CY, r: 90 }]
  if (count === 2)
    return [
      { cx: CX - 45, cy: CY, r: 70 },
      { cx: CX + 45, cy: CY, r: 70 },
    ]
  /* Three circles at 120°, each pair overlapping and all three sharing a middle
     region: the only three-set arrangement in which every intersection exists,
     which is what makes it a Venn rather than an Euler. */
  return [0, 1, 2].map((i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3
    return { cx: round(CX + 42 * Math.cos(angle)), cy: round(CY + 42 * Math.sin(angle)), r: 66 }
  })
}

function buildSets(data: GeometryData): BuildOutcome {
  const sets = data.elements.filter((e) => e.kind === 'set')
  const regions = data.elements.filter((e) => e.kind === 'region')
  const unplaced: Unplaced[] = data.elements
    .filter((e) => e.kind !== 'set' && e.kind !== 'region')
    .map((e) => ({ id: e.id, label: e.label, reason: `a ${e.kind} is not part of a set diagram` }))

  if (sets.length === 0)
    return { ok: false, reason: 'no set elements, so there are no regions to draw.', elements: data.elements }

  if (data.variant === 'eulerDiagram') return buildEuler(data, sets, unplaced)

  if (sets.length > 3)
    return {
      ok: false,
      reason: `a Venn of ${sets.length} sets needs ellipses rather than circles to show every intersection; drawing ${sets.length} circles would leave real intersections with nowhere to be, and a Venn missing a region is a different claim.`,
      elements: data.elements,
    }

  const circles = vennCircles(sets.length)
  const marks: Mark[] = []
  const centroid = {
    x: circles.reduce((sum, c) => sum + c.cx, 0) / circles.length,
    y: circles.reduce((sum, c) => sum + c.cy, 0) / circles.length,
  }

  sets.forEach((set, i) => {
    const circle = circles[i]
    if (circle === undefined) return
    marks.push({ kind: 'circle', id: `set-${set.id}`, cx: circle.cx, cy: circle.cy, r: circle.r, role: 'primary' })

    /* The name sits on the side of its own circle that is furthest from the
       middle — the one part of every circle that belongs to that set alone. */
    const away = unitAway(circle, centroid)
    marks.push({
      kind: 'label',
      id: `set-label-${set.id}`,
      x: round(circle.cx + away.x * circle.r * 0.68),
      y: round(circle.cy + away.y * circle.r * 0.68),
      text: set.label,
      anchor: 'middle',
      role: 'primary',
    })
  })

  const names = sets.map((s) => s.label)
  for (const region of regions) {
    const mentioned = namesIn(region.relation ?? region.label, names)
    const indices = mentioned
      .map((name) => names.indexOf(name))
      .filter((i) => i >= 0 && circles[i] !== undefined)

    if (indices.length === 0) {
      unplaced.push({
        id: region.id,
        label: region.label,
        reason: 'the relation names none of the sets, so which region it is cannot be told',
      })
      continue
    }

    const anchor = regionAnchor(indices, circles, centroid)
    marks.push({
      kind: 'label',
      id: `region-${region.id}`,
      x: round(anchor.x),
      y: round(anchor.y),
      text: region.label,
      anchor: 'middle',
      role: 'result',
    })
  }

  return {
    ok: true,
    figure: frame(FRAME_W, FRAME_H, marks),
    unplaced,
    note: `${sets.length} set${sets.length === 1 ? '' : 's'}, drawn so that every intersection exists — which is what makes it a Venn rather than an Euler.`,
  }
}

function unitAway(circle: { cx: number; cy: number }, from: { x: number; y: number }): { x: number; y: number } {
  const dx = circle.cx - from.x
  const dy = circle.cy - from.y
  const length = Math.hypot(dx, dy)
  /* A single circle is its own centroid, so "away" is undefined; upward is the
     conventional place for a lone set's name. */
  return length < 1e-9 ? { x: 0, y: -1 } : { x: dx / length, y: dy / length }
}

/**
 * Where a named region's label goes.
 *
 * Start at the mean of the NAMED circles' centres, then walk away from the mean
 * of the ones NOT named. Both halves matter.
 *
 * The mean alone is not enough. With three circles, the midpoint of two centres
 * comes out 63 units from the third centre and the third circle's radius is 66,
 * so a label reading "A and B" lands inside C — in the triple region, naming
 * the wrong one. Measured, not guessed: the arrangement is chosen in this file,
 * so the numbers are knowable and the test pins them.
 *
 * The same walk solves the single-set case: "A only" placed at A's own centre
 * would sit inside B as well, so it steps out into the lobe that belongs to A
 * alone. It steps further there, because it has a whole lens to clear rather
 * than the corner of one.
 */
export function regionAnchor(
  indices: number[],
  circles: { cx: number; cy: number; r: number }[],
  centroid: { x: number; y: number },
): { x: number; y: number } {
  const wanted = new Set(indices)
  const chosen = circles.filter((_, i) => wanted.has(i))
  const rest = circles.filter((_, i) => !wanted.has(i))
  if (chosen.length === 0) return { x: centroid.x, y: centroid.y }

  const mean = {
    x: chosen.reduce((sum, c) => sum + c.cx, 0) / chosen.length,
    y: chosen.reduce((sum, c) => sum + c.cy, 0) / chosen.length,
  }
  /* Every named set and nothing left out: the mean IS the shared region. */
  if (rest.length === 0) return mean

  const other = {
    x: rest.reduce((sum, c) => sum + c.cx, 0) / rest.length,
    y: rest.reduce((sum, c) => sum + c.cy, 0) / rest.length,
  }
  const away = unitAway({ cx: mean.x, cy: mean.y }, other)
  const smallest = Math.min(...chosen.map((c) => c.r))
  const step = smallest * (chosen.length === 1 ? 0.55 : 0.34)
  return { x: mean.x + away.x * step, y: mean.y + away.y * step }
}

/**
 * An Euler diagram, which is a different claim from a Venn.
 *
 * A Venn draws every intersection because that is its definition. An Euler
 * draws ONLY the regions that exist, so the containments are the whole content
 * — and this shape states them nowhere except in words. With no relation
 * naming another set, both available drawings assert something: overlapping
 * circles claim intersections, separate circles claim disjointness. Neither is
 * in the data, so neither is drawn.
 */
function buildEuler(data: GeometryData, sets: GeometryElement[], unplaced: Unplaced[]): BuildOutcome {
  const names = sets.map((s) => s.label)
  const parent = new Map<string, string>()
  const anchored = new Set<string>()

  sets.forEach((set) => {
    const text = set.relation
    if (text === undefined) return
    const mentioned = namesIn(text, names).filter((name) => name !== set.label)
    const other = mentioned[0]
    if (other === undefined) return
    if (CONTAINED_IN.test(text)) {
      parent.set(set.label, other)
      anchored.add(set.label)
      anchored.add(other)
    } else if (DISJOINT_FROM.test(text)) {
      anchored.add(set.label)
      anchored.add(other)
    }
  })

  if (anchored.size === 0)
    return {
      ok: false,
      reason:
        'an Euler diagram shows which regions exist, and no element states a containment or a disjointness. Overlapping circles would claim intersections the data never mentions; separate circles would claim they are disjoint. Both are inventions, so neither is drawn.',
      elements: data.elements,
    }

  /* A containment chain that loops is not a containment. Refused rather than
     drawn, because the drawing would have to break the loop somewhere and the
     reader could not tell where. */
  for (const start of parent.keys()) {
    let cursor: string | undefined = start
    for (let hops = 0; hops <= sets.length; hops += 1) {
      cursor = cursor === undefined ? undefined : parent.get(cursor)
      if (cursor === undefined) break
      if (cursor === start)
        return {
          ok: false,
          reason: `"${start}" is inside itself once the containments are followed round; that is not a containment.`,
          elements: data.elements,
        }
    }
  }

  const drawable = sets.filter((s) => anchored.has(s.label))
  for (const set of sets)
    if (!anchored.has(set.label))
      unplaced.push({
        id: set.id,
        label: set.label,
        reason: 'no relation says how this set sits against the others, and an Euler diagram is nothing but those relations',
      })

  const childrenOf = new Map<string, GeometryElement[]>()
  const roots: GeometryElement[] = []
  for (const set of drawable) {
    const above = parent.get(set.label)
    if (above === undefined || !anchored.has(above)) roots.push(set)
    else childrenOf.set(above, [...(childrenOf.get(above) ?? []), set])
  }

  const marks: Mark[] = []
  const rootR = Math.min(HALF_Y, (FRAME_W - PAD * 2) / Math.max(1, roots.length) / 2 - 6)
  const tooDeep: GeometryElement[] = []

  const place = (set: GeometryElement, cx: number, cy: number, r: number, depth: number): void => {
    if (r < 14) {
      tooDeep.push(set)
      return
    }
    marks.push({ kind: 'circle', id: `set-${set.id}`, cx: round(cx), cy: round(cy), r: round(r), role: depth === 0 ? 'primary' : 'result' })
    marks.push({
      kind: 'label',
      id: `set-label-${set.id}`,
      x: round(cx),
      y: round(cy - r + LABEL_LINE),
      text: set.label,
      anchor: 'middle',
      role: depth === 0 ? 'primary' : 'result',
    })

    const kids = childrenOf.get(set.label) ?? []
    if (kids.length === 0) return
    const kidR = kids.length === 1 ? r * 0.55 : r * 0.34
    const ring = kids.length === 1 ? 0 : r - kidR - 8
    kids.forEach((kid, i) => {
      const angle = Math.PI / 2 + (i * 2 * Math.PI) / kids.length
      place(kid, cx + ring * Math.cos(angle), cy + ring * Math.sin(angle), kidR, depth + 1)
    })
  }

  roots.forEach((root, i) => {
    const slot = (FRAME_W - PAD * 2) / roots.length
    place(root, PAD + slot * (i + 0.5), CY, rootR, 0)
  })

  for (const set of tooDeep)
    unplaced.push({
      id: set.id,
      label: set.label,
      reason: 'nested too deeply to draw at a size its own name would fit inside',
    })

  return {
    ok: true,
    figure: frame(FRAME_W, FRAME_H, marks),
    unplaced,
    note: 'Only the regions the elements actually state are drawn: a set inside another is nested, and sets that state no shared region are drawn apart.',
  }
}

/* -------------------------------------------------------------------------- */
/* geometricFigure                                                            */
/* -------------------------------------------------------------------------- */

const MIDPOINT_OF = /\bmid-?point of\b/i
const ON_SEGMENT = /\bon\b/i

interface PlacedPoint {
  element: GeometryElement
  x: number
  y: number
}

/**
 * A canonical placement for points that state nothing about where they are.
 *
 * A triangle described as "A, B, C and the segments AB, BC, CA" is determined
 * up to similarity, so SOME placement has to be chosen. A regular polygon is
 * the choice that adds the least: it introduces no accidental right angle, no
 * accidental parallel, and no illusion that the drawing was measured.
 */
export function canonicalSlot(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: CX, y: CY }
  if (count === 2)
    return index === 0 ? { x: CX - FIGURE_R, y: CY } : { x: CX + FIGURE_R, y: CY }
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
  return { x: CX + FIGURE_R * Math.cos(angle), y: CY + FIGURE_R * Math.sin(angle) }
}

function buildFigure(data: GeometryData): BuildOutcome {
  const unplaced: Unplaced[] = []
  const pointElements = data.elements.filter((e) => e.kind === 'point')
  if (pointElements.length === 0)
    return {
      ok: false,
      reason: 'a figure is drawn from its labelled points, and none are stated.',
      elements: data.elements,
    }

  /*
   * A POINT'S LABEL IS ITS NAME, so two points cannot share one.
   * Relations address points by label — "the midpoint of AB" — and with two
   * points called B there is no fact of the matter about which one that is.
   * Named rather than silently overwritten.
   */
  const seen = new Set<string>()
  const points: GeometryElement[] = []
  for (const element of pointElements) {
    if (seen.has(element.label)) {
      unplaced.push({
        id: element.id,
        label: element.label,
        reason: 'another point already has that label, and relations name points by label',
      })
      continue
    }
    seen.add(element.label)
    points.push(element)
  }

  const names = points.map((p) => p.label)
  const placed = new Map<string, PlacedPoint>()

  /*
   * THREE GROUPS, BECAUSE ONLY ONE OF THEM MAY TAKE A POLYGON SLOT.
   * A point stated to be at the origin has a position already, and a point
   * defined from two others cannot be placed until those two are. If either
   * took a slot, the independent points would shift around depending on how
   * many derived points happened to be listed — so the same triangle would be
   * drawn differently once a midpoint was named.
   */
  const derived: GeometryElement[] = []
  const atOrigin: GeometryElement[] = []
  const free: GeometryElement[] = []
  for (const element of points) {
    const text = element.relation ?? ''
    if (namesIn(text, names).filter((n) => n !== element.label).length >= 2 && (MIDPOINT_OF.test(text) || ON_SEGMENT.test(text)))
      derived.push(element)
    else if (ORIGIN.test(text)) atOrigin.push(element)
    else free.push(element)
  }

  for (const element of atOrigin) placed.set(element.label, { element, x: CX, y: CY })
  free.forEach((element, index) => {
    const slot = canonicalSlot(index, free.length)
    placed.set(element.label, { element, x: slot.x, y: slot.y })
  })

  /* How many points already sit on each segment, so a second "on AB" lands
     somewhere else along it rather than exactly on top of the first. */
  const alongCount = new Map<string, number>()
  /* Points whose relation constrains them to a segment without saying where on
     it. Named in the note, because the drawing cannot show the difference. */
  const representative: string[] = []
  for (let pass = 0; pass < 3; pass += 1) {
    for (const element of derived) {
      if (placed.has(element.label)) continue
      const text = element.relation ?? ''
      const referents = namesIn(text, names).filter((n) => n !== element.label)
      const first = referents[0]
      const second = referents[1]
      if (first === undefined || second === undefined) continue
      const a = placed.get(first)
      const b = placed.get(second)
      if (a === undefined || b === undefined) continue

      const key = `${first}|${second}`
      const rank = alongCount.get(key) ?? 0
      alongCount.set(key, rank + 1)
      /* "the midpoint of AB" fixes the point exactly. "on AB" does not — it
         constrains without locating — so the first lands at the middle and each
         later one further along, and the note says so rather than letting the
         picture pass a chosen position off as a stated one. */
      const exact = MIDPOINT_OF.test(text)
      if (!exact) representative.push(element.label)
      const t = exact ? 0.5 : (rank + 1) / (rank + 2)
      placed.set(element.label, {
        element,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      })
    }
  }

  for (const element of derived)
    if (!placed.has(element.label))
      unplaced.push({
        id: element.id,
        label: element.label,
        reason: 'the points its relation names are not themselves placed',
      })

  const marks: Mark[] = []
  const segments: { a: PlacedPoint; b: PlacedPoint }[] = []

  for (const element of data.elements) {
    if (element.kind === 'point') continue

    if (element.kind === 'line') {
      const referents = namesIn(element.relation ?? element.label, names)
      const first = referents[0]
      const second = referents[1]
      const a = first === undefined ? undefined : placed.get(first)
      const b = second === undefined ? undefined : placed.get(second)
      if (a === undefined || b === undefined) {
        unplaced.push({
          id: element.id,
          label: element.label,
          reason: 'the relation does not name two placed points, so there are no ends to draw between',
        })
        continue
      }
      segments.push({ a, b })
      marks.push({ kind: 'segment', id: `line-${element.id}`, x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y), role: 'primary' })
      continue
    }

    if (element.kind === 'arc') {
      const referents = namesIn(element.relation ?? element.label, names)
      const at = referents[0]
      const vertex = at === undefined ? undefined : placed.get(at)
      if (vertex === undefined) {
        unplaced.push({ id: element.id, label: element.label, reason: 'the relation names no placed point to mark an angle at' })
        continue
      }
      const neighbours = segments
        .filter((s) => s.a.element.id === vertex.element.id || s.b.element.id === vertex.element.id)
        .map((s) => (s.a.element.id === vertex.element.id ? s.b : s.a))
      const one = neighbours[0]
      const two = neighbours[1]
      if (one === undefined || two === undefined) {
        unplaced.push({
          id: element.id,
          label: element.label,
          reason: 'fewer than two segments meet that point, so there is no angle between them to mark',
        })
        continue
      }
      const a0 = Math.atan2(one.y - vertex.y, one.x - vertex.x)
      const a1 = Math.atan2(two.y - vertex.y, two.x - vertex.x)
      marks.push({ kind: 'arc', id: `arc-${element.id}`, cx: round(vertex.x), cy: round(vertex.y), r: ARC_R, d: arcPath(vertex.x, vertex.y, ARC_R, a0, a1), role: 'result' })
      continue
    }

    unplaced.push({ id: element.id, label: element.label, reason: `a ${element.kind} has no boundary this figure can derive` })
  }

  for (const point of placed.values()) {
    marks.push({ kind: 'dot', id: `point-${point.element.id}`, x: round(point.x), y: round(point.y), r: DOT_R, role: 'primary' })
    /* The name sits outside the figure, away from the centre, so it never lands
       on a segment and gets read as a length. */
    const away = unitAway({ cx: point.x, cy: point.y }, { x: CX, y: CY })
    marks.push({
      kind: 'label',
      id: `point-label-${point.element.id}`,
      x: round(point.x + away.x * LABEL_GAP),
      y: round(point.y + away.y * LABEL_GAP + 4),
      text: point.element.label,
      anchor: 'middle',
      role: 'primary',
    })
  }

  const stated = data.elements.some((e) => finite(e.magnitude) || finite(e.angleDegrees))
  const note = [
    stated
      ? 'NOT TO SCALE. Lengths or angles are stated in the data but the figure is drawn at a canonical placement; read the values, not the picture.'
      : 'Drawn at a canonical placement. The points and the segments between them are stated; their positions are not, so no length or angle here is a measurement.',
  ]
  if (representative.length > 0)
    note.push(
      `${representative.join(', ')} ${representative.length === 1 ? 'is' : 'are'} stated to lie ON a segment, which does not say where on it; the position drawn is representative.`,
    )

  return { ok: true, figure: frame(FRAME_W, FRAME_H, marks), unplaced, note: note.join(' ') }
}

/** The shorter of the two arcs between two directions, as an SVG path. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  let sweep = a1 - a0
  while (sweep <= -Math.PI) sweep += Math.PI * 2
  while (sweep > Math.PI) sweep -= Math.PI * 2
  const end = a0 + sweep
  const x0 = round(cx + r * Math.cos(a0))
  const y0 = round(cy + r * Math.sin(a0))
  const x1 = round(cx + r * Math.cos(end))
  const y1 = round(cy + r * Math.sin(end))
  return `M ${x0} ${y0} A ${r} ${r} 0 0 ${sweep >= 0 ? 1 : 0} ${x1} ${y1}`
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

/** The construction as a sentence, for anyone who cannot see the drawing. */
export function describeGeometry(data: GeometryData): string {
  const parts = data.elements.slice(0, 24).map((element) => {
    const bits = [element.kind, element.label]
    if (element.relation !== undefined) bits.push(element.relation)
    if (finite(element.magnitude)) bits.push(`magnitude ${element.magnitude}`)
    if (finite(element.angleDegrees)) bits.push(`${element.angleDegrees}°`)
    return bits.join(' — ')
  })
  const more = data.elements.length > 24 ? `, and ${data.elements.length - 24} more` : ''
  return `${data.variant}: ${parts.join('; ')}${more}.`
}

/* -------------------------------------------------------------------------- */
/* Painting                                                                   */
/* -------------------------------------------------------------------------- */

/* A role resolved to a token. This is the only place in the file where a mark
   meets a colour, which is what keeps Law 4 true by construction. */
function strokeFor(role: MarkRole): string {
  if (role === 'primary') return tokens.color.accent
  if (role === 'result') return tokens.color.result
  if (role === 'axis') return tokens.color.lineStrong
  if (role === 'tick') return tokens.color.line
  return tokens.color.inkFaint
}

function widthFor(role: MarkRole): string {
  return role === 'tick' || role === 'muted' ? tokens.stroke.hair : tokens.stroke.thin
}

function fillFor(role: MarkRole): string {
  return role === 'primary' ? tokens.color.accent : tokens.color.result
}

function Marks({ marks }: { marks: Mark[] }) {
  return (
    <>
      {marks.map((mark) => {
        if (mark.kind === 'segment' || mark.kind === 'arrow')
          return (
            <line
              key={mark.id}
              x1={mark.x1}
              y1={mark.y1}
              x2={mark.x2}
              y2={mark.y2}
              stroke={strokeFor(mark.role)}
              strokeWidth={widthFor(mark.role)}
              {...(mark.kind === 'arrow' ? { markerEnd: 'url(#lc-arrow)' } : {})}
            />
          )

        if (mark.kind === 'dot')
          return <circle key={mark.id} cx={mark.x} cy={mark.y} r={mark.r} fill={fillFor(mark.role)} />

        if (mark.kind === 'circle')
          return (
            <circle
              key={mark.id}
              cx={mark.cx}
              cy={mark.cy}
              r={mark.r}
              /* A faint wash rather than a solid one: where two sets overlap the
                 washes add, so the intersection reads as a region without any
                 renderer having to compute the lens. */
              fill={fillFor(mark.role)}
              fillOpacity={0.07}
              stroke={strokeFor(mark.role)}
              strokeWidth={widthFor(mark.role)}
            />
          )

        if (mark.kind === 'rect')
          return (
            <rect
              key={mark.id}
              x={mark.x}
              y={mark.y}
              width={mark.w}
              height={mark.h}
              rx={tokens.radius.sm}
              fill="none"
              stroke={strokeFor(mark.role)}
              strokeWidth={widthFor(mark.role)}
            />
          )

        if (mark.kind === 'arc')
          return (
            <path
              key={mark.id}
              d={mark.d}
              fill="none"
              stroke={strokeFor(mark.role)}
              strokeWidth={widthFor(mark.role)}
            />
          )

        return (
          <text
            key={mark.id}
            className={mark.role === 'primary' ? 'lc-flow__node lc-flow__node--emph' : 'lc-flow__node'}
            x={mark.x}
            y={mark.y}
            textAnchor={mark.anchor}
            {...(mark.role === 'primary' ? {} : { fill: strokeFor(mark.role) })}
          >
            {mark.text}
          </text>
        )
      })}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* The component                                                              */
/* -------------------------------------------------------------------------- */

export function GeometryShape({ data, at }: { data: GeometryData; at?: string }) {
  const built = buildGeometry(data, at)

  if (!built.ok)
    return (
      <div className="lc-refusal">
        <h2>This {data.variant} is not drawn</h2>
        <ul>
          <li>{built.reason}</li>
        </ul>
        {/* The elements are still the lesson's content, so they are still on the
            page. A representation this renderer cannot draw is not a reason to
            lose what the author wrote. */}
        {built.elements.length > 0 && (
          <>
            <p className="lc-caption">Stated in the data:</p>
            <ul>
              {built.elements.map((element) => (
                <li key={element.id}>
                  <code>{element.kind}</code> {element.label}
                  {element.relation === undefined ? '' : ` — ${element.relation}`}
                  {finite(element.magnitude) ? ` — magnitude ${element.magnitude}` : ''}
                  {finite(element.angleDegrees) ? ` — ${element.angleDegrees}°` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )

  const { figure } = built

  return (
    <div>
      <svg className="lc-flow" viewBox={figure.viewBox} role="img" aria-label={built.description}>
        {/*
          NO `lc-bloom` ANYWHERE BELOW. Its region is in percentages of the
          object bounding box, and an axis — or any horizontal segment — has a
          zero-height box, so the filter output has no area and the line paints
          nothing while every attribute reads correct.
        */}
        <ArrowDefs />
        <Marks marks={figure.marks} />
      </svg>

      <p className="lc-caption">{built.note}</p>

      {/* Stated but not placed. On the page rather than swallowed: a reader
          cannot otherwise tell "absent from the data" from "absent from the
          drawing", and those are completely different facts. */}
      {built.unplaced.length > 0 && (
        <div className="lc-refusal">
          <h2>Stated, but not placed</h2>
          <ul>
            {built.unplaced.map((item) => (
              <li key={item.id}>
                <code>{item.label}</code> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {built.warnings.length > 0 && (
        <ul className="lc-caption">
          {built.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
