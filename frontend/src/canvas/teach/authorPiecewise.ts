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
import {
  LEGAL_KINDS,
  LEGAL_ROLES,
  outlineIssues,
  type BlockOutline,
  type Plan,
  type PlannedRelation,
} from './outline'

/**
 * Author a lesson in two stages: the plan, then the bodies, concurrently.
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
 * So the structure is settled FIRST, on a plan small enough for a small model
 * to get right, and `outlineIssues` refuses a broken one before a single word
 * of prose is paid for. The bodies are then genuinely independent -- the rules
 * that read a body are per-block -- so they are filled CONCURRENTLY and the
 * wall clock becomes the slowest body rather than the sum of all of them.
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

/** How many times a rejected plan is rewritten before the attempt is abandoned. */
const PLAN_ATTEMPTS = 2

/**
 * How many times ONE body is rewritten before the lesson is abandoned.
 *
 * Per block, not per lesson, and that is the point of splitting: `authorLesson`
 * had to regenerate everything to fix anything. Review caught the first version
 * of this file with no body retry at all, which was worse than the code it
 * replaced on the exact axis the split was meant to improve.
 */
const BODY_ATTEMPTS = 2

const SKELETON_MARKER = 'SKELETON'

function skeletonRequest(question: string, grounding: string, previousIssues?: readonly string[]): string {
  const head = grounding === '' ? '' : `${grounding}\n\n`
  const retry =
    previousIssues && previousIssues.length > 0
      ? `\nYour previous plan was refused for: ${previousIssues.join(', ')}. Fix exactly those.\n`
      : ''
  return (
    `${head}${SKELETON_MARKER}. Plan a lesson answering: ${question}\n` +
    retry +
    '\nReturn ONLY the plan — no bodies, no prose, no captions. One JSON object:\n' +
    '{ "id": kebab-case, "question": the question,\n' +
    '  "technicalTerms": [{ "term", "introducedIn": block id }],\n' +
    '  "blocks": [{ "id", "kind", "role", "title", "depth" }],\n' +
    '  "relations": [{ "from": block id, "to": block id, "kind" }] }\n' +
    '\nExactly ONE block has role "definition". Exactly one has role "summary", and it is\n' +
    'the last block with depth "core". At least one block is a table, chart, flow, figure,\n' +
    'equation or simulation. Only an "anchor" may come before the definition. Every block\n' +
    'with depth "deeper" comes after the summary.\n' +
    '\nEVERY table, chart, flow, figure and equation MUST appear in a relation. A shown\n' +
    'thing that nothing refers to is decoration, and the lesson is refused for it.\n' +
    'relation kind is one of: supports, derives, contrasts, exemplifies.'
  )
}

/**
 * What one block is asked for, including the terms it must not use yet.
 *
 * R6 refuses a lesson where a declared technical term appears in any block
 * BEFORE the one that earns it. That is a constraint on a BODY, so a body
 * writer that cannot see the term list has no way to obey it -- and review
 * found the first version of this file withholding exactly that. It is the one
 * piece of cross-block context a body genuinely needs.
 */
function bodyRequest(
  question: string,
  outline: BlockOutline,
  grounding: string,
  forbiddenTerms: readonly string[],
  earnedTerms: readonly string[],
  previousIssue?: string,
): string {
  const head = grounding === '' ? '' : `${grounding}\n\n`
  const forbid =
    forbiddenTerms.length > 0
      ? `\nDo NOT use these words yet — a later block earns them: ${forbiddenTerms.join(', ')}.\n`
      : ''
  const earn =
    earnedTerms.length > 0 ? `\nThis block is where these words are introduced: ${earnedTerms.join(', ')}.\n` : ''
  const retry = previousIssue ? `\nYour previous attempt was unusable: ${previousIssue}. Try again.\n` : ''
  return (
    `${head}Lesson question: ${question}\n\n` +
    `Write ONE block of that lesson and return it as a single JSON object.\n` +
    `  id:    ${outline.id}\n` +
    `  kind:  ${outline.kind}\n` +
    `  role:  ${outline.role}\n` +
    `  depth: ${outline.depth}\n` +
    forbid +
    earn +
    retry +
    `\nKeep the id, kind, role and depth exactly as given. Fill in the fields that\n` +
    `${outline.kind} requires, and nothing else. Follow every rule in the system message.`
  )
}

/** The plan as the model returns it, before anything is trusted. */
interface Skeleton {
  readonly blocks?: unknown
  readonly relations?: unknown
  readonly technicalTerms?: unknown
}

interface DeclaredTerm {
  readonly term: string
  readonly introducedIn: string
}

/**
 * The whole plan, not only its blocks.
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
 * one. `technicalTerms` is the same shape -- `introducedIn` points at a block
 * that the block itself cannot know it is.
 */
interface ParsedSkeleton extends Plan {
  readonly technicalTerms: DeclaredTerm[]
}

