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
import type { MemoryRecord } from '../../src/agent/kernel/contracts.ts'
import { inMemoryPersistence } from '../../src/agent/memory/memory.ts'
import type { ModelPort as AgentModelPort } from '../../src/agent/kernel/loop.ts'
import type { SearchPort as AgentSearchPort } from '../../src/agent/knowledge/knowledge.ts'
import type { ModelPort, SearchPort } from '../handler.ts'
import type { LearningAction } from './ir.ts'
import type { LearningIntelligence, Proposal, TeachingRequest, Unknown } from './LearningIntelligence.ts'
import { reasonAbout, type Reasoned } from './reason.ts'
import type { Registry } from './registry.ts'

export interface CandidateOptions {
  readonly model: ModelPort
  readonly search: SearchPort
  /** The contracts the reasoner may compose from. Absent, the seam is never asked. */
  readonly registry?: Registry
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
      /* THE SERVER'S CHAT IS JSON-MODE (the controller needs it), so the
         reasoner is asked for one key and read by it. A reply that is not
         JSON at all is prose from a text-mode port and is used as it is. A
         JSON reply without the key is not an answer; it is recorded as an
         Unknown below, in the reply's own words, and nothing is invented. */
      let notAnAnswer: string | null = null
      const model: AgentModelPort = {
        generate: async (req) => {
          modelCalls += 1
          const prompt = buildPrompt(req)
          const reply = await chat(`${prompt.system}\n\nReply as a JSON object with exactly one key, "answer", whose value is your whole reply as plain text.`, prompt.user)
          const unwrapped = answerIn(reply)
          if (unwrapped.kind === 'not-an-answer') notAnAnswer = unwrapped.because
          return unwrapped.kind === 'answer' ? unwrapped.text : ''
        },
      }
      const search: AgentSearchPort = {
        search: async (query) => (await options.search.search(query)).map((hit) => ({ url: hit.url, title: hit.url, snippet: hit.content })),
      }

      /* WHAT FOLLOWED EARLIER TEACHING, as observed episodes the loop's own
         memory can find -- a read-only view of the server's evidence. */
      const agent = createAgent({ model, search, now, persistence: inMemoryPersistence(episodesOf(request, now())) })
      const out = await agent.ask({ parts: [{ modality: 'text', content: request.question }], at: now() })

      /* THE `reason` SEAM. Asked only when the loop's own reading was unclear
         by the router's rule; its plan is folded into the rationale and the
         trace, never substituted for the router's selection. */
      const reasoned: Reasoned = options.registry === undefined
        ? { asked: false, compose: [], unknowns: [], modelCalls: 0 }
        : await reasonAbout({ question: request.question, understanding: out.trace.understanding, registry: options.registry, chat: (system, user) => chat(system, user), ...(request.experience === undefined ? {} : { experience: request.experience }) })
      modelCalls += reasoned.modelCalls

      const rationale = [
        ...Object.entries(out.result.plan.rationale).map(([cap, why]) => `${cap}: ${why}`),
        ...reasoned.compose.map((c) => `reasoner: ${c.capability} because ${c.because}`),
      ].join('; ')
      /* When the loop ASKS, its `answer` is a preface to the question, not
         teaching (live run 3), so no explanation is proposed -- only the ask. */
      const asksFirst = out.result.question !== undefined
      const actions: LearningAction[] = notAnAnswer !== null || asksFirst ? [] : [
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
        ...(notAnAnswer === null ? [] : [{ what: 'the reasoner gave no answer', because: notAnAnswer, blocking: true }]),
        ...reasoned.unknowns,
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
        trace: { ...out.trace, reasoner: reasoned },
      }
    },
  }
}


/** What a JSON-mode reply holds, by the one agreed key. */
function answerIn(reply: string): { kind: 'answer'; text: string } | { kind: 'not-an-answer'; because: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(reply)
  } catch {
    return { kind: 'answer', text: reply }
  }
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const answer = (parsed as Record<string, unknown>)['answer']
    if (typeof answer === 'string' && answer.trim().length > 0) return { kind: 'answer', text: answer }
    return { kind: 'not-an-answer', because: `the reply is a JSON object with keys ${Object.keys(parsed as object).join(', ') || '(none)'} and no "answer"` }
  }
  return { kind: 'not-an-answer', because: `the reply is JSON but not an object with an "answer": ${reply.slice(0, 60)}` }
}

/** One observed episode per artifact the evidence named, in words the loop's memory can match to the topic. */
function episodesOf(request: TeachingRequest, at: string): MemoryRecord[] {
  const topic = request.topicName ?? request.topicId ?? 'this topic'
  return (request.experience?.artifacts ?? []).map((a) => ({
    id: `experience-${request.topicId ?? 'topic'}-${a.seq}`,
    kind: 'episode',
    content: `On "${topic}", lesson ${a.seq}: ${describe(a)}${a.movesSpent.length > 0 ? `; moves already spent: ${a.movesSpent.join(', ')}` : ''}.`,
    createdAt: at,
    updatedAt: at,
    strength: 1,
    supersedes: [],
    source: 'observed',
  }))
}

function describe(a: { pleas: number; answers: number; questions: number; empties: number; outcome: string }): string {
  switch (a.outcome) {
    case 'pleaded': return `she said she did not follow it ${a.pleas} time(s)`
    case 'answered': return `she answered on it ${a.answers} time(s)`
    case 'asked': return `she asked ${a.questions} question(s) about it`
    case 'silent': return 'she was asked and said nothing'
    default: return 'nothing followed it'
  }
}
