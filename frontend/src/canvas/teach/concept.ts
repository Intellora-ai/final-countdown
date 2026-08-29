import type { Lesson } from '../spec/spec'
import { validateLesson, type Issue } from '../spec/validate'
import { extractJson, type LessonModel } from './authorLesson'
import { groundingPreamble, type Source } from './grounding'
import { nextRoute, routeDirective } from './route'
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
  | {
      ok: true
      concept: Concept
      /**
       * The VALIDATED lesson, not the raw parse.
       *
       * Without this the module was unrenderable: `CanvasRoute` holds a
       * `Lesson`, a `Concept` is whatever JSON the model sent, and there was no
       * type-safe way to hand one over. So this module measured 5 of 6 while
       * the product went on calling `authorLesson` at 0 of 6. A module that
       * cannot be wired does not ship, however good its number is.
       */
      lesson: Lesson
      attempts: number
    }
  /**
   * `unreachable` separates two outcomes a learner must never see conflated:
   * "the model answered and what it wrote does not teach" and "nothing
   * answered". `authorLesson` records what conflating them cost; this repeats
   * the distinction rather than the mistake.
   */
  | { ok: false; issues: Issue[]; raw: string; attempts: number; unreachable?: string }

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

/**
 * A COMPLETE, VALID, RULE-ABIDING CONCEPT, SHOWN RATHER THAN DESCRIBED.
 *
 * This replaced a pseudo-schema that wrote placeholders unquoted:
 *
 *     "id": kebab-case,
 *     "question": the question this step moves toward,
 *
 * qwen2.5:7b copied that format exactly and replied `{"id": gas-partic和平}`
 * — an unquoted value, twelve completion tokens, `finish_reason: "stop"`. Not
 * JSON, so every reply was refused as "no JSON object", six times out of six,
 * across three separate runs. Two other real defects were found and fixed
 * first (a naive parser, a missing token budget) and neither moved the number,
 * because the model was being handed a broken example the entire time.
 *
 * A model shown malformed JSON emits malformed JSON. The only honest way to
 * describe a JSON shape to a model is to show it JSON, and the only way to
 * keep that example honest is to build it as an object and serialise it — a
 * hand-written string drifts from the rules the moment either changes.
 *
 * `concept.test.ts` parses this back out of the prompt and runs it through
 * `conceptIssues`, so an example that stopped being valid, or stopped obeying
 * the rules it teaches, fails the suite rather than quietly teaching a model
 * to break them.
 */
const WORKED_EXAMPLE = {
  id: 'base-case',
  question: 'What is a base case?',
  technicalTerms: [{ term: 'recursion', introducedIn: 'shown' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'A base case is the branch that returns without calling itself.',
      terms: [{ text: 'branch', mark: 'key' }],
    },
    {
      id: 'shown',
      kind: 'table',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      columns: [
        { key: 'call', label: 'Call', type: 'text' },
        { key: 'does', label: 'What it does', type: 'text' },
      ],
      rows: [
        { call: 'fact(1)', does: 'returns 1, no recursion' },
        { call: 'fact(4)', does: 'calls fact(3)' },
      ],
    },
  ],
  relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
  checkpoint: 'Which of those two calls is the base case, and how can you tell?',
  next: [
    { id: 'deeper', label: 'Why a missing base case never stops' },
    { id: 'related', label: 'How recursion builds the answer back up' },
  ],
}

