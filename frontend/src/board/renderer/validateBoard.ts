/* THE VALIDATOR — the only door content comes through, and it never whispers.
 *
 * Everything that reaches the renderer passed through validateBoard(), and
 * every repair, truncation or drop it performs produces a Notice the learner
 * can read. The failure mode this file refuses to have is silence: data that
 * was changed without saying so, or a block that vanished without a trace.
 *
 * STATUS PRECEDENCE, stated once:
 *   1. Root invalid (wrong type/version, missing title/blocks, unknown
 *      board-level key)  -> 'failed' + error + every notice collected so far.
 *   2. Root valid, any repair or drop occurred      -> 'repaired' + board.
 *   3. Root valid, untouched                        -> 'ok' + board.
 *   Zero surviving blocks is NOT a failure — the board renders its empty
 *   state. Emptiness is a fact, not an error.
 *
 * UNKNOWN KEYS ARE REJECTED, NEVER STRIPPED. A stripped key is a smuggling
 * route: a generator that ships `style:` and sees it silently removed will
 * keep shipping it. At board level an unknown key fails the board; at block
 * level it drops the block, with a notice naming the field either way.
 *
 * UNKNOWN TYPES ARE PRESERVED, NOT DROPPED. A block whose type this build
 * cannot draw becomes UnknownBlockData — id, originalType and a fallback
 * message ONLY; no other payload survives — and renders as a visible
 * placeholder. Dropping it would leave a silent hole in a lesson.
 *
 * NOTICE ORDER IS CONTRACTUAL, not incidental:
 *   1. root-level safe-repair notices (layout, missing board id)
 *   2. root-level fatal notices (the failure itself, also in `error`)
 *   3. block notices, in source order
 *   4. connector notices, in source order
 * A test locks this order; changing it is an API break.
 */
import {
  ALL_BLOCK_TYPES,
  ALL_BLOCK_WIDTHS,
  ALL_CALLOUT_TONES,
  ALL_CONNECTOR_KINDS,
  ALL_LAYOUT_MODES,
  type Block,
  type BlockType,
  type BoardResult,
  type BoardSource,
  type Connector,
  type Notice,
  type TableBlock,
  type ValidatedBlock,
  type ValidatedBoard,
} from '../types/learningBoard'

const MAX_BLOCKS = 24
const MAX_TABLE_ROWS = 50
const MAX_STRING = 4000
const MAX_CHART_LABEL = 60

/* ── small helpers ─────────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

interface Ctx {
  notices: Notice[]
  repaired: boolean
}

function note(ctx: Ctx, level: Notice['level'], message: string, blockId?: string) {
  ctx.notices.push({ level, message, ...(blockId ? { blockId } : {}) })
}

function repair(ctx: Ctx, message: string, blockId?: string) {
  ctx.repaired = true
  note(ctx, 'warn', message, blockId)
}

/** Truncate a string field in place-ish, with a notice when it happens. */
function clampStr(ctx: Ctx, value: string, what: string, blockId?: string): string {
  if (value.length <= MAX_STRING) return value
  repair(ctx, `${what} was truncated to ${MAX_STRING} characters.`, blockId)
  return value.slice(0, MAX_STRING)
}

/* Reject unknown keys. Returns the offending key or null. */
function unknownKey(obj: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const k of Object.keys(obj)) if (allowed.indexOf(k) < 0) return k
  return null
}

const BASE_KEYS = ['id', 'type', 'title', 'eyebrow', 'layout'] as const

/* ── per-type block validators ─────────────────────────────────────────── */
/* Each returns the validated Block, a table-fallback Block, or null (drop —
 * already noticed). The map's keys mirror the registry; a test enforces it. */

type BlockValidator = (b: Record<string, unknown>, id: string, ctx: Ctx) => Block | null

/* What an unusable chart value looks like in the table that replaces it.
 * A finite number is the number. Anything else — missing, NaN, Infinity, a
 * string where a number belonged — becomes an em-dash, because "NaN" is a
 * floating-point term and the person reading the board is learning chemistry.
 * The one exception is a non-empty string, which is shown as written: it may
 * be wrong for a chart, but it is something the learner can actually read. */
