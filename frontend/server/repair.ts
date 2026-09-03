/**
 * WHAT TO DO WITH A LESSON THE GATE REFUSED, WHEN REFUSING IT HELPS NOBODY.
 *
 * `handler.ts` asks the model, validates, retries, and — if the lesson still
 * fails — used to answer 502 with an apology. MEASURED in CI run 33444764358
 * and reproduced locally, the two refusals that really happen are:
 *
 *   "blocks[0]: 62 words with no break, and the limit is 30 in one go"
 *   "blocks: no block is the definition | blocks: the lesson is all words |
 *    the lesson stops rather than ending"
 *
 * Neither is unsafe. The first is a paragraph missing a blank line. The second
 * is a real answer that is not shaped like a whole lesson. In both, a child
 * asked a question and was handed nothing, while readable teaching sat in the
 * response being thrown away.
 *
 * THE LINE THIS FILE WORKS INSIDE, AND WHERE IT COMES FROM.
 * `validate.ts:240` runs the teaching rules only when the structural pass found
 * nothing: `if (teaching !== 'off' && issues.length === 0)`. So a refusal is
 * never mixed — it is ENTIRELY structural or ENTIRELY teaching rules. That is
 * not a distinction invented here; it is the validator's own shape, and it is
 * exactly the distinction that matters:
 *
 *   structural  the thing is not a lesson. An unknown key, a dangling
 *               relation, an appearance breach, a body past the schema's
 *               ceiling — and that last one is the control that refuses a
 *               leaked system prompt. Nothing here is salvageable and nothing
 *               here is safe. `handler.ts` still answers 502, unchanged.
 *   teaching    the thing IS a lesson and teaches badly. This file lives here.
 *
 * THE RULE EVERY REPAIR OBEYS: THE MODEL'S OWN WORDS, IN THE MODEL'S OWN ORDER.
 * A repair may insert whitespace, join whitespace, delete a declaration the
 * reader never saw, or change a chart type the rule's own message tells it to
 * change. It may not add a sentence, drop a sentence, reorder a lesson, or
 * re-role a block. Everything a learner reads was written by the model, and
 * anything else would be this server teaching her something nobody checked
 * (LAW B).
 *
 * AND THE GATE IS NOT WEAKENED. Nothing here loosens a rule. A repaired lesson
 * goes back through the SAME `validateLesson`, and if it does not pass it is
 * not served. A 62-word wall is broken into paragraphs; it is never handed over
 * as a wall.
 */

import { validateLesson, type Issue } from '../src/canvas/spec/validate.ts'
import {
  MAX_EXAMPLE_WORDS,
  MAX_RUN_WORDS,
  segments,
} from '../src/canvas/teach/teaching.ts'

/** True when every issue is a broken teaching rule, so none is structural. */
export function onlyTeachingRules(issues: readonly Issue[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.rule !== undefined)
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0)
}

/* -------------------------------------------------------------------------- */
/* Breaking a wall of text into paragraphs                                     */
/* -------------------------------------------------------------------------- */

/**
 * A sentence with no full stop in it and more words than the budget allows.
 *
 * There is nothing to break on, so it is broken between words. That is ugly,
 * and it is what the rule asks for: "put a blank line in every two or three
 * lines so the reader has somewhere to breathe". The alternative on this path
 * is that she is shown nothing at all.
 *
 * NOTE that this rejoins with single spaces, so runs of whitespace inside one
 * over-long sentence are normalised. The words and their order are untouched,
 * which is the invariant that matters and the one the tests assert.
 */
function betweenWords(sentence: string, budget: number): string[] {
  const all = wordsOf(sentence)
  if (all.length <= budget) return [sentence.trim()]
  const out: string[] = []
  for (let i = 0; i < all.length; i += budget) out.push(all.slice(i, i + budget).join(' '))
  return out
}

/**
 * Pack one over-long run into paragraphs that each fit the budget.
 *
 * Greedy, and it prefers a sentence end: `firstSentence` in `teaching.ts` reads
 * sentences with the same lookbehind, so this breaks where the product already
 * believes a sentence stops.
 */
function paragraphs(run: string, budget: number): string[] {
  if (wordsOf(run).length <= budget) return [run]

  const out: string[] = []
  let current: string[] = []
  let held = 0

  for (const sentence of run.split(/(?<=[.!?])\s+/)) {
    for (const piece of betweenWords(sentence, budget)) {
      const size = wordsOf(piece).length
      if (held > 0 && held + size > budget) {
        out.push(current.join(' '))
        current = []
        held = 0
      }
      current.push(piece)
      held += size
    }
  }
  if (current.length > 0) out.push(current.join(' '))
  return out
}

/** Insert blank lines until no unbroken run exceeds the budget. */
function broken(text: string, budget: number): string {
  return segments(text)
    .flatMap((run) => paragraphs(run, budget))
    .join('\n\n')
}

/* -------------------------------------------------------------------------- */
/* Which field a reader actually reads                                         */
/* -------------------------------------------------------------------------- */

