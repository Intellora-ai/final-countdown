import type {
  Entity,
  MemoryKind,
  MemoryQuery,
  MemoryRecord,
  MemoryStore,
  Understanding,
  WorkingMemory,
} from '../kernel/contracts'
import { overlap, tokens, without } from '../kernel/text'

/**
 * MEMORY, WHICH IS TWO DIFFERENT THINGS WITH OPPOSITE FAILURE MODES.
 *
 *   WORKING     what is true for THIS interaction. Its failure mode is
 *               PERSISTING --- a constraint from twenty minutes ago silently
 *               still applying is a bug the user cannot see or clear.
 *   LONG-TERM   what is true across sessions. Its failure mode is FORGETTING.
 *
 * They are separate types with separate storage because a single "memory"
 * abstraction has to pick one of those failure modes to have, and whichever it
 * picks is wrong half the time.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * -----------------------------
 * The brief says, in as many words: "Do not implement this as simply dumping
 * old chats into context." So there is no `getAll`, no `history()`, and no
 * path that returns every record. The ONLY read is `retrieve`, it takes a
 * query, and it RANKS. That is not a convenience --- an API with a cheap
 * dump-everything call will be used that way under deadline, and then the
 * ranking exists but nothing calls it.
 *
 * NO CLOCK IN HERE
 * ----------------
 * Every function that cares about time takes `now` as an argument. Decay,
 * recency ranking and staleness are the parts most worth testing and least
 * testable against a real clock, and a store that reads `Date.now()` internally
 * can only be tested by waiting.
 */

/* -------------------------------------------------------------------------- */
/* Working memory --- Capability 5                                            */
/* -------------------------------------------------------------------------- */

export const EMPTY_WORKING: WorkingMemory = {
  objective: '',
  entities: [],
  assumptions: [],
  constraints: [],
  intermediates: {},
  open: [],
  corrections: [],
}

/**
 * Fold a new reading of the conversation into working memory.
 *
 * WHY CORRECTIONS ARE NEVER DROPPED
 * ---------------------------------
 * Everything else here is replaced or reset on a topic change. Corrections are
 * appended and kept, because a correction is the user telling us we were
 * wrong, and the single most damaging thing an assistant does is make the same
 * mistake again after being corrected. Their cost is a few strings; the cost
 * of dropping one is the user repeating themselves, which `UserState.repeats`
 * then reads as frustration --- the system would be generating its own bad
 * signal.
 */
export function absorb(
  working: WorkingMemory,
  u: Understanding,
  opts: { keepObjective?: boolean } = {},
): WorkingMemory {
  const corrections = u.intents.some((i) => i.kind === 'correction')
    ? [...working.corrections, u.goal]
    : working.corrections

  /* A topic change clears what was in play, because an assumption carried
     into an unrelated question is worse than no assumption. Objective and
     corrections survive: the user may be asking a side question on the way to
     the same goal. */
  if (u.topicShift && !opts.keepObjective) {
    return {
      ...EMPTY_WORKING,
      objective: working.objective,
      corrections,
      entities: u.entities,
    }
  }

  return {
    objective: working.objective || u.goal,
    entities: mergeEntities(working.entities, u.entities),
    assumptions: working.assumptions,
    constraints: unique([...working.constraints, ...u.constraints]),
    intermediates: working.intermediates,
    open: working.open,
    corrections,
  }
}

export function note(working: WorkingMemory, key: string, value: unknown): WorkingMemory {
  return { ...working, intermediates: { ...working.intermediates, [key]: value } }
}

export function openStep(working: WorkingMemory, step: string): WorkingMemory {
  return { ...working, open: unique([...working.open, step]) }
}

export function closeStep(working: WorkingMemory, step: string): WorkingMemory {
  return { ...working, open: working.open.filter((s) => s !== step) }
}

export function assume(working: WorkingMemory, assumption: string): WorkingMemory {
  return { ...working, assumptions: unique([...working.assumptions, assumption]) }
}

/* -------------------------------------------------------------------------- */
/* What is worth remembering --- Capability 6                                 */
/* -------------------------------------------------------------------------- */

/**
 * Durable statements about the user, as opposed to statements about right now.
 *
 * "I prefer short answers" is durable. "Make this one short" is not, and
 * storing it would make every future answer short on the strength of one
 * request --- a memory system that over-captures does not feel attentive, it
 * feels like it is putting words in your mouth.
 */
