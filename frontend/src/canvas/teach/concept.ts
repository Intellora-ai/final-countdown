import type { Lesson } from '../spec/spec'
import { validateLesson, type Issue } from '../spec/validate'
import { extractJson, type LessonModel } from './authorLesson'
import { groundingPreamble, type Source } from './grounding'
import { nextRoute, routeDirective } from './route'
import { ASKS, askMenu, readTheAsk, type Ask } from './intent'
import { MAX_DEFINITION_WORDS, MAX_EXAMPLE_WORDS, MAX_RUN_WORDS } from './teaching'
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
  /**
   * WHICH OF THE SEVEN READINGS THE MODEL CHOSE, IN ITS OWN WORDS.
   *
   * `askMenu` shows it every reading and asks it to pick one; this is where it
   * says which. It is not decoration and it is not telemetry: `conceptIssues`
   * reads it, so the reply is judged by the rules for the shape it is, rather
   * than by the rules for a lecture.
   *
   * OPTIONAL, AND ABSENT MEANS THE STRICTEST READING. A model that does not
   * declare gets `teach`, which is the full arc and exactly what every reply
   * was held to before this existed. Nothing is loosened by a model staying
   * silent -- a shape is relaxed only when something explicitly claims it.
   *
   * NOT PASSED TO `validateLesson`. `judge` hands that gate an explicit field
   * list, so this never reaches a `.strict()` schema and no shape had to change
   * to carry it.
   */
  readonly asked?: string
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
      /**
       * WHICH way in was taken, so the caller can refuse to take it twice.
       *
       * `nextRoute` already picks a route the learner has not had, but it can
       * only do that if someone REMEMBERS what they were given, and the id was
       * computed inside this function and thrown away. A caller with no way to
       * read it back had no way to fill `alreadyUsed`, so the parameter stayed
       * empty forever and the same question always took the same route.
       */
      route: string
    }
  /**
   * `unreachable` separates two outcomes a learner must never see conflated:
   * "the model answered and what it wrote does not teach" and "nothing
   * answered". `authorLesson` records what conflating them cost; this repeats
   * the distinction rather than the mistake.
   */
  | {
      ok: false
      issues: Issue[]
      raw: string
      attempts: number
      unreachable?: string
      /**
       * THE WAY IN THAT WAS TAKEN, REPORTED ON FAILURE TOO.
       *
       * It was on the ok variant only, and `handler.ts` reads it on BOTH --
       * `route: written.route ?? ''` on the salvage path. The property did not
       * exist there, so every salvaged answer went out with `route: ''`, and an
       * empty route is exactly the signal both clients use to mean "the whole
       * lesson path answered, judge this at 'lesson'". The salvage was then
       * refused by the same arc rule it had just been salvaged from, so the
       * ladder in `handler.ts` could never reach a learner on either caller.
       *
       * A refused draft still SPENT a way in, and the caller has to be able to
       * say which -- for the same reason the ok variant carries it.
       */
      route: string
    }

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
/**
 * WHY EVERY ISSUE HERE CARRIES A `rule`, AND WHAT IT UNLOCKS.
 *
 * `validate.ts` draws one distinction and `repair.ts` depends on it entirely:
 * an issue WITHOUT a rule is structural -- "the thing is not a lesson" -- and
 * nothing structural is salvageable or safe. An issue WITH a rule means "the
 * thing IS a lesson and teaches badly", and that is the only kind the salvage
 * ladder in `handler.ts` will touch.
 *
 * Every issue this function raises is the second kind. Not one of them says the
 * reply was not a lesson -- the schema has already decided that, above -- they
 * say a real lesson is arranged badly: it shows nothing, it teaches two ideas,
 * its checkpoint asserts, it offers no choice.
 *
 * They carried no `rule`, so `onlyTeachingRules` was false for every one of
 * them and `deliverable` refused to salvage any of them. MEASURED: ten real
 * questions, and "how does a fridge work?" produced a true, readable
 * explanation that broke ONE arrangement rule -- and the learner was shown a
 * 502 and nothing else. One child in ten, sent away from a question the model
 * had answered.
 *
 * Naming the rules is not a loosening. `deliverable` still re-judges every
 * repaired or pruned candidate through the SAME `validateLesson`, and anything
 * that does not pass is still not served.
 */
