/* M8 — A LEARNER NEVER GETS AN APOLOGY WHERE A LESSON WAS POSSIBLE.
 *
 * THE PHASE SAYS: "Implement always-respond — every input gets a reply; never
 * blank, dropped, or refused."
 *
 * THE DEFECT THIS PINS. `handler.ts` puts the model's lesson through
 * `validateLesson`, retries a bounded number of times, and then answers 502
 * with "the model returned a lesson that failed validation". MEASURED in CI
 * run 33444764358 and reproduced locally, two refusals that really happen:
 *
 *   "blocks[0]: 62 words with no break, and the limit is 30 in one go"
 *   "blocks: no block is the definition | blocks: the lesson is all words |
 *    the lesson stops rather than ending"
 *
 * In BOTH the model produced structurally sound, safe, readable teaching. The
 * first is a paragraph that needed a blank line in it. The second is a real
 * answer that is not shaped like a whole lesson. A child asked a question and
 * got an apology, and in neither case was there anything unsafe to protect her
 * from. That is what these tests refuse to allow.
 *
 * THE LINE THIS SUITE DRAWS, AND WHY IT IS NOT A CARVE-OUT.
 *   `validate.ts:240` runs the teaching rules ONLY when the structural pass
 *   found nothing:  `if (teaching !== 'off' && issues.length === 0)`. So a
 *   refusal is never mixed. It is EITHER entirely structural — an unknown key,
 *   a dangling relation, a body over the schema's ceiling, an appearance
 *   breach — OR entirely teaching rules. Those two sets mean opposite things:
 *
 *     structural  the thing is not a lesson, and several of these are the
 *                 security gates (a leaked system prompt is refused because it
 *                 is longer than a block body may be). Nothing to salvage.
 *                 STAYS 502. Every pre-existing 502 test in this repo is one
 *                 of these, and Group 4 below re-pins them.
 *     teaching    the thing IS a lesson and teaches badly. Here a child is
 *                 being denied words that were safe to show her.
 *
 * WHAT MUST BE TRUE
 *   1. A question always yields something she can read, or an honest statement
 *      of what happened. Never a bare failure.
 *   2. Nothing is invented. The server may write about ITS OWN state; it never
 *      writes subject matter. LAW B.
 *   3. Laws 1-4 hold: no colour, position, styling or forbidden field added.
 *   4. The validator is not weakened. A 62-word wall is REPAIRED into
 *      paragraphs, never served as a wall — and the chunk rules stay on for
 *      every single path out of this handler.
 *   5. The operator still sees the whole diagnostic.
 *
 * WHY THIS DRIVES `createHandler` AND NOT A SOCKET. `m8-response.test.ts`
 * already proves a reply reaches a real client over a real port. What is
 * unproven, and what these tests are about, is WHICH reply the handler decides
 * on. That is a pure function of the model's output, so it is tested as one.
 */

import { describe, expect, it, vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { validateLesson, type TeachingLevel } from '../src/canvas/spec/validate.ts'
import { MAX_RUN_WORDS, segments } from '../src/canvas/teach/teaching.ts'

const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const search: SearchPort = { search: async () => [] }

function modelReturning(value: unknown): ModelPort {
  return { lesson: async () => value }
}
function handlerWith(model: ModelPort) {
  return createHandler({ model, search, identitySecret: A_TEST_SECRET })
}

const ASK = { method: 'POST', path: '/api/ask', body: { question: 'why is the sky blue?' } }
const LESSON = { method: 'POST', path: '/api/lesson', body: { concept: 'Photosynthesis', subject: 'Biology' } }

/** Silences the operator log this handler is SUPPOSED to write, and returns it. */
function captureOperatorLog() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0)
}

/** Every readable string in a lesson, however deeply nested. */
function everyString(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) value.forEach((v) => everyString(v, into))
  else if (value !== null && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => everyString(v, into))
  }
  return into
}

/* -------------------------------------------------------------------------- */
/* The two model behaviours measured in CI                                     */
/* -------------------------------------------------------------------------- */

/* 62 words, no blank line, but real sentences — the shape a model actually
   emits. The repair has somewhere natural to break. */
const A_WALL_WITH_SENTENCES =
  'Sunlight is made of many colours mixed together and it looks white to us when they all arrive at once. ' +
  'The air above us is full of tiny molecules that are much smaller than the waves of light passing them. ' +
  'Blue light has a very short wave so it bounces off those tiny molecules far more often than red light ever does.'

/* The same fault with NOTHING to break on: one clause, no sentence end. A
   repair that only knows about full stops fails here, and this is the case
   that proves it does not. */
