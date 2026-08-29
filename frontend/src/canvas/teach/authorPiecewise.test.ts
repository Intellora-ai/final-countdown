import { describe, expect, it } from 'vitest'

import { authorPiecewise } from './authorPiecewise'
import type { LessonModel } from './authorLesson'
import { WORKED_EXAMPLE } from './authorLesson'

/*
 * AUTHORING IN TWO STAGES, AND WHY THE SECOND ONE IS CONCURRENT.
 *
 * One reply for a whole lesson is the hardest possible ask of a small model,
 * and measured on qwen2.5:7b it failed exactly that way. Splitting it into a
 * skeleton and then bodies makes each ask small.
 *
 * But splitting it NAIVELY makes it slower, not faster: N sequential calls
 * where there was one. The bodies do not depend on each other -- the rules that
 * read a body are per-block -- so they are filled concurrently and the wall
 * clock becomes the SLOWEST BODY rather than the sum of all of them. The
 * structural rules that DO span blocks were already settled on the skeleton.
 *
 * That is the same split the practice pipeline arrived at: "Candidates are
 * generated and verified concurrently, because they do not depend on each
 * other. Deduplication cannot be."
 */

/** A stub model that records when each call started and finished. */
function recordingModel(reply: (user: string) => string, delayMs = 0) {
  const started: number[] = []
  const finished: number[] = []
  let inFlight = 0
  let maxInFlight = 0

  const model: LessonModel = async (_system, user) => {
    started.push(performance.now())
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    inFlight -= 1
    finished.push(performance.now())
    return reply(user)
  }

  return { model, started, finished, calls: () => started.length, maxInFlight: () => maxInFlight }
}

/**
 * The skeleton the outline stage is expected to return, as the model would send it.
 *
 * It carries `relations` and `technicalTerms`, and that is not padding. A
 * relation names two blocks, so no isolated body call can emit one — the first
 * version of this stub omitted them and the assembled lesson was refused by
 * `representation-is-decoration`: the table was joined to nothing.
 */
const OUTLINE_REPLY = JSON.stringify({
  id: WORKED_EXAMPLE.id,
  question: WORKED_EXAMPLE.question,
  technicalTerms: WORKED_EXAMPLE.technicalTerms,
  relations: WORKED_EXAMPLE.relations,
  blocks: WORKED_EXAMPLE.blocks.map((b) => ({
    id: b.id,
    kind: b.kind,
    role: b.role,
    title: b.title,
    depth: 'core',
  })),
})

/** Each body call answers with the real block of that id, so assembly succeeds. */
function bodyFor(user: string): string {
  const found = WORKED_EXAMPLE.blocks.find((b) => user.includes(b.id))
  return JSON.stringify(found ?? {})
}

const reply = (user: string) => (user.includes('SKELETON') ? OUTLINE_REPLY : bodyFor(user))

