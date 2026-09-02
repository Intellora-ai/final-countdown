/**
 * THE CANDIDATE: `src/agent`, wrapped, unchanged.
 *
 * The agent was built for the browser with an HTTP model; here it is given the
 * SERVER's model and search through two small adapters, so it thinks with the
 * same reasoner and the same web the live brain uses. Its memory is the
 * agent's own in-process store, fresh per request, until M4 hands it read-only
 * views of the server's evidence.
 *
 * The one thing this file must never do is answer in the reasoner's place.
 * A server model with no `chat` means the candidate cannot think, and the
 * proposal says exactly that.
 */
import { buildPrompt, createAgent } from '../../src/agent/index.ts'
import type { ModelPort as AgentModelPort } from '../../src/agent/kernel/loop.ts'
import type { SearchPort as AgentSearchPort } from '../../src/agent/knowledge/knowledge.ts'
import type { ModelPort, SearchPort } from '../handler.ts'
import type { LearningAction } from './ir.ts'
import type { LearningIntelligence, Proposal, TeachingRequest, Unknown } from './LearningIntelligence.ts'

export interface CandidateOptions {
  readonly model: ModelPort
  readonly search: SearchPort
  readonly now?: () => string
}

export function candidateIntelligence(options: CandidateOptions): LearningIntelligence {
  const now = options.now ?? (() => new Date().toISOString())
  return {
    name: 'candidate-agent',
    async propose(request: TeachingRequest): Promise<Proposal> {
      const startedAt = Date.parse(now())
      const chat = options.model.chat
      if (chat === undefined) {
        return {
          actions: [],
          unknowns: [{ what: 'the reasoner', because: 'the server model has no chat, and the candidate does not think without one', blocking: true }],
          rationale: 'no reasoner was available, so nothing was proposed',
          capabilities: { selected: [], rejected: [] },
          cost: { ms: Date.parse(now()) - startedAt, modelCalls: 0 },
          trace: { reasoner: 'absent' },
        }
      }

      let modelCalls = 0
      const model: AgentModelPort = {
        generate: async (req) => {
          modelCalls += 1
          const prompt = buildPrompt(req)
          return chat(prompt.system, prompt.user)
        },
      }
      const search: AgentSearchPort = {
        search: async (query) => (await options.search.search(query)).map((hit) => ({ url: hit.url, title: hit.url, snippet: hit.content })),
      }

      const agent = createAgent({ model, search, now })
      const out = await agent.ask({ parts: [{ modality: 'text', content: request.question }], at: now() })

      const rationale = Object.entries(out.result.plan.rationale).map(([cap, why]) => `${cap}: ${why}`).join('; ')
      const actions: LearningAction[] = [
        {
          kind: 'explain',
          because: rationale.length > 0 ? rationale : 'the loop answered',
          /* Provisional: a claim the loop itself flagged needs a source, so 1;
             none, so 0. M9 sets the full tiers from the content. */
          risk: out.result.claims.length > 0 ? 1 : 0,
          evidence: [...out.trace.sources],
          payload: { answer: out.result.answer, representations: out.result.communication.representations },
        },
      ]
      if (out.result.question !== undefined) {
        actions.push({ kind: 'ask', because: 'the loop wants one thing settled first', risk: 0, evidence: [], payload: { question: out.result.question } })
      }
      const unknowns: Unknown[] = [
        ...out.trace.understanding.ambiguities.map((a) => ({ what: a.what, because: 'the understanding stage could not settle it', blocking: a.blocking })),
        ...Object.entries(out.trace.unmet).map(([capability, why]) => ({ what: capability, because: why, blocking: false })),
      ]
      return {
        actions,
        unknowns,
        rationale: rationale.length > 0 ? rationale : out.result.plan.selected.join(', '),
        capabilities: {
          selected: out.result.plan.selected,
          rejected: Object.entries(out.result.plan.rejected).map(([capability, why]) => ({ capability, why })),
        },
        cost: { ms: Date.parse(now()) - startedAt, modelCalls },
        trace: out.trace,
      }
    },
  }
}
