import { describe, expect, it, vi } from 'vitest'

import { smallTalk } from './smallTalk.ts'
import { createHandler, type ModelPort, type SearchPort } from './handler.ts'

/**
 * "HI" IS NOT A LESSON, AND IT IS NOT A MODEL CALL EITHER.
 *
 * The owner's brief: a greeting gets a greeting; a simple message stays fast;
 * the expensive path is earned by the request. Today every message -- "hi",
 * "thanks", "ok" -- pays the controller's model call before anything can
 * answer, and on a laptop model that is ten seconds of silence for a hello.
 *
 * This is the FAST PATH, not the intent system: a short, explicit, tested
 * list of the things people type that are conversation and nothing else.
 * Anything not on it goes to the model's controller exactly as before. The
 * reply travels as `clarify`, which is what it is -- a sentence back and the
 * box to type in -- so the canvas needs nothing new to show it.
 */

describe('what counts as small talk', () => {
  it('recognises greetings, thanks and acknowledgements, however they are typed', () => {
    for (const said of ['hi', 'Hi!', 'HELLO', 'hey', 'hii', 'hlo', 'namaste', 'good morning', 'hello there']) {
      expect(smallTalk(said), said).toBe('greeting')
    }
    for (const said of ['thanks', 'thank you', 'thx', 'thanks!', 'ty']) expect(smallTalk(said), said).toBe('thanks')
    for (const said of ['ok', 'okay', 'k', 'cool', 'got it', 'fine', 'bye', 'good night']) expect(smallTalk(said), said).toBe('ack')
  })

  it('never mistakes a question or a topic for small talk', () => {
    for (const said of [
      'hi, what is photosynthesis',
      'ok so how does gravity work',
      'thanks but I still do not get it',
      'hello world program',
      'what',
      'why',
      'photosynthesis',
      '',
      'hi hi hi hi hi',
    ]) {
      expect(smallTalk(said), said).toBeNull()
    }
  })
})

describe('/api/ask answers small talk without asking a model', () => {
  const search: SearchPort = { search: async () => [] }
  const A_TEST_SECRET = 'test-secret-not-used-anywhere-real'
  const ask = (question: string) => ({ method: 'POST', path: '/api/ask', body: { question } })

  it('greets a greeting, thanks a thanks, and calls no model at all', async () => {
    const chat = vi.fn(async () => '{}')
    const model: ModelPort = { lesson: async () => ({}), chat }
    const handle = createHandler({ model, search, identitySecret: A_TEST_SECRET })

    const hi = await handle(ask('hi'))
    expect(hi.status).toBe(200)
    expect(hi.body['clarify']).toBe(true)
    expect(String(hi.body['question'])).toMatch(/learn/i)

    const thanks = await handle(ask('thank you!'))
    expect(thanks.status).toBe(200)
    expect(thanks.body['clarify']).toBe(true)

    expect(chat, 'small talk reached the model').not.toHaveBeenCalled()
  })

  it('still sends a real question to the controller', async () => {
    const chat = vi.fn(async () => '{"action":"ASK_CLARIFICATION","target":"","reason":"x","source_needed":false,"subject_named":false}')
    const model: ModelPort = { lesson: async () => ({}), chat }
    const handle = createHandler({ model, search, identitySecret: A_TEST_SECRET })
    await handle(ask('why is the sky blue'))
    expect(chat).toHaveBeenCalled()
  })

  it('reads "ok" typed inside a lesson as an answer, and sends it to the model', async () => {
    /* Inside a lesson, "ok", "got it" and "no" are what she said back to the
       checkpoint -- evidence -- and the model must see them. */
    const chat = vi.fn(async () => '{"action":"ASK_CLARIFICATION","target":"","reason":"x","source_needed":false,"subject_named":false}')
    const model: ModelPort = { lesson: async () => ({}), chat }
    const handle = createHandler({ model, search, identitySecret: A_TEST_SECRET })
    await handle({ method: 'POST', path: '/api/ask', body: { question: 'ok', askedInside: 'What is a base case?' } })
    expect(chat, '"ok" inside a lesson was swallowed as small talk').toHaveBeenCalled()
  })
})
