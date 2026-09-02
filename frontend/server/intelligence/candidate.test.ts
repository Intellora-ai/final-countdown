import { describe, expect, it } from 'vitest'

import { loadPlannedSubjects } from '../../src/almanac/curriculum.ts'
import type { ModelPort, SearchPort } from '../handler.ts'
import { candidateIntelligence } from './candidate.ts'
import type { TeachingRequest } from './LearningIntelligence.ts'

/**
 * THE CANDIDATE is `src/agent` -- 8,020 lines and 671 tests that the canvas
 * never called -- wrapped so it can be asked the same question the live
 * brain was asked. Nothing in the agent is changed; these tests are about the
 * wrapper's promises: it answers from real ports, it says what it turned
 * down, it never fakes the reasoner, and its cost is counted not guessed.
 */

function aRequest(question: string, topicId: string | null = null): TeachingRequest {
  return { question, topicId, classId: '10', examId: null, alreadyUsed: [], askedFrom: 'ask', studentId: 'a-student' }
}

/** A reasoner that answers, and counts how often it was asked. */
function aReasoner(): ModelPort & { calls: number } {
  const port = {
    calls: 0,
    lesson: async () => { throw new Error('the candidate never asks for a whole lesson') },
    chat: async (_system: string, user: string) => {
      port.calls += 1
      return `Here is a short answer about: ${user.slice(0, 40)}`
    },
  }
  return port
}

const noSearch: SearchPort = { search: async () => [] }

/** Real topics from the real curriculum -- one from each of the first six subjects. */
async function sixRealTopics(): Promise<readonly { id: string; name: string }[]> {
  const subjects = await loadPlannedSubjects('10')
  const picked: { id: string; name: string }[] = []
  for (const subject of subjects.slice(0, 6)) {
    const topic = subject.chapters[0]?.concepts[0]
    if (topic !== undefined) picked.push({ id: topic.id, name: topic.name })
  }
  expect(picked.length, 'the class 10 curriculum did not load').toBeGreaterThanOrEqual(4)
  return picked
}

describe('the candidate intelligence', () => {
  it('proposes for real topics, and names what it selected AND what it turned down', async () => {
    const model = aReasoner()
    const candidate = candidateIntelligence({ model, search: noSearch, now: () => '2026-09-03T00:00:00.000Z' })
    for (const topic of await sixRealTopics()) {
      const proposal = await candidate.propose(aRequest(`what is ${topic.name}`, topic.id))
      expect(proposal.actions.length, topic.name).toBeGreaterThan(0)
      expect(proposal.capabilities.selected.length, `${topic.name}: selected nothing`).toBeGreaterThan(0)
      for (const r of proposal.capabilities.rejected) {
        expect(r.why.length, `${topic.name}: rejected ${r.capability} for no reason`).toBeGreaterThan(0)
      }
      expect(proposal.rationale.length, `${topic.name}: no rationale`).toBeGreaterThan(0)
    }
  })

  it('carries the loop s own trace, not a summary of it', async () => {
    const candidate = candidateIntelligence({ model: aReasoner(), search: noSearch, now: () => '2026-09-03T00:00:00.000Z' })
    const proposal = await candidate.propose(aRequest('what is a zero of a polynomial'))
    const trace = proposal.trace as { understanding?: { intents?: unknown[] } }
    expect(trace.understanding?.intents?.length, 'the understanding stage left no intents in the trace').toBeGreaterThan(0)
  })

  it('says the reasoner is missing, and makes nothing up in its place', async () => {
    const noChat: ModelPort = { lesson: async () => { throw new Error('no') } }
    const candidate = candidateIntelligence({ model: noChat, search: noSearch, now: () => '2026-09-03T00:00:00.000Z' })
    const proposal = await candidate.propose(aRequest('what is a zero of a polynomial'))
    expect(proposal.unknowns.some((u) => /reasoner|model/i.test(u.what)), JSON.stringify(proposal.unknowns)).toBe(true)
    expect(proposal.actions.filter((a) => a.kind === 'explain'), 'an explanation was invented without a reasoner').toEqual([])
  })

  it('reads a JSON-mode reply by its one agreed key, so the answer is prose and never a blob', async () => {
    /* The server's chat is JSON-mode for the controller's sake (ollama sends
       `format: 'json'`, groq `response_format: json_object`). The first live
       shadow run handed the canvas `{ "answer": "..." }` as the explanation
       and the gate refused it. The candidate asks for one key and reads it. */
    const model: ModelPort = {
      lesson: async () => { throw new Error('no') },
      chat: async (system: string) => {
        expect(system, 'the candidate did not ask for the agreed key').toMatch(/"answer"/)
        return JSON.stringify({ answer: 'A zero of a polynomial is a number that makes it equal zero.' })
      },
    }
    const candidate = candidateIntelligence({ model, search: noSearch, now: () => '2026-09-03T00:00:00.000Z' })
    const proposal = await candidate.propose(aRequest('what is a zero of a polynomial'))
    const explain = proposal.actions.find((a) => a.kind === 'explain')
    expect(explain?.payload?.['answer']).toBe('A zero of a polynomial is a number that makes it equal zero.')
  })

  it('a JSON reply without the agreed key is an Unknown in its own words, never an answer', async () => {
    const model: ModelPort = { lesson: async () => { throw new Error('no') }, chat: async () => JSON.stringify({ result: 'something', ok: true }) }
    const candidate = candidateIntelligence({ model, search: noSearch, now: () => '2026-09-03T00:00:00.000Z' })
    const proposal = await candidate.propose(aRequest('what is a zero of a polynomial'))
    expect(proposal.actions.filter((a) => a.kind === 'explain')).toEqual([])
    expect(proposal.unknowns.some((u) => /answer/.test(u.what) && /result, ok|keys/.test(u.because)), JSON.stringify(proposal.unknowns)).toBe(true)
  })

  it('counts its cost from what actually happened', async () => {
    const model = aReasoner()
    let tick = 0
    const candidate = candidateIntelligence({ model, search: noSearch, now: () => new Date(1_700_000_000_000 + (tick += 250)).toISOString() })
    const proposal = await candidate.propose(aRequest('what is a zero of a polynomial'))
    expect(proposal.cost.modelCalls).toBe(model.calls)
    expect(proposal.cost.ms).toBeGreaterThan(0)
  })
})
