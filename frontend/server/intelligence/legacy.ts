/**
 * THE LEGACY DECISION AS ONE SIGNAL.
 *
 * Today's five-action chooser (`controller.ts decideNext`) and its veto
 * (`permitted`), asked the same question the candidate is asked, so the two
 * can be compared on every request. Through this wrapper it is never obeyed:
 * the live path still calls the controller itself. A veto is reported as an
 * Unknown in the veto's own words, and the action proposed is what the app
 * would actually do, because a veto is never a dead end.
 */
import { ACTIONS, decideNext, permitted, type Action, type Situation } from '../controller.ts'
import type { ModelPort } from '../handler.ts'
import type { ActionKind } from './ir.ts'
import type { LearningIntelligence, Proposal, TeachingRequest } from './LearningIntelligence.ts'

/** Each of the chooser's actions, as the IR names it. A sixth action fails to compile here. */
const KIND_OF: Readonly<Record<Action, ActionKind>> = {
  START_LESSON: 'explain',
  EXPLAIN: 'explain',
  ANSWER: 'explain',
  PRACTICE: 'practice',
  ASK_CLARIFICATION: 'ask',
}

export interface LegacyOptions {
  readonly model: ModelPort
  readonly now?: () => number
}

export function legacyIntelligence(options: LegacyOptions): LearningIntelligence {
  const now = options.now ?? Date.now
  return {
    name: 'legacy-decision',
    async propose(request: TeachingRequest): Promise<Proposal> {
      const startedAt = now()
      const ask = options.model.decide ?? options.model.chat
      if (ask === undefined) {
        return {
          actions: [],
          unknowns: [{ what: 'the chooser has no model', because: 'neither decide nor chat is configured, and the chooser does not decide by itself', blocking: true }],
          rationale: 'no chooser was available',
          capabilities: { selected: [], rejected: [] },
          cost: { ms: now() - startedAt, modelCalls: 0 },
          trace: { chooser: 'absent', actions: ACTIONS },
        }
      }
      const situation: Situation = {
        said: request.question,
        ...(request.askedFrom === 'ask' ? {} : { lesson: request.askedFrom }),
        told: request.alreadyUsed,
      }
      let modelCalls = 0
      const decision = await decideNext((system, user) => { modelCalls += 1; return ask(system, user) }, situation)
      const verdict = permitted(decision, situation)
      const chosen = verdict.ok ? verdict.decision : verdict.instead
      return {
        actions: [{ kind: KIND_OF[chosen.action], because: chosen.reason, risk: 0, evidence: [], payload: { action: chosen.action, target: chosen.target } }],
        unknowns: verdict.ok ? [] : [{ what: 'the veto refused the chooser', because: verdict.why, blocking: false }],
        rationale: decision.reason,
        capabilities: { selected: ['legacy-decision'], rejected: [] },
        cost: { ms: now() - startedAt, modelCalls },
        trace: { decision, verdict },
      }
    },
  }
}
