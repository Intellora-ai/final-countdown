import { checkTeaching } from '../teach/teaching'
import { checkFigure } from './figure'
import { Block as BlockSchema, LessonSpec, type Block, type Lesson } from './spec'

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
  /**
   * The teaching rule that was broken, where one was. Absent for structural
   * issues, which have no rule name because the schema IS the rule.
   */
  rule?: string
}

/**
 * How hard the teaching rules bite for this particular lesson.
 *
 * WHY THIS IS A LEVEL AND NOT A BOOLEAN
 * -------------------------------------
 * A lesson being TAUGHT owes the learner the whole arc: a definition first, a
 * summary last, at least one thing shown rather than told. A DOUBT ANSWER owes
 * none of that — it is a reply to one question, and demanding it open with a
 * definition and close with a progression would refuse every answer the doubt
 * resolvers produce.
 *
 * The honest way to express that is a named scope. The dishonest way is to
 * weaken the arc rules until answers slip under them, which would take the
 * teeth out of the lesson path at the same time and leave nobody able to say
 * which rules apply where.
 *
 * `'off'` exists for callers checking structure alone — a fixture round-trip,
 * a shape test. It is deliberately not the default: a gate you have to remember
 * to switch on is a gate that is off.
 */
export type TeachingLevel = 'lesson' | 'answer' | 'off'

export interface ValidateOptions {
  teaching?: TeachingLevel
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

/**
 * ONE BLOCK, ON ITS OWN, AS SOON AS IT HAS ARRIVED.
 *
 * `validateLesson` needs the whole document: relations point between blocks
 * and the teaching rules read the lesson as a whole. But a block's OWN rules
 * -- its schema, a flow's links, a table's columns, a chart's shape -- need
 * nothing outside it, and a stream that shows each block as it closes needs
 * exactly those checks and no more. Same checks as the whole-lesson path,
 * lifted out so the two cannot drift.
 */
export function validateBlock(input: unknown, index: number): { ok: true; block: Block } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = []
  appearanceKeysDeep(input, `blocks[${index}]`, issues)
  const parsed = BlockSchema.safeParse(input)
  if (!parsed.success) {
    for (const error of parsed.error.errors) {
      issues.push({ path: `blocks[${index}].${error.path.join('.')}`, message: error.message })
    }
    return { ok: false, issues }
  }
  checkBlock(parsed.data, index, issues)
  return issues.length === 0 ? { ok: true, block: parsed.data } : { ok: false, issues }
}

export function validateLesson(input: unknown, options: ValidateOptions = {}): Result {
  const issues: Issue[] = []
  const teaching = options.teaching ?? 'lesson'

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

  /*
   * WHETHER IT TEACHES, NOT ONLY WHETHER IT RENDERS.
   *
   * Everything above answers "is this well-formed". A lesson can pass all of it
   * and still be six paragraphs of undifferentiated text, which renders
   * perfectly and teaches nobody. The teaching rules run here, at the one gate
   * every lesson already passes through, because a check placed anywhere else
   * is a check some path can go around.
   *
   * Run only on a lesson the structural pass accepted. Word-counting a body
   * that failed to parse reports noise on top of the real fault.
   */
  if (teaching !== 'off' && issues.length === 0) {
    for (const issue of checkTeaching(lesson, { arc: teaching === 'lesson' })) {
      issues.push({ path: issue.path, message: issue.message, rule: issue.rule })
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, lesson }
}
