import type {
  RepresentationContract, CapacityProfile,
  DisclosurePlan, Invariant, DegradationPlan,
} from '../types'
import { Issues, isObj, isStr, isNum, isArr, unknownKey, appearanceKeysDeep } from '../validate'

/* TABLE — where column TYPE drives everything.
 *
 * Alignment and width are never declarable. A generator that could set
 * `align: 'center'` on a number column would produce a table that looks wrong
 * in a way no stylesheet can fix, so the schema simply has no such field: the
 * column's type decides, and the same type decides identically in every lesson.
 * That is what makes two tables in two different subjects read as one product.
 *
 * The single most important line in this file is `tabular-nums` in derive().
 * Proportional digits make columns of numbers jitter; tabular figures make
 * them line up. It is the difference between a real table and a fake one.
 */

const MAX_ROWS = 500
const KEYS = ['columns', 'rows', 'caption'] as const
const COL_KEYS = ['key', 'label', 'type', 'unit', 'precision'] as const

export type ColumnType =
  | 'text' | 'category' | 'number' | 'currency' | 'percent'
  | 'date' | 'boolean' | 'formula'

export interface Column {
  key: string
  label: string
  type: ColumnType
  /** Shown in the header — "Pressure (kPa)" — never repeated per cell. */
  unit?: string
  precision?: number
}

export interface TablePayload {
  columns: Column[]
  rows: Array<Record<string, unknown>>
  caption?: string
}

export interface NormalizedTable {
  columns: Column[]
  rows: Array<Record<string, unknown>>
  caption?: string
}

const TYPES: ColumnType[] = ['text','category','number','currency','percent','date','boolean','formula']
const NUMERIC = new Set<ColumnType>(['number', 'currency', 'percent', 'formula'])

/* Alignment is DERIVED from type. Never authored, never overridable. */
function alignFor(t: ColumnType): 'left' | 'right' | 'center' {
  if (NUMERIC.has(t)) return 'right'
  if (t === 'boolean') return 'center'
  return 'left'
}

function roleFor(t: ColumnType): 'body' | 'label' | 'mono' {
  if (NUMERIC.has(t)) return 'mono'
  if (t === 'date') return 'mono'
  if (t === 'category') return 'label'
  return 'body'
}

