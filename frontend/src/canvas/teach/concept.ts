import { validateLesson, type Issue } from '../spec/validate'
import type { LessonModel } from './authorLesson'
import { classifyTurn } from './turn'

/**
 * ONE ATOMIC CONCEPT, AUTHORED AS THE UNIT.
 *
 * WHY THIS EXISTS
 * ---------------
 * `authorLesson` asks a model for a WHOLE lesson in one reply. Measured against
 * qwen2.5:7b on six questions across six subjects: **0 passed, mean 223.5s**.
 * Three prompt structures were tried -- a worked example, a plan-then-fill
 * split, and concurrent per-block calls -- and all three measured zero.
 *
 * The wall is not the prompt. It is the UNIT OF WORK. A lesson is a document
 * with a definition, a framework, a representation, an example, a summary and
 * a relation graph that must agree with all of them. A model that cannot hold
 * that shape fails every attempt however the request is phrased.
 *
 * One concept is a smaller thing to get right, and it is also what teaching
 * looks like: teach one idea, check it landed, then ask what comes next.
 * `beats.ts` already cuts a finished lesson into those steps -- "beats are
 * derived, never authored" -- and `turn.ts` already ends each beat with a
 * question. This inverts the order, so the step is AUTHORED as the unit rather
 * than recovered from a document the model could not write.
 *
 * WHAT IS REUSED, AND WHAT IS NOT
 * -------------------------------
 * The blocks go through `validateLesson` at `'answer'` level, so a concept
 * inherits every structural check and every chunk rule -- run length, marked
 * terms, one-thing definitions, and `chart-fights-its-data`, which was moved
 * out of the arc-gated group precisely so a step like this is covered by it.
 *
 * The four rules below are NOT in `teaching.ts` on purpose. They are properties
 * of a STEP, not of a lesson: a lesson has one summary at the end, a step has a
 * checkpoint and an offer after every single one. Putting them in the lesson
 * gate would refuse every lesson ever written.
 */

export interface NextBranch {
  readonly id: string
  /** What the learner would actually be taught. Never "Learn more". */
  readonly label: string
}

export interface Concept {
  readonly id: string
  readonly question: string
  readonly blocks: readonly Record<string, unknown>[]
  readonly relations: readonly Record<string, unknown>[]
  /**
   * Declared here rather than reached for with a cast.
   *
   * `checkTechnicalTermsArriveLate` is a chunk rule, so it runs on a step, and
   * it reads this field. Leaving it off the type meant passing it through
   * required asserting a shape the type said did not exist -- which is the
   * compiler telling the truth about a field the module genuinely uses.
   */
  readonly technicalTerms?: readonly { readonly term: string; readonly introducedIn: string }[]
  /** The question that finds out whether it landed. Principle 4. */
  readonly checkpoint: string
  /** Named branches, at least two. Principle 1. */
  readonly next: readonly NextBranch[]
}

export type ConceptResult =
  | { ok: true; concept: Concept }
  /**
   * `unreachable` separates two outcomes a learner must never see conflated:
   * "the model answered and what it wrote does not teach" and "nothing
   * answered". `authorLesson` records what conflating them cost; this repeats
   * the distinction rather than the mistake.
   */
  | { ok: false; issues: Issue[]; raw: string; unreachable?: string }

/** Blocks that count as SHOWING. The same set `teaching.ts` and `beats.ts` use. */
const SHOWS = new Set(['chart', 'table', 'flow', 'figure', 'simulation'])

/**
 * Words that carry no information about WHAT would be taught next.
 *
 * A SHAPE, NOT A BLOCKLIST. The test is whether anything survives removing
 * them: "Learn more" and "Continue" reduce to nothing, so they name nothing.
 * "Why a missing base case never stops" keeps five words and names a topic.
 * A phrase nobody thought to list here is judged the same way, which a list of
 * banned strings could never do.
 */
const EMPTY_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'on', 'in', 'it', 'this', 'that', 'and', 'or',
  'learn', 'know', 'more', 'continue', 'next', 'go', 'further', 'deeper',
  'other', 'others', 'related', 'explore', 'tell', 'show', 'me', 'some',
  'something', 'anything', 'else', 'about', 'topic', 'topics', 'stuff',
  'ahead', 'onward', 'please', 'yes', 'ok', 'okay',
])

function namesSomething(label: string): boolean {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.length > 0 && !EMPTY_WORDS.has(w))
}

/**
 * The four rules that make a STEP a step, checked without a model.
 *
 * Exported so a caller can judge a concept it built by hand, and so the rules
 * are testable without standing up a fake model -- the same reason
 * `checkTeaching` is exported from `teaching.ts`.
 */
