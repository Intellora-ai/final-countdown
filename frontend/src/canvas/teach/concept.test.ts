import { describe, expect, it } from 'vitest'

import { authorConcept, conceptIssues, conceptRequest, type Concept } from './concept'
import type { LessonModel } from './authorLesson'

/*
 * ONE ATOMIC CONCEPT, NOT A LESSON.
 *
 * WHY THIS MODULE EXISTS, AND WHAT IT COST TO LEARN.
 * -------------------------------------------------
 * `authorLesson` asks a model for a WHOLE lesson in one reply and lets the
 * gate judge the result. Measured against qwen2.5:7b on six questions across
 * six subjects: 0 passed, mean 223.5 seconds. Three different prompt
 * structures were tried -- a worked example, a plan-then-fill split, and
 * concurrent per-block calls -- and all three measured zero.
 *
 * The wall is not the prompt. It is the UNIT OF WORK. A whole lesson is a
 * document with a definition, a framework, a representation, an example, a
 * summary and a relation graph that must agree with all of them; a model that
 * cannot hold that shape fails on every attempt regardless of how the request
 * is phrased.
 *
 * One concept is a far smaller thing to get right, and it is also what
 * teaching actually looks like: teach one idea, check it landed, then ask what
 * comes next. `beats.ts` already cuts a finished lesson into those steps --
 * "beats are derived, never authored" -- and `turn.ts` already ends each beat
 * with a question. This inverts the order so the concept is AUTHORED as the
 * unit rather than recovered from a document the model could not write.
 *
 * WHAT A CONCEPT MUST BE, AND WHY EACH RULE IS HERE
 * -------------------------------------------------
 * These are not new teaching opinions. Each one is a numbered principle from
 * the teacher contract, made checkable:
 *
 *   1. ONE atomic idea            -- exactly one definition, never two
 *   3. a representation that FITS -- something is shown, and `teaching.ts`
 *                                    judges whether the chart matches its data
 *   4. check understanding        -- it ends by asking, not by asserting
 *   1. ask what is next           -- at least two NAMED branches, never
 *                                    "would you like to know more?"
 *   8. right amount per step      -- a step that teaches nothing is refused
 */

/** A model that returns whatever it is handed, so the test controls the reply. */
function says(...replies: string[]): LessonModel {
  let i = 0
  return async () => replies[Math.min(i++, replies.length - 1)] ?? ''
}

/** The smallest concept that satisfies every rule, as JSON the model would emit. */
function soundConcept(patch: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
    ...patch,
  })
}

/* -------------------------------------------------------------------------- */
/* What a concept must be                                                     */
/* -------------------------------------------------------------------------- */

