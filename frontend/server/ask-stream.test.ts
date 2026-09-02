import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort, type ServerResponse } from './handler.ts'
import type { StreamEvent } from './lessonStream.ts'

/**
 * `/api/ask` AS AN EVENT STREAM. The owner's decision, 2026-09-02: words
 * appear as they are written, never all at once.
 *
 * Asked with `accept: text/event-stream`, the route answers with a stream of
 * the events `lessonStream.ts` defines -- prose text as it arrives, each block
 * as it passes its own check -- and ends with `done`, carrying exactly the
 * reply the plain route would have sent. Asked without it, nothing changes:
 * the same JSON reply as before, so every existing caller and test stands.
 */

const A_CONCEPT = {
  id: 'base-case',
  question: 'What is a base case?',
  technicalTerms: [{ term: 'recursion', introducedIn: 'shown' }],
  blocks: [
    {
      id: 'says-what', kind: 'prose', emphasis: 'primary', tone: 'neutral', role: 'definition', depth: 'core',
      body: 'A base case is the branch that returns without calling itself.',
      terms: [{ text: 'branch', mark: 'key' }],
    },
    {
      id: 'shown', kind: 'table', emphasis: 'supporting', tone: 'neutral', role: 'framework', depth: 'core',
      columns: [{ key: 'call', label: 'Call', type: 'text' }, { key: 'does', label: 'What it does', type: 'text' }],
      rows: [{ call: 'fact(1)', does: 'returns 1, no recursion' }, { call: 'fact(4)', does: 'calls fact(3)' }],
    },
  ],
  relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
  checkpoint: 'Which of those two calls is the base case, and how can you tell?',
  next: [{ id: 'deeper', label: 'Why a missing base case never stops' }, { id: 'related', label: 'How recursion builds the answer back up' }],
}
const WHOLE = JSON.stringify(A_CONCEPT)
const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
const search: SearchPort = { search: async () => [] }

/** Answers the controller and the author alike, and can write in pieces. */
function streamingModel(chunk = 9): { model: ModelPort; streamed: number } {
  const state = { streamed: 0 }
  const model: ModelPort = {
    lesson: async () => {
      throw new Error('the whole-lesson path must not be taken')
    },
    chat: async () => WHOLE,
    chatStream: async (_system, _user, onDelta) => {
      state.streamed += 1
      for (let at = 0; at < WHOLE.length; at += chunk) onDelta(WHOLE.slice(at, at + chunk))
      return WHOLE
    },
  }
  return { model, get streamed() { return state.streamed } }
}

async function collect(res: ServerResponse): Promise<StreamEvent[]> {
  const events: StreamEvent[] = []
  if (res.stream === undefined) return events
  for await (const event of res.stream) events.push(event)
  return events
}

describe('/api/ask asked as an event stream', () => {
  it('sends the words of the first block before the block itself, then every block, then done', async () => {
    const { model } = streamingModel()
    const handle = createHandler({ model, search, identitySecret: A_TEST_SECRET })
    const res = await handle({ method: 'POST', path: '/api/ask', accept: 'text/event-stream', body: { question: 'What is a base case?' } })
    expect(res.status).toBe(200)
    expect(res.stream, 'asked for a stream, answered with a document').toBeDefined()

    const events = await collect(res)
    const kinds = events.map((e) => e.type)
    expect(kinds.indexOf('text'), 'no words arrived at all').toBeGreaterThanOrEqual(0)
    expect(kinds.indexOf('text')).toBeLessThan(kinds.indexOf('block'))
    expect(events.filter((e) => e.type === 'block').map((e) => (e as { blockIndex: number }).blockIndex)).toEqual([0, 1])
    expect(
      events.filter((e): e is Extract<StreamEvent, { type: 'text' }> => e.type === 'text' && e.blockIndex === 0).map((e) => e.text).join(''),
    ).toBe(A_CONCEPT.blocks[0]!.body)

    const last = events[events.length - 1]
    expect(last?.type).toBe('done')
    if (last?.type !== 'done') throw new Error('unreachable')
    expect(last.reply.status).toBe(200)
    expect((last.reply.body as { lesson?: { id?: string } }).lesson?.id).toBe('base-case')
  })

  it('answers exactly as before when not asked for a stream', async () => {
    const { model } = streamingModel()
    const handle = createHandler({ model, search, identitySecret: A_TEST_SECRET })
    const res = await handle({ method: 'POST', path: '/api/ask', body: { question: 'What is a base case?' } })
    expect(res.status).toBe(200)
    expect(res.stream).toBeUndefined()
    expect((res.body as { lesson?: { id?: string } }).lesson?.id).toBe('base-case')
  })

  it('streams only the first attempt; a repair is written whole', async () => {
    /* A repair re-sends the rejected document and asks for a correction. Its
       words would overwrite what is already on screen mid-sentence, so only
       the first attempt streams. Here the first reply is refused (no
       representation), forcing a repair. */
    let calls = 0
    const allWords = { ...A_CONCEPT, blocks: [A_CONCEPT.blocks[0]], relations: [] }
    const model: ModelPort = {
      lesson: async () => { throw new Error('no') },
      chat: async (system: string) => (calls++ , system.includes('OVERRULED') ? WHOLE : WHOLE),
      chatStream: async (_s, _u, onDelta) => {
        const text = JSON.stringify(allWords)
        for (let at = 0; at < text.length; at += 12) onDelta(text.slice(at, at + 12))
        return text
      },
    }
    const handle = createHandler({ model, search, identitySecret: A_TEST_SECRET })
    const res = await handle({ method: 'POST', path: '/api/ask', accept: 'text/event-stream', body: { question: 'What is a base case?' } })
    const events = await collect(res)
    const last = events[events.length - 1]
    expect(last?.type).toBe('done')
    if (last?.type !== 'done') throw new Error('unreachable')
    expect(last.reply.status, 'the repaired lesson did not arrive').toBe(200)
    expect((last.reply.body as { lesson?: { blocks?: unknown[] } }).lesson?.blocks?.length).toBe(2)
  })
})

describe('F2 — the author is told how well its sources agree', () => {
  /* The verdict is computed from the pages themselves and used to be dropped
     between the search and the author. A lesson resting on one page must say
     so; one resting on two independent sources that agree may say it plainly. */
  it('puts the verdict in the prompt, right beside the sources', async () => {
    const seen: string[] = []
    const handler = createHandler({
      model: {
        lesson: async () => ({ id: 'x', question: 'x', blocks: [], relations: [] }),
        chat: async (system: string) => {
          seen.push(system)
          return JSON.stringify({ action: 'START_LESSON', target: 'zeros', reason: 'asked', source_needed: true, subject_named: true })
        },
      },
      search: {
        search: async () => [
          { url: 'https://a.test/1', content: 'A zero is where the polynomial equals zero.', agreement: 'Only one source says this. Say it, and say that it rests on one source.' },
        ],
      },
      identitySecret: A_TEST_SECRET,
    })
    await handler({ method: 'POST', path: '/api/ask', body: { question: 'what is a zero of a polynomial' } })
    const authoring = seen.find((one) => !one.includes('You are the controller')) ?? ''
    expect(authoring, 'the verdict never reached the author').toMatch(/rests on one source/i)
  })
})