function fallbackCell(value: unknown): string | number {
  if (isNum(value)) return value
  if (isStr(value) && value.trim()) return value
  return '—'
}

function chartTableFallback(
  id: string,
  title: unknown,
  columns: [string, string],
  rows: Array<[string, string | number]>,
  ctx: Ctx,
): TableBlock {
  repair(ctx, 'Chart data was incomplete, so a table is shown.', id)
  return {
    id, type: 'table',
    ...(isStr(title) ? { title } : {}),
    columns: [...columns],
    rows: rows.map((r) => [...r]),
  }
}

const VALIDATORS: Record<BlockType, BlockValidator> = {
  explanation: (b, id, ctx) => {
    if (!isStr(b.content) || !b.content.trim()) { repair(ctx, 'An explanation block had no content and was omitted.', id); return null }
    return { id, type: 'explanation', content: clampStr(ctx, b.content, 'An explanation', id) }
  },

  text: (b, id, ctx) => {
    if (!Array.isArray(b.paragraphs)) { repair(ctx, 'A text block had no paragraphs and was omitted.', id); return null }
    const paragraphs: Array<Array<{ text: string; emphasis?: 'strong' | 'accent' }>> = []
    for (const para of b.paragraphs) {
      if (!Array.isArray(para)) continue
      const segs: Array<{ text: string; emphasis?: 'strong' | 'accent' }> = []
      for (const seg of para) {
        if (!isObj(seg) || !isStr(seg.text)) continue
        const emphasis = seg.emphasis
        if (emphasis === 'strong' || emphasis === 'accent') {
          segs.push({ text: seg.text, emphasis })
        } else {
          if (emphasis !== undefined) repair(ctx, 'A text segment used an unrecognised emphasis and was shown plain.', id)
          segs.push({ text: seg.text })
        }
      }
      if (segs.length) paragraphs.push(segs)
    }
    if (!paragraphs.length) { repair(ctx, 'A text block had no readable paragraphs and was omitted.', id); return null }
    return { id, type: 'text', paragraphs }
  },

  table: (b, id, ctx) => {
    const columns = Array.isArray(b.columns) ? b.columns.filter(isStr) : []
    if (!columns.length) { repair(ctx, 'A table had no columns and was omitted.', id); return null }
    const rawRows = Array.isArray(b.rows) ? b.rows : []
    let rows: (string | number)[][] = []
    let ragged = false
    for (const row of rawRows) {
      if (!Array.isArray(row)) { ragged = true; continue }
      const cells = row.map((c) => (isStr(c) || isNum(c) ? c : String(c ?? '—')))
      if (cells.length !== columns.length) ragged = true
      rows.push(
        cells.length > columns.length
          ? cells.slice(0, columns.length)
          : [...cells, ...Array(columns.length - cells.length).fill('—')],
      )
    }
    if (ragged) repair(ctx, 'Some table rows did not match the columns and were adjusted.', id)
    if (rows.length > MAX_TABLE_ROWS) {
      repair(ctx, `Showing ${MAX_TABLE_ROWS} of ${rows.length} rows.`, id)
      rows = rows.slice(0, MAX_TABLE_ROWS)
    }
    return { id, type: 'table', columns, rows }
  },

  callout: (b, id, ctx) => {
    if (!isStr(b.content) || !b.content.trim()) { repair(ctx, 'A callout had no content and was omitted.', id); return null }
    let tone = b.tone
    if (tone !== undefined && ALL_CALLOUT_TONES.indexOf(tone as never) < 0) {
      repair(ctx, 'A callout used an unrecognised tone and was shown as a note.', id)
      tone = 'note'
    }
    return { id, type: 'callout', content: clampStr(ctx, b.content, 'A callout', id), ...(tone ? { tone: tone as 'note' } : {}) }
  },

  pie_chart: (b, id, ctx) => {
    const raw = Array.isArray(b.data) ? b.data : []
    if (!raw.length) { repair(ctx, 'A chart had no data and was omitted.', id); return null }
    const labelled: Array<{ label: string; value: unknown }> = raw
      .filter((d): d is Record<string, unknown> => isObj(d) && isStr(d.label))
      .map((d) => ({ label: chartLabel(ctx, d.label as string, id), value: d.value }))
    const valid = labelled.filter((d): d is { label: string; value: number } => isNum(d.value) && d.value > 0)
    if (valid.length < labelled.length) repair(ctx, 'Some chart values were invalid and were left out.', id)
    const total = valid.reduce((n, d) => n + d.value, 0)
    if (!valid.length || total <= 0) {
      if (labelled.length) {
        return chartTableFallback(id, b.title, ['Label', 'Value'], labelled.map((d) => [d.label, fallbackCell(d.value)]), ctx)
      }
      repair(ctx, 'A chart had no usable data and was omitted.', id)
      return null
    }
    return { id, type: 'pie_chart', data: valid }
  },

  bar_chart: (b, id, ctx) => {
    const raw = Array.isArray(b.data) ? b.data : []
    if (!raw.length) { repair(ctx, 'A chart had no data and was omitted.', id); return null }
    const labelled = raw
      .filter((d): d is Record<string, unknown> => isObj(d) && isStr(d.label))
      .map((d) => ({ label: chartLabel(ctx, d.label as string, id), value: d.value, highlight: d.highlight === true }))
    const valid = labelled.filter((d): d is { label: string; value: number; highlight: boolean } => isNum(d.value))
    if (valid.length < labelled.length) repair(ctx, 'Some chart values were invalid and were left out.', id)
    if (!valid.length) {
      if (labelled.length) {
        return chartTableFallback(id, b.title, ['Label', 'Value'], labelled.map((d) => [d.label, fallbackCell(d.value)]), ctx)
      }
      repair(ctx, 'A chart had no usable data and was omitted.', id)
      return null
    }
    return {
      id, type: 'bar_chart',
      data: valid.map((d) => ({ label: d.label, value: d.value, ...(d.highlight ? { highlight: true } : {}) })),
      ...(isStr(b.yLabel) ? { yLabel: b.yLabel } : {}),
    }
  },

  line_chart: (b, id, ctx) => {
    const raw = Array.isArray(b.points) ? b.points : []
    if (!raw.length) { repair(ctx, 'A chart had no data and was omitted.', id); return null }
    /* Two filters, deliberately separate: a point with a readable x still
     * carries a label the learner can use, even when its y is unusable. Pie
     * and bar already keep such rows by falling back to a table; a line chart
     * that dropped them silently would be the one chart type where broken data
     * costs the learner the labels as well as the picture. */
    const labelled = raw
      .filter((p): p is Record<string, unknown> => isObj(p) && (isStr(p.x) || isNum(p.x)))
    const points = labelled
      .filter((p) => isNum(p.y))
      .map((p) => ({ x: p.x as string | number, y: p.y as number }))
    if (points.length < raw.length) repair(ctx, 'Some chart points were invalid and were left out.', id)
    if (!points.length) {
      if (labelled.length) {
        return chartTableFallback(
          id, b.title,
          [isStr(b.xLabel) ? b.xLabel : 'X', isStr(b.yLabel) ? b.yLabel : 'Y'],
          labelled.map((p) => [String(p.x), fallbackCell(p.y)]),
          ctx,
        )
      }
      repair(ctx, 'A chart had no usable data and was omitted.', id)
      return null
    }
    let highlightIndex = b.highlightIndex
    if (highlightIndex !== undefined && (!isNum(highlightIndex) || highlightIndex < 0 || highlightIndex >= points.length)) {
      repair(ctx, 'A chart highlight pointed at a missing point and was removed.', id)
      highlightIndex = undefined
    }
    return {
      id, type: 'line_chart', points,
      ...(highlightIndex !== undefined ? { highlightIndex: highlightIndex as number } : {}),
      ...(isStr(b.yLabel) ? { yLabel: b.yLabel } : {}),
      ...(isStr(b.xLabel) ? { xLabel: b.xLabel } : {}),
    }
  },

  equation: (b, id, ctx) => {
    if (!isStr(b.latex) || !b.latex.trim()) { repair(ctx, 'An equation block was empty and was omitted.', id); return null }
    const variables = Array.isArray(b.variables)
      ? b.variables
          .filter((v): v is Record<string, unknown> => isObj(v) && isStr(v.symbol) && isStr(v.meaning))
          .map((v) => ({ symbol: v.symbol as string, meaning: v.meaning as string, ...(isStr(v.unit) ? { unit: v.unit } : {}) }))
      : undefined
    return { id, type: 'equation', latex: clampStr(ctx, b.latex, 'An equation', id), ...(variables?.length ? { variables } : {}) }
  },

  process: (b, id, ctx) => {
    const steps = Array.isArray(b.steps)
      ? b.steps
          .filter((s): s is Record<string, unknown> => isObj(s) && isStr(s.title))
          .map((s) => ({ title: s.title as string, ...(isStr(s.detail) ? { detail: s.detail } : {}) }))
      : []
    if (!steps.length) { repair(ctx, 'A process block had no steps and was omitted.', id); return null }
    return { id, type: 'process', steps }
  },

  timeline: (b, id, ctx) => {
    const events = Array.isArray(b.events)
      ? b.events
          .filter((e): e is Record<string, unknown> => isObj(e) && isStr(e.at) && isStr(e.label))
          .map((e) => ({ at: e.at as string, label: e.label as string, ...(isStr(e.detail) ? { detail: e.detail } : {}) }))
      : []
    if (!events.length) { repair(ctx, 'A timeline had no events and was omitted.', id); return null }
    return { id, type: 'timeline', events }
  },

  comparison: (b, id, ctx) => {
    const subjects = Array.isArray(b.subjects) ? b.subjects.filter(isStr) : []
    const criteria = Array.isArray(b.criteria)
      ? b.criteria
          .filter((c): c is Record<string, unknown> => isObj(c) && isStr(c.label) && Array.isArray(c.values))
          .map((c) => ({ label: c.label as string, values: (c.values as unknown[]).map((v) => (isStr(v) ? v : String(v ?? '—'))) }))
      : []
    if (subjects.length < 2 || !criteria.length) { repair(ctx, 'A comparison needed at least two subjects and one criterion; it was omitted.', id); return null }
    return { id, type: 'comparison', subjects, criteria }
  },

  diagram: (b, id, ctx) => {
    const rawNodes = Array.isArray(b.nodes) ? b.nodes : []
    const nodes = rawNodes
      .filter((n): n is Record<string, unknown> => isObj(n) && isStr(n.id) && isStr(n.label))
      .map((n) => {
        const pos = n.position
        const position = isObj(pos) && isNum(pos.col) && isNum(pos.row) ? { col: pos.col, row: pos.row } : undefined
        if (pos !== undefined && !position) repair(ctx, 'A diagram node had an invalid position, which was ignored.', id)
        return {
          id: n.id as string, label: n.label as string,
          ...(isStr(n.detail) ? { detail: n.detail } : {}),
          ...(isStr(n.group) ? { group: n.group } : {}),
          ...(position ? { position } : {}),
        }
      })
    if (!nodes.length) { repair(ctx, 'A diagram had no nodes and was omitted.', id); return null }
    const ids = new Set(nodes.map((n) => n.id))
    const rawEdges = Array.isArray(b.edges) ? b.edges : []
    const edges = rawEdges
      .filter((e): e is Record<string, unknown> => isObj(e) && isStr(e.from) && isStr(e.to))
      .filter((e) => {
        if (ids.has(e.from as string) && ids.has(e.to as string)) return true
        repair(ctx, 'A diagram relationship pointed at a missing node and was removed.', id)
        return false
      })
      .map((e) => ({
        from: e.from as string, to: e.to as string,
        ...(isStr(e.kind) && ['causal', 'sequence', 'reference'].indexOf(e.kind) >= 0 ? { kind: e.kind as 'causal' } : {}),
        ...(isStr(e.label) ? { label: e.label } : {}),
      }))
    return { id, type: 'diagram', nodes, edges }
  },

  example: (b, id, ctx) => {
    if (!isStr(b.prompt) || !b.prompt.trim()) { repair(ctx, 'An example had no prompt and was omitted.', id); return null }
    const working = Array.isArray(b.working) ? b.working.filter(isStr) : []
    return {
      id, type: 'example', prompt: b.prompt, working,
      ...(isStr(b.input) ? { input: b.input } : {}),
      ...(isStr(b.result) ? { result: b.result } : {}),
    }
  },

  quiz: (b, id, ctx) => {
    if (!isStr(b.prompt) || !b.prompt.trim()) { repair(ctx, 'A quiz had no prompt and was omitted.', id); return null }
    const options = Array.isArray(b.options)
      ? b.options
          .filter((o): o is Record<string, unknown> => isObj(o) && isStr(o.id) && isStr(o.label))
          .map((o) => ({ id: o.id as string, label: o.label as string, ...(o.correct === true ? { correct: true } : {}) }))
      : []
    if (options.length < 2) { repair(ctx, 'A quiz needed at least two options and was omitted.', id); return null }
    if (!options.some((o) => o.correct)) { repair(ctx, 'A quiz marked no option as correct and was omitted.', id); return null }
    return { id, type: 'quiz', prompt: b.prompt, options, ...(isStr(b.explanation) ? { explanation: b.explanation } : {}) }
  },

  image: (b, id, ctx) => {
    const src = isStr(b.src) ? b.src.trim() : ''
    const alt = isStr(b.alt) ? b.alt.trim() : ''
    if (!alt) { repair(ctx, 'An image had no alt text and was omitted — every image must be describable.', id); return null }
    if (!src) { repair(ctx, 'An image had no source and was omitted.', id); return null }
    const external = /^(https?:)?\/\//i.test(src) || /^javascript:/i.test(src) || (/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^data:image\//i.test(src))
    if (external) { repair(ctx, 'An image pointed at an external or unsafe source and was omitted.', id); return null }
    return {
      id, type: 'image', src, alt,
      ...(isStr(b.caption) ? { caption: b.caption } : {}),
      ...(isStr(b.sourceNote) ? { sourceNote: b.sourceNote } : {}),
    }
  },

  simulation: (b, id, ctx) => {
    if (b.kind !== 'particle-box') { repair(ctx, 'A simulation of an unsupported kind was omitted.', id); return null }
    if (b.unit !== 'K') { repair(ctx, 'A simulation used a non-kelvin unit and was omitted — P ∝ T only holds in kelvin.', id); return null }
    const min = b.minTemp, max = b.maxTemp, initial = b.initialTemp
    if (!isNum(min) || !isNum(max) || !isNum(initial) || min <= 0 || max <= min) {
      repair(ctx, 'A simulation had an invalid temperature range and was omitted.', id)
      return null
    }
    return { id, type: 'simulation', kind: 'particle-box', unit: 'K', minTemp: min, maxTemp: max, initialTemp: Math.min(max, Math.max(min, initial)) }
  },
}

