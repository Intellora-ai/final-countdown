import { describe, expect, it } from 'vitest'

import { authorConcept, conceptIssues, conceptRequest, EXAMPLE_FOR_ROUTE, type Concept } from './concept'
import type { LessonModel } from './authorLesson'
import { AXES, nextRoute } from './route'
import { MAX_DEFINITION_WORDS, MAX_RUN_WORDS } from './teaching'

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

  it('asks for a different way in when the learner has already seen one', async () => {
    /*
     * VARIATION HAS TO REACH THE MODEL, OR IT IS AN ORPHAN.
     *
     * `route.ts` picks an unused way into the same idea. That is worth nothing
     * unless the directive actually lands in the prompt -- which is precisely
     * the mistake that cost this session hours: `concept.ts` measured 5 of 6
     * while `CanvasRoute` went on calling `authorLesson` at 0 of 6, because
     * nobody checked the wiring.
     *
     * So this asserts the DIRECTIVE reaches the model, and that asking twice
     * does not send the same one.
     */
    const seen: string[] = []
    const model: LessonModel = async (system) => {
      seen.push(system)
      return soundConcept()
    }

    await authorConcept(model, 'What is a base case?', [], [])
    const firstRoute = AXES.find((a) => seen[0]!.includes(a.directive))
    expect(firstRoute, 'no route directive reached the model at all').toBeDefined()

    await authorConcept(model, 'What is a base case?', [], [firstRoute!.id])
    const secondRoute = AXES.find((a) => seen[1]!.includes(a.directive))
    expect(secondRoute, 'no route directive on the second ask').toBeDefined()
    expect(secondRoute!.id, 'the learner was given the same way in twice').not.toBe(firstRoute!.id)
  })

  it('tells the model the word caps, in the numbers the gate actually enforces', () => {
    /*
     * MEASURED, AND IT IS BOTH REMAINING FAILURES.
     *
     * The any-topic matrix taught 14 of 16 against gpt-oss-120b. Both refusals
     * were the same sentence:
     *
     *   the definition is 32 words, and the cap is 30
     *   the definition is 33 words, and the cap is 30
     *
     * Two words over. Not retrieval, not matching, not the model's competence
     * -- `conceptRequest` mentioned the cap ZERO times, so the model was
     * refused for breaking a limit nobody told it about.
     *
     * `authorLesson` already got this right and says why beside its own
     * interpolation: "Change `MAX_RUN_WORDS` and the instruction changes with
     * it." A number typed into a prompt as a literal drifts from the checker
     * the day someone edits the constant, and then the prompt teaches the model
     * to fail. Asserted from the constants for that reason.
     */
    const prompt = conceptRequest('Why does heating a gas raise its pressure?')
    expect(prompt, 'the definition cap is never stated').toContain(String(MAX_DEFINITION_WORDS))
    expect(prompt, 'the run cap is never stated').toContain(String(MAX_RUN_WORDS))
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

  /*
   * THE EXAMPLE IS WHAT THE MODEL ACTUALLY COPIES, AND ONE EXAMPLE MEANS ONE
   * SHAPE OF LESSON FOREVER.
   *
   * MEASURED against the real server, ten real questions across ten subjects:
   *
   *   real lessons examined: 10
   *   block kinds produced : table 12, prose 10
   *   shapes               : 10 x  prose + table
   *
   * Ten out of ten. `BlockView` paints twelve kinds -- callout, chart,
   * equation, figure, flow, metric, misconception, prose, reasoning,
   * simulation, summary, table -- and TEN of them have never been reached by a
   * real lesson. They are built, they are unit-tested against hand-written
   * fixtures, and no learner has ever seen one.
   *
   * The prompt does list all twelve as legal. The model ignores the list and
   * copies the example, which is what models do, and the example was `prose` +
   * `table`. That is the whole mechanism -- not the model, not the schema, not
   * the renderer.
   *
   * `CLAUDE.md` Goal 1 asks that "different semantic profiles produce different
   * compositions". `route.ts` already rotates over twelve ways in and the route
   * already reaches the prompt. Only the example failed to move with it, so
   * physics, civics and economics all came out as a paragraph and a table.
   *
   * FIVE, NOT TWELVE. A route implies how to OPEN, not which representation the
   * content deserves -- `conceptIssues` is explicit that "WHICH representation
   * fits is `teaching.ts`'s job", and demanding a different kind per route
   * would be this file telling the model to show a chart for something with
   * nothing to plot. Five distinct kinds across twelve routes is enough to
   * prove the example moves, and little enough that no route is forced to lie.
   */
  const EVERY_ROUTE_QUESTION = 'Why does heating a gas raise its pressure?'
  const HELD_SEED = 1

  /** The example each route shows, in route order, for one held seed. */
  function examplePerRoute(): { route: string; example: Concept }[] {
    const used: string[] = []
    const out: { route: string; example: Concept }[] = []
    for (let step = 0; step < AXES.length; step += 1) {
      const taken = nextRoute({ seed: HELD_SEED, alreadyUsed: used })
      const prompt = conceptRequest(EVERY_ROUTE_QUESTION, [], [...used], HELD_SEED)
      const shown = prompt.slice(prompt.indexOf('{'), prompt.lastIndexOf('}') + 1)
      out.push({ route: taken.id, example: JSON.parse(shown) as Concept })
      used.push(taken.id)
    }
    return out
  }

  it('shows a different worked example depending on the route', () => {
    const kinds = new Set<string>()
    for (const { example } of examplePerRoute()) {
      for (const block of example.blocks) kinds.add(String(block.kind))
    }
    expect(
      kinds.size,
      `every route shows the same shape, so every lesson comes out the same: ${[...kinds].sort().join(' + ')}`,
    ).toBeGreaterThanOrEqual(5)
  })

  it('every route’s example is one the gate would accept', () => {
    /*
     * The pair. A dozen varied examples that break the rules teach a model to
     * break them twelve different ways, which is worse than one example that
     * does not vary. Every one is held to the identical standard the single
     * example was held to above.
     */
    for (const { route, example } of examplePerRoute()) {
      expect(conceptIssues(example), `the example shown for route "${route}" breaks the rules it teaches`)
        .toEqual([])
    }
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

/*
 * EVERY WAY IN HAS ITS OWN EXAMPLE, AND NOTHING CHECKED THAT.
 *
 * `EXAMPLE_FOR_ROUTE` is keyed by `route.ts` axis id with no compile-time tie
 * to `AXES` -- `Axis.id` is a `string`, so the two cannot be joined by the
 * type system -- and `exampleFor` falls back to the table example for any id
 * it does not hold.
 *
 * That fallback is right for robustness and silent as a defect: renaming an
 * axis, or adding a thirteenth, leaves the map untouched and the prompt then
 * shows a TABLE example beside a directive that says "walk through what
 * happens step by step". The result is a duller lesson, never an error, so
 * nothing reports it -- and the ten-out-of-ten prose+table monoculture this
 * mapping exists to break quietly comes back one route at a time.
 *
 * This is the tie the types cannot make.
 */
describe('every route has an example written for it', () => {
  it('maps all twelve axes, so none falls back silently', () => {
    const unmapped = AXES.filter((axis) => EXAMPLE_FOR_ROUTE[axis.id] === undefined)
    expect(unmapped.map((axis) => axis.id)).toEqual([])
  })

  it('maps nothing that is not an axis, so a rename cannot leave a dead key', () => {
    const ids = new Set(AXES.map((axis) => axis.id))
    expect(Object.keys(EXAMPLE_FOR_ROUTE).filter((id) => !ids.has(id))).toEqual([])
  })

  it('gives every example something shown, which is what the gate demands', () => {
    const SHOWS = new Set(['chart', 'table', 'flow', 'figure', 'simulation'])
    for (const axis of AXES) {
      const example = EXAMPLE_FOR_ROUTE[axis.id] as { blocks: { kind: string }[] }
      expect(
        example.blocks.some((block) => SHOWS.has(block.kind)),
        `${axis.id} shows nothing`,
      ).toBe(true)
    }
  })
})
