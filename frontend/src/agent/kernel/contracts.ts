/**
 * THE CAPABILITY SUBSTRATE — TYPES ONLY.
 *
 * This file is the seam every other part of the agent is written against. It
 * contains no logic on purpose: it is the thing that lets ten modules be built
 * in parallel without any of them agreeing with each other by accident.
 *
 * THREE LAYERS, KEPT APART
 * ------------------------
 *   GENERAL        what is happening, what does the user want, what is required
 *   COMMUNICATION  how should the result be said
 *   LEARNING       how should this change what the learner knows next
 *
 * They are separate here because merging them is the failure mode this whole
 * design exists to avoid. A learning product that routes every input through a
 * teaching prompt cannot answer "what's the weather" without pretending the
 * weather is a lesson. So the general substrate decides first, and the learning
 * layer is one capability among many that the router MAY select — never the
 * entry point.
 *
 * WHAT THIS FILE MAY NOT CONTAIN
 * ------------------------------
 * The canvas Four Laws apply to anything that reaches a renderer. A model
 * never draws, never positions, never styles. So no type below carries `x`,
 * `y`, `width`, `height`, a colour, a font size, or a spacing value, and none
 * ever may. Communication decides WHICH representation; the design system
 * decides what it looks like; the layout grammar decides where it goes.
 */

/* -------------------------------------------------------------------------- */
/* Input — Capability 1, multimodal understanding                             */
/* -------------------------------------------------------------------------- */

/**
 * One piece of what the user handed us, before interpretation.
 *
 * MODALITY IS A TAG, NOT A CLASS HIERARCHY.
 *
 * The tempting design is a class per modality with a `parse()` method. It is
 * wrong here: a screenshot of a table and a CSV of the same table need the
 * same downstream treatment, and the thing that decides that is the EXTRACTED
 * content, not the container it arrived in. So the container stays a dumb
 * tagged union and the interpretation happens once, in `understand/`.
 */
export type Modality =
  | 'text'
  | 'speech'
  | 'image'
  | 'document'
  | 'code'
  | 'math'
  | 'data'

export interface InputPart {
  modality: Modality
  /** Raw text, a transcript, or a base64 payload. Never pre-interpreted. */
  content: string
  /** MIME type when the source knew one. Advisory; never trusted alone. */
  mediaType?: string
  /** Filename or origin, for citation and for the user's own reference. */
  name?: string
}

/**
 * Everything that arrived in one turn.
 *
 * A LIST, BECAUSE ONE TURN IS ROUTINELY MULTIMODAL.
 *
 * "Here's a screenshot of my error, and the file it came from, and what do I
 * do?" is three parts and one intent. Modelling a turn as a single string is
 * what forces the rest of the system to re-assemble context it never should
 * have lost.
 */
export interface Turn {
  parts: readonly InputPart[]
  /** Wall-clock, injected. Never read from a clock inside the substrate, so
   *  that every stage of the loop is replayable and testable. */
  at: string
}

/* -------------------------------------------------------------------------- */
/* Understanding — Capabilities 2, 3, 4                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the user is asking for.
 *
 * A LIST, NOT A LABEL. "Search the latest inflation data and explain it like
 * I'm new to economics" is retrieval AND explanation, and a single-label
 * classifier has to throw one of them away. The router needs both.
 */
export type IntentKind =
  | 'information' // a fact is wanted
  | 'explanation' // a mechanism is wanted
  | 'action' // do something to the world
  | 'research' // go find out, from sources
  | 'calculation' // compute, don't estimate
  | 'comparison'
  | 'recommendation'
  | 'troubleshooting'
  | 'planning'
  | 'coding'
  | 'learning' // the one that may wake the learning layer
  | 'conversation' // small talk; the correct answer is often short
  | 'memory-write' // "remember that I struggle with integration"
  | 'memory-read' // "what were we doing yesterday"
  | 'continuation' // "carry on with what we started"
  | 'correction' // the user is telling us we got it wrong

export interface Intent {
  kind: IntentKind
  /** 0..1. Drives the uncertainty layer: a low score is a reason to ask. */
  confidence: number
  /** Why the classifier believes this. Shown in diagnostics, never to the
   *  user by default — an agent that narrates its own routing is noise. */
  because: string
}

/**
 * A thing the conversation is about, tracked so pronouns resolve.
 *
 * `mentions` is the turn indices where it appeared. "The second one" is only
 * resolvable against an ordered record of what was on the table.
 */
export interface Entity {
  id: string
  label: string
  kind: string
  mentions: readonly number[]
}