function chartLabel(ctx: Ctx, label: string, blockId: string): string {
  if (label.length <= MAX_CHART_LABEL) return label
  repair(ctx, 'A chart label was shortened to stay readable.', blockId)
  return label.slice(0, MAX_CHART_LABEL - 1) + '…'
}

/* Allowed keys per type, for unknown-key rejection. Base keys + payload keys. */
const PAYLOAD_KEYS: Record<BlockType, readonly string[]> = {
  explanation: ['content'],
  text: ['paragraphs'],
  table: ['columns', 'rows'],
  callout: ['content', 'tone'],
  pie_chart: ['data'],
  bar_chart: ['data', 'yLabel'],
  line_chart: ['points', 'highlightIndex', 'yLabel', 'xLabel'],
  equation: ['latex', 'variables'],
  process: ['steps'],
  timeline: ['events'],
  comparison: ['subjects', 'criteria'],
  diagram: ['nodes', 'edges'],
  example: ['prompt', 'input', 'working', 'result'],
  quiz: ['prompt', 'options', 'explanation'],
  image: ['src', 'alt', 'caption', 'sourceNote'],
  simulation: ['kind', 'unit', 'minTemp', 'maxTemp', 'initialTemp'],
}

/** For the parity test: the validator map's keys. */
export function validatedTypes(): string[] {
  return Object.keys(VALIDATORS)
}

