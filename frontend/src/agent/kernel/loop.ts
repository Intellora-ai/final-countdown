import type {
  Capability,
  Claim,
  CommunicationPlan,
  MemoryRecord,
  Step,
  TaskState,
  Turn,
  TurnResult,
  Understanding,
  Verification,
  WorkingMemory,
} from './contracts'
import { NO_CONTEXT, route, type RouteContext } from './router'
import {
  attachments,
  plainText,
  signals,
  understand,
  type Conversation,
} from '../understand/understand'
import {
  absorb,
  assume,
  closeStep,
  EMPTY_WORKING,
  note,
  openStep,
  worthRemembering,
  type Store,
} from '../memory/memory'
import { decideSource, research, type Research, type SearchPort } from '../knowledge/knowledge'
import { chain, recover, run, type Registry } from '../tools/tools'
import {
  decide,
  selfCheck,
  verifyAddressesGoal,
  verifyArithmetic,
  verifyConstraints,
  verifyNoContradiction,
  verifyAndRepair,
  verifySources,
  type Repair,
  type Repairable,
  type SelfCheck,
  type VerifyResult,
} from '../verify/verify'
import {
  DEFAULT_PERSONALIZATION,
  personalize,
  planCommunication,
  readUserState,
} from '../communicate/communicate'
import {
  dueForReview,
  feedbackFor,
  learnerFrom,
  NEW_LEARNER,
  nextDifficulty,
  nextReview,
  teachingAdjustments,
  whatNext,
  type Attempt,
  type ConceptGraph,
  type Feedback,
  type Recommendation,
} from '../learn/learn'
import {
  planFrom,
  progress,
  replan,
  resume,
  runTask,
  startTask,
  summary,
  type Executor,
  type StepSpec,
} from '../execute/execute'
import type { Ledger } from '../session/ledger'
import { continuityOf, foldTurn, turnId, type Continuity } from '../session/wire'
import {
  build as buildWorld,
  explain,
  impactOf,
  inconsistencies,
  prerequisitesOf,
  type World,
} from '../world/world'

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
  /**
   * Set only on a repair pass: the checks the previous answer failed.
   *
   * Its presence is the difference between "answer this" and "your last answer
   * missed the word limit and cited nothing --- fix those two things". A
   * repair prompt without the failure list is a re-roll, and a re-roll fails
   * the same check about as often as it passes it.
   */
  mustFix?: readonly string[]
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
  /**
   * The task in flight, carried between turns.
   *
   * This is what makes "continue what we started yesterday" a property of the
   * system rather than a promise. It is plain serialisable data for exactly
   * that reason --- see the header of `execute.ts`.
   */
  task?: TaskState
  /**
   * The teaching ledger, when this session is teaching something.
   *
   * OPTIONAL, AND THAT IS A DESIGN DECISION RATHER THAN A CONVENIENCE. A
   * session without one behaves exactly as it did before this field existed:
   * no interruption bookkeeping, no position, no evidence log. That keeps the
   * change opt-in, so every existing caller and every existing test is
   * unaffected, and it keeps the honest reading of "we are not teaching
   * anything" available --- an agent answering a one-off question should not
   * be carrying a lesson position it invented.
   *
   * `task` answers "what work is in flight". This answers "where is the
   * lesson". They looked like the same question until the measurement showed a
   * teaching conversation produces no task at all: `plan` is rejected as "the
   * work has one obvious order" for every phrasing of "teach me X", so after
   * fourteen teaching turns `task` was still `NONE`.
   */
  ledger?: Ledger
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
    /** Set when a port failed and the turn continued without it. */
    degraded?: string
    /** True when memory was unavailable, so personalisation was skipped. */
    memoryUnavailable: boolean
    /**
     * Capabilities that actually DID something this turn.
     *
     * THIS FIELD EXISTS BECAUSE ITS ABSENCE HID A REAL BUG. The router
     * selected `files`, `plan`, `act`, `code` and `tools`; the loop had no
     * branch for any of them; the end-to-end tests asserted on
     * `plan.selected` and passed. A trace that reports a decision without
     * reporting the effect is an audit trail that lies, and it lies in the
     * most expensive direction --- everything looks wired.
     *
     * The invariant, asserted by test: every selected capability appears in
     * `executed` or in `unmet`. Never neither.
     */
    executed: readonly Capability[]
    /**
     * Capabilities selected but not carried out, and precisely why.
     *
     * Not a failure list. "You asked me to read your file and no file tool is
     * registered" is a correct, useful outcome; silently answering anyway is
     * not.
     */
    unmet: Readonly<Record<string, string>>
    /** Set when the turn reasoned over a causal model. */
    world?: World
    /** Set when the learning layer ran. */
    teaching?: Teaching
    /**
     * Where the lesson is, and what the record actually supports.
     *
     * Present only when this session is teaching --- see `Session.ledger`. It
     * is on the trace rather than inside the answer because the caller needs to
     * READ it: "are we mid-detour", "is this lesson finished", and "did the
     * student just claim something the log cannot back" are decisions for
     * whatever is driving the lesson, not sentences for the model to compose.
     */
    continuity?: Continuity
  }
}