/**
 * Something unclear about the request.
 *
 * `blocking` IS THE WHOLE REASON THIS IS A TYPE AND NOT A STRING.
 *
 * Two very different things were previously both called "ambiguity", and
 * collapsing them made the ask-rule wrong in a way that looked like a
 * threshold problem:
 *
 *   NOT BLOCKING  the phrasing is loose but one reading is obviously intended.
 *                 Asking here is friction --- the agent that cannot proceed
 *                 without a clarifying question is not careful, it is unusable.
 *
 *   BLOCKING      we do not know WHAT THING is being referred to. "fix it"
 *                 with nothing yet named has a perfectly confident INTENT
 *                 (fix) and no referent at all. Confidence in the verb says
 *                 nothing about the noun, so no confidence threshold can
 *                 catch this, and one that appears to is catching it by luck.
 */
export interface Ambiguity {
  what: string
  blocking: boolean
}

/**
 * The result of reading the turn. The router's only input about the user.
 */
export interface Understanding {
  /** Ordered by confidence, highest first. Never empty. */
  intents: readonly Intent[]
  /** One sentence, in the user's own framing, of what they want. */
  goal: string
  /** What must hold for the answer to be useful. Feeds verification. */
  constraints: readonly string[]
  entities: readonly Entity[]
  /** Detected BCP-47-ish tag. `en`, `hi`, and `hi-Latn` (Hinglish) are the
   *  three this product must get right; the field is a string so adding a
   *  fourth is not a schema change. */
  language: string
  /** True when the turn changes subject. Used to decide what context to drop. */
  topicShift: boolean
  /** What is genuinely unclear. A blocking entry means we cannot proceed. */
  ambiguities: readonly Ambiguity[]
}

/* -------------------------------------------------------------------------- */
/* Capabilities — Capability selection, section 37                            */
/* -------------------------------------------------------------------------- */

/**
 * The units the router turns on and off.
 *
 * THE POINT OF THIS ENUM IS THAT MOST OF IT STAYS OFF.
 *
 * "What is photosynthesis?" should select knowledge + reasoning +
 * communication and NOTHING else. A system that wakes memory, search, tools
 * and the learner model for every turn is slower, more expensive, and more
 * likely to say something it cannot support. Minimality is the design goal,
 * so it is measured — see `CapabilityPlan.rationale`.
 */
export type Capability =
  | 'knowledge' // answer from what the model already knows
  | 'memory-read'
  | 'memory-write'
  | 'search' // go to the live web
  | 'files' // read what the user gave us
  | 'calculate'
  | 'code'
  | 'tools' // anything in the tool registry
  | 'reason'
  | 'plan'
  | 'act' // multi-step execution against the world
  | 'verify'
  | 'ask' // stop and ask the user
  | 'communicate' // always on; listed so it can be reasoned about
  | 'learning' // the specialised layer

export interface CapabilityPlan {
  /** The minimum set. Order is not execution order; the kernel decides that. */
  selected: readonly Capability[]
  /** Why each was selected, keyed by capability. Auditable by test. */
  rationale: Readonly<Record<string, string>>
  /** Capabilities considered and rejected, with the reason. This is what makes
   *  "it didn't search" a debuggable decision rather than a silent absence. */
  rejected: Readonly<Record<string, string>>
}

/* -------------------------------------------------------------------------- */
/* Memory — Capabilities 5, 6                                                 */
/* -------------------------------------------------------------------------- */

export type MemoryKind =
  | 'preference' // how the user wants us to behave
  | 'fact' // something true about the user or their world
  | 'decision' // a call that was made, and why
  | 'project' // long-running work
  | 'mastery' // learning state: what they know
  | 'misconception' // learning state: what they get wrong, and why
  | 'episode' // a notable past interaction

export interface MemoryRecord {
  id: string
  kind: MemoryKind
  /** The memory itself, one fact per record. Multi-fact records cannot be
   *  superseded independently, which is how memory stores rot. */
  content: string
  /** ISO. Written once. */
  createdAt: string
  /** ISO. Bumped on merge or reinforcement — drives decay. */
  updatedAt: string
  /** 0..1. Reinforcement raises it, contradiction and age lower it. */
  strength: number
  /** Ids this record replaces. A superseded record is kept, not deleted, so
   *  "current state" and "historical state" stay distinguishable. */
  supersedes: readonly string[]
  /** Set when the USER asked for deletion. Hard-deleted, never soft-hidden —
   *  an explicit deletion that leaves the content on disk is a lie. */
  source: 'user-stated' | 'observed' | 'inferred'
}

