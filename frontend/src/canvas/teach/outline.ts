import type { Block, BlockKind } from '../spec/spec'

/**
 * The plan for a lesson: what blocks exist, in what order, doing what job, and
 * which of them refer to each other.
 *
 * WHY AUTHORING IS SPLIT IN TWO
 * -----------------------------
 * `authorLesson` asked a model for one whole lesson in one reply and allowed
 * one repair. Measured on qwen2.5:7b that produced arrays with one item where
 * two are required and keys on the wrong block type -- the failures of a small
 * model asked to hold a large document in its head at once.
 *
 * Splitting it needs care, because a lesson is not a bag of independent blocks.
 * Of the twenty-eight rules in `teaching.ts`, roughly nineteen are CROSS-block:
 * exactly one definition, summary closes the core, framework before
 * classification, a relation pointing at a representation. Blocks generated
 * independently and concurrently cannot satisfy those, because no block can see
 * the others.
 *
 * So the model writes this plan first -- no prose -- and the structural facts
 * are settled on a document small enough for a small model to get right. Bodies
 * are filled afterwards, and those CAN be concurrent because the per-block
 * rules are the ones that read a body.
 */
export interface BlockOutline {
  readonly id: string
  readonly kind: BlockKind
  readonly role: NonNullable<Block['role']>
  readonly title?: string
  readonly depth: 'core' | 'deeper'
}

/** A relation as the model plans it, before the schema has judged it. */
export interface PlannedRelation {
  readonly from?: unknown
  readonly to?: unknown
  readonly kind?: unknown
}

export interface Plan {
  readonly blocks: readonly BlockOutline[]
  readonly relations: readonly PlannedRelation[]
}

/**
 * Block kinds that SHOW something rather than say it.
 *
 * Kept as a list of kinds rather than a predicate on a block, because at plan
 * time there is no body to inspect -- which is the whole point: R9 is knowable
 * before a single word is written.
 */
const SHOWS = new Set<BlockKind>(['table', 'chart', 'flow', 'figure', 'simulation', 'equation'])

/** The twelve legal kinds and thirteen legal roles, so an invented one is caught here. */
export const LEGAL_KINDS = new Set<string>([
  'prose', 'callout', 'misconception', 'reasoning', 'summary', 'metric',
  'equation', 'table', 'chart', 'flow', 'simulation', 'figure',
])
export const LEGAL_ROLES = new Set<string>([
  'anchor', 'definition', 'notation', 'framework', 'classification', 'component',
  'rule', 'restriction', 'contrast', 'misconception', 'example', 'summary', 'support',
])

/**
 * The structural faults knowable without prose.
 *
 * THIS IS NOT A SECOND GATE, AND THE DISTINCTION IS LOAD-BEARING.
 * `validateLesson` still runs in full on the assembled lesson, unchanged. What
 * happens here is EARLIER, not instead: a fault caught on a short plan is
 * retried by rewriting the plan, while the same fault caught after the bodies
 * exist throws away every word the model wrote.
 *
 * Only checks that need no body live here. `nothing-marked`, `run-too-long`
 * and `definition-too-long` are absent on purpose -- they read prose, and prose
 * does not exist yet.
 *
 * BEING LOOSER THAN THE REAL RULE IS THE EXPENSIVE MISTAKE, not being stricter.
 * A loose check passes the plan, every body is paid for, and the lesson is
 * refused anyway. Review found two such gaps -- summaries counted over core
 * only, and relations not read at all -- and both are closed here, each with a
 * test naming the real rule it mirrors.
 */
export function outlineIssues(plan: Plan): string[] {
  const issues: string[] = []
  const { blocks, relations } = plan

  const core = blocks.filter((b) => b.depth === 'core')

  const definitions = blocks.filter((b) => b.role === 'definition')
  if (definitions.length === 0) issues.push('no-definition')
  if (definitions.length > 1) issues.push('many-definitions')

  /*
   * Counted over EVERY block, matching `teaching.ts:463`
   * (`roleAt.filter(r => r === 'summary')`). Counting core only was looser than
   * the real rule, so a deeper summary reached the body stage and was refused
   * after every call had been paid for.
   */
  const summaries = blocks.filter((b) => b.role === 'summary')
  if (summaries.length === 0) issues.push('no-summary')
  if (summaries.length > 1) issues.push('many-summaries')

  /* R9. A lesson that only talks. This is the rule the Python engine can never
     satisfy, because its output carries no field that could name a shape. */
  const shown = blocks.filter((b) => SHOWS.has(b.kind))
  if (shown.length === 0) issues.push('nothing-is-shown')

  /*
   * A shown thing nothing refers to is decoration. Knowable here because the
   * plan carries the relations -- and this is the rule that already cost a red
   * test on this branch when the plan did not.
   *
   * Either end counts: a relation naming the table is a reference to it,
   * whichever side it sits on.
   */
  const referenced = new Set<unknown>()
  for (const relation of relations) {
    referenced.add(relation.from)
    referenced.add(relation.to)
  }
  if (shown.some((b) => !referenced.has(b.id))) issues.push('representation-is-decoration')

  /*
   * The summary closes the CORE, not the lesson. Deeper material comes after it
   * by design -- `depth: 'deeper'` is the opt-in continuation -- so checking
   * "last block overall" would refuse the very structure the prompt asks for.
   */
  if (summaries.length === 1 && core[core.length - 1]?.role !== 'summary') {
    issues.push('summary-does-not-close-the-core')
  }

  /* Deeper material continues after the core; it does not sit inside it.
     Knowable from the `depth` sequence alone. */
  const lastCore = blocks.map((b) => b.depth).lastIndexOf('core')
  if (blocks.slice(0, lastCore).some((b) => b.depth === 'deeper')) {
    issues.push('deeper-material-inside-the-core')
  }

  /*
   * Only anchors may precede the definition. Read over ALL blocks, not the core
   * slice: a definition marked `deeper` would otherwise make `findIndex` return
   * -1 and skip the check entirely.
   */
  const definitionAt = blocks.findIndex((b) => b.role === 'definition')
  if (definitionAt > 0 && blocks.slice(0, definitionAt).some((b) => b.role !== 'anchor')) {
    issues.push('material-before-the-definition')
  }

  return issues
}