/**
 * The ONE stored string that `readableText` in `teaching.ts` measures, where
 * there is exactly one.
 *
 * `reasoning` is deliberately absent. Its readable text is a JOIN of `claim`,
 * every step's `expression` and `because`, and `therefore` — it is not stored
 * anywhere, so there is no single field to put a blank line into, and moving
 * words between `expression` and `because` would change which part of the
 * argument each one makes. A reasoning block with an over-long step is left for
 * the caller to drop rather than quietly rewritten into something the model did
 * not say.
 */
function readableField(kind: string): 'body' | 'why' | 'mentalModel' | undefined {
  if (kind === 'prose' || kind === 'callout') return 'body'
  if (kind === 'misconception') return 'why'
  if (kind === 'summary') return 'mentalModel'
  return undefined
}

type Loose = Record<string, unknown>

/* -------------------------------------------------------------------------- */
/* The repairs                                                                 */
/* -------------------------------------------------------------------------- */

export interface Repaired {
  /** The candidate. Still has to go back through `validateLesson`. */
  readonly lesson: unknown
  /** Which rules were acted on, for the operator's log. */
  readonly rules: readonly string[]
}

/**
 * Apply every mechanical repair the refusal calls for.
 *
 * Driven by the rule NAMES in the refusal, but each repair re-derives its own
 * condition rather than parsing an issue path. That makes every one of them
 * idempotent and keeps a path format out of the contract between two files.
 */
export function repairLesson(produced: unknown, issues: readonly Issue[]): Repaired | undefined {
  if (!onlyTeachingRules(issues)) return undefined

  /* Re-parsed with the rules off, purely to get the schema's defaults applied
     (`role`, `emphasis`, `terms`, `relations`). Working on the raw object would
     mean re-implementing those defaults here, and a second copy of a default is
     a second thing to get wrong. The structural pass already succeeded — that
     is what `onlyTeachingRules` proves — so this cannot fail. */
  const normalised = validateLesson(produced, { teaching: 'off' })
  if (!normalised.ok) return undefined

  const lesson = JSON.parse(JSON.stringify(normalised.lesson)) as Loose
  const blocks = (lesson['blocks'] ?? []) as Loose[]
  const broke = new Set(issues.map((issue) => issue.rule as string))
  const done: string[] = []

  /* run-too-long — the wall gets blank lines in it. */
  if (broke.has('run-too-long')) {
    let any = false
    for (const block of blocks) {
      if (block['role'] === 'definition') continue
      const field = readableField(String(block['kind']))
      if (field === undefined) continue
      const text = block[field]
      if (typeof text !== 'string') continue
      const budget = block['role'] === 'example' ? MAX_EXAMPLE_WORDS : MAX_RUN_WORDS
      const fixed = broken(text, budget)
      if (fixed !== text) { block[field] = fixed; any = true }
    }
    if (any) done.push('run-too-long')
  }

  /* definition-split-up — one idea arrives in one piece. Whitespace only. */
  if (broke.has('definition-split-up')) {
    let any = false
    for (const block of blocks) {
      if (block['role'] !== 'definition') continue
      const field = readableField(String(block['kind']))
      if (field === undefined) continue
      const text = block[field]
      if (typeof text !== 'string') continue
      const joined = segments(text).join(' ')
      if (joined !== text) { block[field] = joined; any = true }
    }
    if (any) done.push('definition-split-up')
  }

  /* marked-term-absent — a mark on a word the block never says.
     The mark never rendered; that IS the defect. Dropping the declaration
     removes nothing the reader would have seen. */
  if (broke.has('marked-term-absent')) {
    let any = false
    for (const block of blocks) {
      if (block['kind'] !== 'prose' && block['kind'] !== 'callout') continue
      const terms = block['terms']
      const body = block['body']
      if (!Array.isArray(terms) || typeof body !== 'string') continue
      const haystack = body.toLowerCase()
      const kept = terms.filter((term) => {
        const text = (term as Loose)['text']
        return typeof text === 'string' && haystack.includes(text.toLowerCase())
      })
      if (kept.length !== terms.length) { block['terms'] = kept; any = true }
    }
    if (any) done.push('marked-term-absent')
  }

  /* term-introduced-nowhere — a declaration pointing at no block.
     It guards nothing, so it protects nothing to keep it. It is never
     re-pointed at the nearest id: that would be guessing at the model's
     intent, and a wrong guess silently disables the rule it belongs to. */
  if (broke.has('term-introduced-nowhere')) {
    const declared = lesson['technicalTerms']
    if (Array.isArray(declared)) {
      const ids = new Set(blocks.map((block) => block['id']))
      const kept = declared.filter((term) => ids.has((term as Loose)['introducedIn']))
      if (kept.length !== declared.length) {
        lesson['technicalTerms'] = kept
        done.push('term-introduced-nowhere')
      }
    }
  }

  /* chart-fights-its-data — the one rule whose message names its own fix:
     "Use a line". Same series, same points, and the bars were making a false
     claim about the gaps between them. */
  if (broke.has('chart-fights-its-data')) {
    let any = false
    for (const block of blocks) {
      if (block['kind'] !== 'chart' || block['chartType'] !== 'bar') continue
      const series = (block['series'] ?? []) as Loose[]
      const points = series.flatMap((one) => ((one['points'] ?? []) as Loose[]))
      if (points.length === 0 || !points.every((p) => typeof p['x'] === 'number')) continue
      block['chartType'] = 'line'
      any = true
    }
    if (any) done.push('chart-fights-its-data')
  }

  return done.length === 0 ? undefined : { lesson, rules: done }
}