export interface MemoryQuery {
  goal: string
  entities: readonly string[]
  kinds?: readonly MemoryKind[]
  limit: number
}

/**
 * The long-term store.
 *
 * `retrieve` RANKS — it does not dump. The stated non-goal of this design is
 * "shovel old chats into the context window", and a store whose read path is
 * `getAll()` makes that the path of least resistance.
 */
export interface MemoryStore {
  retrieve(q: MemoryQuery): Promise<readonly MemoryRecord[]>
  /** Returns the record actually written — which may be a MERGE of an existing
   *  one rather than a new row. Callers must not assume they created a row. */
  capture(r: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryRecord>
  /** Honours explicit user deletion. Irreversible by design. */
  forget(id: string): Promise<void>
}

/**
 * What is true for THIS interaction, and dies with it.
 *
 * Separate from `MemoryStore` because the failure modes are opposite: working
 * memory that persists is a stale-context bug, and long-term memory that
 * doesn't is amnesia.
 */
export interface WorkingMemory {
  objective: string
  entities: readonly Entity[]
  assumptions: readonly string[]
  constraints: readonly string[]
  /** Results worth keeping between steps — a computed number, a fetched page. */
  intermediates: Readonly<Record<string, unknown>>
  /** Substeps not yet done. Empty means the task is complete. */
  open: readonly string[]
  /** Corrections the user has issued. Never dropped on topic shift. */
  corrections: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* Tools — Capability 9                                                       */
/* -------------------------------------------------------------------------- */

export interface ToolResult {
  ok: boolean
  /** Present when ok. */
  value?: unknown
  /** Present when !ok. Written for the RECOVERY layer to classify, so it says
   *  what happened, not just that something did. */
  error?: string
  /** Machine-readable failure class, so recovery can branch without parsing
   *  prose. `transient` is the only one a blind retry is ever correct for. */
  failure?: 'transient' | 'bad-args' | 'not-found' | 'denied' | 'unavailable'
}

export interface Tool {
  name: string
  /** What it does, in the words the SELECTOR reasons over. */
  description: string
  /** JSON Schema for arguments. Validated before execution, always. */
  schema: unknown
  /** True when running it changes the world. Gates confirmation. */
  effectful: boolean
  run(args: unknown): Promise<ToolResult>
}

/* -------------------------------------------------------------------------- */
/* Knowledge and search — Capabilities 7, 8                                   */
/* -------------------------------------------------------------------------- */

/**
 * Where an answer came from. Every claim the agent makes that is not from the
 * model's own knowledge carries one of these, because "cite sources" without a
 * type to hang the citation on becomes "mention sources sometimes".
 */
export interface Source {
  kind: 'model' | 'user' | 'file' | 'web' | 'tool' | 'memory'
  /** URL, filename, tool name, or memory id. */
  ref: string
  /** ISO date the source itself was published or written, when known. This is
   *  the field freshness reasoning runs on, and it is deliberately separate
   *  from when WE fetched it. */
  publishedAt?: string
  retrievedAt?: string
  /** Verbatim, so a claim can be checked against what was actually read. */
  excerpt?: string
}

export interface Claim {
  statement: string
  sources: readonly Source[]
  /** 0..1. Below the uncertainty threshold the answer must be qualified,
   *  searched, or refused — never asserted flat. */
  confidence: number
  /** Set when sources disagree. Carrying the disagreement forward is the
   *  point; collapsing it to a majority answer is how agents launder doubt. */
  conflict?: string
}

/* -------------------------------------------------------------------------- */
/* Execution — Capabilities 11, 12, 13, 14                                    */
/* -------------------------------------------------------------------------- */

export type StepState = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped'

export interface Step {
  id: string
  goal: string
  capability: Capability
  state: StepState
  /** Ids that must be `done` first. Cycles are a plan bug and are rejected. */
  dependsOn: readonly string[]
  /** Populated as it runs. Survives a pause, so the task can resume. */
  result?: unknown
  error?: string
  attempts: number
}

export interface Plan {
  goal: string
  steps: readonly Step[]
  /** Written when the plan is revised, so replanning is visible in the record
   *  rather than looking like the original plan always said this. */
  revisions: readonly string[]
}

/**
 * Everything needed to stop mid-task and pick it up in another session.
 *
 * Capability 32 is not a feature bolted on at the end; it is what this type
 * being serialisable buys. If any field here held a closure, a socket, or a
 * class instance, cross-session continuity would be impossible and nobody
 * would notice until a user came back the next day.
 */
export interface TaskState {
  id: string
  plan: Plan
  working: WorkingMemory
  /** Append-only. The audit trail AND the resume point. */
  journal: readonly JournalEntry[]
  status: 'active' | 'paused' | 'done' | 'blocked'
}

export interface JournalEntry {
  at: string
  stepId?: string
  event: string
  detail?: string
}

/* -------------------------------------------------------------------------- */
/* Verification — Capability 24                                               */
/* -------------------------------------------------------------------------- */

export type VerificationKind =
  | 'factual'
  | 'source'
  | 'arithmetic'
  | 'logical'
  | 'code-test'
  | 'constraint'
  | 'cross-check'
  | 'schema'

export interface Verification {
  kind: VerificationKind
  passed: boolean
  /** What was actually checked, and how. A verification with no detail is
   *  indistinguishable from a claim that verification happened. */
  detail: string
  /** Set when it failed and a repair was attempted. */
  repaired?: boolean
}

/* -------------------------------------------------------------------------- */
/* Communication — Capabilities 17, 18                                        */
/* -------------------------------------------------------------------------- */

/**
 * The representations the communication layer may choose between.
 *
 * DELIBERATELY THE SAME VOCABULARY THE CANVAS ALREADY SPEAKS.
 *
 * The canvas has a registry of named representations with a `shape` and an
 * `intent` for each. Inventing a second, parallel list here would guarantee
 * the two drift, and the first symptom would be the communication layer
 * choosing a representation the renderer cannot draw. So the overlap is
 * intentional and the mapping is checked by test.
 */
export type Representation =
  | 'prose'
  | 'bullets'
  | 'table'
  | 'comparison'
  | 'equation'
  | 'flow'
  | 'timeline'
  | 'chart'
  | 'tree'
  | 'matrix'
  | 'sequence'
  | 'decision-tree'
  | 'worked-example'
  | 'code'
  | 'simulation'

/**
 * How to say it. Decided from the STRUCTURE of the content and the state of
 * the user — never from a single global template.
 */
export interface CommunicationPlan {
  /** How much to say. `brief` is a real answer, not a truncated one: "what's
   *  2+2" gets `brief` and that is correct behaviour, not under-explaining. */
  depth: 'brief' | 'standard' | 'thorough'
  /** What to say first. */
  leadWith: string
  /** Terms this user will need defined, given what memory says they know. */
  define: readonly string[]
  /** Things to leave out. Naming them makes omission a decision rather than
   *  an oversight, which is what makes it reviewable. */
  omit: readonly string[]
  /** Ordered. The first is the primary form; the rest support it. */
  representations: readonly Representation[]
  /** True when the answer should arrive in stages that check comprehension —
   *  the canvas already implements this as beats. */
  progressive: boolean
  /** Language to answer in. Mirrors the user unless memory overrides. */
  language: string
  because: string
}

/* -------------------------------------------------------------------------- */
/* User state — Capabilities 26, 27                                           */
/* -------------------------------------------------------------------------- */

/**
 * Inferred interaction conditions.
 *
 * THIS CHANGES STRATEGY, NOT TONE.
 *
 * Detecting frustration must make the answer shorter and more direct. It must
 * not make the agent say "I understand this is frustrating" — that is
 * performance, and a user who has asked the same question three times wants
 * the answer, not sympathy. Every field here is consumed by
 * `CommunicationPlan`, and none of it reaches the wording as an emotion.
 */
export interface UserState {
  confusion: number
  frustration: number
  urgency: number
  /** How many times the user has re-asked substantially the same thing. The
   *  strongest single signal that the previous explanation did not work. */
  repeats: number
}

export interface Personalization {
  language: string
  /** How much the user already knows in this domain. Drives `define`. */
  technicalLevel: 'novice' | 'intermediate' | 'expert'
  density: 'brief' | 'standard' | 'thorough'
  preferredRepresentations: readonly Representation[]
}

/* -------------------------------------------------------------------------- */
/* The turn result                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What one pass of the loop produced.
 *
 * `answer` is the text. `spec` is present when the answer is better drawn than
 * written, and it is a canvas LessonSpec — which is why the model still never
 * draws, never positions and never styles even when it chooses a diagram.
 * Typed as `unknown` here so the substrate does not depend on the canvas; the
 * canvas-facing adapter narrows it with the real schema.
 */
export interface TurnResult {
  answer: string
  spec?: unknown
  claims: readonly Claim[]
  verifications: readonly Verification[]
  plan: CapabilityPlan
  communication: CommunicationPlan
  /** Memories written this turn. Surfaced so a write is never invisible. */
  remembered: readonly MemoryRecord[]
  /** Set when the correct action was to ask rather than answer. */
  question?: string
  task?: TaskState
}
