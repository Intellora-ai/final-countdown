/**
 * The situation client and the ledger classifier: every ending accounted for.
 *
 * Two ways this pair can lie, both tested in both directions: the classifier
 * can misfile an ending (a debt recorded for a kept promise, or a kept promise
 * for a debt), and the client can let a courtesy failure become a learner's
 * problem (a throw where silence was owed).
 */
import { describe, expect, it, vi } from 'vitest'

import { createAnswering } from './answering'
import { fetchOpenLoops, situationClient, type SituationPort } from './situation'
import { gasPressure } from '../lessons/gasPressure'
import { validateLesson } from '../spec/validate'
import type { DoubtResolver } from './contract'

const LESSON = (() => {
  const checked = validateLesson(gasPressure)
  if (!checked.ok) throw new Error('the stored lesson no longer validates')
  return checked.lesson
})()

const doubt = { text: 'why does that happen?', atBeatId: 'b1' }

function ledger(): { port: SituationPort; opened: unknown[]; resolved: string[] } {
  const opened: unknown[] = []
  const resolved: string[] = []
  return {
    port: {
      opened: (loop) => void opened.push(loop),
      resolved: (question) => void resolved.push(question),
    },
    opened,
    resolved,
  }
}

const answers: DoubtResolver = {
  name: 'test',
  resolve: () =>
    ({ kind: 'answer', blocks: [LESSON.blocks[0]!], source: 'lesson' }) as never,
}

const refuses: DoubtResolver = {
  name: 'test',
  resolve: () => ({ kind: 'refusal', reason: 'nothing in this lesson names that' }) as never,
}

describe('which endings are a kept promise and which are a debt', () => {
  it('a chain answer settles the question', async () => {
    const { port, opened, resolved } = ledger()
    const answering = createAnswering({ resolvers: [answers], ask: vi.fn(), situation: port })
    await answering.answer(doubt as never, LESSON)
    expect(resolved).toEqual([doubt.text])
    expect(opened).toEqual([])
  })

  it('a real model answer settles the question', async () => {
    const { port, opened, resolved } = ledger()
    const answering = createAnswering({
      resolvers: [refuses],
      ask: async () => ({ ok: true, text: 'a real general answer' }),
      situation: port,
    })
    await answering.answer(doubt as never, LESSON)
    expect(resolved).toEqual([doubt.text])
    expect(opened).toEqual([])
  })

  it('nothing reachable records a debt, as failed', async () => {
    const { port, opened, resolved } = ledger()
    const answering = createAnswering({
      resolvers: [refuses],
      ask: async () => {
        throw new Error('the network is down')
      },
      situation: port,
    })
    await answering.answer(doubt as never, LESSON)
    expect(resolved).toEqual([])
    expect(opened).toEqual([
      { question: doubt.text, lesson: LESSON.question, stalled: 'failed' },
    ])
  })

  it("the chain's polite refusal records a debt, as refused", async () => {
    const { port, opened, resolved } = ledger()
    const answering = createAnswering({
      resolvers: [refuses],
      /* Reached and empty: the refusal sentence is what she reads. */
      ask: async () => ({ ok: true, text: '' }),
      situation: port,
    })
    await answering.answer(doubt as never, LESSON)
    expect(resolved).toEqual([])
    expect(opened).toEqual([
      { question: doubt.text, lesson: LESSON.question, stalled: 'refused' },
    ])
  })

  it('a ledger that throws never costs her the answer', async () => {
    const hostile: SituationPort = {
      opened: () => {
        throw new Error('ledger exploded')
      },
      resolved: () => {
        throw new Error('ledger exploded')
      },
    }
    const answering = createAnswering({ resolvers: [answers], ask: vi.fn(), situation: hostile })
    const answered = await answering.answer(doubt as never, LESSON)
    expect(answered.from).toBe('lesson')
  })

  it('no ledger wired means answering behaves exactly as before', async () => {
    const answering = createAnswering({ resolvers: [answers], ask: vi.fn() })
    const answered = await answering.answer(doubt as never, LESSON)
    expect(answered.from).toBe('lesson')
  })
})

describe('the client half: every failure is silence', () => {
  it('reads loops from a well-shaped reply and skips junk entries', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({
        openLoops: [
          { question: 'real one', lesson: 'gas', stalled: 'refused', at: 't' },
          { question: '', stalled: 'refused', at: 't' },
          { question: 'wrong stall', stalled: 'bored', at: 't' },
          'not a record',
        ],
      }),
    })) as unknown as typeof fetch
    const loops = await fetchOpenLoops(fetchImpl)
    expect(loops.map((l) => l.question)).toEqual(['real one'])
  })

  it('a 503, junk JSON, or a dead network all read as no loops', async () => {
    const unconfigured = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await fetchOpenLoops(unconfigured)).toEqual([])

    const junk = (async () => ({ ok: true, json: async () => 'nonsense' })) as unknown as typeof fetch
    expect(await fetchOpenLoops(junk)).toEqual([])

    const dead = (async () => {
      throw new Error('refused')
    }) as unknown as typeof fetch
    expect(await fetchOpenLoops(dead)).toEqual([])
  })

  it('writes go to the route with the right verbs and swallow failure', async () => {
    const sent: Array<{ url: string; body: unknown }> = []
    const fetchImpl = (async (url: string, init?: { body?: string }) => {
      sent.push({ url, body: JSON.parse(init?.body ?? '{}') })
      throw new Error('the write failed after sending')
    }) as unknown as typeof fetch

    const port = situationClient(fetchImpl)
    port.opened({ question: 'q1', lesson: 'gas', stalled: 'failed' })
    port.resolved('q1')
    /* Both fired, neither threw, and the bodies say what happened. */
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toEqual([
      { url: '/api/situation', body: { question: 'q1', lesson: 'gas', stalled: 'failed' } },
      { url: '/api/situation', body: { question: 'q1', resolved: true } },
    ])
  })
})
