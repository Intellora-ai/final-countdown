import { scaleLinear } from 'd3-scale'
import type {
  RepresentationContract, CapacityProfile, DisclosurePlan, Invariant, DegradationPlan,
} from '../types'
import { Issues, isObj, isStr, isArr, unknownKey, appearanceKeysDeep } from '../validate'

/* THE CHART CONTRACT — one grammar, not one architecture per chart type.
 *
 * A lesson states its INTENT and its data. It does not state a chart type, a
 * colour, an axis position, a tick array, a margin or a pixel. The renderer
 * chooses the mark, the scale, the ticks, the legend and the colours, because
 * those are rendering decisions and a language model has no way to make them
 * correctly for a viewport it cannot see.
 *
 * THE BUG THIS FILE EXISTS TO MAKE IMPOSSIBLE: the reference image's y-axis
 * reads 200, 150, 100, 110. Descending, then not. That is what happens when
 * whatever draws the chart also invents its numbers. Here the ticks come from
 * d3-scale's .nice(), whose postcondition is an ascending, evenly-spaced,
 * round-numbered sequence. There is no code path in this file that chooses a
 * tick value, so there is no code path that can choose a wrong one.
 *
 * AN HONEST AXIS IS NOT ONE RULE. A bar chart must start at zero, because a
 * bar's LENGTH is the quantity and a truncated bar lies about a ratio. A line
 * chart of a narrow range must NOT be forced to zero, because flattening real
 * variation into a straight line at the top of the frame is its own lie. The
 * renderer decides per mark; the model never gets a vote.
 */

const KEYS = ['data', 'fields', 'intent', 'preferredMark'] as const
const FIELD_KEYS = ['name', 'role', 'type', 'unit'] as const

export type ChartIntent =
  | 'trend' | 'comparison' | 'composition' | 'distribution' | 'relationship' | 'change'

export type Mark = 'bar' | 'line' | 'area' | 'pie' | 'scatter'

export interface FieldDefinition {
  name: string
  role: 'x' | 'y' | 'series'
  type: 'quantitative' | 'temporal' | 'nominal' | 'ordinal' | 'currency'
  unit?: string
}

export interface ChartPayload {
  data: Array<Record<string, unknown>>
  fields: FieldDefinition[]
  intent: ChartIntent
  preferredMark?: Mark
}

export interface NormalizedChart {
  data: Array<Record<string, unknown>>
  fields: FieldDefinition[]
  intent: ChartIntent
  preferredMark?: Mark
  x: FieldDefinition
  y: FieldDefinition
  seriesField?: FieldDefinition
  seriesCount: number
  points: number
}

const INTENTS: ChartIntent[] = ['trend','comparison','composition','distribution','relationship','change']
const MARKS: Mark[] = ['bar','line','area','pie','scatter']

/* INTENT CHOOSES THE MARK. Not the model, and not a preference the model
 * expresses — `preferredMark` is a hint that is honoured only when it does not
 * contradict the data. */
function markFor(n: NormalizedChart): Mark {
  const ordered = n.x.type === 'temporal' || n.x.type === 'ordinal'
  switch (n.intent) {
    case 'trend': return ordered || n.points > 8 ? 'line' : 'bar'
    case 'change': return 'area'
    case 'composition': return n.points <= 6 ? 'pie' : 'bar'
    case 'relationship': return n.x.type === 'quantitative' ? 'line' : 'scatter'
    case 'distribution': return 'bar'
    case 'comparison':
    default: return 'bar'
  }
}

/* BASELINE IS A PROPERTY OF THE MARK, NOT A BLANKET RULE. */
function baselineAtZero(mark: Mark): boolean {
  return mark === 'bar' || mark === 'area' || mark === 'pie'
}