const A_WALL_WITH_NO_SENTENCE_END = words(A_WALL_WITH_SENTENCES)
  .join(' ')
  .replace(/\./g, '')

const wallLesson = (body: string) => ({
  id: 'sky', question: 'why is the sky blue?',
  blocks: [{ id: 'p', kind: 'prose', body }],
})

/* The arc failure: a real answer that is not shaped like a whole lesson.
   Refused at 'lesson' level for no-definition, no-summary and nothing-is-shown. */
const AN_ANSWER_THAT_IS_NOT_AN_ARC = {
  id: 'photosynthesis', question: 'How does a leaf make food?',
  blocks: [
    { id: 'a', kind: 'prose', body: 'A leaf takes in light, water and air.' },
    { id: 'b', kind: 'prose', body: 'It uses them to build sugar, and lets out oxygen.' },
  ],
}

const A_GOOD_LESSON = {
  id: 'photosynthesis',
  question: 'How does a leaf make food?',
  blocks: [
    {
      id: 'intro', kind: 'prose', emphasis: 'primary', role: 'definition',
      body: 'A leaf turns light into sugar.',
      terms: [{ text: 'sugar', mark: 'key' }],
    },
    {
      id: 'ingredients', kind: 'table', emphasis: 'primary',
      title: 'What goes in and what comes out',
      columns: [
        { key: 'side', label: 'Side', type: 'text' },
        { key: 'what', label: 'What', type: 'text' },
      ],
      rows: [
        { side: 'In', what: 'Light, water, carbon dioxide' },
        { side: 'Out', what: 'Sugar, oxygen' },
      ],
      caption: 'Read across one row to see one side of the swap.',
    },
    {
      id: 'keep-this', kind: 'summary', emphasis: 'primary', tone: 'result', role: 'summary',
      progression: ['Light arrives', 'The leaf combines water and carbon dioxide', 'Sugar is stored'],
      mentalModel: 'A leaf is a kitchen that cooks with light instead of heat.',
    },
  ],
  relations: [{ from: 'ingredients', to: 'intro', kind: 'supports' }],
}

/* -------------------------------------------------------------------------- */

describe('M8 — the wall of text is repaired, not refused', () => {
  for (const [name, body] of [
    ['with sentence ends to break on', A_WALL_WITH_SENTENCES],
    ['with no sentence end anywhere', A_WALL_WITH_NO_SENTENCE_END],
  ] as const) {
    it(`answers a 62-word unbroken run ${name}`, async () => {
      /* PRECONDITION. If this stops being the fault under test the test is
         proving nothing, so it is asserted rather than assumed. */
      const before = validateLesson(wallLesson(body), { teaching: 'answer' })
      expect(before.ok, 'the fixture no longer fails validation').toBe(false)
      if (before.ok) return
      expect(before.issues.map((i) => i.rule)).toEqual(['run-too-long'])

      const log = captureOperatorLog()
      const res = await handlerWith(modelReturning(wallLesson(body)))(ASK)
      log.mockRestore()

      expect(res.status, 'a child was handed an apology for a missing blank line').toBe(200)
      expect(res.body['lesson'], 'no lesson arrived').toBeDefined()
    })

    it(`serves her the model's own words, none added or lost, ${name}`, async () => {
      const log = captureOperatorLog()
      const res = await handlerWith(modelReturning(wallLesson(body)))(ASK)
      log.mockRestore()

      const lesson = res.body['lesson'] as { blocks: { body?: string }[] }
      const served = lesson.blocks.map((b) => b.body ?? '').join(' ')
      /* THE WHOLE POINT OF A MECHANICAL REPAIR: the same words, in the same
         order. Anything else is the server writing the lesson. */
      expect(words(served).join(' ')).toBe(words(body).join(' '))
    })
  }

  it('never lets the wall itself through — every run is inside the budget', async () => {
    const log = captureOperatorLog()
    const res = await handlerWith(modelReturning(wallLesson(A_WALL_WITH_SENTENCES)))(ASK)
    log.mockRestore()

    const lesson = res.body['lesson'] as { blocks: { body?: string }[] }
    for (const block of lesson.blocks) {
      for (const run of segments(block.body ?? '')) {
        expect(words(run).length, `a ${words(run).length}-word wall reached her anyway`)
          .toBeLessThanOrEqual(MAX_RUN_WORDS)
      }
    }
  })
})

