import { describe, expect, it } from 'vitest'

import { loadPlannedSubjects } from '../../src/almanac/curriculum.ts'
import type { Understanding } from '../../src/agent/kernel/contracts.ts'
import { costsFrom } from './cost.ts'
import { reasonAbout, UNCLEAR_BELOW } from './reason.ts'
import type { ListedRun, ShadowRun } from './runs.ts'
import liveRun2 from './__fixtures__/live-run-2.json'
import { capabilityRegistry, type Has } from './registry.ts'

/**
 * THE `reason` SEAM -- the one `understand.ts` documents and never built.
 * "The reasoner decides what intelligence is necessary": given the request,
 * the rules' reading of it, and the registry's contracts, it names which
 * capabilities to compose and why. It is asked ONLY when the rules found the
 * reading unclear; a clear reading costs no model call. Its reply is
 * JSON-mode, read by one key; a capability it names that does not exist is an
 * Unknown, never quietly dropped and never quietly invented.
 */

const EVERYTHING: Has = { model: 'chat-and-decide', search: true, aliases: true, lessons: true, evidence: true, misconceptions: true, concepts: true, verifiedTopics: 3 }
const registry = capabilityRegistry(EVERYTHING)

function reading(confidence: number, ambiguity: 'none' | 'open' | 'blocking' = 'open'): Understanding {
  return {
    intents: [{ kind: 'explanation', confidence, because: 'asks for a concept' }],
    goal: 'what is a zero of a polynomial',
    constraints: [],
    entities: [],
    language: 'en',
    topicShift: false,
    ambiguities: ambiguity === 'none' ? [] : [{ what: 'which polynomial', blocking: ambiguity === 'blocking' }],
  }
}

function aChatSaying(reply: unknown): { chat: (system: string, user: string) => Promise<string>; calls: number } {
  const port = { calls: 0, chat: async () => { port.calls += 1; return typeof reply === 'string' ? reply : JSON.stringify(reply) } }
  return port
}