export const chartContract: RepresentationContract<ChartPayload, NormalizedChart> = {
  kind: 'chart',
  renderer: 'ChartPanel',

  validate(payload) {
    const issues = new Issues()
    if (!isObj(payload)) return issues.fail('', 'A chart payload must be an object.')

    const bad = unknownKey(payload, KEYS)
    if (bad) return issues.fail(bad, `Unrecognised field '${bad}'. Unknown fields are refused, not stripped.`)

    const appearance = appearanceKeysDeep(payload, '', ['data'])
    if (appearance) {
      return issues.fail(appearance, `'${appearance}' carries appearance. A chart states its data and its intent; the renderer chooses everything else.`)
    }

    if (!isArr(payload.fields) || !payload.fields.length) {
      return issues.fail('fields', 'A chart needs field definitions.')
    }

    const fields: FieldDefinition[] = []
    payload.fields.forEach((f, i) => {
      if (!isObj(f)) { issues.repair(`fields[${i}]`, 'A field was not an object and was omitted.'); return }
      const fk = unknownKey(f, FIELD_KEYS)
      if (fk) { issues.repair(`fields[${i}].${fk}`, `Field carried unrecognised '${fk}' and was omitted.`); return }
      if (!isStr(f.name) || !isStr(f.role)) { issues.repair(`fields[${i}]`, 'A field needed a name and a role.'); return }
      if (['x','y','series'].indexOf(f.role) < 0) { issues.repair(`fields[${i}].role`, `Unknown role '${f.role}'.`); return }
      fields.push({
        name: f.name, role: f.role as FieldDefinition['role'],
        type: (isStr(f.type) ? f.type : 'quantitative') as FieldDefinition['type'],
        ...(isStr(f.unit) ? { unit: f.unit } : {}),
      })
    })

    const x = fields.find((f) => f.role === 'x')
    const y = fields.find((f) => f.role === 'y')
    if (!x || !y) return issues.fail('fields', 'A chart needs an x field and a y field.')

    let intent = payload.intent as ChartIntent
    if (INTENTS.indexOf(intent) < 0) {
      issues.repair('intent', `Unrecognised intent '${String(payload.intent)}'; read as a comparison.`)
      intent = 'comparison'
    }

    let preferredMark = payload.preferredMark as Mark | undefined
    if (preferredMark !== undefined && MARKS.indexOf(preferredMark) < 0) {
      issues.repair('preferredMark', `Unrecognised mark '${String(preferredMark)}'; the renderer will choose.`)
      preferredMark = undefined
    }

    const data = isArr(payload.data) ? payload.data.filter(isObj) : []

    return issues.ok({
      data, fields, intent,
      ...(preferredMark ? { preferredMark } : {}),
    })
  },

  normalize(payload) {
    const x = payload.fields.find((f) => f.role === 'x')!
    const y = payload.fields.find((f) => f.role === 'y')!
    const seriesField = payload.fields.find((f) => f.role === 'series')
    const seriesCount = seriesField
      ? new Set(payload.data.map((d) => String(d[seriesField.name]))).size
      : 1
    return {
      ...payload, x, y, seriesField, seriesCount, points: payload.data.length,
    }
  },

  fitness(n) {
    /* FEWER THAN THREE POINTS IS NOT A CHART. Two bars is a sentence with
     * extra steps, and drawing it as a chart implies a trend that two points
     * cannot support. */
    if (n.points < 3) return 0.1
    if (n.points > 300) return 0.5
    const numericY = n.y.type === 'quantitative' || n.y.type === 'currency'
    if (!numericY) return 0.2
    return n.seriesCount <= 4 ? 0.9 : 0.6
  },

  capacity(n, ctx): CapacityProfile {
    const wide = ctx.viewport.width > 900
    return {
      unit: 'points',
      demand: n.points,
      supply: wide ? 300 : 120,
      span: { min: 4, pref: wide ? 6 : 12, max: 12 },
      rows: { min: 3, pref: 5, max: 8 },
    }
  },

  disclosure(n, ctx): DisclosurePlan[] {
    const plans: DisclosurePlan[] = []
    const cap = this.capacity(n, ctx)

    if (n.points > cap.supply) {
      plans.push({
        strategy: 'aggregate',
        initiallyVisible: cap.supply,
        reachableVia: 'drawer',
        /* Downsampling that is not stated is a lie about the data. */
        notice: `${n.points} points downsampled to ${cap.supply}; the full series is in the data view.`,
      })
    }

    if (n.seriesCount > 6) {
      plans.push({
        strategy: 'aggregate',
        initiallyVisible: 5,
        reachableVia: 'drawer',
        notice: `Showing the 5 largest of ${n.seriesCount} series; the rest are grouped as "Other".`,
      })
    }

    return plans
  },

  derive(n, ctx) {
    const mark = n.preferredMark && marksAgree(n, n.preferredMark) ? n.preferredMark : markFor(n)
    const ys = n.data
      .map((d) => Number(d[n.y.name]))
      .filter((v) => Number.isFinite(v))

    const dataMin = ys.length ? Math.min(...ys) : 0
    const dataMax = ys.length ? Math.max(...ys) : 1

    /* An honest domain, decided per mark.
     *
     * A bar's LENGTH encodes the quantity, so truncating the axis makes a 5%
     * difference look like a 5x one — the classic misleading chart. A line
     * encodes SHAPE, so forcing zero on a series that runs 6.4 to 8.3 flattens
     * every real movement into a straight line and hides the story. Neither
     * rule is universally right, which is exactly why the model does not get
     * to choose. */
    const zeroBased = baselineAtZero(mark)
    const lo = zeroBased ? Math.min(0, dataMin) : dataMin
    const hi = Math.max(dataMax, zeroBased ? 0 : dataMax)

    /* .nice() is the whole guarantee. Its postcondition is an ascending,
     * evenly-spaced, round-numbered sequence — so a descending axis is not
     * something this code avoids, it is something it cannot express. */
    const yScale = scaleLinear().domain([lo, hi]).nice(5)
    const yTicks = yScale.ticks(5)

    const xs = n.data.map((d) => Number(d[n.x.name])).filter((v) => Number.isFinite(v))
    const xScale = xs.length
      ? scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).nice(6)
      : null

    return {
      mark,
      zeroBased,
      yDomain: yScale.domain(),
      yTicks,
      xTicks: xScale ? xScale.ticks(6) : [],
      /* Colours are INDICES into the token series. The model never sees a hex
       * and cannot invent a palette one chart at a time. */
      seriesIndices: Array.from({ length: n.seriesCount }, (_, i) => i % 6),
      /* omitted at 1, inline at 2-3, block at 4+ */
      legend: n.seriesCount === 1 ? 'none' : n.seriesCount <= 3 ? 'inline' : 'block',
      /* Units belong on the axis, always. */
      xLabel: n.x.unit ? `${n.x.name} (${n.x.unit})` : n.x.name,
      yLabel: n.y.unit ? `${n.y.name} (${n.y.unit})` : n.y.name,
      downsampled: n.points > (ctx.viewport.width > 900 ? 300 : 120),
    }
  },

  invariants(n, ctx): Invariant[] {
    const d = this.derive(n, ctx) as {
      yTicks: number[]; zeroBased: boolean; mark: Mark
    }
    const ticks = d.yTicks

    const ascending = ticks.every((t, i) => i === 0 || t > ticks[i - 1])
    const steps = ticks.slice(1).map((t, i) => t - ticks[i])
    const even = steps.every((s) => Math.abs(s - steps[0]) < 1e-9)

    return [
      { name: 'axisAscending', holds: ascending,
        detail: ascending ? undefined : `Ticks are not ascending: ${ticks.join(', ')}` },
      { name: 'axisEvenlySpaced', holds: even,
        detail: even ? undefined : `Tick steps differ: ${steps.join(', ')}` },
      { name: 'barsStartAtZero', holds: !baselineAtZero(d.mark) || d.zeroBased,
        detail: 'A bar chart whose axis does not start at zero misstates every ratio it draws.' },
      { name: 'enoughPointsToPlot', holds: n.points >= 3,
        detail: 'Fewer than three points implies a trend the data cannot support.' },
    ]
  },

  degrade(n): DegradationPlan | null {
    /* If a chart would mislead, something safer is not a compromise — it is
     * the correct answer. */
    if (n.points < 3) {
      return {
        to: 'table',
        reason: 'Fewer than three points is a table, not a trend.',
        payload: {
          columns: [
            { key: n.x.name, label: n.x.name, type: 'text' },
            { key: n.y.name, label: n.y.name, type: 'number', ...(n.y.unit ? { unit: n.y.unit } : {}) },
          ],
          rows: n.data,
        },
      }
    }
    if (n.intent === 'composition' && n.data.some((d) => Number(d[n.y.name]) < 0)) {
      return {
        to: 'table',
        reason: 'Negative values cannot be parts of a whole; a share chart would be false.',
        payload: {
          columns: [
            { key: n.x.name, label: n.x.name, type: 'text' },
            { key: n.y.name, label: n.y.name, type: 'number' },
          ],
          rows: n.data,
        },
      }
    }
    return null
  },
}

/** A preferred mark is honoured only when the data supports it. */
function marksAgree(n: NormalizedChart, mark: Mark): boolean {
  if (mark === 'pie') return n.intent === 'composition' && n.points <= 6
  if (mark === 'line' || mark === 'area') return n.points >= 3
  return true
}
