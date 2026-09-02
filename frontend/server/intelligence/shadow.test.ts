import { describe, expect, it } from 'vitest'

import { shadowObserver } from './shadow.ts'
import type { LearningIntelligence, Proposal, TeachingRequest } from './LearningIntelligence.ts'

/**
 * THE SHADOW BRIDGE is the one call the live path makes, after its reply is
 * already formed. Its whole contract is that the student can never tell it is
 * there: off means off, it never waits, and nothing it does can surface.
 */

const request: TeachingRequest = { question: 'what is a zero of a polynomial', topicId: null, classId: '10', examId: null, alreadyUsed: [], askedFrom: 'ask', studentId: 's' }

function aBrain(name: string, behave: () => Promise<Proposal>): LearningIntelligence & { asked: TeachingRequest[] } {
  const brain = { name, asked: [] as TeachingRequest[], propose: async (r: TeachingRequest) => { brain.asked.push(r); return behave() } }
  return brain
}

const emptyProposal = (): Promise<Proposal> => Promise.resolve({ actions: [], unknowns: [], rationale: '', capabilities: { selected: [], rejected: [] }, cost: { ms: 0, modelCalls: 0 }, trace: {} })

function settle(): Promise<void> { return new Promise((r) => setTimeout(r, 0)) }

describe('the shadow bridge', () => {
  it('does nothing at all when the mode is off: neither brain is even asked', async () => {
    const candidate = aBrain('candidate', emptyProposal)
    const legacy = aBrain('legacy', emptyProposal)
    const lines: string[] = []
    const observe = shadowObserver({ candidate, legacy, mode: () => 'off', log: (l) => lines.push(l), now: () => 0 })
    observe(request, { lesson: 'x' })
    await settle()
    expect(candidate.asked).toEqual([])
    expect(legacy.asked).toEqual([])
    expect(lines).toEqual([])
  })

  it('never makes the student wait: it hands control back before the candidate has answered', async () => {
    let release: () => void = () => {}
    const candidate = aBrain('candidate', () => new Promise<Proposal>((r) => { release = () => emptyProposal().then(r) }))
    const legacy = aBrain('legacy', emptyProposal)
    const observe = shadowObserver({ candidate, legacy, mode: () => 'shadow', log: () => {}, now: () => 0 })
    const returned = observe(request, {})
    expect(returned, 'the bridge returned a promise the caller might be tempted to await').toBeUndefined()
    release()
  })

  it('asks both brains the identical request, once each, in shadow mode', async () => {
    const candidate = aBrain('candidate', emptyProposal)
    const legacy = aBrain('legacy', emptyProposal)
    const observe = shadowObserver({ candidate, legacy, mode: () => 'shadow', log: () => {}, now: () => 0 })
    observe(request, {})
    await settle()
    expect(candidate.asked).toEqual([request])
    expect(legacy.asked).toEqual([request])
  })

  it('records a proposal whose actions do not fit the IR as MALFORMED, never as a proposal', async () => {
    const lying = aBrain('candidate', async () => ({ ...(await emptyProposal()), actions: [{ kind: 'explain', risk: 0, evidence: [] } as never] }))
    const legacy = aBrain('legacy', emptyProposal)
    const lines: string[] = []
    const observe = shadowObserver({ candidate: lying, legacy, mode: () => 'shadow', log: (l) => lines.push(l), now: () => 0 })
    observe(request, {})
    await settle(); await settle()
    expect(lines).toHaveLength(1)
    expect(lines[0], lines[0]).toMatch(/candidate malformed/)
    expect(lines[0], 'a malformed proposal was recorded as if it were one').not.toMatch(/candidate explain/)
  })

  it('a brain that throws is invisible: one log line, nothing thrown, nothing unhandled', async () => {
    const candidate = aBrain('candidate', () => Promise.reject(new Error('the reasoner fell over')))
    const legacy = aBrain('legacy', emptyProposal)
    const lines: string[] = []
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    /* The server's own `node.d.ts` types `process` narrowly on purpose; the
       real Node API is reached here through a cast, in a test only. */
    const node = process as unknown as { on(e: string, f: (r: unknown) => void): void; off(e: string, f: (r: unknown) => void): void }
    node.on('unhandledRejection', onUnhandled)
    try {
      const observe = shadowObserver({ candidate, legacy, mode: () => 'shadow', log: (l) => lines.push(l), now: () => 0 })
      expect(() => observe(request, {})).not.toThrow()
      await settle(); await settle()
    } finally {
      node.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])
    expect(lines.filter((l) => l.startsWith('[shadow]') && /fell over/.test(l))).toHaveLength(1)
  })
})
