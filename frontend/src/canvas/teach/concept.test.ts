import { describe, expect, it } from 'vitest'

import { authorConcept, conceptIssues, type Concept } from './concept'
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

  it('a refused concept carries the gate reasons, not a generic apology', async () => {
    const result = await authorConcept(says('not json at all'), 'What is a base case?')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.unreachable).toBeUndefined()
    expect(result.issues.length).toBeGreaterThan(0)
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