export function conceptIssues(concept: Concept): Issue[] {
  const out: Issue[] = []
  const blocks = concept.blocks ?? []

  /*
   * THE LAST ASSUMPTION: THAT EVERY REPLY IS A CONCEPT.
   *
   * `askMenu` lets the model read what the student wanted, and the prompt then
   * asked for a shape this function refused to accept. A learner typing "wat is
   * 7x8" was answered with a definition block, a representation, a checkpoint
   * and two branches, because that is the only shape that passes here --
   * whatever the prompt said they had asked for.
   *
   * ONE RULE MOVES, AND ONLY FOR THE TWO SHAPES WHOSE ANSWER IS NOT A DIAGRAM.
   * A `define` reply is the shortest true statement of a thing, and an
   * `example` reply is one worked instance. Requiring a chart, table, flow or
   * figure of either is requiring decoration -- and `teaching.ts` already
   * refuses a representation that does not fit its content, so the two rules
   * together were demanding something be shown and then refusing most ways of
   * showing it.
   *
   * EVERYTHING ELSE IS UNTOUCHED, INCLUDING FOR THESE TWO. One idea only, a
   * checkpoint that asks rather than asserts, two named branches, every
   * structural rule and every chunk rule in `validateLesson`. `stuck`, `why`,
   * `compare`, `practice` and `teach` keep the representation requirement in
   * full: a learner who is lost, or who asked for a mechanism or a comparison,
   * is owed something shown, and that is the case this rule was written for.
   *
   * THE DEFAULT IS THE STRICT ONE. An undeclared reply is `teach`, so a model
   * that says nothing is held to exactly what every reply was held to before.
   */
  const declared = typeof concept.asked === 'string' ? concept.asked.trim().toLowerCase() : ''
  /*
   * A DECLARATION THAT IS NOT ONE OF THE SEVEN IS REPORTED, NOT IGNORED.
   *
   * `askMenu` lists the readings and this asked the model to name the one it
   * chose. A near miss -- "definition" for `define`, "defining", "Practice
   * questions" -- silently fell through to the strict reading, so a perfectly
   * good definition was refused for showing nothing: the exact defect the
   * declaration was added to prevent, and nothing anywhere said the declaration
   * was the reason.
   *
   * It carries a `rule`, so it is a teaching-arrangement issue rather than a
   * structural one: the repair turn is told the word it should have used, and
   * `deliverable` can still salvage the answer if the second attempt misses
   * too. The learner never pays for a vocabulary slip.
   */
  const known = (ASKS as readonly string[]).includes(declared)
  if (declared !== '' && !known) {
    out.push({
      path: 'asked',
      message:
        `"${concept.asked}" is not one of the readings. Use exactly one of: ${ASKS.join(', ')}`,
      rule: 'unreadable-ask',
    })
  }

  const shape = known ? declared : 'teach'
  const owesARepresentation = shape !== 'define' && shape !== 'example'

  /* Principle 3. Prose alone is telling. `nothing-is-shown` says this for a
     whole lesson, but it is arc-gated and a step has no arc, so the step says
     it itself. WHICH representation fits is `teaching.ts`'s job. */
  if (owesARepresentation && !blocks.some((b) => SHOWS.has(String(b.kind)))) {
    out.push({
      path: 'blocks',
      message:
        'this step shows nothing — it is all words. One concept gets one representation that ' +
        'fits it: a graph, a table, a flow or a figure',
      rule: 'nothing-is-shown',
    })
  }

  /* Principle 1. The unit is ONE atomic idea. Two definitions is two concepts,
     which is the whole-lesson failure this module exists to escape. */
  const definitions = blocks.filter((b) => b.role === 'definition').length
  if (definitions > 1) {
    out.push({
      path: 'blocks',
      message: `this step carries ${definitions} definitions, so it is teaching more than one idea. Split it`,
      rule: 'more-than-one-idea',
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
      rule: 'checkpoint-asserts',
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
      rule: 'no-choice-of-next',
    })
  }
  for (const [i, branch] of next.entries()) {
    if (!namesSomething(branch.label ?? '')) {
      out.push({
        path: `next[${i}]`,
        message: `"${branch.label}" names nothing the learner could choose between — it is generic. Name the actual idea`,
        rule: 'generic-branch',
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
const SHOWS_A_TABLE = {
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

const SHOWS_A_CHART = {
  id: 'half-life',
  question: 'What is a half-life?',
  technicalTerms: [{ term: 'decay', introducedIn: 'says-what' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'A half-life is the time it takes for half of what is left to decay.',
      terms: [{ text: 'half of what is left', mark: 'key' }],
    },
    {
      id: 'shown',
      kind: 'chart',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      chartType: 'line',
      xLabel: 'Half-lives passed',
      yLabel: 'Amount left',
      series: [
        {
          name: 'Amount left',
          colorIndex: 0,
          points: [
            { x: 0, y: 100 },
            { x: 1, y: 50 },
            { x: 2, y: 25 },
            { x: 3, y: 12.5 },
          ],
        },
      ],
      caption: 'Each step halves what remains, so it never reaches zero.',
    },
  ],
  relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
  checkpoint: 'After four half-lives, what fraction of the original is left?',
  next: [
    { id: 'deeper', label: 'Why the curve never touches zero' },
    { id: 'related', label: 'How this is used to date old bones' },
  ],
}

const SHOWS_A_FLOW = {
  id: 'tap-water',
  question: 'How does water reach a tap?',
  technicalTerms: [{ term: 'treatment', introducedIn: 'shown' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'Tap water is river water that has been cleaned and pushed uphill.',
      terms: [{ text: 'pushed uphill', mark: 'key' }],
    },
    {
      id: 'shown',
      kind: 'flow',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      nodes: [
        { id: 'river', label: 'River', tone: 'neutral' },
        { id: 'works', label: 'Treatment works', tone: 'neutral' },
        { id: 'tower', label: 'Water tower', tone: 'neutral' },
        { id: 'tap', label: 'Your tap', tone: 'result' },
      ],
      links: [
        { from: 'river', to: 'works', label: 'pumped' },
        { from: 'works', to: 'tower', label: 'cleaned' },
        { from: 'tower', to: 'tap', label: 'gravity' },
      ],
      caption: 'The tower is what gives the water its pressure.',
    },
  ],
  relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
  checkpoint: 'Which step is the one that gives the water its pressure?',
  next: [
    { id: 'deeper', label: 'What the treatment works actually removes' },
    { id: 'related', label: 'Why tall buildings need their own pumps' },
  ],
}

const SHOWS_A_MISCONCEPTION = {
  id: 'falling-speed',
  question: 'Do heavier things fall faster?',
  technicalTerms: [{ term: 'air resistance', introducedIn: 'wrong-idea' }],
  blocks: [
    {
      id: 'wrong-idea',
      kind: 'misconception',
      emphasis: 'primary',
      tone: 'warning',
      role: 'contrast',
      depth: 'core',
      wrong: 'A heavy ball falls faster than a light one.',
      correct: 'Both fall at the same rate unless air resistance differs.',
      why: 'Heavier things are pulled harder, but they are also harder to move.',
      counterexample: 'A hammer and a feather fall together on the Moon.',
    },
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'Free fall is motion where gravity is the only force acting.',
      terms: [{ text: 'only force', mark: 'key' }],
    },
    {
      id: 'shown',
      kind: 'table',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      columns: [
        { key: 'object', label: 'Object', type: 'text' },
        { key: 'air', label: 'In air', type: 'text' },
        { key: 'vacuum', label: 'In a vacuum', type: 'text' },
      ],
      rows: [
        { object: 'Hammer', air: 'falls fast', vacuum: 'falls fast' },
        { object: 'Feather', air: 'drifts down', vacuum: 'falls fast' },
      ],
    },
  ],
  relations: [{ kind: 'contrasts', from: 'wrong-idea', to: 'shown' }],
  checkpoint: 'Which column shows what gravity alone does, and how can you tell?',
  next: [
    { id: 'deeper', label: 'Why being heavier does not help' },
    { id: 'related', label: 'What air resistance depends on' },
  ],
}

const SHOWS_REASONING = {
  id: 'nine-recurring',
  question: 'Why does 0.999… equal 1?',
  technicalTerms: [{ term: 'recurring', introducedIn: 'says-what' }],
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'A recurring decimal is one whose digits repeat without ever stopping.',
      terms: [{ text: 'without ever stopping', mark: 'key' }],
    },
    {
      id: 'argued',
      kind: 'reasoning',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      mode: 'why',
      claim: '0.999… is another way of writing 1.',
      steps: [
        { expression: 'Call the number x, so x = 0.999…', because: 'Naming it lets us do arithmetic on it.' },
        { expression: 'Then 10x = 9.999…', because: 'Multiplying by ten shifts every digit one place.' },
        { expression: 'So 10x − x = 9, giving 9x = 9', because: 'The endless tails are identical and cancel.' },
      ],
      therefore: 'x = 1, so 0.999… and 1 are the same number.',
    },
    {
      id: 'shown',
      kind: 'table',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'component',
      depth: 'core',
      columns: [
        { key: 'digits', label: 'Digits used', type: 'text' },
        { key: 'gap', label: 'Gap from 1', type: 'text' },
      ],
      rows: [
        { digits: '0.9', gap: '0.1' },
        { digits: '0.99', gap: '0.01' },
        { digits: 'all of them', gap: 'nothing left' },
      ],
    },
  ],
  relations: [{ kind: 'derives', from: 'says-what', to: 'argued' }],
  checkpoint: 'At which step do the endless tails cancel, and why are they equal?',
  next: [
    { id: 'deeper', label: 'What “endless” is really doing here' },
    { id: 'related', label: 'Other numbers with two decimal names' },
  ],
}

/**
 * WHICH EXAMPLE EACH WAY IN GETS, AND WHY THIS EXISTS AT ALL.
 *
 * MEASURED against the real server, ten real questions across ten subjects:
 *
 *   real lessons examined: 10
 *   block kinds produced : table 12, prose 10
 *   shapes               : 10 x  prose + table
 *
 * Ten out of ten, identical. `BlockView` paints twelve kinds and TEN of them
 * had never been reached by a real lesson -- built, unit-tested against
 * hand-written fixtures, and never once seen by a learner.
 *
 * There was ONE worked example and its blocks were `prose` + `table`. The
 * prompt does list all twelve kinds as legal, and the model ignored the list
 * and copied the example, which is what models do with an example. That is the
 * whole mechanism: not the model, not the schema, not the renderer.
 *
 * `route.ts` was already rotating over twelve ways in, and the route already
 * reached the prompt as `HOW TO COME AT IT THIS TIME`. Only the example failed
 * to move with it, so a physics question, a civics question and an economics
 * question all came back as a paragraph and a table.
 *
 * EVERY EXAMPLE STILL SHOWS SOMETHING. `conceptIssues` refuses a step that is
 * all words -- "this step shows nothing" -- and `SHOWS` is `chart`, `table`,
 * `flow`, `figure`, `simulation`. So each example below carries at least one of
 * those, and the variation is in WHICH, never in whether.
 *
 * NOT `figure`, deliberately: it needs `as` from a registry of 137
 * representation names plus a matching payload, and an example that names one
 * wrong teaches the model to name one wrong. The five here need no registry.
 *
 * THE PAIRINGS ARE THE DIRECTIVE'S, NOT A PREFERENCE. `numbers-first` already
 * says "Lead with actual numbers in a table or chart"; `sequence` already says
 * "Walk through what happens step by step, in the order it happens". The
 * example now agrees with the sentence beside it instead of contradicting it.
 */
export const EXAMPLE_FOR_ROUTE: Record<string, unknown> = {
  'numbers-first': SHOWS_A_CHART,
  'scale-up': SHOWS_A_CHART,
  sequence: SHOWS_A_FLOW,
  'whole-then-parts': SHOWS_A_FLOW,
  'parts-then-whole': SHOWS_A_FLOW,
  'misconception-first': SHOWS_A_MISCONCEPTION,
  'problem-first': SHOWS_REASONING,
  'question-led': SHOWS_REASONING,
  contrast: SHOWS_A_TABLE,
  'definition-first': SHOWS_A_TABLE,
  'example-first': SHOWS_A_TABLE,
  'everyday-example': SHOWS_A_TABLE,
}

/**
 * The example this route should copy.
 *
 * FALLS BACK TO THE TABLE ONE, which is the example that shipped for months and
 * is the most thoroughly proven of the five. A route id that is not in the map
 * -- a new axis added to `route.ts` and not paired here -- therefore behaves
 * exactly as everything did before this existed, rather than showing nothing.
 */
function exampleFor(routeId: string): unknown {
  return EXAMPLE_FOR_ROUTE[routeId] ?? SHOWS_A_TABLE
}

/**
 * How many previous explanations are shown back to the model.
 *
 * `explanations.ts` keeps twelve, because `route.ts` has twelve axes and a
 * thirteenth row can no longer change which route is chosen. Showing all twelve
 * is a different question: this is PROMPT BUDGET, and it is taken from the same
 * `CONCEPT_MAX_TOKENS` reservation the reply is written out of -- which
 * `groq.ts` measured being exhausted, arriving as `json_validate_failed` and
 * reading like a bad model.
 *
 * THREE, NEWEST, because a repeat resembles what was said RECENTLY. The oldest
 * telling is the one the learner is least likely to notice being echoed, and it
 * is the one whose route `alreadyUsed` already rules out anyway.
 */
const MOST_PRIOR_SHOWN = 3

/**
 * How much of one previous explanation is shown back.
 *
 * Enough to recognise, not enough to re-read. The model needs to know what it
 * SAID, and the opening of an explanation is what a second telling repeats
 * first -- so the beginning is kept and the tail is dropped.
 */
const MOST_PRIOR_CHARS = 400

function clipped(said: string): string {
  const flat = said.replace(/\s+/g, ' ').trim()
  return flat.length <= MOST_PRIOR_CHARS ? flat : `${flat.slice(0, MOST_PRIOR_CHARS)}…`
}

/**
 * The default route seed for a question.
 *
 * Same topic, same rotation, on every machine and in every session. Exported
 * so a caller that wants to hold the route still can name the seed it is
 * holding, rather than reproducing this arithmetic and drifting from it.
 */
export function questionSeed(question: string): number {
  return [...question].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
}

/** What the model is asked for. One concept, and a real one to copy. */
export function conceptRequest(
  question: string,
  sources: readonly Source[] = [],
  alreadyUsed: readonly string[] = [],
  /**
   * The route seed, EXPLICIT so a measurement can hold it still.
   *
   * Defaulting it to the question hash was not wrong -- it is what makes one
   * learner's rotation stable across sessions -- but it was the ONLY way in,
   * and that made route choice unaddressable from outside. A harness could
   * then vary code and route together and had no arithmetic to tell the two
   * apart afterwards. A randomised system that cannot be replayed cannot be
   * measured, and that is a property of this signature, not of the model.
   */
  seed: number = questionSeed(question),
  /**
   * THE WORDS THIS LEARNER HAS ALREADY BEEN GIVEN FOR THIS IDEA.
   *
   * `alreadyUsed` above carries route IDS -- which WAY IN was spent -- and that
   * is all the model was ever told. It was never shown what it actually wrote,
   * so "do not repeat yourself" was enforced entirely by rotating the opening:
   * a different way in, and nothing stopping the same sentences appearing under
   * it. The owner's requirement is stronger than that and says so: "it should
   * know what it said last."
   *
   * `handler.ts` has stored exactly this all along -- `explanations.wordsShown`
   * -- and read only the route ids out of the same rows.
   *
   * NEWEST LAST, and capped by the caller. This is prompt budget spent on
   * history rather than on teaching, and a learner's twelfth asking must not
   * push the reply itself out of `CONCEPT_MAX_TOKENS`.
   */
  alreadySaid: readonly string[] = [],
  /**
   * The ask, when something has already decided it.
   *
   * `readTheAsk` is exact, free and reads clean textbook English. It is not
   * what the learners this product is for actually type -- measured on eight
   * real strings it got five wrong, every one of them falling through to
   * `teach`, which is the generic lecture: "wat is fotosynthesis", "diff b/w
   * mass n weight", "give eg of metaphor", "sir mujhe samajh nahi aaya".
   *
   * `authorConcept` asks the MODEL instead, which handles misspellings,
   * abbreviations and Hinglish natively, and passes the answer here. This stays
   * a pure function of its arguments: the decision is made by the caller that
   * has a model, not by this one, so the prompt is still exactly testable.
   *
   * Absent falls back to the patterns, which is what a caller with no model
   * gets and what every existing caller keeps.
   */
  ask?: Ask,
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
  /*
   * WHAT KIND OF ANSWER THEY ASKED FOR. See `intent.ts`.
   *
   * This prompt used to open "Teach ONE atomic concept" for every string a
   * person could type, so "what is 7 x 8", "quiz me on tenses" and "I don't get
   * step 3" all requested the same artifact. Read first, because the ask
   * decides both the opening sentence below and, for three of the readings, the
   * way in itself.
   */
  /* All seven readings, and the pattern check's guess as a hint it may
     override. See `askMenu`: the model reads the student's own words, which is
     the only thing in this system that can read a misspelling or Hinglish. */
    const menu = askMenu(ask ?? readTheAsk(question).ask)

  /*
   * THE ASK SHAPES THE REPLY. IT DOES NOT GET TO CHOOSE THE WAY IN.
   *
   * The first version of this let three readings pin an axis -- a comparison to
   * `contrast`, an example to `example-first`, a "why" to `problem-first` --
   * on the argument that for those asks the axis IS the answer's shape.
   *
   * THREE TESTS REFUSED IT, and they were right: `matrix.test.ts` holds that a
   * different seed gives a different way in, and `again.test.ts` and
   * `concept-rotation.test.ts` hold that asking again takes a route not taken
   * before. A pin breaks all three for the commonest questions there are --
   * every first "why does X" would have opened the same way for every learner,
   * for ever, which is precisely the predictability `route.ts` exists to
   * destroy.
   *
   * The ask was already doing its work without the pin: `intent.directive`
   * below says what the reply must BE -- ordered steps for a "why", two things
   * side by side for a comparison -- and that is the part that answers the
   * question. WHICH opening it arrives through is exactly the accidental
   * property rotation is entitled to keep owning.
   */
  const axis = nextRoute({ seed, alreadyUsed })
  const route = routeDirective(axis)
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
  /*
   * THE UNCHANGING HALF FIRST, AND IT IS WORTH REAL MONEY.
   *
   * Gemini (and Anthropic, and DeepSeek) discount a repeated PREFIX: the
   * leading run of characters identical to the previous request is billed at a
   * fraction. That only pays if the identical part LEADS.
   *
   * MEASURED BEFORE THIS REORDERING: two ordinary requests shared 64 characters
   * -- 16 tokens of 1,735 -- because the grounding, the question, the ask menu
   * and the route directive all came first and all vary, so the ~1,000 tokens
   * of rules, legal values and craft guidance behind them could never be
   * matched against anything.
   *
   * So the order is now: everything constant, then everything that varies, and
   * the learner's own question last -- which is also where a model reads it
   * most reliably. Nothing about the content changed; only its order.
   */
  return [
    'Reply with ONE JSON object and nothing else. No markdown, no code fence,',
    'no sentence before or after it. Every string must be in double quotes.',
    '',
    'HOW THIS PRODUCT TEACHES. These two decide everything else:',
    '- Simplify the PATH, never the DESTINATION. Use plain words and keep the',
    '  full idea. Do not reach a simpler explanation by teaching less of the',
    '  subject; never use a technical term before you have earned it, and never',
    '  drop one to avoid having to.',
    '- EARN every rule, or do not state it. A rule asserted with no',
    '  justification and no check is an assertion, and it will be forgotten.',
    '  Derive it from something more primitive, then check it immediately on a',
    '  number or a case.',
    '',
    'Rules your reply must obey, and the example below obeys them too:',
    '- exactly ONE block with "role":"definition"',
    '- at least one block of kind "table", "chart", "flow" or "figure" that',
    '  SHOWS the idea, and it must FIT the content — a graph for a continuous',
    '  relationship, a table for cases, a flow for a process. Never add one',
    '  because this list asked for one.',
    /*
     * THE CAPS, AND THEY ARE BOTH REMAINING FAILURES.
     *
     * The any-topic matrix taught 14 of 16 against gpt-oss-120b. BOTH refusals
     * were the same sentence: "the definition is 32 words, and the cap is 30",
     * and "33 words". Two words over -- and this prompt mentioned the cap ZERO
     * times, so the model was refused for breaking a limit nobody told it
     * about. Same class as the unquoted-JSON bug: the contract declining to
     * state itself.
     *
     * INTERPOLATED, NEVER TYPED. `authorLesson` records the reason beside its
     * own: "Change `MAX_RUN_WORDS` and the instruction changes with it." A
     * literal drifts from the checker the day somebody edits the constant, and
     * then the prompt actively teaches the model to fail.
     */
    `- the definition block is AT MOST ${MAX_DEFINITION_WORDS} words. Count them. This is the`,
    '  one sentence the learner has to be able to hold, and it is a hard cap',
    `- no unbroken run of text anywhere may exceed ${MAX_RUN_WORDS} words. Break a longer`,
    '  passage with a blank line rather than trimming the meaning out of it',
    `- an example block is at most ${MAX_EXAMPLE_WORDS} words. Its job is to isolate one rule,`,
    '  not to tell a story',
    /*
     * R8, STATED, BECAUSE THE ROLE IT GOVERNS IS NOW REACHABLE.
     *
     * `teaching.ts:614` refuses a block with `"role":"example"` unless exactly
     * one `exemplifies` relation runs FROM it. The prompt listed `exemplifies`
     * among the legal relation kinds and never said what it was for, which was
     * harmless only for as long as `example` was missing from the role list and
     * the model could not choose it.
     *
     * It can now. MEASURED on the first real request after the roles were
     * widened -- "quiz me on the water cycle", a 200 that reached the learner
     * only through the salvage ladder:
     *
     *   blocks[1]: an example points at 0 rules via "exemplifies"; it must
     *   point at exactly one, or the reader cannot tell what it is an example OF
     *
     * The model used a newly-offered role correctly and was refused for a rule
     * nobody had told it about. That is the same failure this file records
     * twice already -- the unquoted placeholders, the missing enum lists -- and
     * the fix is the same one: the contract states itself.
     */
    /* THE SHAPE IT CHOSE, SAID OUT LOUD. `askMenu` above shows it all seven
       readings; this is where it reports which one it picked, and
       `conceptIssues` judges the reply by the rules for THAT shape rather than
       by the rules for a lecture. Omitting it is safe and strict: an
       undeclared reply is held to the full arc. */
    `- "asked" is which of the readings above you chose: ${ASKS.join(' | ')}`,
    '- a block with "role":"example" must have exactly ONE relation of kind',
    '  "exemplifies" running FROM it TO the block it is an example of.',
    '  An example that points at nothing does not say what it is an example of',
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
    /*
     * ALL THIRTEEN ROLES, AND SIX OF THEM WERE UNREACHABLE.
     *
     * `spec/roles.ts` defines thirteen. This list named seven, under the
     * heading "These are closed lists. A word outside them is refused." -- so
     * the model was told a SMALLER vocabulary than the schema accepts and
     * correctly never used the rest.
     *
     * The six that were missing are not spare capacity. `notation`, `rule` and
     * `restriction` were added to the schema BY `teaching-patterns.md`,
     * specifically so patterns 7, 9, 14-16, 19 and 20 could be required rather
     * than hoped for -- "say how to read the notation aloud", "justify the
     * rule, never assert it", "state the restrictions explicitly". They were
     * built, tested, and then never mentioned to the only thing that can emit
     * them. `misconception` and `classification` went the same way.
     *
     * Naming them is not a new rule and does not narrow anything: it widens
     * what can be said, which is the opposite of the failure `CONSTRAINTS.md`
     * warns about when it says not to answer a quality problem with more rules.
     */
    '- "role": anchor | definition | notation | framework | classification |',
    '  component | rule | restriction | contrast | misconception | example |',
    '  summary | support',
    '  ("anchor" is the only role allowed BEFORE the definition: ground they',
    '   already stand on. "notation" says how to read it aloud and names its',
    '   parts. "rule" is a rule you have JUSTIFIED. "restriction" is where it',
    '   stops being true.)',
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
    '',
    /* ---- everything below this line varies per request ---- */
    'Here is a complete, correct answer to a different question. Copy its shape',
    'exactly and change only the content:',
    '',
    /*
     * The example that matches the way in above -- see `EXAMPLE_FOR_ROUTE`.
     * One example, still, so the prompt shows exactly one JSON object and the
     * tests that slice from the first `{` to the last `}` keep working.
     *
     * MINIFIED, AND THAT IS A TOKEN DECISION RATHER THAN A STYLE ONE. This was
     * `JSON.stringify(x, null, 2)`, and the indentation is not free: MEASURED,
     * the concept prompt is 6,960 characters of which 701 are indent-only
     * whitespace, and the example alone is 1,684. Every one of those characters
     * is billed on every authoring request, against a budget measured exhausted
     * at `Used 199967` of 200,000 per day.
     *
     * NOTHING IS LOST. The example is here so the model can copy a SHAPE, and a
     * shape is the keys and the nesting -- neither of which indentation carries.
     * The reply is read by `extractJson`, which slices from the first `{` to the
     * last `}` and parses; it has never cared how the example was spaced.
     */
    JSON.stringify(exampleFor(axis.id)),
    '',
    /*
     * THE TWO CRAFT RULES, AND WHY THERE ARE ONLY TWO OF THEM.
     *
     * `docs/engineering/teaching-patterns.md` extracts 26 universal patterns
     * from two worked reference explanations, and closes by naming the two the
     * other 24 are consequences of. Those two are below, in the document's own
     * words.
     *
     * NOT ALL 26. `CONSTRAINTS.md` is explicit, and it is the same page that
     * points at the pattern document: "Do not add rules to fix a quality
     * problem. Each new rule narrows what can be said, and a model optimising
     * against a long rule list produces output that passes and does not teach."
     * Twenty-six numbered instructions would be exactly that list.
     *
     * The other 24 reach the model the way the document says they were meant
     * to: as STRUCTURE rather than as instructions -- the `anchor`, `notation`,
     * `rule` and `restriction` roles, the `reasoning` block whose every step
     * carries its own `because`, and `counterexample` on a misconception. All
     * of those are now in the legal values above, which is what makes them
     * sayable. A pattern the schema can express and the gate can check does not
     * need to be a sentence in a prompt.
     */
    ...(grounding === '' ? [] : [grounding, '']),
    `Teach ONE atomic concept that moves a learner toward answering: ${question}`,
    '',
    /* WHAT THEY ASKED FOR, BEFORE HOW TO COME AT IT. See `intent.ts`: the line
       above is the TOPIC and was for a long time the only thing said, so every
       string a person could type requested the same artifact. This says which
       artifact. It is placed first because it can change what the reply IS,
       where the route below only changes how it opens. */
    menu,
    '',
    `HOW TO COME AT IT THIS TIME: ${route}`,
    '',
    'Not a lesson. One idea, the smallest that stands on its own.',
    '',
    /*
     * WHAT WAS ALREADY SAID, VERBATIM, SO "DO NOT REPEAT" IS CHECKABLE BY THE
     * MODEL RATHER THAN ONLY BY US.
     *
     * Rotating the route made the OPENING different and left the sentences free
     * to be identical underneath it. `noveltyAgainst` in `handler.ts` catches
     * that afterwards and pays for a whole second authoring turn to fix it --
     * so the cheapest place to prevent a repeat is the only place that can:
     * showing the model its own previous words before it writes.
     *
     * TRUNCATED, AND THE OLDEST DROPPED. Prompt budget spent here is budget not
     * spent on the reply, and `CONCEPT_MAX_TOKENS` is a hard ceiling that
     * `groq.ts` measured being hit as `json_validate_failed`.
     */
    ...(alreadySaid.length === 0
      ? []
      : [
          'YOU HAVE ALREADY TAUGHT THIS LEARNER THIS IDEA. Here is what you said,',
          'oldest first. Do not say it again — not these examples, not these',
          'numbers, not these opening words. Teach the same truth a different way.',
          '',
          ...alreadySaid
            .slice(-MOST_PRIOR_SHOWN)
            .map((said, i) => `--- what you said (${i + 1}) ---\n${clipped(said)}`),
          '',
        ]),
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

/**
 * Name the block an issue is about by the id the MODEL chose, not only by index.
 *
 * `blocks[0]` is an index into a document the model wrote a turn ago and is no
 * longer looking at. Its own blocks are named -- and every relation, every
 * `introducedIn`, every reference inside the reply already addresses them that
 * way. Handing back the index alone leaves locating the fault to the model, and
 * a model that cannot locate the fault rewrites instead of editing.
 *
 * ANNOTATED ONLY WHERE A BLOCK EXISTS. `checkpoint` and `next[0]` name no
 * block, and an id printed next to a path that has none is worse than no id at
 * all: the model goes looking for something that is not there. Same for an
 * index past the end, which is what a structural refusal about a missing block
 * looks like.
 */
function nameBlock(path: string, concept: Concept | null): string {
  const at = /^blocks\[(\d+)\]/.exec(path)
  if (at === null || concept === null) return path
  const id = concept.blocks?.[Number(at[1])]?.id
  return typeof id === 'string' && id !== '' ? `${path} (id "${id}")` : path
}

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
  /** The route seed. Defaults to the question, so behaviour is unchanged. */
  seed: number = questionSeed(question),
  /** What this learner has already been told about this idea, oldest first.
   *  See `conceptRequest`'s own parameter: the model is shown its own previous
   *  words so a repeat can be prevented rather than only detected. */
  alreadySaid: readonly string[] = [],
  /**
   * What kind of reply they asked for, DECIDED BY THE CALLER.
   *
   * Not decided here, and the reason is a call. Reading the ask well needs a
   * model -- the patterns get five of eight real student strings wrong -- but
   * this function's `model` argument is its AUTHORING port: every test double
   * in the suite answers it with lesson JSON, and every repair test counts its
   * turns. Spending that port on a classification put a question in front of
   * seven suites that were counting authoring calls, and shifted the repair
   * turn's `priorAssistant` onto the wrong reply.
   *
   * Deciding it is also not this function's job. Whether to spend a second
   * model call belongs to the layer that knows the learner's time budget --
   * the same argument the `ATTEMPTS` comment makes about retries -- and that
   * layer is `handler.ts`. It calls `readTheAskWithModel` and passes the word
   * down. Absent falls back to the patterns.
   */
  ask?: Ask,
): Promise<ConceptResult> {
  /*
   * The SAME choice `conceptRequest` makes, made once and named, because the
   * caller has to be told which one it was. `nextRoute` is pure, so asking it
   * twice with the same state cannot disagree with itself.
   */
  const taken = nextRoute({ seed, alreadyUsed })
  const system = conceptRequest(question, sources, alreadyUsed, seed, alreadySaid, ask)
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
        route: taken.id,
      }
    }

    const verdict = judge(raw)
    if (verdict.concept !== null && verdict.lesson !== null && verdict.issues.length === 0) {
      return { ok: true, concept: verdict.concept, lesson: verdict.lesson, attempts: attempt, route: taken.id }
    }

    last = { raw, issues: verdict.issues }
    prior = raw
    /*
     * THE GATE'S OWN WORDS, AND AN ORDER TO EDIT RATHER THAN REDRAFT.
     *
     * The words alone were already here, and they were not enough. Measured on
     * the any-topic matrix against gpt-oss-120b, twice: 14 of 16, and BOTH
     * refusals in BOTH runs were the same rule and the same size of miss --
     * "the definition is 32 words, and the cap is 30", then "33 words". Two
     * words over, on the SECOND attempt. The repair turn ran, carried
     * `priorAssistant`, and delivered that exact sentence; the model came back
     * over the cap anyway, and WHICH questions failed moved between runs. A
     * genuine two-word trim does not wander between topics. A fresh draft does.
     *
     * Nothing had ever asked for an edit. The system prompt on this turn is
     * still the authoring instruction -- "Teach ONE atomic concept", "HOW TO
     * COME AT IT THIS TIME: <route>", "Copy its shape exactly" -- and "the
     * corrected JSON object" reads as naturally as "a corrected object" as it
     * does "your object, corrected". So the model did the thing it was asked
     * to do, and a fresh definition clears a 30-word cap at the same rate the
     * first one did.
     *
     * This is the third time in this file the same class has been paid for: an
     * unquoted JSON example, an unstated word cap, and now an unstated
     * requirement to preserve. Each time, the contract declined to state
     * itself and the model was blamed for the gap.
     */
    user = [
      'That reply was refused. Correct the JSON object you just sent, and reply',
      'with the whole of it again, nothing else.',
      '',
      'This is an EDIT, not a rewrite. Change only what is listed below. Every',
      'other field — every id, every block, every row, every label, every word',
      'you are not told to change — is copied through exactly as you wrote it. A',
      'rewrite has to get everything right a second time, and it breaks rules the',
      'first reply already obeyed.',
      '',
      ...verdict.issues.map((i) => `- ${nameBlock(i.path, verdict.concept)}: ${i.message}`),
    ].join('\n')
  }

  return { ok: false, issues: last.issues, raw: last.raw, attempts: ATTEMPTS, route: taken.id }
}
