import { checkFigure } from './figure'
import { LessonSpec, type Block, type Lesson } from './spec'

/**
 * The gate. Nothing renders that has not been through here.
 *
 * TWO CHECKS, BECAUSE THE SCHEMA CANNOT SEE EVERYTHING
 * ----------------------------------------------------
 * Zod refuses unknown keys and wrong types. It cannot see that a `flow` link
 * points at a node that does not exist, or that a pie chart's slices are
 * negative — both are well-typed and both render as nonsense. Those live here.
 *
 * WHY REFUSAL IS A FEATURE
 * ------------------------
 * A lesson that arrives slightly wrong should be REFUSED with a reason, not
 * quietly repaired. Silent repair teaches the author nothing and hides drift:
 * the model keeps emitting the same broken shape because it never hears that
 * it was broken. Every issue below names the exact path.
 */

export interface Issue {
  path: string
  message: string
}

export type Result =
  | { ok: true; lesson: Lesson }
  | { ok: false; issues: Issue[] }

/**
 * Keys that carry appearance. Laws 1-3, checked at runtime as well as in the
 * schema, because a spec can arrive as JSON from a model and never meet the
 * TypeScript types at all.
 */
const APPEARANCE = new Set([
  'x', 'y', 'top', 'left', 'right', 'bottom', 'width', 'height',
  'color', 'colour', 'background', 'backgroundColor', 'fill', 'stroke',
  'fontSize', 'font', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing',
  'padding', 'margin', 'gap', 'radius', 'borderRadius', 'borderWidth',
  'align', 'alignment', 'textAlign', 'style', 'className', 'css', 'html', 'jsx',
  'position', 'transform', 'zIndex', 'opacity', 'shadow',
])

/**
 * STRUCTURE IS POLICED; DATA IS NOT.
 *
 * The first version of this walked every object and rejected any `x` key
 * anywhere. That refused a chart — whose data points are literally `{x, y}` —
 * and would have refused a table about rectangles with a `width` column. The
 * defect is real and worth naming: a rule that cannot tell a POSITION from a
 * MEASUREMENT will eventually refuse the lesson it exists to protect.
 *
 * So the walk stops at data boundaries. Inside `points`, `rows` and `columns`,
 * an `x` is a number the lesson is about, not a place to put something.
 */
const DATA_KEYS = new Set(['points', 'rows', 'columns', 'controls', 'readouts'])

function appearanceKeysDeep(value: unknown, path: string, issues: Issue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => appearanceKeysDeep(item, `${path}[${index}]`, issues))
    return
  }
  if (value === null || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key

    if (APPEARANCE.has(key)) {
      issues.push({
        path: here,
        message: `"${key}" carries appearance. The author decides what exists, not how it looks (Laws 1-3).`,
      })
      continue
    }

    // Below a data key, the contents are the lesson's subject matter.
    if (DATA_KEYS.has(key)) continue
    appearanceKeysDeep(child, here, issues)
  }
}

/* -------------------------------------------------------------------------- */
/* Semantic checks — well-typed but still wrong                               */
/* -------------------------------------------------------------------------- */

function checkBlock(block: Block, index: number, issues: Issue[]): void {
  const at = `blocks[${index}]`

  if (block.kind === 'flow') {
    const ids = new Set(block.nodes.map((n) => n.id))
    block.links.forEach((link, i) => {
      if (!ids.has(link.from))
        issues.push({ path: `${at}.links[${i}].from`, message: `no node "${link.from}"` })
      if (!ids.has(link.to))
        issues.push({ path: `${at}.links[${i}].to`, message: `no node "${link.to}"` })
      if (link.from === link.to)
        issues.push({ path: `${at}.links[${i}]`, message: 'a node cannot link to itself' })
    })

    /* An unreachable node renders as a floating word with no explanation.
       Catching it here is cheaper than a reader wondering what it meant. */
    const touched = new Set(block.links.flatMap((l) => [l.from, l.to]))
    for (const node of block.nodes) {
      if (!touched.has(node.id))
        issues.push({ path: `${at}`, message: `node "${node.id}" has no link — it would float` })
    }
  }

  if (block.kind === 'table') {
    const keys = new Set(block.columns.map((c) => c.key))
    block.rows.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        if (!keys.has(key))
          issues.push({ path: `${at}.rows[${i}].${key}`, message: `no column "${key}"` })
      }
    })
  }

  if (block.kind === 'chart') {
    /* A pie is a claim that the parts make a whole. Negative slices are not a
       styling problem — they mean the author picked the wrong chart type. */
    if (block.chartType === 'pie') {
      if (block.series.length > 1)
        issues.push({ path: `${at}.series`, message: 'a pie shows ONE whole; use bar to compare series' })
      const negative = block.series[0]?.points.some((p) => p.y < 0)
      if (negative)
        issues.push({ path: `${at}.series[0]`, message: 'a pie cannot show negative parts' })
    }

    if (block.annotate) {
      const xs = new Set(block.series.flatMap((s) => s.points.map((p) => String(p.x))))
      if (!xs.has(String(block.annotate.atX)))
        issues.push({
          path: `${at}.annotate.atX`,
          message: `no point at x=${String(block.annotate.atX)} to annotate`,
        })
    }
  }

  /* A figure is checked twice over: that the named representation and the
     supplied data agree on a shape, and that the shape's own invariants hold.
     `checkFigure` does both and returns levelled issues. */
  if (block.kind === 'figure') {
    for (const issue of checkFigure(block, at)) {
      if (issue.level === 'reject') issues.push({ path: issue.path, message: issue.message })
    }
  }

  if (block.kind === 'simulation') {
    for (const [i, control] of block.controls.entries()) {
      if (control.min >= control.max)
        issues.push({ path: `${at}.controls[${i}]`, message: 'min must be below max' })
      if (control.initial < control.min || control.initial > control.max)
        issues.push({ path: `${at}.controls[${i}].initial`, message: 'initial is outside min..max' })
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

export function validateLesson(input: unknown): Result {
  const issues: Issue[] = []

  // Appearance is checked on the RAW input, before Zod strips anything.
  appearanceKeysDeep(input, '', issues)

  const parsed = LessonSpec.safeParse(input)
  if (!parsed.success) {
    for (const error of parsed.error.errors) {
      issues.push({ path: error.path.join('.') || '(root)', message: error.message })
    }
    return { ok: false, issues }
  }

  const lesson = parsed.data

  const seen = new Set<string>()
  lesson.blocks.forEach((block, index) => {
    if (seen.has(block.id))
      issues.push({ path: `blocks[${index}].id`, message: `duplicate id "${block.id}"` })
    seen.add(block.id)
    checkBlock(block, index, issues)
  })

  lesson.relations.forEach((relation, index) => {
    if (!seen.has(relation.from))
      issues.push({ path: `relations[${index}].from`, message: `no block "${relation.from}"` })
    if (!seen.has(relation.to))
      issues.push({ path: `relations[${index}].to`, message: `no block "${relation.to}"` })
  })

  return issues.length > 0 ? { ok: false, issues } : { ok: true, lesson }
}
