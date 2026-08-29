import type { Lesson } from '../spec/spec'
import { validateLesson, type Issue } from '../spec/validate'
import {
  dropNulls,
  extractJson,
  teachingSystemPrompt,
  type AuthorResult,
  type LessonModel,
} from './authorLesson'
import { groundingPreamble, type Source } from './grounding'
import { outlineIssues, type BlockOutline } from './outline'

/**
 * Author a lesson in two stages: the skeleton, then the bodies, concurrently.
 *
 * WHY NOT ONE REPLY
 * -----------------
 * `authorLesson` asks for a whole lesson in one turn and allows one repair.
 * Measured on qwen2.5:7b that produced arrays with one item where two are
 * required and keys on the wrong block type: the failure of a small model asked
 * to hold a large document in its head. Every fault it made was local, and a
 * local fault is only cheap to fix if the ask was local too.
 *
 * WHY NOT SIMPLY N CALLS
 * ----------------------
 * Because a lesson is not a bag of independent blocks. Nineteen of the
 * twenty-eight rules in `teaching.ts` span blocks -- exactly one definition,
 * summary closes the core, framework before classification. Blocks written
 * independently cannot satisfy those, because no block can see the others.
 *
 * So the structure is settled FIRST, on a skeleton small enough for a small
 * model to get right, and `outlineIssues` refuses a broken one before a single
 * word of prose is paid for. The bodies are then genuinely independent -- the
 * rules that read a body are per-block -- so they are filled CONCURRENTLY and
 * the wall clock becomes the slowest body rather than the sum of all of them.
 *
 * Splitting without that concurrency would make authoring slower than the
 * single call it replaces, which is the trap this shape exists to avoid. It is
 * the same split the practice pipeline arrived at: generate concurrently,
 * reconcile serially.
 *
 * THE GATE IS UNCHANGED. `validateLesson` still runs in full on the assembled
 * lesson. Nothing here lowers a bar; it only moves the cheap half of the
 * checking earlier.
 */

/** How many times a rejected skeleton is rewritten before the attempt is abandoned. */
const OUTLINE_ATTEMPTS = 2

const SKELETON_MARKER = 'SKELETON'

function skeletonRequest(question: string, grounding: string, previousIssues?: readonly string[]): string {
  const head = grounding === '' ? '' : `${grounding}\n\n`
  const retry =
    previousIssues && previousIssues.length > 0
      ? `\nYour previous skeleton was refused for: ${previousIssues.join(', ')}. Fix exactly those.\n`
      : ''
  return (
    `${head}${SKELETON_MARKER}. Plan a lesson answering: ${question}\n` +
    retry +
    '\nReturn ONLY the skeleton — no bodies, no prose, no captions. One JSON object:\n' +
    '{ "id": kebab-case, "question": the question,\n' +
    '  "technicalTerms": [{ "term", "introducedIn": block id }],\n' +
    '  "blocks": [{ "id", "kind", "role", "title", "depth" }],\n' +
    '  "relations": [{ "from": block id, "to": block id, "kind" }] }\n' +
    '\nExactly ONE block has role "definition". Exactly one has role "summary", and it is\n' +
    'the last block with depth "core". At least one block is a table, chart, flow, figure,\n' +
    'equation or simulation. Only an "anchor" may come before the definition.\n' +
    '\nEVERY table, chart, flow, figure and equation MUST appear in a relation. A shown\n' +
    'thing that nothing refers to is decoration, and the lesson is refused for it.\n' +
    'relation kind is one of: supports, derives, contrasts, exemplifies.'
  )
}

function bodyRequest(question: string, outline: BlockOutline, grounding: string): string {
  const head = grounding === '' ? '' : `${grounding}\n\n`
  return (
    `${head}Lesson question: ${question}\n\n` +
    `Write ONE block of that lesson and return it as a single JSON object.\n` +
    `  id:    ${outline.id}\n` +
    `  kind:  ${outline.kind}\n` +
    `  role:  ${outline.role}\n` +
    `  depth: ${outline.depth}\n` +
    `\nKeep the id, kind, role and depth exactly as given. Fill in the fields that\n` +
    `${outline.kind} requires, and nothing else. Follow every rule in the system message.`
  )
}

/** The skeleton as the model returns it, before anything is trusted. */
interface Skeleton {
  readonly id?: unknown
  readonly question?: unknown
  readonly blocks?: unknown
  readonly relations?: unknown
  readonly technicalTerms?: unknown
}

/**
 * The whole skeleton, not only its blocks.
 *
 * RELATIONS BELONG HERE, AND FINDING THAT OUT COST A RED TEST.
 *
 * The first version of this parser read `blocks` alone, and the assembled
 * lesson was refused by `representation-is-decoration`: "the table is joined to
 * nothing by a relation, so nothing in the lesson refers to it."
 *
 * That is not a gap in the gate. It is the same fact this whole file is built
 * on, arriving one layer later than expected: a relation names TWO blocks, so
 * it is cross-block by construction and no isolated body call could ever emit
 * one. `technicalTerms` is the same shape — `introducedIn` points at a block
 * that the block itself cannot know it is.
 *
 * So the skeleton carries every piece of structure that spans blocks, and the
 * body calls carry only what one block can know about itself.
 */