const DURABLE: readonly { kind: MemoryKind; test: RegExp }[] = [
  { kind: 'preference', test: /\bi (prefer|like|want|always want|hate|don'?t like|find it easier)\b/i },
  { kind: 'preference', test: /\b(always|never|from now on|in future|going forward) (give|show|use|answer|explain|keep)\b/i },
  { kind: 'misconception', test: /\bi (struggle with|am bad at|never understood|keep getting .* wrong|find .* confusing)\b/i },
  { kind: 'mastery', test: /\bi (already know|understand|am good at|am comfortable with|have done)\b/i },
  { kind: 'fact', test: /\bi (am|'m) (a|an|in|studying|preparing for|working on)\b/i },
  { kind: 'project', test: /\bi (am|'m) (building|writing|working on)\b/i },
  { kind: 'decision', test: /\b(we|i) (decided|chose|settled on|are going with)\b/i },
]

/**
 * Should this be remembered, and as what?
 *
 * Returns null for the overwhelming majority of turns, and that is the correct
 * behaviour. The question in the brief is "What SHOULD I remember?", and a
 * capture rule that answers "all of it" has not answered it.
 */
export function worthRemembering(
  text: string,
  u: Understanding,
): { kind: MemoryKind; content: string; source: MemoryRecord['source'] } | null {
  /* An explicit instruction outranks every heuristic. If the user says
     "remember X", X is remembered whether or not it looks durable --- second
     -guessing an explicit instruction is how a memory feature loses trust. */
  if (u.intents.some((i) => i.kind === 'memory-write')) {
    return { kind: classify(text), content: strip(text), source: 'user-stated' }
  }
  for (const d of DURABLE) {
    if (d.test.test(text)) return { kind: d.kind, content: strip(text), source: 'observed' }
  }
  return null
}

function classify(text: string): MemoryKind {
  for (const d of DURABLE) if (d.test.test(text)) return d.kind
  return 'fact'
}

/** Remove the instruction wrapper so the stored fact reads as a fact. */
function strip(text: string): string {
  return text
    .replace(/^\s*(please\s+)?(remember|note|keep in mind|don'?t forget|save)\s+(that\s+)?/i, '')
    .replace(/\s+$/, '')
    .replace(/[.!]$/, '')
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

const HALF_LIFE_DAYS: Readonly<Record<MemoryKind, number>> = {
  /* A stated preference should survive months of silence. A misconception
     SHOULD fade --- that is the point of learning, and a system that keeps
     insisting you are bad at percentages a year after you stopped being bad at
     them is worse than one that forgot. */
  preference: 365,
  fact: 365,
  decision: 180,
  project: 90,
  mastery: 120,
  misconception: 45,
  episode: 30,
}

const DAY = 86_400_000

/**
 * Strength after decay. Never mutates the record --- decay is a function of
 * WHEN YOU ASK, so baking it in would make the same memory read differently
 * depending on how often it happened to be retrieved.
 */
export function decayed(r: MemoryRecord, now: string): number {
  const then = Date.parse(r.updatedAt)
  const at = Date.parse(now)

  /* AN UNREADABLE TIMESTAMP MUST NOT DESTROY THE MEMORY.
   *
   * `Date.parse` returns NaN for anything it cannot read, NaN propagates
   * through `Math.pow` to the score, and `NaN > 0.05` is FALSE --- so
   * `retrieve`'s relevance floor drops the record. Not an error, not a
   * warning: the memory stops existing, for every query, forever. A red-team
   * pass found this by feeding a corrupt `updatedAt` straight into the store.
   *
   * A corrupt timestamp is a corrupt TIMESTAMP. The content is still the
   * thing the user asked to be remembered. Losing their data because a clock
   * field got mangled is the worst available response, and it is invisible
   * from outside and unrecoverable from inside.
   *
   * So unparseable means age zero: no decay applied, the record survives at
   * its stated strength, and the only thing lost is our ability to date it.
   * That errs toward keeping user data, which is the correct direction to err
   * when the alternative is silent deletion. */
  const age = Number.isNaN(then) || Number.isNaN(at) ? 0 : Math.max(0, at - then) / DAY
  const half = HALF_LIFE_DAYS[r.kind]
  return r.strength * Math.pow(0.5, age / half)
}

/**
 * How relevant is this memory to this request?
 *
 * Relevance × strength, not relevance alone. A perfectly on-topic memory that
 * has decayed to nothing should not resurface, and a strong memory about
 * something else should not either. Both terms have to hold.
 */
export function relevance(r: MemoryRecord, q: MemoryQuery, now: string): number {
  const want = new Set([...tokens(q.goal), ...q.entities.flatMap((e) => [...tokens(e)])])
  return overlap(tokens(r.content), want) * decayed(r, now)
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

export interface Persistence {
  read(): MemoryRecord[]
  write(records: readonly MemoryRecord[]): void
}

/**
 * In-process persistence. Swap for localStorage or a server without touching
 * anything above --- the store's logic is the part worth testing and none of
 * it depends on where the bytes live.
 */
export function inMemoryPersistence(seed: readonly MemoryRecord[] = []): Persistence {
  let records = [...seed]
  return {
    read: () => [...records],
    write: (next) => {
      records = [...next]
    },
  }
}

/** Contradiction markers, checked between two records on the same subject. */
const POLARITY = [
  { positive: /\b(know|understand|good at|comfortable|mastered|confident)\b/i, negative: /\b(struggle|bad at|confus|don'?t understand|never understood|weak)\b/i },
  { positive: /\b(prefer|like|want)\b/i, negative: /\b(don'?t (prefer|like|want)|hate|dislike)\b/i },
  { positive: /\b(long|detailed|thorough|more detail)\b/i, negative: /\b(short|brief|concise|less detail)\b/i },
]

/**
 * Every word that carries polarity rather than subject.
 *
 * Removed before comparing subjects --- see `conflicts`.
 */
const POLARITY_WORDS = new Set(
  POLARITY.flatMap((p) => [p.positive, p.negative])
    .flatMap((re) => re.source.match(/[a-z']{3,}/g) ?? [])
    .map((w) => w.replace(/'s$/, '')),
)

/**
 * Do these two records disagree about the same subject?
 *
 * SUBJECT overlap AND opposite polarity, and the word "subject" is doing real
 * work. Comparing the FULL text was the original bug: "I struggle with
 * percentages" against "I understand percentages now" shares only
 * `percentages` out of three content words each, scores 0.33, and falls under
 * any sane threshold --- so the system never noticed that a learner had
 * stopped struggling, and kept both beliefs alive at once.
 *
 * The polarity words are precisely what makes it a CONFLICT, so leaving them
 * in the subject comparison is asking two contradictory statements to use the
 * same vocabulary in order to be recognised as contradicting. Strip them, and
 * both sentences are about `percentages`, which is the actual question.
 *
 * Both conditions are still required. Subject overlap alone would make "I know
 * calculus" conflict with "I know trigonometry"; polarity alone would make "I
 * struggle with percentages" conflict with "I like short answers".
 */
export function conflicts(a: MemoryRecord, b: MemoryRecord, threshold = 0.5): boolean {
  if (a.kind !== b.kind && !isMasteryPair(a, b)) return false
  const subjectA = without(tokens(a.content), POLARITY_WORDS)
  const subjectB = without(tokens(b.content), POLARITY_WORDS)
  if (overlap(subjectA, subjectB) < threshold) return false
  return POLARITY.some(
    (p) =>
      (p.positive.test(a.content) && p.negative.test(b.content)) ||
      (p.negative.test(a.content) && p.positive.test(b.content)),
  )
}

/* Mastery and misconception are opposite claims about the same thing, so a
   conflict between them is exactly what learning progress looks like. */
function isMasteryPair(a: MemoryRecord, b: MemoryRecord): boolean {
  const s = new Set([a.kind, b.kind])
  return s.has('mastery') && s.has('misconception')
}

export interface Store extends MemoryStore {
  /** Records this one replaced. The history, kept and separable. */
  historyOf(id: string): Promise<readonly MemoryRecord[]>
  all(): Promise<readonly MemoryRecord[]>
}

/**
 * `now` is a function so a caller can inject a fixed clock. `all()` exists for
 * tests and for an explicit "show me everything you know about me" screen ---
 * NOT as a retrieval path. Nothing in the agent loop may call it.
 */
export function createStore(p: Persistence, now: () => string): Store {
  let counter = 0
  const nextId = () => `m${Date.parse(now())}-${counter++}`

  const live = () => p.read().filter((r) => !isSuperseded(r, p.read()))

  return {
    async retrieve(q: MemoryQuery): Promise<readonly MemoryRecord[]> {
      const at = now()
      const kinds = q.kinds ? new Set(q.kinds) : null
      return live()
        .filter((r) => !kinds || kinds.has(r.kind))
        .map((r) => ({ r, score: relevance(r, q, at) }))
        /* A floor, not just a sort. Returning the top 5 of an irrelevant
           corpus is how "relevant historical context" becomes noise that the
           model then tries to make relevant. */
        .filter((x) => x.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, q.limit)
        .map((x) => x.r)
    },

    async capture(input): Promise<MemoryRecord> {
      const at = now()
      const existing = p.read()

      /* MERGE BEFORE INSERT. Capturing "I prefer short answers" twice must
         produce one stronger memory, not two competing ones --- duplicates are
         how a store starts returning the same fact three times and crowding
         out everything else. */
      const same = existing.find(
        (r) =>
          !isSuperseded(r, existing) &&
          r.kind === input.kind &&
          overlap(tokens(r.content), tokens(input.content)) > 0.8,
      )
      if (same) {
        const reinforced: MemoryRecord = {
          ...same,
          updatedAt: at,
          /* Reinforcement raises strength but cannot exceed 1: a fact repeated
             ten times is not ten times truer. */
          strength: Math.min(1, same.strength + 0.15),
          /* An observed guess later CONFIRMED by the user is upgraded. The
             reverse never happens --- see below. */
          source: same.source === 'user-stated' ? 'user-stated' : input.source,
        }
        p.write(existing.map((r) => (r.id === same.id ? reinforced : r)))
        return reinforced
      }

      const record: MemoryRecord = {
        ...input,
        id: nextId(),
        createdAt: at,
        updatedAt: at,
        supersedes: [
          ...input.supersedes,
          /* CONFLICT RESOLUTION IS SUPERSESSION, NOT DELETION. The old record
             stays readable through `historyOf` --- "distinguish current state
             from historical state" is impossible if the historical state was
             destroyed. This is also what makes learning progress visible:
             "struggles with percentages" superseded by "understands
             percentages" is the record of someone improving. */
          ...existing
            .filter((r) => !isSuperseded(r, existing) && conflicts(r, { ...input, id: '', createdAt: at, updatedAt: at }))
            .map((r) => r.id),
        ],
      }
      p.write([...existing, record])
      return record
    },

    async forget(id: string): Promise<void> {
      /* HARD DELETE, AND IT HAS TO BE.
         The brief says "respect explicit user deletion". A soft-hidden record
         still exists, still ranks in any code path that forgets the flag, and
         still sits on disk --- telling a user something is deleted when it is
         merely hidden is a lie with their data. Records that pointed at this
         one keep the dangling id, which is harmless: `historyOf` returns what
         it can find. */
      p.write(p.read().filter((r) => r.id !== id))
    },

    async historyOf(id: string): Promise<readonly MemoryRecord[]> {
      const all = p.read()
      const record = all.find((r) => r.id === id)
      if (!record) return []
      const seen = new Set<string>()
      const out: MemoryRecord[] = []
      const walk = (ids: readonly string[]) => {
        for (const i of ids) {
          if (seen.has(i)) continue
          seen.add(i)
          const found = all.find((r) => r.id === i)
          if (found) {
            out.push(found)
            walk(found.supersedes)
          }
        }
      }
      walk(record.supersedes)
      return out
    },

    async all(): Promise<readonly MemoryRecord[]> {
      return p.read()
    },
  }
}

function isSuperseded(r: MemoryRecord, all: readonly MemoryRecord[]): boolean {
  return all.some((other) => other.id !== r.id && other.supersedes.includes(r.id))
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)]
}

function mergeEntities(prior: readonly Entity[], fresh: readonly Entity[]): Entity[] {
  const byId = new Map(prior.map((e) => [e.id, e]))
  for (const e of fresh) {
    const was = byId.get(e.id)
    byId.set(e.id, was ? { ...was, mentions: [...was.mentions, ...e.mentions] } : e)
  }
  return [...byId.values()]
}