describe('authorPiecewise', () => {
  it('asks for the skeleton first, then one call per block', async () => {
    const { model, calls } = recordingModel(reply)

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?')

    expect(result.ok).toBe(true)
    /* One outline call plus one per block. Pinned as an equation rather than a
       number so adding a block to the example cannot silently pass. */
    expect(calls()).toBe(1 + WORKED_EXAMPLE.blocks.length)
  })

  /*
   * THE TEST THAT MAKES THE SPLIT WORTH DOING.
   *
   * Without it, "piecewise" is just "slower". `maxInFlight` counts calls
   * overlapping at their peak; sequential filling can never exceed 1, so this
   * cannot be satisfied by an implementation that awaits in a loop.
   */
  it('fills the bodies concurrently, not one after another', async () => {
    const { model, maxInFlight } = recordingModel(reply, 20)

    await authorPiecewise(model, 'Why does water boil on a mountain?')

    expect(maxInFlight()).toBeGreaterThan(1)
  })

  it('produces a lesson that passes the real gate', async () => {
    const { model } = recordingModel(reply)

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.lesson.blocks.length).toBe(WORKED_EXAMPLE.blocks.length)
  })

  /*
   * A BROKEN SKELETON MUST NOT COST N BODY CALLS.
   *
   * This is the saving the split exists for: a structural fault is found on a
   * four-line document, before a single word of prose has been paid for.
   */
  it('refuses a structurally broken skeleton without filling any block', async () => {
    const twoDefinitions = JSON.stringify({
      id: 'broken',
      question: 'q',
      blocks: [
        { id: 'a', kind: 'prose', role: 'definition', depth: 'core' },
        { id: 'b', kind: 'prose', role: 'definition', depth: 'core' },
        { id: 'c', kind: 'summary', role: 'summary', depth: 'core' },
      ],
    })
    const { model, calls } = recordingModel(() => twoDefinitions)

    const result = await authorPiecewise(model, 'q')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => i.message.includes('many-definitions'))).toBe(true)
    /* Outline attempts only. If this ever exceeds the retry count, bodies were
       filled against a skeleton already known to be broken. */
    expect(calls()).toBeLessThanOrEqual(2)
  })

  /* A transport failure is a result, not an exception -- the same distinction
     `authorLesson` already draws, kept here so the caller's banner can tell
     "this model cannot write lessons" from "this lesson does not teach". */
  it('reports an unreachable model rather than throwing', async () => {
    const model: LessonModel = async () => {
      throw new Error('connection refused')
    }

    const result = await authorPiecewise(model, 'q')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.unreachable).toContain('connection refused')
  })

  /*
   * REVIEW FINDING 1. R6 refuses a lesson where a declared technical term
   * appears in any block BEFORE the one that earns it. That is a constraint on
   * a BODY, so a body writer that cannot see the term list has no way to obey
   * it -- and the whole lesson is then refused after every call is paid for.
   */
  it('tells each block which technical terms it may not use yet', async () => {
    const asked: string[] = []
    const model: LessonModel = async (_s, user) => {
      asked.push(user)
      return user.includes('SKELETON') ? OUTLINE_REPLY : bodyFor(user)
    }

    await authorPiecewise(model, 'Why does water boil on a mountain?')

    const term = WORKED_EXAMPLE.technicalTerms![0]!.term
    const earner = WORKED_EXAMPLE.technicalTerms![0]!.introducedIn
    /* Blocks before the earning one are told to avoid the term. */
    const anchorAsk = asked.find((a) => a.includes('start-from-the-kettle'))
    expect(anchorAsk).toContain(term)
    /* The block that earns it is told it may introduce it. */
    const earnerAsk = asked.find((a) => a.includes(earner))
    expect(earnerAsk).toContain(term)
  })

  /*
   * REVIEW FINDING 4. `authorLesson` allowed one repair. Without one here, a
   * single malformed body discards every other reply -- which is worse than the
   * code this replaces, on the exact axis the split was meant to improve.
   */
  it('retries only the block that came back malformed', async () => {
    /* A real block id from the example, not an invented one -- the first
       version of this test named a block that does not exist, so the failure
       branch never fired and the retry looked absent when it was untested. */
    const flaky = WORKED_EXAMPLE.blocks[3]!.id
    let bodyCalls = 0
    let failuresLeft = 1
    const model: LessonModel = async (_s, user) => {
      if (user.includes('SKELETON')) return OUTLINE_REPLY
      bodyCalls += 1
      if (user.includes(flaky) && failuresLeft > 0) {
        failuresLeft -= 1
        return 'sorry, I could not write that one'
      }
      return bodyFor(user)
    }

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?')

    expect(result.ok).toBe(true)
    /* One extra call, not a whole second pass over every block. */
    expect(bodyCalls).toBe(WORKED_EXAMPLE.blocks.length + 1)
  })

  /*
   * REVIEW FINDING 5. An invented kind must not survive the plan. Left
   * unchecked it is forced into the assembled block and guarantees a refusal
   * after every body is written.
   */
  it('refuses a plan naming a kind that does not exist', async () => {
    /*
     * OTHERWISE SOUND, so only the kind check can refuse it. The first version
     * of this test used a two-block plan that `nothing-is-shown` refused
     * anyway, and a mutant deleting the kind check SURVIVED -- the test asserted
     * the right outcome for the wrong reason.
     */
    const invented = JSON.parse(OUTLINE_REPLY) as { blocks: { kind: string }[] }
    invented.blocks[0]!.kind = 'paragraph'
    const { model, calls } = recordingModel(() => JSON.stringify(invented))

    const result = await authorPiecewise(model, 'q')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]!.message).toContain('legal kinds and roles')
    /* Plan attempts only. No body was paid for. */
    expect(calls()).toBeLessThanOrEqual(2)
  })

  /* The same plan WITHOUT the invented kind must succeed, or the test above is
     satisfied by refusing everything. The real question is used because rule 4
     requires the opening block to name the topic -- "q" names nothing. */
  it('accepts the same plan when every kind is legal', async () => {
    const { model } = recordingModel(reply)

    expect((await authorPiecewise(model, 'Why does water boil on a mountain?')).ok).toBe(true)
  })

  /*
   * REVIEW FINDING 6. The assembly override exists because a body may rename
   * its own block, which would break every relation pointing at it. Every other
   * test replays already-correct blocks, so the override was a no-op and a
   * mutant deleting it stayed green.
   */
  it('keeps the planned id when a body renames itself', async () => {
    const model: LessonModel = async (_s, user) => {
      if (user.includes('SKELETON')) return OUTLINE_REPLY
      const found = WORKED_EXAMPLE.blocks.find((b) => user.includes(b.id))
      /* The model returns the right content under the wrong id. */
      return JSON.stringify({ ...found, id: 'renamed-by-the-model' })
    }

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lesson.blocks.map((b) => b.id)).toEqual(WORKED_EXAMPLE.blocks.map((b) => b.id))
    }
  })

  /*
   * REVIEW FINDING 7. On a gate refusal the model's own replies are the
   * evidence. Reporting only the assembled object throws away what the model
   * actually said, which is the thing a captured-reply corpus is made of.
   */
  it('keeps the raw body replies when the assembled lesson is refused', async () => {
    const model: LessonModel = async (_s, user) =>
      user.includes('SKELETON') ? OUTLINE_REPLY : JSON.stringify({ body: '' })

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?')

    expect(result.ok).toBe(false)
    /* The model's own reply, verbatim, not the object this file assembled from
       it. `JSON.stringify` without an indent emits no space after the colon. */
    if (!result.ok) expect(result.raw).toContain('{"body":""}')
  })

  /*
   * A CEILING THAT REFUSES, RATHER THAN ONE THAT DEGRADES.
   *
   * Measured before this branch: 187 seconds and then nothing, and a 316-second
   * transport timeout. Both are "no answer" with no ceiling, and a learner
   * cannot tell a slow success from a hang.
   *
   * There is deliberately no path from "out of budget" to "deliver what we
   * have". A refusal can be retried; a half-written lesson teaches something
   * false, and the practice engine's `EngineFailure` makes the same choice by
   * having no member that could express the alternative.
   *
   * The clock is injected so this costs no wall time -- the same reason the
   * practice pipeline takes a `now`.
   */
  it('refuses when the plan stage has already spent the budget', async () => {
    const { model } = recordingModel(reply)
    let clock = 0
    const now = () => (clock += 5_000)

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?', [], {
      budgetMs: 1_000,
      now,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.message).toContain('budget')
      /* Named as a timeout, not as a teaching fault. Conflating them tells a
         learner their question was answered badly when it was never answered. */
      expect(result.issues[0]!.path).toBe('(budget)')
    }
  })

  /* The other direction. Without this, the check above is satisfied by an
     implementation that refuses everything. */
  it('does not refuse when the work fits inside the budget', async () => {
    const { model } = recordingModel(reply)
    let clock = 0
    const now = () => (clock += 1)

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?', [], {
      budgetMs: 60_000,
      now,
    })

    expect(result.ok).toBe(true)
  })

  /* No budget given behaves exactly as before the option existed. */
  it('has no ceiling when none is asked for', async () => {
    const { model } = recordingModel(reply)

    expect((await authorPiecewise(model, 'Why does water boil on a mountain?')).ok).toBe(true)
  })

  /*
   * WHERE THE TIME WENT, not merely how much. 187 seconds with no breakdown is
   * a complaint; a per-stage split is a measurement, and it is what says
   * whether the next optimisation belongs in search, the model, or the gate.
   */
  it('reports how long the plan and the bodies each took', async () => {
    const { model } = recordingModel(reply)
    let clock = 0
    const now = () => (clock += 100)

    const result = await authorPiecewise(model, 'Why does water boil on a mountain?', [], { now })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.timing!.planMs).toBeGreaterThan(0)
      expect(result.timing!.bodiesMs).toBeGreaterThan(0)
      expect(result.timing!.totalMs).toBeGreaterThanOrEqual(
        result.timing!.planMs + result.timing!.bodiesMs,
      )
    }
  })
})