/** What the model is asked for. One concept, and a real one to copy. */
export function conceptRequest(
  question: string,
  sources: readonly Source[] = [],
  alreadyUsed: readonly string[] = [],
): string {
  /*
   * A DIFFERENT WAY IN EACH TIME, and it reaches the model or it is nothing.
   *
   * `route.ts` rotates over twelve accidental axes -- where the step opens,
   * what it shows, which example domain it reaches for -- none of which can
   * change whether a statement is true. Shannon: a message the receiver could
   * have predicted carries zero bits, and a second explanation arriving in the
   * shape of the first is exactly that.
   *
   * The seed is the question, so the same topic rotates consistently while two
   * different topics do not march in lockstep.
   */
  const seed = [...question].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
  const route = routeDirective(nextRoute({ seed, alreadyUsed }))
  /*
   * SEARCH FIRST, THEN WRITE -- the same order `authorLesson` uses, and for the
   * reason `CanvasRoute` records beside its own search: "The gate reads shape
   * and has no opinion about truth, so an invented lesson passes every check in
   * this repository. The only defence is giving the author real text to write
   * from."
   *
   * `groundingPreamble([])` returns '', so a topic the web does not cover, a
   * refused search, or an unconfigured provider all leave the prompt exactly as
   * it was. Turning a retrieval failure into a teaching failure would be worse
   * than being honestly ungrounded.
   */
  const grounding = groundingPreamble(sources)
  return [
    ...(grounding === '' ? [] : [grounding, '']),
    `Teach ONE atomic concept that moves a learner toward answering: ${question}`,
    '',
    `HOW TO COME AT IT THIS TIME: ${route}`,
    '',
    'Not a lesson. One idea, the smallest that stands on its own.',
    '',
    'Reply with ONE JSON object and nothing else. No markdown, no code fence,',
    'no sentence before or after it. Every string must be in double quotes.',
    '',
    'Here is a complete, correct answer to a different question. Copy its shape',
    'exactly and change only the content:',
    '',
    JSON.stringify(WORKED_EXAMPLE, null, 2),
    '',
    'Rules that example obeys, and yours must too:',
    '- exactly ONE block with "role":"definition"',
    '- at least one block of kind "table", "chart", "flow" or "figure" that',
    '  SHOWS the idea, and it must FIT the content — a graph for a continuous',
    '  relationship, a table for cases, a flow for a process. Never add one',
    '  because this list asked for one.',
    '- "checkpoint" is a QUESTION that finds out whether the idea landed',
    '- "next" has at least two branches, each naming a real idea. "Learn more"',
    '  and "Continue" name nothing and will be refused.',
    '',
    /*
     * EVERY ENUM WRITTEN OUT, AND THE REASON IS MEASURED.
     *
     * `authorLesson.ts` learned this once already and says so beside its own
     * list: "This prompt used to print `"kind": ...` and never say what the
     * values were, so the model filled the gap with a plausible word. That is
     * not the model guessing badly; it is the contract declining to state
     * itself."
     *
     * This prompt shipped without that lesson applied, and the run that
     * followed shows exactly the predicted shape: `"type": "percentage"` where
     * the schema says `percent`, and a block kind outside the twelve. A model
     * that cannot see the legal values invents plausible ones.
     */
    'LEGAL VALUES. These are closed lists. A word outside them is refused.',
    '- "kind": prose | callout | misconception | reasoning | summary | metric |',
    '  equation | table | chart | flow | simulation | figure',
    '- "role": anchor | definition | framework | component | example |',
    '  contrast | summary',
    '- "depth": core | deeper',
    '- "emphasis": primary | supporting',
    '- "tone": neutral | warning | success',
    '- a table column "type": text | number | percent | currency',
    '  ("percentage" is NOT one of them)',
    '- "relations[].kind": supports | contrasts | leads-to | exemplifies',
    '',
    /*
     * THE ID RULE, AND IT IS THE COMMONEST FAILURE IN THE MEASURED RUN.
     *
     * Three of six refusals were `relations[0].to: no block "shown"` or
     * `"title"` -- the model renamed its blocks to suit its own topic, which is
     * correct, and then copied the EXAMPLE's relation ids verbatim, which is
     * not. The example is meant to be copied in shape and not in content, and
     * nothing in the prompt said which was which.
     */
    'IDS MUST MATCH. Every "from" and "to" in "relations", and every',
    '"introducedIn" in "technicalTerms", must be an id you actually used in',
    'your own "blocks". Do not copy the ids from the example above — you will',
    'have renamed those blocks. Ids are lowercase kebab-case: a-z, 0-9 and',
    'hyphens only.',
  ].join('\n')
}