describe('M8 — an answer that is not shaped like a lesson still reaches her', () => {
  it('answers /api/lesson instead of apologising', async () => {
    const before = validateLesson(AN_ANSWER_THAT_IS_NOT_AN_ARC, { teaching: 'lesson' })
    expect(before.ok, 'the fixture no longer fails the arc rules').toBe(false)
    if (before.ok) return
    expect(before.issues.every((i) => i.rule !== undefined), 'fixture has a structural fault').toBe(true)

    const log = captureOperatorLog()
    const res = await handlerWith(modelReturning(AN_ANSWER_THAT_IS_NOT_AN_ARC))(LESSON)
    log.mockRestore()

    expect(res.status).toBe(200)
    expect(res.body['lesson']).toBeDefined()
  })

  it('says plainly that this is not the whole lesson', async () => {
    const log = captureOperatorLog()
    const res = await handlerWith(modelReturning(AN_ANSWER_THAT_IS_NOT_AN_ARC))(LESSON)
    log.mockRestore()

    /* LAW B. She is told what she got, in words, and is not left believing a
       partial answer was the full lesson. */
    const text = everyString(res.body['lesson']).join(' ').toLowerCase()
    expect(text, 'she was handed a partial lesson with nothing said about it')
      .toMatch(/could not|not the whole|part of/)
    /* And the fact is on the envelope too, for the operator and the client. */
    expect(res.body['partial']).toBe(true)
  })

  it('keeps every word the model did write', async () => {
    const log = captureOperatorLog()
    const res = await handlerWith(modelReturning(AN_ANSWER_THAT_IS_NOT_AN_ARC))(LESSON)
    log.mockRestore()

    const text = everyString(res.body['lesson']).join(' ')
    for (const block of AN_ANSWER_THAT_IS_NOT_AN_ARC.blocks) {
      expect(text, `"${block.body}" was dropped on the floor`).toContain(block.body)
    }
  })
})

describe('M8 — a good lesson is not touched', () => {
  it('passes a valid lesson through unchanged and unflagged', async () => {
    const res = await handlerWith(modelReturning(A_GOOD_LESSON))(LESSON)
    expect(res.status).toBe(200)
    expect(res.body['partial'], 'a perfectly good lesson was labelled partial').toBeUndefined()
    /* Byte-for-byte the model's lesson. A repair pass that rewrites healthy
       output is a repair pass nobody can reason about. */
    expect(res.body['lesson']).toEqual(validateLesson(A_GOOD_LESSON, { teaching: 'lesson' }).ok
      ? (validateLesson(A_GOOD_LESSON, { teaching: 'lesson' }) as { lesson: unknown }).lesson
      : undefined)
  })
})

describe('M8 — a structural fault is still refused, because it is not a lesson', () => {
  /* THE PAIR TO EVERYTHING ABOVE. Without this suite, "always respond" is
     satisfied by a server that serves anything at all, and the security gates
     that currently answer 502 would be gone. Each of these is pinned elsewhere
     in this repo; they are re-pinned here because THIS change is the one that
     could break them. */
  const A_LONG_BODY = 'x'.repeat(4000)
  for (const [name, produced] of [
    ['no blocks at all', { id: 'x', blocks: [] }],
    ['rubbish that is not a lesson', 'not a lesson at all'],
    ['nothing at all', undefined],
    ['an appearance key', { ...A_GOOD_LESSON, blocks: [{ ...A_GOOD_LESSON.blocks[0], color: '#ff0000' }] }],
    ['an unknown key at the root', { ...A_GOOD_LESSON, plantedMarker: true }],
    ['a dangling relation', { ...A_GOOD_LESSON, relations: [{ from: 'intro', to: 'no-such-block', kind: 'supports' }] }],
    ['a body past the schema ceiling', { id: 'x', question: 'q', blocks: [{ id: 'p', kind: 'prose', body: A_LONG_BODY }] }],
  ] as const) {
    it(`refuses ${name}`, async () => {
      const log = captureOperatorLog()
      const res = await handlerWith(modelReturning(produced))(ASK)
      log.mockRestore()

      expect(res.status, `${name} was served to a learner`).toBe(502)
      expect(res.body['lesson'], `${name} produced a lesson`).toBeUndefined()
    })
  }

  it('does not reflect the model output back in a refusal', async () => {
    const marker = 'REFLECTED-MODEL-CONTENT-MARKER'
    const log = captureOperatorLog()
    const res = await handlerWith(modelReturning({ id: 'x', question: marker, blocks: [] }))(LESSON)
    log.mockRestore()
    expect(JSON.stringify(res.body)).not.toContain(marker)
  })
})