describe('a concept teaches one idea and asks what is next', () => {
  it('accepts the smallest sound concept', async () => {
    /* THE PAIRED POSITIVE, and every refusal below is this one mutated once.
       Without it a checker that refused everything would pass the whole file. */
    const result = await authorConcept(says(soundConcept()), 'What is a base case?')
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`)
    expect(result.concept.checkpoint).toMatch(/base case/i)
    expect(result.concept.next).toHaveLength(2)
  })

  it('hands back the VALIDATED lesson, so a caller can render it', async () => {
    /*
     * WHY THIS FIELD EXISTS, AND IT IS THE WHOLE POINT OF THE MODULE.
     *
     * `authorConcept` already runs `validateLesson` and then threw the result
     * away, returning the raw parsed object instead. That made it unrenderable:
     * `CanvasRoute` holds a `Lesson`, and a `Concept` is not one -- it is
     * whatever JSON the model sent, which is exactly the thing the validator
     * exists to stop reaching a screen.
     *
     * So this module measured 5/6 while the product went on calling
     * `authorLesson`, which measures 0/6, because there was no type-safe way to
     * hand the result over. A module that cannot be wired is a module that does
     * not ship, however good its number is.
     */
    const result = await authorConcept(says(soundConcept()), 'What is a base case?')
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`)
    expect(result.lesson.id).toBe('base-case')
    expect(result.lesson.blocks).toHaveLength(2)
  })

  it('puts real source text in front of the model before it writes', async () => {
    /*
     * PRINCIPLE 13, AND A REGRESSION THIS TEST EXISTS TO STOP.
     *
     * `authorLesson` took `sources` and `CanvasRoute` searched the web before
     * calling it -- "SEARCH FIRST, THEN WRITE. The gate reads shape and has no
     * opinion about truth, so an invented lesson passes every check in this
     * repository. The only defence is giving the author real text to write
     * from."
     *
     * Swapping the call site to `authorConcept` without this parameter made
     * `sources` dead at `CanvasRoute.tsx:227` -- lint caught it -- which would
     * have silently removed the ONLY thing standing between a learner and a
     * confidently invented lesson.
     */
    let seenSystem = ''
    const model: LessonModel = async (system) => {
      seenSystem = system
      return soundConcept()
    }
    const result = await authorConcept(model, 'What is a base case?', [
      {
        url: 'https://example.org/recursion',
        title: 'Recursion',
        text: 'A base case stops the recursion by returning without calling itself.',
      },
    ])
    expect(result.ok).toBe(true)
    expect(seenSystem, 'the source text must reach the model').toContain(
      'stops the recursion by returning',
    )
  })

  it('refuses a concept that shows nothing, however well it is written', async () => {
    /* Principle 3. Prose alone is telling, not teaching, and this is the rule
       `nothing-is-shown` would apply to a whole lesson -- but that one is
       arc-gated and a concept has no arc, so a concept states it itself. */
    const parsed = JSON.parse(soundConcept()) as Record<string, unknown>
    const blocks = (parsed.blocks as unknown[]).slice(0, 1)
    const result = await authorConcept(
      says(JSON.stringify({ ...parsed, blocks, relations: [] })),
      'What is a base case?',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/shows nothing/i)
  })

  it('refuses two definitions, because that is two concepts', async () => {
    /* Principle 1. The unit is ONE atomic idea. A step carrying two definitions
       is the whole-lesson failure this module exists to escape, in miniature. */
    const parsed = JSON.parse(soundConcept()) as { blocks: Record<string, unknown>[] }
    const second = { ...parsed.blocks[0]!, id: 'second-def', body: 'Recursion is a call to itself.' }
    const result = await authorConcept(
      says(JSON.stringify({ ...parsed, blocks: [...parsed.blocks, second] })),
      'What is a base case?',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/one idea|two definitions/i)
  })

  it('refuses a concept that asserts instead of asking', async () => {
    /* Principle 4. "Check understanding, do not assume." A step that ends with
       a statement has moved on without finding out whether it landed. */
    const result = await authorConcept(
      says(soundConcept({ checkpoint: 'That is how a base case works.' })),
      'What is a base case?',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/question/i)
  })

  it('refuses an offer that names nothing real', async () => {
    /*
     * Principle 1's second half. "Would you like to know more?" is the offer a
     * system makes when it has no idea what comes next, and it puts the work of
     * knowing the syllabus back on the learner -- who is the one person in the
     * room who cannot know it.
     */
    const result = await authorConcept(
      says(
        soundConcept({
          next: [
            { id: 'a', label: 'Learn more' },
            { id: 'b', label: 'Continue' },
          ],
        }),
      ),
      'What is a base case?',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/names nothing|generic/i)
  })

  it('refuses a single branch, because one option is not a choice', async () => {
    const result = await authorConcept(
      says(soundConcept({ next: [{ id: 'deeper', label: 'Why a missing base case never stops' }] })),
      'What is a base case?',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/two/i)
  })
})

/* -------------------------------------------------------------------------- */
/* The two failures a learner must never see conflated                        */
/* -------------------------------------------------------------------------- */