/** What the learning layer worked out this turn, surfaced rather than buried. */
export interface Teaching {
  next: readonly Recommendation[]
  due: readonly string[]
  difficulty: number
  reviewAt: string
  feedback?: Feedback
}

export async function handle(turn: Turn, session: Session, ports: Ports): Promise<LoopResult> {
  const at = ports.now()
  const text = plainText(turn)

  /* ---- 1 & 2. Understand, and detect intent + goal --------------------- */
  const u = understand(turn, session.conversation)

  /* ---- 2a. Fold the turn into the teaching ledger, if we are teaching ----
   *
   * BEFORE ROUTING, because the ledger is a record of what the student did and
   * that is true regardless of which capabilities the router goes on to pick.
   * Putting it after would make the evidence log conditional on the routing
   * decision, and a history that only records the turns the router found
   * interesting is not a history.
   *
   * `foldTurn` is where an utterance becomes a teaching move: a change of
   * subject pushes the current position so it can be returned to, and a request
   * to continue pops it. Both are decided from `Understanding`, which is why
   * this sits here and not in `wire.ts`'s caller. */
  const ledger = session.ledger ? foldTurn(session.ledger, u, at, turnId(turn)) : undefined

  /* ---- 3. Load relevant context and memory ---------------------------- */
  /* Retrieved BEFORE routing, because whether anything relevant is stored is
     an input to the routing decision --- `memoryHits` is what lets the router
     leave `memory-read` off when there is genuinely nothing to load. */
  /* EVERY PORT CALL IN THIS FILE IS A BOUNDARY, AND EACH ONE DEGRADES.
     `research()` already does this for search; nothing else did, and the test
     block asserting "the loop never throws" only faulted search --- the one
     port that could not fail it. The rule now: a port that fails costs the
     capability it provides, never the turn.

     Memory is an ENHANCEMENT. A store that is down should cost
     personalisation and prior context, not the answer. */
  let memories: readonly MemoryRecord[] = []
  let memoryFailed = false
  try {
    memories = await ports.memory.retrieve({
      goal: u.goal,
      entities: u.entities.map((e) => e.label),
      limit: 5,
    })
  } catch {
    memoryFailed = true
  }

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

  /* Set when a port failed and the turn continued without it. Surfaced on the
     trace so a degraded turn is DISTINGUISHABLE from a healthy one --- a
     system that silently drops memory or the model and returns something
     anyway is the failure this whole boundary layer exists to prevent. */
  let degraded: string | undefined

  let working = absorb(session.working, u)
  const claims: Claim[] = []
  const computed: Record<string, unknown> = {}
  const verifications: Verification[] = []
  let researchResult: Research | undefined

  /* ---- 6. Execute --- ONLY what was selected -------------------------- */

  /* EVERY SELECTED CAPABILITY ENDS UP IN ONE OF THESE TWO SETS.
     See `trace.executed` for what went wrong when it did not. `couldNot` is
     not an error channel: "you asked me to read a file and no file tool is
     registered" is a correct outcome, and the only wrong move is to say
     nothing and answer anyway. */
  const executed = new Set<Capability>()
  const unmet: Record<string, string> = {}

  /* THE SELECTION GUARD LIVES HERE, NOT AT EACH CALL SITE.
     `executed` must be a subset of `selected` --- a trace that over-claims is
     exactly as misleading as one that under-reports, and "communicate always
     runs" is the kind of reasonable-sounding exception that puts an unselected
     capability into the record. Enforcing it in one place means no future
     branch can get it wrong. */
  const didRun = (c: Capability) => void (selected.has(c) && executed.add(c))
  const couldNot = (c: Capability, why: string) => void (selected.has(c) && (unmet[c] = why))

  let world: World | undefined
  let task: TaskState | undefined = session.task

  /* --- memory-read ------------------------------------------------------ */
  if (selected.has('memory-read')) {
    if (memoryFailed) {
      couldNot('memory-read', 'the memory store was unavailable')
    } else {
      for (const m of memories) {
        claims.push({
          statement: m.content,
          sources: [{ kind: 'memory', ref: m.id }],
          confidence: m.strength,
        })
      }
      didRun('memory-read')
    }
  }

  /* --- files ------------------------------------------------------------ */
  /* THE CAPABILITY THAT WAS SELECTED AND NEVER EXECUTED. The router turned
     `files` on whenever something was attached, the loop had no branch, and
     the trace still reported `files` among the capabilities used --- so
     "summarise the PDF I sent" produced an answer from the model's own
     knowledge with an audit trail claiming the file had been read. */
  if (selected.has('files')) {
    const attached = attachments(turn)
    if (!ports.tools.get('read_file') || !ports.tools.get('search_files')) {
      couldNot('files', 'no file tools are registered, so nothing could be read')
    } else if (attached.length === 0) {
      couldNot('files', 'the turn was routed to files but carried no attachment')
    } else {
      /* FIND, THEN READ --- a real two-step chain rather than two calls with a
         hopeful path in between. `chain` stops at the first failure and hands
         back the partial trace, which is what makes the failure reportable
         instead of merely absent. */
      const found = await chain(ports.tools, [
        { tool: 'search_files', args: () => ({ query: firstKeyword(u.goal) }) },
        { tool: 'read_file', args: (hits) => ({ path: firstPath(hits, attached) }) },
      ])
      if (found.ok) {
        claims.push({
          statement: String(found.value).slice(0, FILE_CLAIM_CHARS),
          sources: [{ kind: 'file', ref: firstPath(found.attempts[0]?.result.value, attached) }],
          confidence: 0.9,
        })
        didRun('files')
      } else {
        const failure = found.attempts[found.attempts.length - 1]?.result
        const next = failure ? recover(failure) : { action: 'give-up', why: 'no attempt was made' }
        couldNot('files', `${failure?.error ?? 'unknown'} --- ${next.action}: ${next.why}`)
      }
    }
  }

  /* --- search ----------------------------------------------------------- */
  if (selected.has('search')) {
    if (!ports.search) {
      couldNot('search', 'no search port is configured')
    } else {
      researchResult = await research(ports.search, u, at, ctx.freshnessSensitive)
      claims.push(...researchResult.claims)
      didRun('search')
    }
  }

  /* --- calculate -------------------------------------------------------- */
  if (selected.has('calculate')) {
    const expression = extractExpression(text)
    if (!expression) {
      couldNot('calculate', 'no arithmetic expression could be extracted from the text')
    } else {
      const out = await run(ports.tools, 'calculator', { expression })
      if (out.ok) {
        computed[expression] = out.value
        working = note(working, expression, out.value)
        /* Verified immediately, at the point the number exists. Deferring it
           to a later pass means the number can reach the prompt unchecked. */
        verifications.push(verifyArithmetic(expression, out.value as number))
        didRun('calculate')
      } else {
        verifications.push({
          kind: 'arithmetic',
          passed: false,
          detail: `could not compute "${expression}": ${out.error}`,
        })
        couldNot('calculate', `${out.error} --- ${recover(out).action}`)
      }
    }
  }

  /* --- code ------------------------------------------------------------- */
  /* There is no code-execution tool in this substrate, and inventing one here
     would be the wrong place for it. What matters is that the absence is
     STATED: a `code` capability that is selected and silently skipped is
     indistinguishable, from the outside, from one that ran. */
  if (selected.has('code')) {
    const runner = ports.tools.select('run execute code', 1)[0]
    if (!runner) {
      couldNot('code', 'no code-execution tool is registered; the answer is reasoning, not a run')
    } else {
      const out = await run(ports.tools, runner.name, { source: text }, { allowEffects: false })
      if (out.ok) {
        computed[runner.name] = out.value
        didRun('code')
      } else {
        couldNot('code', `${out.error} --- ${recover(out).action}`)
      }
    }
  }

  /* --- reason ----------------------------------------------------------- */
  /* THE CAUSAL MODEL, BUILT FROM WHAT THIS TURN ACTUALLY HAS. Everything the
     agent has been told this turn --- the user's own words plus every claim
     retrieved --- is one body of text, and relations extracted across that
     whole body can contradict each other in ways no single sentence does.
     That is the point: `inconsistencies` finds "X prevents Y" sitting next to
     "X enables Y" when the two arrived from different sources. */
  if (selected.has('reason')) {
    world = buildWorld([text, ...claims.map((c) => c.statement)].join('. '))
    if (world.relations.length === 0) {
      couldNot('reason', 'no causal or structural relations could be extracted from the material')
    } else {
      for (const bad of inconsistencies(world)) {
        verifications.push({
          kind: 'logical',
          passed: false,
          detail: bad.message,
        })
      }
      /* A CAUSAL CHAIN IS EVIDENCE, and it is the kind a language model is
         worst at holding on its own: it will happily assert A causes C without
         ever having represented B. Handing the path over as a claim means the
         explanation is grounded in an extracted structure rather than in the
         model's willingness to sound confident. */
      const subjects = u.entities.map((e) => e.label.toLowerCase())
      const from = subjects[0]
      const to = subjects[subjects.length - 1]
      const path = from && to && from !== to ? explain(world, from, to) : null
      if (path && path.length > 2) {
        claims.push({
          statement: `${path.join(' -> ')}`,
          sources: [{ kind: 'reasoning', ref: 'causal-chain' }],
          confidence: 0.6,
        })
      }
      for (const need of from ? prerequisitesOf(world, from) : []) {
        working = openStep(working, `establish: ${need}`)
      }

      /* WHAT ELSE MOVES IF THIS DOES. `impactOf` walks ACROSS relation kinds
         rather than along one, which is the difference between "heating causes
         expansion" and the full set of things a change to the subject reaches.
         It is the question a causal model is for and the one a language model
         answers worst, because answering it well requires having represented
         the intermediate steps rather than recalling a plausible-sounding
         consequence. */
      const downstream = from ? impactOf(world, from) : []
      if (downstream.length > 0) {
        claims.push({
          statement: `changing ${from} reaches: ${downstream.join(', ')}`,
          sources: [{ kind: 'reasoning', ref: 'impact-analysis' }],
          confidence: 0.55,
        })
      }
      didRun('reason')
    }
  }

  /* --- plan ------------------------------------------------------------- */
  /* Resumed BEFORE a new plan is considered, because "carry on with what we
     started" and "start something" are different turns and the wrong order
     silently discards yesterday's work. */
  if (task && task.status === 'paused') {
    task = resume(task, at)
  }

  if (selected.has('plan')) {
    if (task && task.status === 'active' && !u.topicShift) {
      /* An existing task plus new requirements is a REVISION, recorded as one.
         Building a second plan would leave two tasks both claiming the goal. */
      const extra = stepsFor(u, text).filter(
        (s) => !task?.plan.steps.some((existing) => existing.goal === s.goal),
      )
      task =
        extra.length > 0
          ? replan(task, `new requirements arrived: ${extra.map((s) => s.goal).join(', ')}`, extra, at)
          : task
      didRun('plan')
    } else {
      const specs = stepsFor(u, text)
      if (specs.length === 0) {
        couldNot('plan', 'the goal did not decompose into more than one step')
      } else {
        try {
          task = startTask(u, planFrom(u.goal, specs), at)
          didRun('plan')
        } catch (e) {
          /* `planFrom` refuses impossible plans at construction. A refusal is
             information, not an outage. */
          couldNot('plan', e instanceof Error ? e.message : String(e))
        }
      }
    }
  }

  /* --- act -------------------------------------------------------------- */
  if (selected.has('act')) {
    /* ACTING DOES NOT REQUIRE HAVING BEEN ASKED FOR A PLAN.
       The router selects `act` on an intent to change the world and `plan` on
       an intent to sequence work, and those are different questions with
       different answers --- "delete my old notes and send the summary" is the
       first and not the second. This branch used to require a task and report
       `act` unmet whenever `plan` had not also fired, which made the capability
       structurally unreachable on exactly the requests it exists for.
       Measured on five action-shaped requests: two selected `act`, and both
       reported "nothing was planned".

       So a plan is built here when one is needed. The steps are the actions
       the user listed, which is the same decomposition `plan` uses --- there
       was never a second thing to work out, only a missing call. */
    if (!task) {
      const specs = stepsFor(u, text)
      if (specs.length > 0) {
        try {
          task = startTask(u, planFrom(u.goal, specs), at)
        } catch (e) {
          couldNot('act', e instanceof Error ? e.message : String(e))
        }
      }
    }
    if (!task) {
      couldNot('act', 'the request named no steps that could be carried out')
    } else {
      const executor = stepExecutor(ports, text)
      task = await runTask(task, executor, { now: ports.now, budget: STEP_BUDGET })
      for (const step of task.plan.steps) {
        working =
          step.state === 'done'
            ? closeStep(working, step.goal)
            : step.state === 'pending'
              ? openStep(working, step.goal)
              : working
      }
      const p = progress(task)
      working = note(working, 'task', summary(task))
      verifications.push({
        kind: 'completeness',
        passed: p.failed === 0 && p.blocked === 0,
        detail: summary(task),
      })
      didRun('act')
    }
  }

  /* --- tools ------------------------------------------------------------ */
  /* `tools` is not a capability of its own so much as the statement that the
     selected work executes through the registry. It is met when anything
     actually went through it this turn. */
  if (selected.has('tools')) {
    const throughRegistry = (['calculate', 'files', 'code', 'act'] as const).some((c) =>
      executed.has(c),
    )
    if (throughRegistry) didRun('tools')
    else couldNot('tools', 'no selected capability ended up invoking a tool')
  }

  /* --- knowledge -------------------------------------------------------- */
  /* Met by generation, below. Recorded here so the ordering of this block
     matches the router's ORDER and nothing is left implicit. */

  /* A NON-BLOCKING AMBIGUITY IS AN ASSUMPTION, AND IT GETS WRITTEN DOWN.
     The loop already decided not to stop for these. Proceeding silently is
     what makes an answer feel authoritative when it rested on a guess. */
  for (const a of u.ambiguities) {
    if (!a.blocking) working = assume(working, a.what)
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
     already produced, and it returns a modified plan. It never builds one.

     THIS IS ALSO WHERE THE LAYER BOUNDARY IS ENFORCED IN PRACTICE. Everything
     above ran identically whether or not this turn is a lesson --- the general
     layer was never told it was teaching. If any decision above started
     branching on `selected.has('learning')`, the learning layer would have
     stopped being a layer and become a mode, which is the specific failure the
     brief names. */
  let teaching: Teaching | undefined
  if (selected.has('learning')) {
    if (!ports.concepts) {
      couldNot('learning', 'no concept graph is configured, so teaching cannot adapt to the learner')
    } else {
      /* A LEARNER BUILT FROM AN UNAVAILABLE STORE IS NOT A BEGINNER.
         `learnerFrom([])` and "we could not read what they know" produce the
         same empty mastery map, and treating them the same means a memory
         outage silently restarts someone at lesson one. `NEW_LEARNER` is used
         explicitly here so the two cases are at least written down as
         different, and so `teaching.next` is understood as a default rather
         than as a finding about this person. */
      const learner = memoryFailed
        ? NEW_LEARNER
        : learnerFrom(memories, ports.concepts, session.attempts)
      const concept = firstConcept(u, ports.concepts)

      /* WHAT TO TEACH, HOW HARD, AND WHEN TO COME BACK --- computed, not
         improvised inside a prompt. A model asked to "pick an appropriate
         difficulty" has no access to the attempt history that makes the answer
         determinate, and will pick something plausible instead. */
      /* FEEDBACK IS OWED ONLY WHEN SOMETHING WAS ACTUALLY GOT WRONG. Attaching
         it to every teaching turn produces corrective language aimed at a
         mistake the learner did not make, which reads as condescension and is
         the fastest way to lose someone. */
      const lastOnConcept = [...learner.attempts]
        .filter((a) => a.conceptId === concept)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .pop()

      teaching = {
        next: whatNext(learner, ports.concepts),
        due: dueForReview(learner, at),
        difficulty: nextDifficulty(learner.attempts),
        reviewAt: concept ? nextReview(learner.attempts, concept, at) : at,
        ...(concept && lastOnConcept && !lastOnConcept.correct
          ? { feedback: feedbackFor(concept, learner, text, u.goal) }
          : {}),
      }

      if (concept) communication = teachingAdjustments(communication, learner, concept)
      didRun('learning')
    }
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
    didRun('ask')
    if (selected.has('knowledge')) {
      couldNot('knowledge', 'the turn stopped to ask rather than answering')
    }
  } else {
    if (selected.has('ask')) {
      couldNot('ask', 'the ambiguity did not block, so the turn proceeded on a stated assumption')
    }
    try {
      answer = await ports.model.generate({
        understanding: u,
        communication,
        claims,
        working,
        capabilities: plan.selected,
        computed,
      })
    } catch (e) {
      /* THE MOST IMPORTANT BOUNDARY IN THE FILE.
         This is the only network call in the loop and the likeliest thing to
         fail, and every other stage --- reading, routing, memory, research,
         computation, verification --- has already SUCCEEDED by the time it
         does. Throwing here discards all of that work and hands the caller an
         unhandled rejection.

         The degraded answer SAYS it failed. An empty string would be
         indistinguishable from a real answer, and a cheerful apology would be
         worse: verification runs over whatever is returned, so a fabricated
         answer would be checked and reported on as though it were one. */
      const why = e instanceof Error ? e.message : String(e)
      answer =
        `I worked out what to do but could not produce the answer: ${why}. ` +
        `Nothing above this point failed, so retrying is likely to work.`
      degraded = why
    }
    if (selected.has('knowledge')) {
      if (degraded) couldNot('knowledge', `the model port failed: ${degraded}`)
      else didRun('knowledge')
    }
  }

  /* ---- 7 again. Verify what was produced, and FIX IT ------------------ */
  /* This block used to check the answer and then do nothing about a failure.
     Reporting `passed: false` and shipping the answer unchanged is a strange
     halfway house: the system knows the answer misses a stated constraint and
     hands it over anyway, with the evidence attached where nobody reads it.
     GENERATE -> CHECK -> DETECT -> REPAIR -> CHECK AGAIN, bounded. */
  /* A QUESTION IS NOT AN ANSWER, AND MUST NOT BE CHECKED AS ONE.
     When the loop correctly stops to ask, the "answer" is
     `Before I answer: "it" refers to something not yet named`, and
     `verifyAddressesGoal` duly reports that it does not address the goal. It
     does not, by design. That is a verification failing on a turn that did the
     right thing, and a record where correct behaviour looks like a defect is a
     record people stop reading --- the same reason a linter nobody trusts gets
     switched off. The goal-addressing and constraint checks are therefore
     skipped when asking; source integrity still applies, because a question
     that cites something has still cited it. */
  const answering = action.action !== 'ask'

  const checks = (s: Repairable): readonly Verification[] => [
    ...(selected.has('verify') || s.claims.length > 0 ? [verifySources(s.claims)] : []),
    ...(answering ? [verifyAddressesGoal(s.answer, u.goal)] : []),
    ...(answering ? verifyConstraints(s.answer, u.constraints) : []),
    ...(answering && working.corrections.length > 0
      ? [verifyNoContradiction(s.answer, working.corrections)]
      : []),
  ]

  const repair: Repair = async (subject, failures) => {
    try {
      return {
        ...subject,
        answer: await ports.model.generate({
          understanding: u,
          communication,
          claims: subject.claims,
          working,
          capabilities: plan.selected,
          computed,
          /* The model is told WHAT failed. Asking it to "try again" without
             that is asking it to guess which of its sentences was the
             problem. */
          mustFix: failures.map((f) => `${f.kind}: ${f.detail}`),
        }),
      }
    } catch (e) {
      /* THE ONLY PORT CALL IN THIS FILE THAT USED TO FAIL IN SILENCE.
         `verifyAndRepair` catches a throwing repairer and keeps the last good
         answer, which is correct behaviour and is also why a try/catch at the
         call site can never see this. The consequence was that a turn whose
         repair port DIED and a turn whose repair ran and simply could not fix
         the answer were byte-identical from outside: `degraded` null in both,
         the same verifications, the same `passed: false`.

         That breaks the promise stated two hundred lines above --- the trace
         exists so a degraded turn is DISTINGUISHABLE from a healthy one. The
         realistic trigger is a rate limit, not a bug: under a provider outage
         EVERY failing turn silently loses its repair round, answers get worse,
         and nothing anywhere points at the cause.

         Recorded, then rethrown, so `verifyAndRepair` still keeps the last
         good attempt. The verdict was never wrong --- `passed: false` is true
         either way. What was missing is the reason. */
      const why = e instanceof Error ? e.message : String(e)
      degraded = degraded ?? `the repair call failed: ${why}`
      couldNot('verify', `the repair call failed: ${why}`)
      throw e
    }
  }

  /* NOT REPAIRED WHEN THERE IS NOTHING TO REPAIR WITH. If the turn stopped to
     ask, or the model port already failed, calling it again to fix its own
     absent output would turn one failure into two. */
  const repairable = action.action !== 'ask' && degraded === undefined
  const checked: VerifyResult = repairable
    ? /* ONE repair round, not two. A check the repairer cannot satisfy is not
         satisfied any better on the third try, and each round is a full model
         call --- so the second round mostly buys latency and cost on turns
         that were going to be reported as failing anyway. An answer that
         passes needs zero rounds, which is the common case and the reason
         this is affordable at all. */
      await verifyAndRepair({ answer, claims }, checks, repair, 1)
    : (() => {
        /* `passed` is COMPUTED, not hardcoded false. An ask-turn or a degraded
           turn skips repair because there is nothing to repair with, which
           says nothing about whether the checks that did run succeeded --- and
           a verdict of "failed" on a turn whose every check passed is the same
           lie in the other direction. */
        const verifications = checks({ answer, claims })
        return {
          subject: { answer, claims },
          verifications,
          passed: verifications.every((v) => v.passed),
          rounds: 0,
        }
      })()

  answer = checked.subject.answer
  verifications.push(...checked.verifications)
  if (selected.has('verify')) didRun('verify')

  /* Communication is unconditional --- there is no turn that produces no
     output --- so it is met by having got this far. */
  didRun('communicate')

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
    if (!decision) {
      couldNot('memory-write', 'nothing in the turn was durable enough to be worth keeping')
    } else {
      try {
        remembered.push(
          await ports.memory.capture({
            kind: decision.kind,
            content: decision.content,
            strength: decision.source === 'user-stated' ? 0.9 : 0.6,
            supersedes: [],
            source: decision.source,
          }),
        )
        didRun('memory-write')
      } catch (e) {
        /* Failing to WRITE must not lose the turn that produced it. Note that
           `remembered` stays empty --- the result reports what was actually
           stored, so nothing downstream can tell the user their fact was kept
           when it was not. */
        memoryFailed = true
        const why = e instanceof Error ? e.message : String(e)
        degraded = degraded ?? why
        couldNot('memory-write', `the memory store rejected the write: ${why}`)
      }
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
    /* THE TASK SURVIVES THE TURN. A finished task is dropped rather than
       carried: keeping it would make the next turn believe work is in flight
       and try to resume something already complete. */
    ...(task && task.status !== 'done' ? { task } : {}),
    /* THE LEDGER SURVIVES UNCONDITIONALLY, including when the lesson is
       complete. A task is dropped when done because a done task would be
       resumed by mistake; a completed lesson is the opposite --- it is the
       evidence that the student finished it, and it is exactly what a later
       session needs in order not to teach the same thing again. */
    ...(ledger ? { ledger } : {}),
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
      ...(task ? { task } : {}),
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
      ...(degraded ? { degraded } : {}),
      memoryUnavailable: memoryFailed,
      executed: [...executed],
      unmet,
      ...(world ? { world } : {}),
      ...(teaching ? { teaching } : {}),
      /* Computed from the FOLDED ledger, so the position reported is the one
         after this turn's detour or return --- not the one we arrived with. A
         trace that reports the pre-turn position would tell a caller to resume
         from the place the student just left. */
      ...(ledger ? { continuity: continuityOf(ledger, text, u) } : {}),
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
/**
 * Characters that mean a match STARTED OR ENDED INSIDE A LONGER LITERAL.
 *
 * `_` is here for digit separators, `.` for a leading decimal point, and the
 * letters for scientific and hexadecimal notation.
 */
const LITERAL_CHAR = /[0-9A-Za-z._]/

/**
 * REFUSING IS THE FEATURE. A truncated match is a different expression.
 *
 * The regex anchors on the first digit it can reach, so a number written in a
 * notation it does not model gets its prefix eaten and what remains is still
 * syntactically valid. The verifier then faithfully checks that OTHER
 * expression and stamps `passed: true`. Measured before the guard:
 *
 *     "What is 1e5*2?"       ->  "5*2"     verified 10     (200000)
 *     "What is 3.5e2 + 1?"   ->  "2 + 1"   verified 3      (351)
 *     "What is 0x10+1?"      ->  "10+1"    verified 11     (17)
 *     "What is 1_000+1?"     ->  "000+1"   verified 1      (1001)
 *     "What is .5+1?"        ->  "5+1"     verified 6      (1.5)
 *     "What is 2+2?"         ->  "2+2"     verified 4      (4)  correct
 *
 * Every field of those verifications is internally consistent and five of six
 * are wrong. Note the last row: it is right on the case anyone would write a
 * fixture for, and silently wrong on notation nobody thought to test.
 *
 * A WRONG ARITHMETIC VERIFICATION IS WORSE THAN NO ARITHMETIC VERIFICATION.
 * Absent, the number is unchecked and everyone knows it. Present-and-wrong, it
 * launders a bad number as verified — and this is the one check a reader cannot
 * repeat for themselves, so it is the one carrying the most trust.
 *
 * The principle was already written down four lines above the bug: dropping the
 * `%` "would silently compute 17.5 * 2400 --- a wrong answer rather than a
 * refusal, which is the worse of the two failures." Stating a rule is not
 * enforcing it.
 */
function truncated(text: string, match: RegExpMatchArray): boolean {
  const start = match.index ?? 0
  const end = start + match[0].length
  const before = text[start - 1]
  const after = text[end]
  return (
    (before !== undefined && LITERAL_CHAR.test(before)) ||
    (after !== undefined && LITERAL_CHAR.test(after))
  )
}

/**
 * Pull the arithmetic out of a sentence, or refuse.
 *
 * Percentages are rewritten to division BEFORE the general scan, because "17.5%
 * of 2400" is not an expression the parser accepts and dropping the `%` would
 * silently compute 17.5 * 2400 --- a wrong answer rather than a refusal, which
 * is the worse of the two failures.
 *
 * Returning null is not a failure path. The caller records
 * `unmet.calculate = "no arithmetic expression could be extracted"`, which is a
 * true statement the reader can act on, and the answer proceeds unverified and
 * honestly labelled.
 */
export function extractExpression(text: string): string | null {
  const percent = text.match(/(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/i)
  if (percent) return truncated(text, percent) ? null : `${percent[1]} / 100 * ${percent[2]}`

  const bare = text.match(/(-?\d+(?:\.\d+)?(?:\s*[-+*/^]\s*\(?\s*-?\d+(?:\.\d+)?\s*\)?)+)/)
  if (!bare) return null
  return truncated(text, bare) ? null : (bare[1]?.trim() ?? null)
}

/** How much of a read file is carried as a claim. Enough to ground an answer. */
const FILE_CLAIM_CHARS = 4000

/**
 * Steps executed per turn.
 *
 * A TURN IS NOT A TASK. Running a fifteen-step plan to completion inside one
 * turn means the user waits for all of it with no way to redirect, and a
 * mistake at step two is discovered at step fifteen. Three steps then report
 * back keeps the human in the loop, which is the whole reason `pause`/`resume`
 * exist rather than a single blocking call.
 */
const STEP_BUDGET = 3

/** The most specific word in the goal, for searching what the user attached. */
function firstKeyword(goal: string): string {
  const words = goal.toLowerCase().match(/[a-z]{4,}/g) ?? []
  return words.sort((a, b) => b.length - a.length)[0] ?? goal.slice(0, 20)
}

/**
 * Which file to read: one the search actually matched, else one that was
 * attached.
 *
 * NEVER A PATH THE MODEL SUGGESTED. The only paths that reach `read_file` here
 * come from a search result or from the turn's own attachments, so a request
 * to read something the user never provided cannot be constructed.
 */
function firstPath(hits: unknown, attached: readonly { name?: string }[]): string {
  if (Array.isArray(hits)) {
    const first = hits[0] as { path?: string } | undefined
    if (first?.path) return first.path
  }
  return attached.find((a) => a.name)?.name ?? ''
}

/** Beyond this, a "plan" is a wall of steps nobody reads. */
const MAX_STEPS = 8

/* Coordinators people actually use to enumerate work. Ordered longest-first so
   "and then" is consumed before the bare "and" inside it. */
const CLAUSE_SPLIT = /\s*(?:[,;]|\.\s|\band then\b|\bthen\b|\band\b|\balso\b)\s*/i

/**
 * Turn a request into steps.
 *
 * DELIBERATELY MECHANICAL. The alternative is asking a model to decompose the
 * task, and a decomposition that varies run to run makes a resumable task
 * meaningless: yesterday's plan and today's would not be the same plan, so
 * "carry on where we left off" would have nothing stable to carry on with.
 *
 * The first version of this read only `u.constraints`, which was wrong in the
 * most ordinary case there is. "Plan my revision: cover mechanics, optics and
 * thermodynamics" states no constraints at all --- it states a LIST. The
 * router selected `plan`, this returned nothing, and the capability reported
 * itself unmet on precisely the input it exists for.
 *
 * Enumerated clauses first, then constraints, then nothing. Returning an empty
 * list is a legitimate answer: a request with one obvious order is not a plan,
 * and wrapping it in a one-step task adds ceremony and no information.
 */
function stepsFor(u: Understanding, text: string): StepSpec[] {
  const clauses = text
    .split(CLAUSE_SPLIT)
    .map((c) => c.trim().replace(/^(?:please|now|first|next|finally)\s+/i, ''))
    /* Two words minimum: a fragment like "optics" is a topic, not a step, and
       a one-word step goal produces a journal nobody can read afterwards. */
    .filter((c) => /[a-z]/i.test(c) && c.split(/\s+/).length >= 2)

  /* Deduped because `planFrom` resolves dependencies by goal text, so two
     identical goals would collide and the second would silently inherit the
     first one's id. */
  const unique = [...new Set(clauses)].slice(0, MAX_STEPS - 1)

  const specs: StepSpec[] =
    unique.length >= 2
      ? unique.map((c) => ({ goal: c, capability: 'reason' as Capability }))
      : u.constraints
          .slice(0, MAX_STEPS - 1)
          .map((c) => ({ goal: `satisfy: ${c}`, capability: 'reason' as Capability }))

  if (specs.length < 2) return []

  /* The synthesis step, which is the one that produces the answer. It depends
     on every other step, so `nextStep` cannot hand it back before the work it
     is meant to summarise has actually happened. */
  specs.push({
    goal: `answer: ${u.goal}`,
    capability: 'knowledge' as Capability,
    after: specs.map((s) => s.goal),
  })
  return specs
}

/**
 * How one planned step is carried out.
 *
 * Steps run through the SAME registry as everything else. A step that reached
 * for its own private path to the world would be a second, untested way of
 * doing what tools already do --- and the permission gate in `run()` would not
 * be on it.
 */
function stepExecutor(ports: Ports, text: string): Executor {
  return async (step: Step) => {
    const tool = ports.tools.select(step.goal, 1)[0]
    if (!tool) {
      /* NOT A FAILURE. A step with no tool is a step the model answers, and
         reporting it as failed would block everything downstream of it. */
      return { ok: true, value: `no tool for "${step.goal}"; answered from knowledge` }
    }
    const out = await run(ports.tools, tool.name, argsFor(tool.name, step, text))
    if (out.ok) return { ok: true, value: out.value }
    const next = recover(out)
    return {
      ok: false,
      error: `${out.error} --- ${next.action}: ${next.why}`,
      /* Only the class `recover` says is worth repeating unchanged. */
      retryable: next.action === 'retry',
    }
  }
}

function argsFor(tool: string, step: Step, text: string): unknown {
  if (tool === 'calculator') return { expression: extractExpression(text) ?? step.goal }
  if (tool === 'search_files') return { query: firstKeyword(step.goal) }
  if (tool === 'read_file') return { path: step.goal }
  return { query: step.goal }
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