describe('M8 — nothing invalid ever reaches the browser, by any path', () => {
  const everyModel: readonly (readonly [string, unknown])[] = [
    ['a wall with sentences', wallLesson(A_WALL_WITH_SENTENCES)],
    ['a wall with none', wallLesson(A_WALL_WITH_NO_SENTENCE_END)],
    ['an answer with no arc', AN_ANSWER_THAT_IS_NOT_AN_ARC],
    ['a good lesson', A_GOOD_LESSON],
    ['a marked term that is absent', {
      id: 'x', question: 'q',
      blocks: [{ id: 'p', kind: 'prose', body: 'A leaf turns light into sugar.', terms: [{ text: 'chlorophyll', mark: 'key' }] }],
    }],
    ['a term introduced in a block that does not exist', {
      id: 'x', question: 'q',
      blocks: [{ id: 'p', kind: 'prose', body: 'A leaf turns light into sugar.' }],
      technicalTerms: [{ term: 'sugar', introducedIn: 'no-such-block' }],
    }],
  ]

  for (const [route, teaching] of [[ASK, 'answer'], [LESSON, 'lesson']] as const) {
    for (const [name, produced] of everyModel) {
      it(`${route.path} serving ${name} returns only a lesson the gate accepts`, async () => {
        const log = captureOperatorLog()
        const res = await handlerWith(modelReturning(produced))(route)
        log.mockRestore()

        if (res.body['lesson'] === undefined) {
          expect(res.status, 'no lesson AND no refusal is a blank reply').toBe(502)
          return
        }
        /* A lesson that reaches a browser has been through the SAME gate the
           browser uses, or the repair is a wall of text arriving by the back
           door. The chunk rules are on at both levels, so this proves the
           length guarantee on every route. */
        const check = validateLesson(res.body['lesson'], { teaching: 'answer' as TeachingLevel })
        expect(
          check.ok ? [] : check.issues.map((i) => `${i.path}: ${i.message}`),
          'an invalid lesson was served',
        ).toEqual([])
      })
    }
  }
})

describe('M8 — LAW C: no machine code ever reaches her', () => {
  const hostile: readonly (readonly [string, unknown])[] = [
    ['a wall', wallLesson(A_WALL_WITH_SENTENCES)],
    ['no arc', AN_ANSWER_THAT_IS_NOT_AN_ARC],
    ['no blocks', { id: 'x', blocks: [] }],
    ['rubbish', 'not a lesson at all'],
    ['nothing', undefined],
  ]
  for (const [name, produced] of hostile) {
    it(`answers ${name} in words a twelve-year-old can act on`, async () => {
      const log = captureOperatorLog()
      const res = await handlerWith(modelReturning(produced))(LESSON)
      log.mockRestore()

      const body = JSON.stringify(res.body)
      expect(body.length, 'a blank reply').toBeGreaterThan(2)
      expect(body, 'an object stringified into the reply').not.toContain('[object Object]')
      expect(body, 'a NaN reached a learner').not.toMatch(/\bNaN\b/)
      expect(body, 'a stack frame reached a learner').not.toMatch(/\bat [\w.]+ \(/)
      expect(body, 'a stack frame reached a learner').not.toContain('.ts:')
      /* No bare HTTP status anywhere in what she is shown. */
      for (const text of everyString(res.body['lesson'] ?? {})) {
        expect(text, 'a status code reached a learner').not.toMatch(/\b[45]\d\d\b/)
      }
    })
  }
})

describe('M8 — the operator still sees everything', () => {
  it('logs the full diagnosis even when the learner is served a lesson', async () => {
    const log = captureOperatorLog()
    await handlerWith(modelReturning(AN_ANSWER_THAT_IS_NOT_AN_ARC))(LESSON)
    const said = log.mock.calls.map((c) => c.join(' ')).join('\n')
    log.mockRestore()

    /* Requirement 5. Recovering for the child must not blind the operator: the
       model is still emitting arc-less lessons and somebody has to know. */
    expect(said, 'the refusal stopped being reported').toContain('lesson refused by validation')
    expect(said, 'the operator lost the rule that was broken').toContain('no-definition')
  })

  it('says a repair happened, and what it repaired', async () => {
    const log = captureOperatorLog()
    await handlerWith(modelReturning(wallLesson(A_WALL_WITH_SENTENCES)))(ASK)
    const said = log.mock.calls.map((c) => c.join(' ')).join('\n')
    log.mockRestore()

    expect(said, 'a silent repair is drift nobody can see').toMatch(/repair/i)
    expect(said).toContain('run-too-long')
  })
})