interface ParsedSkeleton {
  readonly blocks: BlockOutline[]
  readonly relations: unknown[]
  readonly technicalTerms: unknown[]
}

function asOutline(parsed: unknown): ParsedSkeleton | null {
  const skeleton = parsed as Skeleton | null
  if (!skeleton || !Array.isArray(skeleton.blocks)) return null
  const out: BlockOutline[] = []
  for (const raw of skeleton.blocks) {
    const b = raw as Partial<BlockOutline>
    if (typeof b.id !== 'string' || typeof b.kind !== 'string' || typeof b.role !== 'string') return null
    out.push({
      id: b.id,
      kind: b.kind,
      role: b.role,
      title: typeof b.title === 'string' ? b.title : undefined,
      /* An absent depth means core. The prompt asks for it, but a missing
         optional is not worth a retry when the default is unambiguous. */
      depth: b.depth === 'deeper' ? 'deeper' : 'core',
    })
  }
  return {
    blocks: out,
    relations: Array.isArray(skeleton.relations) ? skeleton.relations : [],
    technicalTerms: Array.isArray(skeleton.technicalTerms) ? skeleton.technicalTerms : [],
  }
}

function transportFailure(error: unknown, attempts: number, where: string): AuthorResult {
  return {
    ok: false,
    attempts,
    raw: '',
    unreachable: error instanceof Error ? error.message : String(error),
    issues: [{ path: '(transport)', message: `the model was never reached ${where}` }],
  }
}

export async function authorPiecewise(
  model: LessonModel,
  question: string,
  sources: readonly Source[] = [],
): Promise<AuthorResult> {
  const system = teachingSystemPrompt()
  const grounding = groundingPreamble(sources)

  /* ---------------------------------------------------------------- stage 1 */

  let skeleton: ParsedSkeleton | null = null
  let lastIssues: string[] = []
  let raw = ''
  let attempts = 0

  for (let attempt = 0; attempt < OUTLINE_ATTEMPTS; attempt += 1) {
    attempts += 1
    try {
      raw = await model(system, skeletonRequest(question, grounding, lastIssues))
    } catch (error) {
      return transportFailure(error, attempts, 'while planning the lesson')
    }

    const candidate = asOutline(dropNulls(extractJson(raw)))
    if (candidate === null) {
      lastIssues = ['the reply was not a skeleton with a blocks array']
      continue
    }

    const problems = outlineIssues(candidate.blocks)
    if (problems.length === 0) {
      skeleton = candidate
      break
    }
    lastIssues = problems
  }
  const outline = skeleton?.blocks ?? null

  if (outline === null) {
    /*
     * Refused BEFORE any body was written. That is the point of the stage: a
     * structural fault costs two small replies, not one reply per block.
     */
    return {
      ok: false,
      attempts,
      raw,
      issues: lastIssues.map((rule) => ({
        path: '(outline)',
        message: `the plan for this lesson was refused: ${rule}`,
      })),
    }
  }

  /* ---------------------------------------------------------------- stage 2 */

  /*
   * CONCURRENT, AND THAT IS THE WHOLE POINT.
   *
   * The bodies do not depend on each other, so `Promise.all` makes the wall
   * clock the slowest single body rather than the sum. Awaiting these in a loop
   * would make this shape strictly worse than the single call it replaces.
   */
  let bodies: string[]
  try {
    bodies = await Promise.all(
      outline.map((block) => model(system, bodyRequest(question, block, grounding))),
    )
  } catch (error) {
    return transportFailure(error, attempts + outline.length, 'while writing the blocks')
  }
  attempts += outline.length

  /* --------------------------------------------------------------- assembly */

  const blocks = bodies.map((body, index) => {
    const parsed = dropNulls(extractJson(body))
    const plan = outline[index]!
    /*
     * The plan wins on the four structural fields. A model that renamed its own
     * block mid-flight would break every relation pointing at it, and the
     * skeleton is the thing the structural checks were run against.
     */
    return { ...(parsed as object), id: plan.id, kind: plan.kind, role: plan.role, depth: plan.depth }
  })

  /*
   * The cross-block structure comes from the skeleton, never from the bodies.
   * A relation names two blocks and `introducedIn` names a third thing, so
   * neither could be written by a call that can see only one block.
   */
  const assembled = {
    id: toKebab(question),
    question,
    blocks,
    ...(skeleton!.relations.length > 0 ? { relations: skeleton!.relations } : {}),
    ...(skeleton!.technicalTerms.length > 0 ? { technicalTerms: skeleton!.technicalTerms } : {}),
  }

  const result = validateLesson(assembled)
  if (result.ok) return { ok: true, lesson: result.lesson as Lesson, attempts }

  return { ok: false, attempts, raw: JSON.stringify(assembled), issues: result.issues as Issue[] }
}

/** A lesson id derived from the question, since the skeleton's own may be absent. */
function toKebab(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug === '' ? 'lesson' : slug
}
