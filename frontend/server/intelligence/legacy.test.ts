import { describe, expect, it } from 'vitest'

import { ACTIONS } from '../controller.ts'
import type { ModelPort } from '../handler.ts'
import { legacyIntelligence } from './legacy.ts'
import type { TeachingRequest } from './LearningIntelligence.ts'

/**
 * THE LEGACY DECISION is today's five-action chooser plus its veto, wrapped
 * so it can be compared with the candidate on the same request. It is never
 * obeyed through this wrapper; it is one signal. These tests iterate the real
 * `ACTIONS` list so a sixth action tomorrow is covered the day it appears.
 */

function aRequest(question: string): TeachingRequest {
  return { question, topicId: null, classId: '10', examId: null, alreadyUsed: [], askedFrom: 'ask', studentId: 'a-student' }
}

function aChooserThatSays(action: string): ModelPort {
  return {
    lesson: async () => { throw new Error('never') },
    decide: async () => JSON.stringify({ action, target: 'zeros of a polynomial', reason: `because I chose ${action}` }),
  }
}

describe('the legacy decision, as a signal', () => {
  it('maps every one of the five actions to a learning action and keeps the reason', async () => {
    for (const action of ACTIONS) {
      const legacy = legacyIntelligence({ model: aChooserThatSays(action) })
      const proposal = await legacy.propose(aRequest('what is a zero of a polynomial'))
      expect(proposal.actions, action).toHaveLength(1)
      expect(proposal.rationale, action).toContain(`because I chose ${action}`)
      expect(proposal.capabilities.selected, action).toContain('legacy-decision')
    }
  })

  it('reports a veto as an Unknown carrying the veto s own words, and still proposes what the app would do instead', async () => {
    const legacy = legacyIntelligence({ model: aChooserThatSays('EXPLAIN') })
    const proposal = await legacy.propose(aRequest('   '))
    expect(proposal.unknowns.length, 'an empty question was not refused').toBeGreaterThan(0)
    expect(proposal.unknowns[0]?.because.length).toBeGreaterThan(0)
    expect(proposal.actions.length, 'a veto must never be a dead end').toBeGreaterThan(0)
  })

  it('says when it has no chooser at all, rather than deciding by itself', async () => {
    const legacy = legacyIntelligence({ model: { lesson: async () => { throw new Error('never') } } })
    const proposal = await legacy.propose(aRequest('what is a zero of a polynomial'))
    expect(proposal.unknowns.some((u) => /chooser|model/i.test(u.what))).toBe(true)
  })
})
