import type { Capability, CapabilityPlan, Understanding } from './contracts'

/**
 * WHICH CAPABILITIES THIS REQUEST ACTUALLY NEEDS.
 *
 * A PURE FUNCTION, FOR THE SAME REASON `layout.plan` IS ONE.
 *
 * No network, no clock, no model call, no randomness. Given the same reading
 * of a request it returns the same capability set on every machine, which is
 * the only condition under which "the router chose not to search" is a fact
 * that can be asserted in a test rather than an anecdote about one run.
 *
 * The alternative — asking a model "which capabilities do you need?" — cannot
 * be tested, cannot be explained, and gets more expensive exactly when the
 * request is cheap. A one-line greeting would pay for a model call to discover
 * that it needs no capabilities.
 *
 * MINIMALITY IS THE PRODUCT, NOT AN OPTIMISATION
 * ----------------------------------------------
 * The failure this exists to prevent is the learning product that routes
 * "what's the weather" through a teaching prompt, wakes the learner model,
 * loads memory, and answers a simple question as though it were a lesson. So
 * the default for every capability is OFF, each one is switched on by a named
 * rule, and `rejected` records why the others stayed off. A capability that
 * cannot say why it woke up is a capability that will wake up for everything.
 *
 * WHY `rejected` IS POPULATED EVEN THOUGH NOTHING READS IT AT RUNTIME
 * ------------------------------------------------------------------
 * "It didn't search" and "it decided not to search because nothing in the
 * request was time-sensitive" look identical from outside. The first is a bug
 * report with nowhere to go. The second is a decision someone can disagree
 * with. Recording the rejection is what turns an absence into a decision.
 */

/**
 * Everything the router needs that is not a property of the words themselves.
 *
 * Kept separate from `Understanding` on purpose: `Understanding` is what the
 * request MEANS, and this is what the WORLD currently offers. The same
 * sentence routes differently when a file is attached or a task is open, and
 * folding those into the reading of the sentence would make the reading
 * untestable in isolation.
 */
export interface RouteContext {
  /** A file, image, or document arrived with this turn. */
  hasAttachments: boolean
  /** A task from an earlier session is paused and resumable. */
  hasOpenTask: boolean
  /** The request depends on the state of the world right now. */
  freshnessSensitive: boolean
  /** Something in the request must be computed rather than recalled. */
  hasComputation: boolean
  /** Code is present, or the goal is about code. */
  hasCode: boolean
  /** Long-term memory holds something relevant. 0 means "nothing to load". */
  memoryHits: number
  /** The request asks to change the world, not just describe it. */
  requestsSideEffect: boolean
}

export const NO_CONTEXT: RouteContext = {
  hasAttachments: false,
  hasOpenTask: false,
  freshnessSensitive: false,
  hasComputation: false,
  hasCode: false,
  memoryHits: 0,
  requestsSideEffect: false,
}

/** Below this, the top intent is a guess and the router should consider asking. */
const SHAKY = 0.5

/**
 * Multi-step work worth planning rather than just doing.
 *
 * Two is not enough --- "read this and summarise it" is two steps and wants no
 * plan. Planning a request that has one obvious order is overhead the user
 * pays for in latency and reads as the agent stalling.
 */
const PLAN_THRESHOLD = 3

type Ledger = {
  selected: Set<Capability>
  rationale: Record<string, string>
  rejected: Record<string, string>
}

function select(l: Ledger, cap: Capability, why: string): void {
  l.selected.add(cap)
  l.rationale[cap] = why
  // A capability cannot be both chosen and refused. If an earlier rule
  // rejected it and a later one needs it, the selection is what happened.
  delete l.rejected[cap]
}

function reject(l: Ledger, cap: Capability, why: string): void {
  if (l.selected.has(cap)) return
  l.rejected[cap] = why
}

/**
 * The order capabilities run in.
 *
 * Not the order they were selected in --- selection is a set of independent
 * rules and says nothing about sequence. This is a genuine dependency order:
 * memory must load before reasoning can use it, verification must come after
 * the thing it verifies, and communication is last because it decides how to
 * say whatever the others produced.
 */
