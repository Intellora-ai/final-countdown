import type { Lesson, LessonElement } from './types'

/* THE GENERATION BUDGET.
 *
 * Limits on what a model may produce, checked BEFORE layout rather than
 * discovered during it. A lesson that breaches a budget is a generation
 * failure, not a stretch goal — but the response is never to regenerate and
 * hope. Regeneration is non-deterministic, costs a round trip, and gives the
 * learner a different lesson than the one that was nearly right. The response
 * is to apply the disclosure strategies that already exist.
 *
 * "Explain all of thermodynamics" therefore degrades gracefully: the budget
 * check names every breach, disclosure absorbs them, and the learner gets a
 * complete lesson with more of it behind a tap.
 */

export const BUDGET = {
  blocks: { min: 3, max: 7 },
  primary: { exact: 1 },
  aside: { max: 2 },
  proseChars: 900,
  tableCols: 6,
  tableRowsPreferred: 12,
  causalSteps: 5,
  chartPoints: { min: 3, max: 40 },
  chartSeries: 4,
  simulations: 1,
} as const

export interface Breach {
  /** '' when the breach is about the lesson as a whole. */
  elementId: string
  rule: keyof typeof BUDGET
  actual: number
  limit: number
  message: string
  /** What disclosure will do about it. Never "regenerate". */
  remedy: string
}

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0)

export function checkBudget(lesson: Lesson): Breach[] {
  const breaches: Breach[] = []
  const els = lesson.elements

  if (els.length > BUDGET.blocks.max) {
    breaches.push({
      elementId: '', rule: 'blocks', actual: els.length, limit: BUDGET.blocks.max,
      message: `${els.length} blocks; a lesson holds ${BUDGET.blocks.max}.`,
      remedy: 'Lower-priority blocks collapse into a drawer, then the canvas splits.',
    })
  }
  if (els.length < BUDGET.blocks.min) {
    breaches.push({
      elementId: '', rule: 'blocks', actual: els.length, limit: BUDGET.blocks.min,
      message: `${els.length} blocks is thin for a lesson.`,
      remedy: 'Rendered as-is; a short lesson is not a broken one.',
    })
  }

  const primary = els.filter((e) => e.priority === 'primary')
  if (primary.length !== BUDGET.primary.exact) {
    breaches.push({
      elementId: '', rule: 'primary', actual: primary.length, limit: BUDGET.primary.exact,
      message: `${primary.length} primary blocks; a lesson has exactly one.`,
      remedy: primary.length > 1
        ? 'The first keeps the lead slot; the rest become supporting.'
        : 'The first block is promoted to lead.',
    })
  }

  const asides = els.filter((e) => e.priority === 'optional')
  if (asides.length > BUDGET.aside.max) {
    breaches.push({
      elementId: '', rule: 'aside', actual: asides.length, limit: BUDGET.aside.max,
      message: `${asides.length} optional blocks; at most ${BUDGET.aside.max} are shown.`,
      remedy: 'The surplus collapses into a drawer, reachable in one action.',
    })
  }

  const sims = els.filter((e) => e.kind === 'simulation')
  if (sims.length > BUDGET.simulations) {
    breaches.push({
      elementId: sims[1]?.id ?? '', rule: 'simulations',
      actual: sims.length, limit: BUDGET.simulations,
      message: `${sims.length} simulations; one per lesson.`,
      remedy: 'The first is interactive; the rest render as static diagrams.',
    })
  }

  for (const e of els) breaches.push(...checkElement(e))
  return breaches
}