function asOutline(parsed: unknown): ParsedSkeleton | null {
  const skeleton = parsed as Skeleton | null
  if (!skeleton || !Array.isArray(skeleton.blocks)) return null

  const blocks: BlockOutline[] = []
  for (const raw of skeleton.blocks) {
    const b = raw as Partial<BlockOutline>
    if (typeof b.id !== 'string') return null
    /*
     * An invented kind or role is refused HERE, not after every body has been
     * written. Left unchecked it is forced into the assembled block by the
     * plan-wins rule below and guarantees a schema refusal at the very end --
     * the expensive failure this stage exists to prevent.
     */
    if (typeof b.kind !== 'string' || !LEGAL_KINDS.has(b.kind)) return null
    if (typeof b.role !== 'string' || !LEGAL_ROLES.has(b.role)) return null
    blocks.push({
      id: b.id,
      kind: b.kind,
      role: b.role,
      title: typeof b.title === 'string' ? b.title : undefined,
      /* An absent depth means core. The prompt asks for it, but a missing
         optional is not worth a retry when the default is unambiguous. */
      depth: b.depth === 'deeper' ? 'deeper' : 'core',
    })
  }

  const terms: DeclaredTerm[] = []
  if (Array.isArray(skeleton.technicalTerms)) {
    for (const raw of skeleton.technicalTerms) {
      const t = raw as Partial<DeclaredTerm>
      if (typeof t.term === 'string' && typeof t.introducedIn === 'string') {
        terms.push({ term: t.term, introducedIn: t.introducedIn })
      }
    }
  }

  return {
    blocks,
    relations: Array.isArray(skeleton.relations) ? (skeleton.relations as PlannedRelation[]) : [],
    technicalTerms: terms,
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

/** A body reply is usable when it parsed into an object with something in it. */
function usableBody(reply: string): Record<string, unknown> | null {
  const parsed = dropNulls(extractJson(reply))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return Object.keys(parsed).length === 0 ? null : (parsed as Record<string, unknown>)
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
  let planRaw = ''
  let attempts = 0

  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt += 1) {
    attempts += 1
    try {
      planRaw = await model(system, skeletonRequest(question, grounding, lastIssues))
    } catch (error) {
      return transportFailure(error, attempts, 'while planning the lesson')
    }

    const candidate = asOutline(dropNulls(extractJson(planRaw)))
    if (candidate === null) {
      lastIssues = ['the plan was not a blocks array of legal kinds and roles']
      continue
    }

    const problems = outlineIssues(candidate)
    if (problems.length === 0) {
      skeleton = candidate
      break
    }
    lastIssues = problems
  }

  if (skeleton === null) {
    /*
     * Refused BEFORE any body was written. That is the point of the stage: a
     * structural fault costs two small replies, not one reply per block.
     */
    return {
      ok: false,
      attempts,
      raw: planRaw,
      issues: lastIssues.map((rule) => ({
        path: '(plan)',
        message: `the plan for this lesson was refused: ${rule}`,
      })),
    }
  }

  const outline = skeleton.blocks

  /* ---------------------------------------------------------------- stage 2 */

  /* Which terms each block may not use yet, from the plan's own declarations. */
  const earnedAt = new Map<string, number>()
  outline.forEach((b, i) => earnedAt.set(b.id, i))
  const forbiddenFor = (index: number): string[] =>
    skeleton!.technicalTerms
      .filter((t) => {
        const at = earnedAt.get(t.introducedIn)
        return at !== undefined && index < at
      })
      .map((t) => t.term)
  const earnedBy = (id: string): string[] =>
    skeleton!.technicalTerms.filter((t) => t.introducedIn === id).map((t) => t.term)

  /**
   * One block, retried on its own if the reply is unusable.
   *
   * The retry is PER BLOCK. `authorLesson` had to regenerate the whole lesson
   * to fix one fault; retrying just the block that failed is the saving the
   * split exists for, and leaving it out made this file worse than what it
   * replaced.
   */
  const fillOne = async (block: BlockOutline, index: number): Promise<string> => {
    let last = ''
    for (let attempt = 0; attempt < BODY_ATTEMPTS; attempt += 1) {
      last = await model(
        system,
        bodyRequest(
          question,
          block,
          grounding,
          forbiddenFor(index),
          earnedBy(block.id),
          attempt === 0 ? undefined : 'it contained no JSON object',
        ),
      )
      if (usableBody(last) !== null) return last
    }
    return last
  }

  /*
   * CONCURRENT, AND THAT IS THE WHOLE POINT.
   *
   * The bodies do not depend on each other, so `Promise.all` makes the wall
   * clock the slowest single body rather than the sum. Awaiting these in a loop
   * would make this shape strictly worse than the single call it replaces.
   */
  let bodies: string[]
  try {
    bodies = await Promise.all(outline.map((block, index) => fillOne(block, index)))
  } catch (error) {
    return transportFailure(error, attempts + outline.length, 'while writing the blocks')
  }
  attempts += outline.length

  /* --------------------------------------------------------------- assembly */

  const blocks = bodies.map((body, index) => {
    const parsed = usableBody(body) ?? {}
    const plan = outline[index]!
    /*
     * The plan wins on the four structural fields. A model that renamed its own
     * block mid-flight would break every relation pointing at it, and the plan
     * is the thing the structural checks were run against.
     */
    return { ...parsed, id: plan.id, kind: plan.kind, role: plan.role, depth: plan.depth }
  })

  const assembled = {
    id: toKebab(question),
    question,
    blocks,
    ...(skeleton.relations.length > 0 ? { relations: skeleton.relations } : {}),
    ...(skeleton.technicalTerms.length > 0 ? { technicalTerms: skeleton.technicalTerms } : {}),
  }

  const result = validateLesson(assembled)
  if (result.ok) return { ok: true, lesson: result.lesson as Lesson, attempts }

  /*
   * THE MODEL'S OWN WORDS ARE THE EVIDENCE, so the raw replies are reported
   * rather than the object this file assembled from them. A captured-reply
   * corpus is made of what the model actually said; reporting only the
   * assembly would throw that away at exactly the moment it is needed.
   */
  return {
    ok: false,
    attempts,
    raw: bodies.join('\n---\n'),
    issues: result.issues as Issue[],
  }
}

/** A lesson id derived from the question, since the plan's own may be absent. */
function toKebab(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug === '' ? 'lesson' : slug
}