const ORDER: readonly Capability[] = [
  'memory-read',
  'files',
  'search',
  'calculate',
  'code',
  'tools',
  'knowledge',
  'reason',
  'plan',
  'act',
  'verify',
  'learning',
  'memory-write',
  'ask',
  'communicate',
]

export function route(u: Understanding, ctx: RouteContext = NO_CONTEXT): CapabilityPlan {
  const l: Ledger = { selected: new Set(), rationale: {}, rejected: {} }

  const kinds = new Set(u.intents.map((i) => i.kind))
  const top = u.intents[0]
  const has = (...k: readonly string[]) => k.some((x) => kinds.has(x as never))

  /* ---------------------------------------------------------------------- */
  /* Always on                                                              */
  /* ---------------------------------------------------------------------- */

  /* Every request produces something a human reads, so something always has
     to decide how to say it. Listing it explicitly rather than treating it as
     ambient is what lets a test assert that the communication layer ran. */
  select(l, 'communicate', 'every result must be communicated')

  /* ---------------------------------------------------------------------- */
  /* Memory                                                                 */
  /* ---------------------------------------------------------------------- */

  if (has('memory-write')) {
    select(l, 'memory-write', 'the user asked for something to be remembered')
  }

  if (has('memory-read', 'continuation')) {
    select(l, 'memory-read', 'the request refers to something from before this turn')
  } else if (ctx.memoryHits > 0) {
    select(l, 'memory-read', `${ctx.memoryHits} relevant memories exist`)
  } else {
    reject(l, 'memory-read', 'nothing stored is relevant to this request')
  }

  /* Learning needs the learner's history to be worth anything --- "teach me
     rotational motion" answered without knowing what they already know is a
     textbook, not teaching. */
  if (has('learning')) {
    select(l, 'memory-read', 'teaching requires the learner state to adapt to')
  }

  /* ---------------------------------------------------------------------- */
  /* Where the information comes from                                       */
  /* ---------------------------------------------------------------------- */

  if (ctx.hasAttachments) {
    select(l, 'files', 'the user attached something the answer must be grounded in')
  } else {
    reject(l, 'files', 'nothing was attached')
  }

  /* THE RULE THAT KEEPS THE AGENT FROM SEARCHING FOR EVERYTHING.
     Research is an explicit ask. Otherwise the web is only worth the latency
     when the answer actually moves --- "what is photosynthesis" has not
     changed and searching it is pure cost. */
  if (has('research')) {
    select(l, 'search', 'the user asked for current information from sources')
  } else if (ctx.freshnessSensitive) {
    select(l, 'search', 'the answer depends on the state of the world right now')
  } else {
    reject(l, 'search', 'the answer does not change with time')
  }

  /* Model knowledge is the default source, and it is NOT selected when the
     answer must come from somewhere else. Leaving it on alongside search is
     how a cited answer quietly acquires an uncited sentence. */
  if (has('information', 'explanation', 'comparison', 'recommendation', 'learning', 'troubleshooting')) {
    select(l, 'knowledge', 'the answer draws on what the model already knows')
  } else if (has('conversation') && kinds.size === 1) {
    reject(l, 'knowledge', 'small talk needs no knowledge lookup')
  } else {
    reject(l, 'knowledge', 'the request is an action, not a question')
  }

  /* ---------------------------------------------------------------------- */
  /* Computation and code                                                   */
  /* ---------------------------------------------------------------------- */

  /* CAPABILITY 21'S WHOLE POINT. Reasoning ABOUT a calculation and PERFORMING
     one are different acts, and a model that does the first while claiming the
     second is the single most reliable way to produce a confident wrong
     number. If there is arithmetic, it gets executed. */
  if (has('calculation') || ctx.hasComputation) {
    select(l, 'calculate', 'there is arithmetic here, and it must be executed rather than estimated')
  } else {
    reject(l, 'calculate', 'nothing here needs computing')
  }

  if (has('coding') || ctx.hasCode) {
    select(l, 'code', 'the request is about code')
  } else {
    reject(l, 'code', 'no code is involved')
  }

  /* `tools` is the execution substrate the three above run ON, so it follows
     rather than leads. Selecting it independently would let a plan claim tool
     use with nothing to run. */
  if (l.selected.has('calculate') || l.selected.has('code') || l.selected.has('search') || l.selected.has('files')) {
    select(l, 'tools', 'the selected capabilities execute through tools')
  } else {
    reject(l, 'tools', 'nothing selected needs to run anything')
  }

  /* ---------------------------------------------------------------------- */
  /* Thinking, planning, doing                                              */
  /* ---------------------------------------------------------------------- */

  /* Deliberately NOT always-on. A greeting reasoned about is a greeting
     answered slowly. */
  if (
    has(
      'explanation', 'comparison', 'troubleshooting', 'planning', 'coding',
      'calculation', 'recommendation', 'learning', 'research', 'action',
    )
  ) {
    select(l, 'reason', 'the answer has to be worked out, not recalled')
  } else {
    reject(l, 'reason', 'the request is answered by recall or by acknowledgement')
  }

  const steps = u.constraints.length + u.intents.length
  if (has('planning')) {
    select(l, 'plan', 'the user asked for a plan')
  } else if (steps >= PLAN_THRESHOLD) {
    select(l, 'plan', `${steps} distinct requirements need sequencing`)
  } else {
    reject(l, 'plan', 'the work has one obvious order')
  }

  if (has('action') || ctx.requestsSideEffect) {
    select(l, 'act', 'the request changes something rather than describing it')
  } else {
    reject(l, 'act', 'nothing is being changed')
  }

  /* ---------------------------------------------------------------------- */
  /* Verification                                                           */
  /* ---------------------------------------------------------------------- */

  /* Verify what can be CHECKED and would MATTER if wrong. A definition has no
     verification path short of searching for it, so asserting one would be
     theatre; a number, a program, a cited claim and a side effect all have
     real ones. */
  const checkable: readonly Capability[] = ['calculate', 'code', 'search', 'act']
  const why = checkable.filter((c) => l.selected.has(c))
  if (why.length > 0) {
    select(l, 'verify', `${why.join(', ')} produce results that can be checked and matter if wrong`)
  } else {
    reject(l, 'verify', 'nothing here has a verification path that is not theatre')
  }

  /* ---------------------------------------------------------------------- */
  /* Asking                                                                 */
  /* ---------------------------------------------------------------------- */

  /* CAPABILITY 23 INVERTED. The instruction is "do not optimise for always
     answering", and the way an agent violates it is not by refusing --- it is
     by resolving an ambiguity silently in the direction that lets it answer.
     But asking about EVERY looseness is its own failure: an agent that cannot
     proceed without a clarifying question is not careful, it is unusable.
     Hence two rules, because there are two different failures.

     A BLOCKING ambiguity is decisive on its own and no confidence score can
     override it. "fix it" with nothing yet named is a confident intent with
     no referent --- being sure about the verb says nothing about the noun. An
     earlier version gated this on intent confidence and let it straight
     through, which read as a threshold that needed tuning and was actually a
     type that needed splitting. */
  const blocking = u.ambiguities.find((a) => a.blocking)
  if (blocking) {
    select(l, 'ask', `cannot proceed: ${blocking.what}`)
  } else if (u.ambiguities.length > 0 && (!top || top.confidence < SHAKY)) {
    select(l, 'ask', `the request is loose (${u.ambiguities[0]?.what}) and no reading is confident`)
  } else if (u.ambiguities.length > 0) {
    reject(l, 'ask', 'loose, but one reading is clearly the intended one')
  } else {
    reject(l, 'ask', 'the request is clear')
  }

  /* ---------------------------------------------------------------------- */
  /* The specialised layer                                                  */
  /* ---------------------------------------------------------------------- */

  /* THE LINE THIS WHOLE ARCHITECTURE EXISTS TO DRAW.
     Learning is one capability among fifteen, reached by a rule, and off by
     default. It is not the entry point, it does not wrap the others, and no
     other capability is routed through it. "Tell me something unrelated to
     education" must leave this off, and that is a test, not a hope. */
  if (has('learning')) {
    select(l, 'learning', 'the user asked to be taught, not merely told')
  } else {
    reject(l, 'learning', 'this is a request for an answer, not for teaching')
  }

  const selected = ORDER.filter((c) => l.selected.has(c))
  return { selected, rationale: l.rationale, rejected: l.rejected }
}