describe('a broken bridge is not a bad concept', () => {
  it('reports an unreachable model separately from a refused concept', async () => {
    /* `authorLesson` learned this the hard way and records it: "the model
       answered and what it wrote does not teach" and "nothing answered" want
       different words on screen. Repeating the distinction, not the mistake. */
    const dead: LessonModel = async () => {
      throw new Error('connection refused')
    }
    const result = await authorConcept(dead, 'What is a base case?')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.unreachable).toMatch(/connection refused/)
  })

  it('accepts a concept the model fenced, apologised before, or chattered after', async () => {
    /*
     * MEASURED, AND IT WAS MY BUG, NOT THE MODEL'S.
     *
     * The first per-concept run against qwen2.5:7b scored 0 of 6 — and every
     * single refusal was `the reply was not one JSON object`. Not one was a
     * teaching failure. This module called `JSON.parse` directly while
     * `authorLesson` had already exported `extractJson` for exactly this, with
     * a comment recording the reason:
     *
     *   "Local models fence their JSON, apologise before it, or add a sentence
     *    after it, however firmly they are told not to."
     *
     * That knowledge was in the codebase and this file did not use it, so the
     * measurement it produced said nothing about whether a per-concept unit
     * teaches better. A probe that fails on the harness rather than the subject
     * reports a number that looks like a finding and is not.
     */
    const fenced = '```json\n' + soundConcept() + '\n```\nHope that helps!'
    const result = await authorConcept(says(fenced), 'What is a base case?')
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`)
    expect(result.concept.id).toBe('base-case')
  })

  it('a refused concept carries the gate reasons, not a generic apology', async () => {
    const result = await authorConcept(says('not json at all'), 'What is a base case?')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.unreachable).toBeUndefined()
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------- */
/* A repair turn, because one shot is not "any topic"                         */
/* -------------------------------------------------------------------------- */

describe('a refused concept gets one chance to be corrected', () => {
  /*
   * WHY THIS EXISTS, MEASURED RATHER THAN ASSUMED.
   *
   * This module shipped with "No retry here on purpose", on the argument that
   * a retry loop belongs to the caller. That was wrong for the requirement.
   *
   * Against qwen2.5:7b the surviving failures were not teaching failures at
   * all -- they were schema slips a second look fixes: `"type": "percentage"`
   * where the enum says `percent`, a block kind outside the twelve, and
   * `relations[0].to` naming a block the model had renamed. One shot demands
   * the model be perfect first time on every topic, and no small model is.
   *
   * `authorLesson` already carries the pattern and states the reason:
   * supplying the prior reply "turns a repair into a correction of a document
   * the model can actually see; omitting it makes the same message a complaint
   * about something it has never read, and it regenerates from scratch."
   */
  it('feeds the gate reasons back and accepts the corrected reply', async () => {
    const broken = JSON.stringify({
      ...(JSON.parse(soundConcept()) as Record<string, unknown>),
      next: [{ id: 'only', label: 'Why a missing base case never stops' }],
    })
    const model = says(broken, soundConcept())
    const result = await authorConcept(model, 'What is a base case?')
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`)
    expect(result.attempts).toBe(2)
  })

  it('the repair message carries the actual reasons, not a generic retry', async () => {
    /*
     * A repair that says "that was wrong, try again" is a complaint. The model
     * cannot act on it, so it regenerates and fails the same way. Assert the
     * gate's own words reach the second turn.
     */
    const seen: string[] = []
    const broken = JSON.stringify({
      ...(JSON.parse(soundConcept()) as Record<string, unknown>),
      checkpoint: 'That is how a base case works.',
    })
    let call = 0
    const model: LessonModel = async (_system, user, priorAssistant) => {
      seen.push(user)
      call += 1
      if (call === 1) return broken
      expect(priorAssistant, 'the repair must show the model what it wrote').toBe(broken)
      return soundConcept()
    }
    const result = await authorConcept(model, 'What is a base case?')
    expect(result.ok).toBe(true)
    expect(seen[1] ?? '', 'the repair must quote the gate').toMatch(/question/i)
  })

  it('gives up after the repair, rather than looping forever', async () => {
    /* Two attempts, not N. An unbounded loop against a model that cannot
       satisfy the gate burns the learner's time and never says so. */
    const broken = JSON.stringify({
      ...(JSON.parse(soundConcept()) as Record<string, unknown>),
      next: [{ id: 'only', label: 'Learn more' }],
    })
    const result = await authorConcept(says(broken), 'What is a base case?')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.attempts).toBe(2)
  })
})

/* -------------------------------------------------------------------------- */
/* The prompt must show valid JSON, because the model copies it               */
/* -------------------------------------------------------------------------- */

describe('the shape shown to the model is itself valid JSON', () => {
  /*
   * MEASURED, AND IT IS THE ROOT CAUSE OF THREE 0-OF-6 RUNS.
   *
   * The prompt described the shape with UNQUOTED placeholders:
   *
   *     "id": kebab-case,
   *     "question": the question this step moves toward,
   *
   * qwen2.5:7b copied the format literally and replied:
   *
   *     {"id": gas-partic和平}
   *
   * — an unquoted value, 12 completion tokens, `finish_reason: "stop"`. That is
   * not JSON, so `extractJson` correctly returned null and the probe reported
   * "no JSON object" six times out of six. Every earlier explanation (a naive
   * parser, a missing token budget) was a real defect but not THIS one, and
   * fixing them changed nothing because the model was being shown a broken
   * example the whole time.
   *
   * A model shown malformed JSON emits malformed JSON. The only way to describe
   * a JSON shape to a model is to show it real JSON, so this test parses what
   * the prompt actually contains rather than trusting that it looks right.
   */
  it('the example inside conceptRequest parses', () => {
    const prompt = conceptRequest('Why does heating a gas raise its pressure?')
    const start = prompt.indexOf('{')
    const end = prompt.lastIndexOf('}')
    expect(start, 'the prompt shows no JSON object at all').toBeGreaterThanOrEqual(0)
    const shown = prompt.slice(start, end + 1)
    expect(() => JSON.parse(shown) as unknown).not.toThrow()
  })

  it('the example is a concept the gate would accept', () => {
    /*
     * Stronger than "it parses". An example that parses but breaks the rules
     * teaches the model to break them — it would show a single branch, or a
     * checkpoint that asserts, and the model would copy that too.
     */
    const prompt = conceptRequest('Why does heating a gas raise its pressure?')
    const shown = prompt.slice(prompt.indexOf('{'), prompt.lastIndexOf('}') + 1)
    expect(conceptIssues(JSON.parse(shown) as Concept)).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* The checker on its own                                                     */
/* -------------------------------------------------------------------------- */

describe('conceptIssues is usable without a model', () => {
  it('says nothing about a sound concept', () => {
    const concept = JSON.parse(soundConcept()) as Concept
    expect(conceptIssues(concept)).toEqual([])
  })
})