function checkElement(e: LessonElement): Breach[] {
  const out: Breach[] = []
  const p = (e.payload ?? {}) as Record<string, unknown>

  if (Array.isArray(p.paragraphs)) {
    const chars = p.paragraphs.join('').length
    if (chars > BUDGET.proseChars) {
      out.push({
        elementId: e.id, rule: 'proseChars', actual: chars, limit: BUDGET.proseChars,
        message: `${chars} characters of prose in one block.`,
        remedy: 'truncate_expand — the opening is shown, the rest is one tap away.',
      })
    }
  }

  if (Array.isArray(p.columns) && p.columns.length > BUDGET.tableCols) {
    out.push({
      elementId: e.id, rule: 'tableCols', actual: p.columns.length, limit: BUDGET.tableCols,
      message: `${p.columns.length} columns.`,
      remedy: 'The first column freezes and the rest scroll; beyond ten, entities become rows.',
    })
  }

  /* THE CAUSAL-CHAIN LIMIT IS NOT A FLOWCHART LIMIT, and conflating them was
   * a real bug caught by the acceptance suite.
   *
   * "How does a bill become law" has eight stages because the legislative
   * process HAS eight stages; capping it at five would teach it wrongly. A
   * causal chain is a cause-and-effect argument -- temperature, speed, kinetic
   * energy, collisions, pressure -- and past five links the argument stops
   * being followable. A sequence is a real-world process whose length is a
   * fact about the world, and the flow grammar already reshapes it: serpentine
   * at six, vertical at nine, phase groups past fourteen.
   *
   * So the budget governs the argument and the layout governs the process. */
  const isCausalChain = e.purpose === 'explain' || e.purpose === 'relate'
  if (isCausalChain && Array.isArray(p.nodes) && p.nodes.length > BUDGET.causalSteps) {
    out.push({
      elementId: e.id, rule: 'causalSteps', actual: p.nodes.length, limit: BUDGET.causalSteps,
      message: `${p.nodes.length} links in one causal chain; past ${BUDGET.causalSteps} the argument stops being followable.`,
      remedy: 'The chain reshapes: serpentine, then vertical, then phase groups.',
    })
  }

  if (Array.isArray(p.data)) {
    const n = p.data.length
    if (n > BUDGET.chartPoints.max) {
      out.push({
        elementId: e.id, rule: 'chartPoints', actual: n, limit: BUDGET.chartPoints.max,
        message: `${n} data points.`,
        remedy: 'Downsampled with the reduction stated, full series in the data view.',
      })
    }
    if (n > 0 && n < BUDGET.chartPoints.min) {
      out.push({
        elementId: e.id, rule: 'chartPoints', actual: n, limit: BUDGET.chartPoints.min,
        message: `${n} data points is not a trend.`,
        remedy: 'Degrades to a table.',
      })
    }
  }

  const seriesField = Array.isArray(p.fields)
    ? (p.fields as Array<Record<string, unknown>>).find((f) => f.role === 'series')
    : undefined
  if (seriesField && Array.isArray(p.data)) {
    const series = new Set(
      (p.data as Array<Record<string, unknown>>).map((d) => String(d[String(seriesField.name)])),
    ).size
    if (series > BUDGET.chartSeries) {
      out.push({
        elementId: e.id, rule: 'chartSeries', actual: series, limit: BUDGET.chartSeries,
        message: `${series} series on one chart.`,
        remedy: 'The five largest are drawn; the rest group as "Other".',
      })
    }
  }

  void count
  return out
}

/** The system-prompt text. Kept beside the checker deliberately: a limit
 *  stated to the model and a limit enforced in code must be the same limit,
 *  and the surest way to guarantee that is to generate one from the other. */
export function budgetPrompt(): string {
  return [
    'You choose WHAT exists and HOW blocks relate. You do not choose colours,',
    'sizes, spacing, alignment, or positions.',
    '',
    `blocks        ${BUDGET.blocks.min}-${BUDGET.blocks.max}, exactly ${BUDGET.primary.exact} primary, at most ${BUDGET.aside.max} optional`,
    `prose         max ${BUDGET.proseChars} characters per block`,
    `table         max ${BUDGET.tableCols} columns, ${BUDGET.tableRowsPreferred} rows preferred`,
    `causal_chain  max ${BUDGET.causalSteps} steps`,
    `chart         ${BUDGET.chartPoints.min}-${BUDGET.chartPoints.max} points, max ${BUDGET.chartSeries} series`,
    `simulation    max ${BUDGET.simulations} per lesson, and only if interacting genuinely teaches`,
    '',
    'Exceeding a budget is a generation failure, not a stretch goal.',
  ].join('\n')
}