export const tableContract: RepresentationContract<TablePayload, NormalizedTable> = {
  kind: 'table',
  renderer: 'TablePanel',

  validate(payload) {
    const issues = new Issues()
    if (!isObj(payload)) return issues.fail('', 'A table payload must be an object.')

    const bad = unknownKey(payload, KEYS)
    if (bad) return issues.fail(bad, `Unrecognised field '${bad}'. Unknown fields are refused, not stripped.`)

    const appearance = appearanceKeysDeep(payload, '', ['rows'])
    if (appearance) {
      return issues.fail(appearance, `'${appearance}' carries appearance. A column's type decides its alignment; a lesson does not.`)
    }

    if (!isArr(payload.columns) || !payload.columns.length) {
      return issues.fail('columns', 'A table needs at least one column.')
    }

    const columns: Column[] = []
    const seen = new Set<string>()
    payload.columns.forEach((c, i) => {
      if (!isObj(c)) { issues.repair(`columns[${i}]`, 'A column was not an object and was omitted.'); return }
      const ck = unknownKey(c, COL_KEYS)
      if (ck) { issues.repair(`columns[${i}].${ck}`, `Column carried unrecognised field '${ck}' and was omitted.`); return }
      if (!isStr(c.key) || !isStr(c.label)) { issues.repair(`columns[${i}]`, 'A column needed a key and a label.'); return }
      if (seen.has(c.key)) { issues.repair(`columns[${i}]`, `Duplicate column key '${c.key}' was omitted.`); return }

      let type = c.type as ColumnType
      if (TYPES.indexOf(type) < 0) {
        issues.repair(`columns[${i}].type`, `Unrecognised column type '${String(c.type)}'; shown as text.`)
        type = 'text'
      }
      seen.add(c.key)
      columns.push({
        key: c.key, label: c.label, type,
        ...(isStr(c.unit) ? { unit: c.unit } : {}),
        ...(isNum(c.precision) ? { precision: Math.max(0, Math.min(6, Math.floor(c.precision))) } : {}),
      })
    })
    if (!columns.length) return issues.fail('columns', 'A table had no usable columns.')

    let raw = isArr(payload.rows) ? payload.rows : []
    if (raw.length > MAX_ROWS) {
      issues.repair('rows', `This table has ${raw.length} rows; the first ${MAX_ROWS} are loaded and the rest are available on request.`)
      raw = raw.slice(0, MAX_ROWS)
    }

    const rows: Array<Record<string, unknown>> = []
    raw.forEach((r, i) => {
      if (!isObj(r)) { issues.repair(`rows[${i}]`, 'A row was not an object and was omitted.'); return }
      const out: Record<string, unknown> = {}
      for (const col of columns) {
        const v = r[col.key]
        if (v === undefined) issues.repair(`rows[${i}].${col.key}`, `Missing value shown as a dash.`)
        out[col.key] = v ?? null
      }
      rows.push(out)
    })

    return issues.ok({
      columns, rows,
      ...(isStr(payload.caption) ? { caption: payload.caption } : {}),
    })
  },

  normalize(payload) { return payload },

  fitness(n) {
    /* A table is the right answer when the data has real columns. It is the
     * WRONG answer for two rows of prose, and scores accordingly. */
    if (n.columns.length < 2) return 0.2
    if (n.rows.length < 2) return 0.3
    const cellText = n.rows.reduce(
      (m, r) => Math.max(m, ...n.columns.map((c) => String(r[c.key] ?? '').length)), 0,
    )
    /* A 200-character cell is prose wearing a table's clothes. */
    if (cellText > 200) return 0.15
    const structured = n.columns.filter((c) => c.type !== 'text').length
    return Math.min(0.95, 0.6 + structured * 0.08)
  },

  capacity(n, ctx): CapacityProfile {
    const cols = n.columns.length
    const span = cols <= 3 ? 5 : cols <= 6 ? 8 : 12
    /* Row height is a CONSTANT token. Capacity changes how many rows are
     * VISIBLE; it never changes how tall a row is. */
    const rowH = 34
    const visible = Math.max(4, Math.floor((ctx.viewport.height * 0.42) / rowH))
    return {
      unit: 'rows',
      demand: n.rows.length,
      supply: visible,
      span: { min: 4, pref: span, max: 12 },
      rows: { min: 3, pref: Math.min(n.rows.length + 2, 14), max: 20 },
    }
  },

  disclosure(n, ctx): DisclosurePlan[] {
    const cap = this.capacity(n, ctx)
    const plans: DisclosurePlan[] = []
    const rows = n.rows.length
    const cols = n.columns.length

    /* Row strategy — visibility changes, styling never does. */
    if (rows > 200) {
      plans.push({
        strategy: 'aggregate', initiallyVisible: 0, reachableVia: 'drawer',
        notice: `${rows} rows are summarised as a chart. Every row is available in the data view.`,
      })
    } else if (rows > 40) {
      plans.push({
        strategy: 'paginate', initiallyVisible: cap.supply, reachableVia: 'pager',
        notice: `${rows} rows, shown ${cap.supply} at a time.`,
      })
    } else if (rows > cap.supply) {
      plans.push({
        strategy: 'scroll_y', initiallyVisible: cap.supply, reachableVia: 'scroll',
        notice: undefined,
      })
    }

    /* Column strategy. Beyond ten columns a table stops being readable in any
     * width, so the entities become rows instead — a genuine transform, not a
     * squeeze. */
    if (cols > 10) {
      plans.push({
        strategy: 'split_block', initiallyVisible: cols, reachableVia: 'next-section',
        notice: `${cols} columns is wider than a screen reads; entities are shown as rows.`,
      })
    } else if (cols > 6) {
      plans.push({
        strategy: 'scroll_y', initiallyVisible: 6, reachableVia: 'scroll',
        notice: 'The first column stays visible while the rest scroll.',
      })
    }

    /* Long cells expand rather than clip. */
    const longCell = n.rows.some((r) =>
      n.columns.some((c) => String(r[c.key] ?? '').length > 80))
    if (longCell) {
      plans.push({
        strategy: 'progressive_disclosure', initiallyVisible: 2, reachableVia: 'expand',
        notice: undefined,
      })
    }

    return plans
  },

  derive(n) {
    /* Everything the renderer needs, decided here so no component re-derives
     * it differently. */
    return {
      columns: n.columns.map((c) => ({
        ...c,
        align: alignFor(c.type),
        role: roleFor(c.type),
        /* THE LINE THAT MAKES IT A REAL TABLE. Proportional digits jitter;
         * tabular figures line up under each other. */
        tabularNums: NUMERIC.has(c.type),
        /* The unit belongs in the header, once — never on every cell. */
        header: c.unit ? `${c.label} (${c.unit})` : c.label,
      })),
      freezeFirstColumn: n.columns.length > 6,
    }
  },

  invariants(n): Invariant[] {
    const rectangular = n.rows.every((r) =>
      n.columns.every((c) => Object.prototype.hasOwnProperty.call(r, c.key)))
    return [
      { name: 'hasColumns', holds: n.columns.length > 0 },
      { name: 'rectangular', holds: rectangular,
        detail: 'Every row must carry a value for every column, even if that value is a dash.' },
      { name: 'everyRowReachable', holds: true,
        detail: 'Guaranteed by the disclosure plan: rows are paginated or scrolled, never dropped.' },
    ]
  },

  degrade(n): DegradationPlan | null {
    /* A table of one column is a list; a table of 200-char cells is prose.
     * Both are better served by text, and saying so is more useful than
     * rendering a table that embarrasses the lesson. */
    const longCell = n.rows.some((r) =>
      n.columns.some((c) => String(r[c.key] ?? '').length > 200))
    if (longCell) {
      return {
        to: 'text', reason: 'Cells over 200 characters are prose, not table data.',
        payload: {
          paragraphs: n.rows.flatMap((r) => n.columns.map((c) => String(r[c.key] ?? ''))).filter(Boolean),
        },
      }
    }
    if (n.columns.length < 2) {
      return {
        to: 'text', reason: 'A single-column table is a list.',
        payload: { paragraphs: n.rows.map((r) => String(r[n.columns[0].key] ?? '')).filter(Boolean) },
      }
    }
    return null
  },
}
