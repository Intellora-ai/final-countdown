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
})
