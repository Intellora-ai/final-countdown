import type {
  Capability,
  Claim,
  CommunicationPlan,
  MemoryRecord,
  Turn,
  TurnResult,
  Understanding,
  Verification,
  WorkingMemory,
} from './contracts'
import { NO_CONTEXT, route, type RouteContext } from './router'
import { plainText, signals, understand, type Conversation } from '../understand/understand'
import { absorb, EMPTY_WORKING, note, worthRemembering, type Store } from '../memory/memory'
import { decideSource, research, type Research, type SearchPort } from '../knowledge/knowledge'
import { run, type Registry } from '../tools/tools'
import {
  decide,
  selfCheck,
  verifyAddressesGoal,
  verifyArithmetic,
  verifyConstraints,
  verifyNoContradiction,
  verifySources,
  type SelfCheck,
} from '../verify/verify'
import {
  DEFAULT_PERSONALIZATION,
  personalize,
  planCommunication,
  readUserState,
} from '../communicate/communicate'
import { learnerFrom, teachingAdjustments, type Attempt, type ConceptGraph } from '../learn/learn'

/**
 * THE DECISION LOOP --- section 36 of the brief, in order.
 *
 *   1 understand -> 2 intent+goal -> 3 context+memory -> 4 capabilities
 *   -> 5 choose -> 6 execute -> 7 verify -> 8 communication -> 9 generate
 *   -> 10 update state and memory
 *
 * WHAT MAKES THIS A LOOP AND NOT A PROMPT
 * ---------------------------------------
 * Every stage is a function that already exists and is already tested on its
 * own. This file contains no intelligence of its own; it is wiring, and it is
 * deliberately boring. The moment it starts making decisions --- "well, if
 * it's a learning question, skip verification" --- those decisions become
 * untestable, because they only exist in the composition.
 *
 * THE HONESTY PROPERTY
 * --------------------
 * Stage 6 runs ONLY the capabilities stage 4 selected. Not a superset "just in
 * case". If the router rejected `search`, no search happens, and the returned
 * `plan.rejected` says why. That is what makes "it didn't search" a decision
 * someone can disagree with rather than a bug with nowhere to go.
 *
 * THE MODEL IS A PORT, AND IT IS THE LAST THING CALLED
 * ----------------------------------------------------
 * Understanding, routing, memory, research, verification and communication
 * planning all complete BEFORE any generation. The model is handed a finished
 * decision --- here is what they want, here is the evidence, here is how to
 * say it --- rather than being asked to work all of that out inside one
 * prompt. That ordering is the architecture: it is why the whole loop is
 * testable with a model that returns a fixed string.
 */

export interface GenerateRequest {
  understanding: Understanding
  communication: CommunicationPlan
  claims: readonly Claim[]
  working: WorkingMemory
  capabilities: readonly Capability[]
  /** Present when a tool computed something the answer must use verbatim. */
  computed: Readonly<Record<string, unknown>>
}

export interface ModelPort {
  generate(req: GenerateRequest): Promise<string>
}

export interface Ports {
  memory: Store
  tools: Registry
  model: ModelPort
  search?: SearchPort
  /** Concept graph for the learning layer. Absent means teaching is generic. */
  concepts?: ConceptGraph
  now: () => string
}

export interface Session {
  conversation: Conversation
  working: WorkingMemory
  /** Goals from recent turns, for repeat detection. */
  recentGoals: readonly string[]
  attempts: readonly Attempt[]
}

export const NEW_SESSION: Session = {
  conversation: { entities: [], topic: '', turnIndex: 0 },
  working: EMPTY_WORKING,
  recentGoals: [],
  attempts: [],
}

export interface LoopResult {
  result: TurnResult
  session: Session
  /** Everything the loop decided, for inspection and for tests. */
  trace: {
    understanding: Understanding
    context: RouteContext
    capabilities: readonly Capability[]
    sources: readonly string[]
    action: string
    research?: Research
    selfChecks: readonly SelfCheck[]
  }
}