/* ── the board validator ───────────────────────────────────────────────── */

const BOARD_KEYS = ['type', 'version', 'id', 'title', 'subtitle', 'layout', 'blocks', 'connectors', 'metadata'] as const
const METADATA_KEYS = ['chapterId', 'conceptId', 'source'] as const
const CONNECTOR_KEYS = ['id', 'from', 'to', 'kind', 'label'] as const
const LAYOUT_KEYS = ['width', 'position'] as const

export function validateBoard(source: BoardSource): BoardResult {
  const ctx: Ctx = { notices: [], repaired: false }
  /* A fatal root error is ALSO a notice — the ErrorState shows the learner
   * everything the validator managed to establish before it had to stop. */
  const fail = (error: string): BoardResult => {
    note(ctx, 'warn', error)
    return { status: 'failed', error, notices: ctx.notices }
  }

  /* Phase 0 — structurally unparseable: nothing collectable exists yet. */
  if (!isObj(source)) return fail('The board was not an object.')
  if (source.type !== 'learning_board') return fail("The board's type was not 'learning_board'.")
  if (source.version !== 1) return fail(`Unsupported board version: ${String(source.version)}.`)
  if (!isStr(source.title) || !source.title.trim()) return fail('The board had no title.')
  if (!Array.isArray(source.blocks)) return fail('The board had no blocks list.')

  /* Phase 1 — collect root-level SAFE REPAIRS. These run BEFORE fatal
   * detection so a board that both needs a repair and carries a fatal fault
   * fails WITH its repair notices, not instead of them. */
  if (source.layout !== undefined && ALL_LAYOUT_MODES.indexOf(source.layout as never) < 0) {
    repair(ctx, "The board's layout mode was unrecognised; 'grid' is used.")
  }
  if (!isStr(source.id) || !source.id.trim()) repair(ctx, "The board had no id; 'board' was assigned.")

  /* Phase 2 — detect root-level FATAL errors. */
  const badKey = unknownKey(source, BOARD_KEYS)
  if (badKey) return fail(`The board carried an unrecognised field '${badKey}'. Unknown fields are refused, not stripped.`)
  if (source.metadata !== undefined) {
    if (!isObj(source.metadata)) return fail('The board metadata was not an object.')
    const mk = unknownKey(source.metadata, METADATA_KEYS)
    if (mk) return fail(`The board metadata carried an unrecognised field '${mk}'.`)
  }

  /* blocks */
  let rawBlocks = source.blocks as unknown[]
  if (rawBlocks.length > MAX_BLOCKS) {
    repair(ctx, `Showing the first ${MAX_BLOCKS} of ${rawBlocks.length} blocks.`)
    rawBlocks = rawBlocks.slice(0, MAX_BLOCKS)
  }

  const blocks: ValidatedBlock[] = []
  const seenIds = new Set<string>()
  rawBlocks.forEach((raw, index) => {
    if (!isObj(raw)) { repair(ctx, `Block ${index + 1} was not an object and was omitted.`); return }
    const declaredType = raw.type

    /* id first — repairs and notices need something to point at. */
    let id = isStr(raw.id) && raw.id.trim() ? raw.id : ''
    if (!id) {
      id = `${isStr(declaredType) ? declaredType : 'block'}-${index + 1}`
      repair(ctx, `A block had no id; '${id}' was assigned.`, id)
    }
    if (seenIds.has(id)) { repair(ctx, `A second block with id '${id}' was omitted — ids must be unique.`, id); return }

    if (!isStr(declaredType)) { repair(ctx, 'A block had no type and was omitted.', id); return }

    if ((ALL_BLOCK_TYPES as readonly string[]).indexOf(declaredType) < 0) {
      /* Preserved, not dropped: the learner sees that something was here. */
      note(ctx, 'info', `One block of the unsupported type '${declaredType}' is shown as a placeholder.`, id)
      ctx.repaired = true
      seenIds.add(id)
      /* id, originalType, message — and NOTHING else. Whatever payload the
       * unknown block carried is discarded here, unvalidated and unrendered. */
      blocks.push({
        type: 'unknown', id, originalType: declaredType,
        message: 'This block type is not available in this version of the board.',
      })
      return
    }

    const type = declaredType as BlockType
    const bk = unknownKey(raw, [...BASE_KEYS, ...PAYLOAD_KEYS[type]])
    if (bk) { repair(ctx, `A ${type} block carried an unrecognised field '${bk}' and was omitted. Unknown fields are refused, not stripped.`, id); return }

    /* layout hint */
    let layoutOut: { width?: (typeof ALL_BLOCK_WIDTHS)[number] } | undefined
    if (raw.layout !== undefined) {
      if (!isObj(raw.layout)) { repair(ctx, 'A block layout hint was unreadable and was ignored.', id) }
      else {
        const lk = unknownKey(raw.layout, LAYOUT_KEYS)
        if (lk) { repair(ctx, `A block layout hint carried an unrecognised field '${lk}' and was ignored.`, id) }
        else if (raw.layout.width !== undefined) {
          if (ALL_BLOCK_WIDTHS.indexOf(raw.layout.width as never) >= 0) layoutOut = { width: raw.layout.width as never }
          else repair(ctx, 'A block asked for an unrecognised width; the default is used.', id)
        }
      }
    }

    const body = VALIDATORS[type](raw, id, ctx)
    if (!body) return
    seenIds.add(body.id)
    blocks.push({
      ...body,
      ...(isStr(raw.title) ? { title: clampStr(ctx, raw.title, 'A title', id) } : {}),
      ...(isStr(raw.eyebrow) ? { eyebrow: raw.eyebrow } : {}),
      ...(layoutOut ? { layout: layoutOut } : {}),
    })
  })

  /* connectors */
  const connectors: Connector[] = []
  if (source.connectors !== undefined) {
    if (!Array.isArray(source.connectors)) return fail('The board connectors were not a list.')
    source.connectors.forEach((raw, i) => {
      if (!isObj(raw)) { repair(ctx, `Connector ${i + 1} was not an object and was removed.`); return }
      const ck = unknownKey(raw, CONNECTOR_KEYS)
      if (ck) { repair(ctx, `A connector carried an unrecognised field '${ck}' and was removed.`); return }
      if (!isStr(raw.id) || !isStr(raw.from) || !isStr(raw.to)) { repair(ctx, 'A connector was missing id, from or to, and was removed.'); return }
      if (!seenIds.has(raw.from) || !seenIds.has(raw.to)) {
        repair(ctx, `A relationship pointed at a block that does not exist ('${raw.from}' → '${raw.to}') and was removed.`)
        return
      }
      if (raw.kind !== undefined && ALL_CONNECTOR_KINDS.indexOf(raw.kind as never) < 0) {
        repair(ctx, 'A relationship used an unrecognised kind and is shown as a plain reference.')
        connectors.push({ id: raw.id, from: raw.from, to: raw.to, ...(isStr(raw.label) ? { label: raw.label } : {}) })
        return
      }
      connectors.push({
        id: raw.id, from: raw.from, to: raw.to,
        ...(raw.kind !== undefined ? { kind: raw.kind as Connector['kind'] } : {}),
        ...(isStr(raw.label) ? { label: raw.label } : {}),
      })
    })
  }

  const board: ValidatedBoard = {
    type: 'learning_board',
    version: 1,
    id: isStr(source.id) && source.id.trim() ? source.id : 'board',
    title: clampStr(ctx, source.title, 'The board title'),
    ...(isStr(source.subtitle) || source.subtitle === null ? { subtitle: source.subtitle as string | null } : {}),
    layout: ALL_LAYOUT_MODES.indexOf(source.layout as never) >= 0 ? (source.layout as ValidatedBoard['layout']) : 'grid',
    blocks,
    connectors,
    ...(isObj(source.metadata) ? { metadata: source.metadata as ValidatedBoard['metadata'] } : {}),
  }
  return { status: ctx.repaired ? 'repaired' : 'ok', board, notices: ctx.notices }
}