export function conceptIssues(concept: Concept): Issue[] {
  const out: Issue[] = []
  const blocks = concept.blocks ?? []

  /* Principle 3. Prose alone is telling. `nothing-is-shown` says this for a
     whole lesson, but it is arc-gated and a step has no arc, so the step says
     it itself. WHICH representation fits is `teaching.ts`'s job. */
  if (!blocks.some((b) => SHOWS.has(String(b.kind)))) {
    out.push({
      path: 'blocks',
      message:
        'this step shows nothing — it is all words. One concept gets one representation that ' +
        'fits it: a graph, a table, a flow or a figure',
    })
  }

  /* Principle 1. The unit is ONE atomic idea. Two definitions is two concepts,
     which is the whole-lesson failure this module exists to escape. */
  const definitions = blocks.filter((b) => b.role === 'definition').length
  if (definitions > 1) {
    out.push({
      path: 'blocks',
      message: `this step carries ${definitions} definitions, so it is teaching more than one idea. Split it`,
    })
  }

  /* Principle 4. A step that ends with a statement has moved on without
     finding out whether it landed. `classifyTurn` already decides question
     from answer, and it is tested -- reimplementing it here would be a second
     opinion that can disagree with the box the learner types into. */
  if (classifyTurn(concept.checkpoint ?? '') !== 'question') {
    out.push({
      path: 'checkpoint',
      message:
        'the step ends by asserting, not by asking. Check the idea landed before moving on — ' +
        'end with a question the learner has to answer',
    })
  }

  /* Principle 1, second half. One option is not a choice, and an offer that
     names nothing puts the work of knowing the syllabus back on the learner,
     who is the one person who cannot know it. */
  const next = concept.next ?? []
  if (next.length < 2) {
    out.push({
      path: 'next',
      message: `only ${next.length} branch offered. Give at least two, so what comes next is a choice`,
    })
  }
  for (const [i, branch] of next.entries()) {
    if (!namesSomething(branch.label ?? '')) {
      out.push({
        path: `next[${i}]`,
        message: `"${branch.label}" names nothing the learner could choose between — it is generic. Name the actual idea`,
      })
    }
  }

  return out
}

/** What the model is asked for. One concept, and the shape it must arrive in. */
export function conceptRequest(question: string): string {
  return [
    `Teach ONE atomic concept that moves a learner toward answering: ${question}`,
    '',
    'Not a lesson. One idea, the smallest that stands on its own.',
    '',
    'Output one JSON object and nothing else. No markdown, no code fence.',
    '{',
    '  "id": kebab-case,',
    '  "question": the question this step moves toward,',
    '  "technicalTerms": [{ "term": word, "introducedIn": block id }],',
    '  "blocks": [ one block with "role":"definition", and at least one of',
    '              kind "table" | "chart" | "flow" | "figure" that SHOWS it ],',
    '  "relations": [{ "kind":"supports", "from": id, "to": id }],',
    '  "checkpoint": a QUESTION that finds out whether the idea landed,',
    '  "next": [ at least two branches, each { "id":..., "label": the actual',
    '            idea it would teach } ]',
    '}',
    '',
    'The representation must FIT the content — a graph for a continuous',
    'relationship, a table for cases, a flow for a process. Never add one',
    'because this list asked for one.',
    '',
    'A "next" label names a real idea. "Learn more" and "Continue" name',
    'nothing and will be refused.',
  ].join('\n')
}

/**
 * Ask for one concept, and gate it.
 *
 * No retry here on purpose. A retry loop belongs to the caller, which knows the
 * learner's time budget; burying one here hides the per-attempt failure rate,
 * and that rate is the number this whole module exists to move.
 */
export async function authorConcept(
  model: LessonModel,
  question: string,
): Promise<ConceptResult> {
  let raw: string
  try {
    raw = await model(conceptRequest(question), question)
  } catch (error) {
    /* Nothing answered. Not the same as answering badly. */
    return {
      ok: false,
      issues: [{ path: '(model)', message: 'the model could not be reached' }],
      raw: '',
      unreachable: error instanceof Error ? error.message : String(error),
    }
  }

  let parsed: Concept
  try {
    parsed = JSON.parse(raw) as Concept
  } catch {
    return {
      ok: false,
      issues: [{ path: '(reply)', message: 'the reply was not one JSON object' }],
      raw,
    }
  }

  /* The blocks go through the real gate at `'answer'` level: structure, and
     every chunk rule including `chart-fights-its-data`. Arc rules are off
     because a step has no arc -- it is one idea, not an opening and an ending. */
  const structural = validateLesson(
    {
      id: parsed.id,
      question: parsed.question,
      blocks: parsed.blocks,
      relations: parsed.relations ?? [],
      ...(parsed.technicalTerms ? { technicalTerms: parsed.technicalTerms } : {}),
    },
    { teaching: 'answer' },
  )

  const issues = [...(structural.ok ? [] : structural.issues), ...conceptIssues(parsed)]
  if (issues.length > 0) return { ok: false, issues, raw }

  return { ok: true, concept: parsed }
}