export async function handle(turn: Turn, session: Session, ports: Ports): Promise<LoopResult> {
  const at = ports.now()
  const text = plainText(turn)

  /* ---- 1 & 2. Understand, and detect intent + goal --------------------- */
  const u = understand(turn, session.conversation)

  /* ---- 3. Load relevant context and memory ---------------------------- */
  /* Retrieved BEFORE routing, because whether anything relevant is stored is
     an input to the routing decision --- `memoryHits` is what lets the router
     leave `memory-read` off when there is genuinely nothing to load. */
  const memories = await ports.memory.retrieve({
    goal: u.goal,
    entities: u.entities.map((e) => e.label),
    limit: 5,
  })

  const ctx: RouteContext = {
    ...NO_CONTEXT,
    ...signals(turn),
    memoryHits: memories.length,
    hasOpenTask: session.working.open.length > 0,
  }

  /* ---- 4. Determine required capabilities ----------------------------- */
  const plan = route(u, ctx)
  const selected = new Set(plan.selected)

  /* ---- 5. Choose where the answer comes from -------------------------- */
  const sourceDecision = decideSource(u, ctx)

  let working = absorb(session.working, u)
  const claims: Claim[] = []
  const computed: Record<string, unknown> = {}
  const verifications: Verification[] = []
  let researchResult: Research | undefined

  /* ---- 6. Execute --- ONLY what was selected -------------------------- */

  if (selected.has('calculate')) {
    const expression = extractExpression(text)
    if (expression) {
      const out = await run(ports.tools, 'calculator', { expression })
      if (out.ok) {
        computed[expression] = out.value
        working = note(working, expression, out.value)
        /* Verified immediately, at the point the number exists. Deferring it
           to a later pass means the number can reach the prompt unchecked. */
        verifications.push(verifyArithmetic(expression, out.value as number))
      } else {
        verifications.push({
          kind: 'arithmetic',
          passed: false,
          detail: `could not compute "${expression}": ${out.error}`,
        })
      }
    }
  }

  if (selected.has('search') && ports.search) {
    researchResult = await research(ports.search, u, at, ctx.freshnessSensitive)
    claims.push(...researchResult.claims)
  }

  if (selected.has('memory-read')) {
    for (const m of memories) {
      claims.push({
        statement: m.content,
        sources: [{ kind: 'memory', ref: m.id }],
        confidence: m.strength,
      })
    }
  }

  /* ---- 7. Decide whether an answer is even the right move ------------- */
  const action = decide({
    understanding: u,
    claims,
    evidenceInsufficient: researchResult?.insufficient ?? false,
    timeSensitive: ctx.freshnessSensitive,
    searched: researchResult !== undefined,
    uncomputed: selected.has('calculate') && Object.keys(computed).length === 0,
  })

  /* ---- 8. Determine optimal communication ----------------------------- */
  const personalization = memories.length > 0 ? personalize(memories, u.language) : DEFAULT_PERSONALIZATION
  const userState = readUserState(text, session.recentGoals)

  let communication = planCommunication({
    understanding: u,
    content: text,
    personalization,
    userState,
    known: memories.filter((m) => m.kind === 'mastery').map((m) => m.content),
    teaching: selected.has('learning'),
  })

  /* THE LEARNING LAYER, LAST AND AS AN ADJUSTMENT.
     It runs only when the router selected it, it takes the plan communication
     already produced, and it returns a modified plan. It never builds one. */
  if (selected.has('learning') && ports.concepts) {
    const learner = learnerFrom(memories, ports.concepts, session.attempts)
    const concept = firstConcept(u, ports.concepts)
    if (concept) communication = teachingAdjustments(communication, learner, concept)
  }

  /* ---- 9. Generate ---------------------------------------------------- */
  let answer: string
  let question: string | undefined

  if (action.action === 'ask') {
    /* THE MODEL IS NOT CALLED. Asking is a decision the loop already made,
       and handing it to a model invites it to answer anyway --- which is
       precisely the behaviour Capability 23 exists to prevent. */
    question = u.ambiguities.find((a) => a.blocking)?.what ?? action.because
    answer = `Before I answer: ${question}`
  } else {
    answer = await ports.model.generate({
      understanding: u,
      communication,
      claims,
      working,
      capabilities: plan.selected,
      computed,
    })
  }

  /* ---- 7 again. Verify what was produced ------------------------------ */
  if (selected.has('verify') || claims.length > 0) {
    verifications.push(verifySources(claims))
  }
  verifications.push(verifyAddressesGoal(answer, u.goal))
  verifications.push(...verifyConstraints(answer, u.constraints))
  if (working.corrections.length > 0) {
    verifications.push(verifyNoContradiction(answer, working.corrections))
  }

  const selfChecks = selfCheck({
    understanding: u,
    answer,
    claims,
    verifications,
    capabilitiesUsed: plan.selected,
    corrections: working.corrections,
  })

  /* ---- 10. Update state and memory ------------------------------------ */
  const remembered: MemoryRecord[] = []
  if (selected.has('memory-write')) {
    const decision = worthRemembering(text, u)
    if (decision) {
      remembered.push(
        await ports.memory.capture({
          kind: decision.kind,
          content: decision.content,
          strength: decision.source === 'user-stated' ? 0.9 : 0.6,
          supersedes: [],
          source: decision.source,
        }),
      )
    }
  }

  const nextSession: Session = {
    conversation: {
      entities: u.entities,
      topic: u.topicShift ? u.goal : session.conversation.topic || u.goal,
      turnIndex: session.conversation.turnIndex + 1,
    },
    working,
    /* Bounded. An unbounded goal history makes repeat detection slower every
       turn and eventually matches something from an hour ago. */
    recentGoals: [...session.recentGoals, u.goal].slice(-5),
    attempts: session.attempts,
  }

  return {
    result: {
      answer,
      claims,
      verifications,
      plan,
      communication,
      remembered,
      ...(question ? { question } : {}),
    },
    session: nextSession,
    trace: {
      understanding: u,
      context: ctx,
      capabilities: plan.selected,
      sources: sourceDecision.routes,
      action: action.action,
      ...(researchResult ? { research: researchResult } : {}),
      selfChecks,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pull the arithmetic out of a sentence.
 *
 * Percentages are rewritten to division BEFORE the general scan, because "17.5%
 * of 2400" is not an expression the parser accepts and dropping the `%` would
 * silently compute 17.5 * 2400 --- a wrong answer rather than a refusal, which
 * is the worse of the two failures.
 */
export function extractExpression(text: string): string | null {
  const percent = text.match(/(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/i)
  if (percent) return `${percent[1]} / 100 * ${percent[2]}`

  const bare = text.match(/(-?\d+(?:\.\d+)?(?:\s*[-+*/^]\s*\(?\s*-?\d+(?:\.\d+)?\s*\)?)+)/)
  return bare?.[1]?.trim() ?? null
}

function firstConcept(u: Understanding, graph: ConceptGraph): string | null {
  const words = new Set(u.goal.toLowerCase().match(/[a-z]{3,}/g) ?? [])
  for (const c of graph.concepts.values()) {
    for (const w of c.label.toLowerCase().split(/\s+/)) {
      if (words.has(w)) return c.id
    }
  }
  return null
}
