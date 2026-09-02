import { describe, expect, it } from 'vitest'

import { loadPlannedSubjects } from '../../src/almanac/curriculum.ts'
import type { ModelPort, SearchPort } from '../handler.ts'
import { candidateIntelligence } from './candidate.ts'
import { legacyIntelligence } from './legacy.ts'
import type { TeachingRequest } from './LearningIntelligence.ts'

/**
 * THE NOVEL-COMPOSITION BENCHMARK -- the one test that can show the fabric
 * does something the five-action chooser cannot: compose. Questions are
 * drawn from the real class 10 curriculum through templates whose honest
 * answer needs more than one capability. The candidate's plan is measured;
 * the legacy chooser, by construction, proposes exactly one action.
 *
 * The reasoner here answers every prompt with the same short JSON, so what
 * is measured is the ROUTER and the LOOP -- rule-based, deterministic --
 * not a model's mood.
 */

const noSearch: SearchPort = { search: async () => [] }
const model: ModelPort = {
  lesson: async () => { throw new Error('never') },
  decide: async () => JSON.stringify({ action: 'EXPLAIN', target: 'the topic', reason: 'one action, as always' }),
  chat: async (system: string) => (system.includes('"compose"') ? JSON.stringify({ compose: [] }) : JSON.stringify({ answer: 'A short answer.' })),
}

function aRequest(question: string, topic: { id: string; name: string }): TeachingRequest {
  return { question, topicId: topic.id, topicName: topic.name, classId: '10', examId: null, alreadyUsed: [], askedFrom: 'ask', studentId: 's' }
}

const TEMPLATES: readonly { name: string; ask: (topic: string) => string; needs: readonly string[] }[] = [
  { name: 'check my working', ask: (t) => `is my working right for ${t}: 2 × 3 = 7 so the answer is 7`, needs: ['calculate'] },
  { name: 'why I got it wrong', ask: (t) => `why did i get ${t} wrong last time and what should i do next`, needs: ['memory-read'] },
]

describe('novel composition', () => {
  it('the candidate composes capabilities where the five-action chooser proposes one action, on real topics', async () => {
    const subjects = await loadPlannedSubjects('10')
    const topics = subjects.slice(0, 6).flatMap((s) => { const c = s.chapters[0]?.concepts[0]; return c === undefined ? [] : [{ id: c.id, name: c.name }] })
    expect(topics.length).toBeGreaterThanOrEqual(4)

    const candidate = candidateIntelligence({ model, search: noSearch, now: () => '2026-09-03T00:00:00.000Z' })
    const legacy = legacyIntelligence({ model })
    const experience = { artifacts: [{ seq: 1, pleas: 2, answers: 0, questions: 0, empties: 0, movesSpent: ['worked-example'], outcome: 'pleaded' as const }], unplaced: 0 }

    const rows: string[] = []
    let composed = 0
    let total = 0
    for (const template of TEMPLATES) {
      for (const topic of topics) {
        const request = { ...aRequest(template.ask(topic.name), topic), experience }
        const c = await candidate.propose(request)
        const l = await legacy.propose(request)
        const executed = ((c.trace as { executed?: readonly string[] }).executed ?? [])
        total += 1
        if (c.capabilities.selected.length >= 2) composed += 1
        rows.push(`${template.name} | ${topic.name.slice(0, 28)} | selected ${c.capabilities.selected.join('+')} | executed ${executed.join('+')} | legacy ${l.actions.map((a) => a.kind).join('+')}`)
        /* The chooser, by construction, proposes one action. */
        expect(l.actions, `${template.name}: ${topic.name}`).toHaveLength(1)
        /* The composition each template exists to test actually ran. */
        for (const need of template.needs) {
          expect(executed, `${template.name} on "${topic.name}" never ran ${need}: ${rows[rows.length - 1]}`).toContain(need)
        }
      }
    }
    console.log(`BENCHMARK ${composed}/${total} composed\n${rows.join('\n')}`)
    expect(composed, 'the candidate composed nothing anywhere').toBeGreaterThan(0)
  })
})