/* -------------------------------------------------------------------------- */
/* Dropping what still will not pass                                           */
/* -------------------------------------------------------------------------- */

/** The block index an issue points at, where it points at one. */
/**
 * Which block an issue is about, in either of the two path dialects the gate
 * speaks: `blocks[6]` from the teaching rules, `blocks.6.series.0.points.0.y`
 * from the schema. The second was unread, so a block whose points were not
 * numbers -- the commonest thing a small model gets wrong -- could not be
 * pruned and the whole lesson was refused (S7, `oneBrokenBlock.test.ts`).
 */
function blockIndex(path: string): number | undefined {
  const found = /^blocks(?:\[(\d+)\]|\.(\d+)(?:\.|$))/.exec(path)
  if (found === null) return undefined
  const at = found[1] ?? found[2]
  return at === undefined ? undefined : Number(at)
}

/**
 * Remove the blocks the gate is still refusing, and everything that referred to
 * them, so what is left can be shown.
 *
 * This DOES drop teaching the reader would have seen, which is why it is the
 * last thing tried before giving up on the model's words entirely. It is still
 * better than the alternative on this path, which is showing her none of it.
 * Arc issues name `blocks` with no index and drop nothing — there is no single
 * block at fault when the complaint is the shape of the whole lesson.
 */
export function withoutRefusedBlocks(lesson: unknown, issues: readonly Issue[]): unknown | undefined {
  const guilty = new Set(
    issues.map((issue) => blockIndex(issue.path)).filter((i): i is number => i !== undefined),
  )
  if (guilty.size === 0) return undefined

  const copy = JSON.parse(JSON.stringify(lesson)) as Loose
  const blocks = (copy['blocks'] ?? []) as Loose[]
  const kept = blocks.filter((_, index) => !guilty.has(index))
  if (kept.length === 0 || kept.length === blocks.length) return undefined

  const ids = new Set(kept.map((block) => block['id']))
  copy['blocks'] = kept

  const relations = copy['relations']
  if (Array.isArray(relations)) {
    copy['relations'] = relations.filter(
      (r) => ids.has((r as Loose)['from']) && ids.has((r as Loose)['to']),
    )
  }
  const declared = copy['technicalTerms']
  if (Array.isArray(declared)) {
    copy['technicalTerms'] = declared.filter((t) => ids.has((t as Loose)['introducedIn']))
  }
  return copy
}

/* -------------------------------------------------------------------------- */
/* Saying so, in words                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What the server says about ITSELF when it could not build the whole lesson.
 *
 * THIS IS THE ONE PLACE THE SERVER WRITES WORDS, AND IT IS NOT AN EXCEPTION TO
 * LAW B. LAW B says: asked what it does not teach, it says so and invents
 * nothing. These sentences are exactly the "says so". They are about the
 * server's own state and name nothing about the subject, so there is no claim
 * in them for the learner to be wrong about.
 *
 * Both are inside `MAX_RUN_WORDS`, carry no number, no code and no jargon, and
 * end with something she can actually do next.
 */
export const PART_OF_IT =
  'I could not put all of this together properly, so this is the part of it I was able to check. ' +
  'Ask me again if it looks wrong.'

export const NONE_OF_IT =
  'I could not put this one together properly, and I would rather say so than guess at it. ' +
  'Ask me again, or ask for one smaller piece of it.'

/** An id for the note that cannot collide with one the model chose. */
function freeId(taken: ReadonlySet<unknown>): string {
  let id = 'a-note'
  while (taken.has(id)) id = `${id}-x`
  return id
}

/** Put the note at the top, where she reads it before the part that survived. */
export function withNote(lesson: unknown, note: string): unknown {
  const copy = JSON.parse(JSON.stringify(lesson)) as Loose
  const blocks = (copy['blocks'] ?? []) as Loose[]
  const id = freeId(new Set(blocks.map((block) => block['id'])))
  copy['blocks'] = [{ id, kind: 'prose', body: note }, ...blocks]
  return copy
}

/**
 * The floor. Nothing of the model's survived, so she gets the honest sentence
 * and nothing else — but she gets it as a real lesson, through the real gate,
 * because a reply that has not been validated is a wall of text arriving by the
 * back door.
 */
export function noteOnly(question: string): unknown {
  return {
    id: 'a-note',
    question: question.slice(0, 200),
    blocks: [{ id: 'a-note', kind: 'prose', body: NONE_OF_IT }],
  }
}