describe('the reason seam', () => {
  it('is not asked when the rules read the request clearly: zero model calls', async () => {
    /* The router's own rule: unclear is a blocking ambiguity, or an open one
       with a shaky top intent. A confident reading with an open ambiguity, or
       a shaky reading with none, is not unclear to the router and not here. */
    for (const u of [reading(UNCLEAR_BELOW + 0.2, 'open'), reading(UNCLEAR_BELOW - 0.2, 'none'), reading(UNCLEAR_BELOW + 0.2, 'none')]) {
      const chat = aChatSaying({ compose: [{ capability: 'diagnose', because: 'x' }] })
      const out = await reasonAbout({ question: 'what is a zero of a polynomial', understanding: u, registry, chat: chat.chat })
      expect(out.asked).toBe(false)
      expect(chat.calls).toBe(0)
    }
  })

  it('UNCLEAR_BELOW is the router s own SHAKY, read from the router s source', () => {
    const sources = import.meta.glob('../../src/agent/kernel/router.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const text = Object.values(sources)[0] ?? ''
    const shaky = /const SHAKY = ([0-9.]+)/.exec(text)?.[1]
    expect(shaky, 'router.ts no longer declares SHAKY; the pin below is now a guess').toBeDefined()
    expect(Number(shaky)).toBe(UNCLEAR_BELOW)
  })

  it('is asked when the reading is unclear or blocked, and names capabilities that exist, with reasons', async () => {
    for (const u of [reading(UNCLEAR_BELOW - 0.1, 'open'), reading(0.9, 'blocking')]) {
      const chat = aChatSaying({ compose: [{ capability: 'diagnose', because: 'she may hold a wrong belief' }, { capability: 'knowledge', because: 'the scope of the topic is on file' }] })
      const out = await reasonAbout({ question: 'i dont get why there are two', understanding: u, registry, chat: chat.chat })
      expect(out.asked).toBe(true)
      expect(chat.calls).toBe(1)
      expect(out.compose.map((c) => c.capability)).toEqual(['diagnose', 'knowledge'])
      for (const c of out.compose) expect(c.because.length).toBeGreaterThan(0)
      expect(out.unknowns).toEqual([])
    }
  })

  it('a capability the reasoner names that does not exist is an Unknown, not a composition', async () => {
    const chat = aChatSaying({ compose: [{ capability: 'mind-reading', because: 'it would help' }, { capability: 'diagnose', because: 'x' }] })
    const out = await reasonAbout({ question: 'q', understanding: reading(0.1), registry, chat: chat.chat })
    expect(out.compose.map((c) => c.capability)).toEqual(['diagnose'])
    expect(out.unknowns.some((u) => /mind-reading/.test(u.what))).toBe(true)
  })

  it('a capability that exists but is unavailable here is named as such, never composed', async () => {
    const nothing = capabilityRegistry({ ...EVERYTHING, search: false })
    const chat = aChatSaying({ compose: [{ capability: 'search', because: 'it changes with time' }] })
    const out = await reasonAbout({ question: 'q', understanding: reading(0.1), registry: nothing, chat: chat.chat })
    expect(out.compose).toEqual([])
    expect(out.unknowns.some((u) => /search/.test(u.what) && u.because.length > 0)).toBe(true)
  })

  it('a reply that is not the agreed shape is an Unknown in its own words', async () => {
    for (const reply of ['not json at all', { answer: 'prose where a plan was asked for' }, { compose: 'diagnose' }]) {
      const chat = aChatSaying(reply)
      const out = await reasonAbout({ question: 'q', understanding: reading(0.1), registry, chat: chat.chat })
      expect(out.compose, JSON.stringify(reply)).toEqual([])
      expect(out.unknowns.length, JSON.stringify(reply)).toBeGreaterThan(0)
    }
  })

  it('tells the reasoner a measured cost when there is one, and says unmeasured when there is none', async () => {
    let seen = ''
    const chat = { chat: async (system: string) => { seen = system; return JSON.stringify({ compose: [] }) } }
    await reasonAbout({ question: 'q', understanding: reading(0.1), registry, chat: chat.chat })
    expect(seen).toMatch(/candidate-agent[^\n]*unmeasured/)
    const runs: ListedRun[] = [{ seq: 2, at: (liveRun2 as ShadowRun).at, run: liveRun2 as ShadowRun }]
    const measured = capabilityRegistry(EVERYTHING, () => costsFrom(runs))
    await reasonAbout({ question: 'q', understanding: reading(0.1), registry: measured, chat: chat.chat })
    const ms = (liveRun2 as { candidate: { proposal: { cost: { ms: number } } } }).candidate.proposal.cost.ms
    expect(seen).toMatch(new RegExp(`candidate-agent[^\\n]*${ms} ms`))
  })

  it('tells the reasoner what followed earlier teaching on the topic, in one line', async () => {
    let seenUser = ''
    const chat = { chat: async (_system: string, user: string) => { seenUser = user; return JSON.stringify({ compose: [] }) } }
    const experience = { artifacts: [{ seq: 3, pleas: 2, answers: 0, questions: 0, empties: 0, movesSpent: ['worked-example'], outcome: 'pleaded' as const }, { seq: 5, pleas: 0, answers: 1, questions: 0, empties: 0, movesSpent: [], outcome: 'answered' as const }], unplaced: 0 }
    await reasonAbout({ question: 'q', understanding: reading(0.1), registry, chat: chat.chat, experience })
    expect(seenUser).toMatch(/2 earlier lesson/)
    expect(seenUser).toMatch(/1 followed by a plea/)
    expect(seenUser).toMatch(/worked-example/)
  })

  it('tells the reasoner every contract by name, purpose and availability -- nothing more, nothing less', async () => {
    let seen = ''
    const chat = { chat: async (system: string) => { seen = system; return JSON.stringify({ compose: [] }) } }
    const subjects = await loadPlannedSubjects('10')
    const topic = subjects[0]?.chapters[0]?.concepts[0]?.name ?? 'a topic'
    await reasonAbout({ question: `what is ${topic}`, understanding: reading(0.1), registry, chat: chat.chat })
    for (const c of registry.list()) {
      expect(seen, `${c.name} was not offered`).toContain(c.name)
      expect(seen, `${c.name}'s purpose was not offered`).toContain(c.purpose)
    }
  })
})
