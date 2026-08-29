import type { Block, BlockKind } from '../spec/spec'

/**
 * The skeleton of a lesson: what blocks exist, in what order, doing what job.
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
 * So the model writes this skeleton first -- ids, kinds, roles, no prose -- and
 * the structural facts are settled on a document small enough for a small model
 * to get right. Bodies are filled afterwards, and those CAN be concurrent
 * because the per-block rules are the ones that read a body.
 */
export interface BlockOutline {
  readonly id: string
  readonly kind: BlockKind
  readonly role: NonNullable<Block['role']>
  readonly title?: string
  readonly depth: 'core' | 'deeper'
}

/**
 * Block kinds that SHOW something rather than say it.
 *
 * Kept as a list of kinds rather than a predicate on a block, because at
 * outline time there is no body to inspect -- which is the whole point: R9 is
 * knowable before a single word is written.
 */
const SHOWS = new Set<BlockKind>(['table', 'chart', 'flow', 'figure', 'simulation', 'equation'])

/**
 * The structural faults knowable from roles and kinds alone.
 *
 * THIS IS NOT A SECOND GATE, AND THE DISTINCTION IS LOAD-BEARING.
 * `validateLesson` still runs in full on the assembled lesson, unchanged. What
 * happens here is EARLIER, not instead: a fault caught on a four-line skeleton
 * is retried by rewriting four lines, while the same fault caught after the
 * bodies exist throws away every word the model wrote.
 *
 * Only checks that need no body live here. `nothing-marked`, `run-too-long`
 * and `definition-too-long` are absent on purpose -- they read prose, and prose
 * does not exist yet. Reimplementing them here would be a second copy that
 * drifts from the one that actually refuses lessons.
 *
 * Rule names match `teaching.ts` exactly so a reader can find the real check.
 * Where they disagree, the real one is right; this one is an early filter.
 */
export function outlineIssues(blocks: readonly BlockOutline[]): string[] {
  const issues: string[] = []

  const core = blocks.filter((b) => b.depth === 'core')

  const definitions = blocks.filter((b) => b.role === 'definition')
  if (definitions.length === 0) issues.push('no-definition')
  if (definitions.length > 1) issues.push('many-definitions')

  const summaries = core.filter((b) => b.role === 'summary')
  if (summaries.length === 0) issues.push('no-summary')
  if (summaries.length > 1) issues.push('many-summaries')

  /* R9. A lesson that only talks. This is the rule the Python engine can never
     satisfy, because its output carries no field that could name a shape. */
  if (!blocks.some((b) => SHOWS.has(b.kind))) issues.push('nothing-is-shown')

  /*
   * The summary closes the CORE, not the lesson. Deeper material comes after it
   * by design -- `depth: 'deeper'` is the opt-in continuation -- so checking
   * "last block overall" would refuse the very structure the prompt asks for.
   */
  if (summaries.length === 1 && core[core.length - 1]?.role !== 'summary') {
    issues.push('summary-does-not-close-the-core')
  }

  /*
   * Only anchors may precede the definition. Checked on the core sequence: a
   * deeper block cannot come before the definition anyway, since deeper
   * material follows the summary.
   */
  const definitionAt = core.findIndex((b) => b.role === 'definition')
  if (definitionAt > 0 && core.slice(0, definitionAt).some((b) => b.role !== 'anchor')) {
    issues.push('material-before-the-definition')
  }

  return issues
}