/**
 * Ask for one concept, and gate it.
 *
 * No retry here on purpose. A retry loop belongs to the caller, which knows the
 * learner's time budget; burying one here hides the per-attempt failure rate,
 * and that rate is the number this whole module exists to move.
 */
/** How many turns a concept gets: the first, and one repair. */
const ATTEMPTS = 2

/** Judge one reply. Returns the issues, empty when the concept is sound. */
function judge(raw: string): { concept: Concept | null; lesson: Lesson | null; issues: Issue[] } {
  const parsed = extractJson(raw) as Concept | null
  if (parsed === null || typeof parsed !== 'object') {
    return {
      concept: null,
      lesson: null,
      issues: [{ path: '(reply)', message: 'the reply contained no JSON object' }],
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

  return {
    concept: parsed,
    lesson: structural.ok ? structural.lesson : null,
    issues: [...(structural.ok ? [] : structural.issues), ...conceptIssues(parsed)],
  }
}

/**
 * Ask for one concept, and give it one chance to be corrected.
 *
 * WHY A REPAIR TURN, MEASURED RATHER THAN ASSUMED.
 *
 * This shipped with "No retry here on purpose", on the argument that a retry
 * loop belongs to the caller. That was wrong for the requirement, which is that
 * ANY topic gets taught.
 *
 * Against qwen2.5:7b the surviving failures were not teaching failures at all.
 * They were schema slips a second look fixes: `"type": "percentage"` where the
 * enum says `percent`, a block kind outside the twelve, and `relations[0].to`
 * naming a block the model had renamed. One shot demands the model be perfect
 * first time on every topic, and no small model is.
 *
 * TWO TURNS, NOT N. An unbounded loop against a model that cannot satisfy the
 * gate burns the learner's time and never says so.
 *
 * `priorAssistant` carries the model's own previous reply, and
 * `authorLesson` records why that matters: it "turns a repair into a correction
 * of a document the model can actually see; omitting it makes the same message
 * a complaint about something it has never read, and it regenerates from
 * scratch."
 */
export async function authorConcept(
  model: LessonModel,
  question: string,
  sources: readonly Source[] = [],
  /** Route ids this learner has already been given for this idea. */
  alreadyUsed: readonly string[] = [],
): Promise<ConceptResult> {
  const system = conceptRequest(question, sources, alreadyUsed)
  let user = question
  let prior: string | undefined
  let last: { raw: string; issues: Issue[] } = { raw: '', issues: [] }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let raw: string
    try {
      raw = await model(system, user, prior)
    } catch (error) {
      /* Nothing answered. Not the same as answering badly, and the learner
         must never see the two conflated. */
      return {
        ok: false,
        issues: [{ path: '(model)', message: 'the model could not be reached' }],
        raw: '',
        attempts: attempt,
        unreachable: error instanceof Error ? error.message : String(error),
      }
    }

    const verdict = judge(raw)
    if (verdict.concept !== null && verdict.lesson !== null && verdict.issues.length === 0) {
      return { ok: true, concept: verdict.concept, lesson: verdict.lesson, attempts: attempt }
    }

    last = { raw, issues: verdict.issues }
    prior = raw
    /* The gate's OWN words, not "that was wrong, try again". A complaint the
       model cannot act on makes it regenerate and fail the same way. */
    user = [
      'That reply was refused. Fix exactly these problems and reply with the',
      'corrected JSON object, nothing else:',
      '',
      ...verdict.issues.map((i) => `- ${i.path}: ${i.message}`),
    ].join('\n')
  }

  return { ok: false, issues: last.issues, raw: last.raw, attempts: ATTEMPTS }
}
