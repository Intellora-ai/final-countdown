import type { CommunicationPlan, MemoryRecord } from '../kernel/contracts'
import { overlap, tokens } from '../kernel/text'

/**
 * LEARNING INTELLIGENCE --- Capability 34.
 *
 * "Only after the general substrate is working should this specialized layer
 * operate." It does, and the shape of this file is what enforces that:
 *
 *   - Nothing here reads a request. `understand` does that.
 *   - Nothing here routes. `router` does that, and it switches this layer on
 *     for exactly one intent.
 *   - Nothing here decides depth or representation. `communicate` does that,
 *     and this layer ADJUSTS the plan it produced rather than replacing it.
 *
 * That last point is the whole architecture in one function signature: see
 * `teachingAdjustments`, which takes a `CommunicationPlan` and returns a
 * `CommunicationPlan`. If this layer built its own plan from scratch, a lesson
 * and an answer would drift apart until "explain X" and "teach me X" came out
 * of two different products.
 */

/* -------------------------------------------------------------------------- */
/* Mastery --- five states, deliberately not a number                         */
/* -------------------------------------------------------------------------- */

/**
 * The brief's five levels, kept as named states.
 *
 * A 0-1 score would be easier to compute and worse to act on: the difference
 * between `exposed` and `partial` is whether they have SEEN it or tried it,
 * which is a difference in kind, not in degree. Averaging those into 0.4 loses
 * exactly the information that decides what to do next.
 */
export type Mastery = 'unknown' | 'exposed' | 'partial' | 'competent' | 'mastered'

export const MASTERY_ORDER: readonly Mastery[] = ['unknown', 'exposed', 'partial', 'competent', 'mastered']

export function masteryRank(m: Mastery): number {
  return MASTERY_ORDER.indexOf(m)
}

/* -------------------------------------------------------------------------- */
/* Concept model                                                              */
/* -------------------------------------------------------------------------- */

export interface Concept {
  id: string
  label: string
  /** Concepts that must be held first. The edges of the prerequisite graph. */
  requires: readonly string[]
}

export interface ConceptGraph {
  concepts: ReadonlyMap<string, Concept>
}

export function buildGraph(concepts: readonly Concept[]): ConceptGraph {
  const map = new Map(concepts.map((c) => [c.id, c]))
  for (const c of concepts) {
    for (const r of c.requires) {
      if (!map.has(r)) throw new Error(`concept "${c.id}" requires unknown concept "${r}"`)
    }
  }
  /* A prerequisite cycle means no valid learning order exists. Caught at
     construction, because discovered at run time it looks like a curriculum
     that simply never recommends anything. */
  const cycle = findCycle(map)
  if (cycle) throw new Error(`prerequisite cycle: ${cycle.join(' -> ')}`)
  return { concepts: map }
}

function findCycle(map: ReadonlyMap<string, Concept>): string[] | null {
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const walk = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'open') return [...stack.slice(stack.indexOf(id)), id]
    state.set(id, 'open')
    stack.push(id)
    for (const r of map.get(id)?.requires ?? []) {
      const found = walk(r)
      if (found) return found
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }
  for (const id of map.keys()) {
    const found = walk(id)
    if (found) return found
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Learner model                                                              */
/* -------------------------------------------------------------------------- */

export interface Attempt {
  conceptId: string
  correct: boolean
  /** ISO. Drives spacing. */
  at: string
  /** 1 (easiest) to 5. Feeds adaptive difficulty. */
  difficulty: number
}

export interface Learner {
  mastery: ReadonlyMap<string, Mastery>
  misconceptions: ReadonlyMap<string, string>
  attempts: readonly Attempt[]
  /** Concepts the learner said they already hold. */
  claimed: readonly string[]
}

export const NEW_LEARNER: Learner = {
  mastery: new Map(),
  misconceptions: new Map(),
  attempts: [],
  claimed: [],
}

/**
 * Build the learner from long-term memory.
 *
 * READS THE SAME STORE EVERYTHING ELSE DOES. There is no separate "learning
 * database", because two stores means two truths: a learner who tells the
 * general assistant "I understand percentages now" would still be treated as
 * struggling by a learning layer with its own copy.
 */
export function learnerFrom(
  memories: readonly MemoryRecord[],
  graph: ConceptGraph,
  attempts: readonly Attempt[] = [],
): Learner {
  const mastery = new Map<string, Mastery>()
  const misconceptions = new Map<string, string>()
  const claimed: string[] = []

  for (const m of memories) {
    const concept = matchConcept(m.content, graph)
    if (!concept) continue
    if (m.kind === 'mastery') {
      mastery.set(concept.id, 'competent')
      claimed.push(concept.id)
    } else if (m.kind === 'misconception') {
      /* A stated struggle is `partial`, NOT `unknown`. Someone who says "I
         struggle with integration" has met integration --- treating them as a
         beginner restarts material they have already seen, which is the
         fastest way to lose them. */
      mastery.set(concept.id, 'partial')
      misconceptions.set(concept.id, m.content)
    }
  }

  /* Attempts override statements. What someone DID outranks what they said. */
  const byConcept = new Map<string, Attempt[]>()
  for (const a of attempts) {
    byConcept.set(a.conceptId, [...(byConcept.get(a.conceptId) ?? []), a])
  }
  for (const [id, list] of byConcept) {
    mastery.set(id, masteryFromAttempts(list))
  }

  return { mastery, misconceptions, attempts, claimed }
}

function matchConcept(text: string, graph: ConceptGraph): Concept | null {
  const want = tokens(text)
  let best: { c: Concept; score: number } | null = null
  for (const c of graph.concepts.values()) {
    const score = overlap(tokens(c.label), want)
    if (score > 0.5 && (!best || score > best.score)) best = { c, score }
  }
  return best?.c ?? null
}

/**
 * Mastery from evidence.
 *
 * RECENCY-WEIGHTED, because learning moves in one direction and an average
 * does not. Someone who failed four times and then succeeded twice is
 * improving; a mean says 33% and calls them stuck. The last three attempts
 * carry the decision.
 */
export function masteryFromAttempts(attempts: readonly Attempt[]): Mastery {
  if (attempts.length === 0) return 'unknown'
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const recent = sorted.slice(-3)
  const right = recent.filter((a) => a.correct).length

  if (recent.length === 1) return recent[0]?.correct ? 'partial' : 'exposed'
  if (right === 0) return 'exposed'
  if (right < recent.length) return 'partial'
  /* All recent attempts correct. `mastered` additionally requires that the
     evidence is not all from one sitting --- getting three right in a row
     immediately after being shown something is short-term recall, which is
     precisely what spaced repetition exists to distinguish from mastery. */
  const span = Date.parse(recent[recent.length - 1]?.at ?? '') - Date.parse(recent[0]?.at ?? '')
  return span > 86_400_000 && attempts.length >= 3 ? 'mastered' : 'competent'
}

/* -------------------------------------------------------------------------- */
/* Curriculum --- what to learn next                                          */
/* -------------------------------------------------------------------------- */

export interface Recommendation {
  conceptId: string
  label: string
  because: string
  /** Prerequisites not yet held, which is why this is not next. */
  blockedBy: readonly string[]
}

export function masteryOf(learner: Learner, id: string): Mastery {
  return learner.mastery.get(id) ?? 'unknown'
}

/**
 * What should I learn next?
 *
 * READY means every prerequisite is at least `competent`. Recommending
 * something whose prerequisites are shaky is how a learner concludes they are
 * bad at the subject when they are actually missing one thing underneath it.
 *
 * Ordered so that shoring up a wobbly prerequisite beats starting new
 * material: a `partial` concept that other things depend on is the highest
 * -leverage thing in the graph.
 */
export function whatNext(learner: Learner, graph: ConceptGraph, limit = 3): Recommendation[] {
  const ready = (id: string) =>
    (graph.concepts.get(id)?.requires ?? []).every((r) => masteryRank(masteryOf(learner, r)) >= masteryRank('competent'))

  const dependents = new Map<string, number>()
  for (const c of graph.concepts.values()) {
    for (const r of c.requires) dependents.set(r, (dependents.get(r) ?? 0) + 1)
  }

  const out: Recommendation[] = []
  for (const c of graph.concepts.values()) {
    const m = masteryOf(learner, c.id)
    if (m === 'mastered' || m === 'competent') continue

    const missing = (c.requires ?? []).filter(
      (r) => masteryRank(masteryOf(learner, r)) < masteryRank('competent'),
    )
    if (!ready(c.id)) {
      out.push({ conceptId: c.id, label: c.label, because: 'prerequisites are not solid yet', blockedBy: missing })
      continue
    }

    const leverage = dependents.get(c.id) ?? 0
    out.push({
      conceptId: c.id,
      label: c.label,
      because:
        m === 'partial'
          ? `already met, not solid, and ${leverage} later concept${leverage === 1 ? '' : 's'} depend on it`
          : leverage > 0
            ? `ready to start, and ${leverage} later concept${leverage === 1 ? '' : 's'} depend on it`
            : 'ready to start',
      blockedBy: [],
    })
  }

  return out
    .sort((a, b) => {
      /* Blocked last. Then partial-before-unknown. Then by leverage. */
      const blockedDiff = a.blockedBy.length - b.blockedBy.length
      if (blockedDiff !== 0) return blockedDiff > 0 ? 1 : -1
      const rankA = masteryRank(masteryOf(learner, a.conceptId))
      const rankB = masteryRank(masteryOf(learner, b.conceptId))
      if (rankA !== rankB) return rankB - rankA
      return (dependents.get(b.conceptId) ?? 0) - (dependents.get(a.conceptId) ?? 0)
    })
    .slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/* Adaptive difficulty                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Next difficulty, 1 to 5.
 *
 * Moves DOWN faster than it moves UP. Two failures at level 4 drops to 2; two
 * successes at level 2 rises to 3. The asymmetry is deliberate: a learner
 * stuck too high stops and concludes they cannot do it, while a learner held
 * too low is merely bored for one more question.
 */
export function nextDifficulty(attempts: readonly Attempt[], floor = 1, ceiling = 5): number {
  const recent = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-2)
  if (recent.length === 0) return 2
  const current = recent[recent.length - 1]?.difficulty ?? 2
  const wins = recent.filter((a) => a.correct).length

  if (recent.length === 1) {
    return clamp(current + (recent[0]?.correct ? 1 : -1), floor, ceiling)
  }
  if (wins === 2) return clamp(current + 1, floor, ceiling)
  if (wins === 0) return clamp(current - 2, floor, ceiling)
  return clamp(current, floor, ceiling)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/* -------------------------------------------------------------------------- */
/* Spaced repetition                                                          */
/* -------------------------------------------------------------------------- */

const DAY = 86_400_000

/**
 * When to review this concept next.
 *
 * Interval doubles on success and RESETS on failure --- not halves. A learner
 * who has just got something wrong needs to see it soon regardless of how well
 * they knew it last month; halving would leave a forgotten concept a week
 * away because it used to be strong.
 */
export function nextReview(attempts: readonly Attempt[], conceptId: string, from: string): string {
  const mine = attempts
    .filter((a) => a.conceptId === conceptId)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (mine.length === 0) return from

  let interval = 1
  let streak = 0
  for (const a of mine) {
    if (a.correct) {
      streak++
      interval = streak === 1 ? 1 : Math.min(180, interval * 2)
    } else {
      streak = 0
      interval = 1
    }
  }
  return new Date(Date.parse(from) + interval * DAY).toISOString()
}

export function dueForReview(learner: Learner, now: string): string[] {
  const ids = new Set(learner.attempts.map((a) => a.conceptId))
  const due: string[] = []
  for (const id of ids) {
    const last = learner.attempts
      .filter((a) => a.conceptId === id)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
    if (!last) continue
    if (Date.parse(nextReview(learner.attempts, id, last.at)) <= Date.parse(now)) due.push(id)
  }
  return due
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export interface Feedback {
  whatIsWrong: string
  whyItIsWrong: string
  /** How much to give away. */
  help: 'hint' | 'partial' | 'full'
  nextAttempt: string
}

/**
 * Why the answer was wrong, and how much to give away --- Capability 34.
 *
 * HELP ESCALATES WITH FAILURE COUNT, and that is the substance of the feature.
 * A full worked solution on the first miss removes the only chance the learner
 * had to find it themselves; a hint on the fourth miss is withholding. The
 * schedule is hint -> partial -> full, keyed to consecutive failures on THIS
 * concept.
 */
export function feedbackFor(
  conceptId: string,
  learner: Learner,
  observed: string,
  expected: string,
): Feedback {
  const consecutive = countTrailingFailures(learner.attempts, conceptId)
  const known = learner.misconceptions.get(conceptId)

  return {
    whatIsWrong: `answered "${observed}" where the result is "${expected}"`,
    whyItIsWrong:
      known ?? 'the step that produced this differs from the one the method requires',
    help: consecutive >= 3 ? 'full' : consecutive === 2 ? 'partial' : 'hint',
    nextAttempt:
      consecutive >= 3
        ? 'work through the solved version, then try a fresh one of the same difficulty'
        : consecutive === 2
          ? 'try again with the first step given'
          : 'try again',
  }
}

function countTrailingFailures(attempts: readonly Attempt[], conceptId: string): number {
  const mine = attempts
    .filter((a) => a.conceptId === conceptId)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  let n = 0
  for (let i = mine.length - 1; i >= 0; i--) {
    if (mine[i]?.correct) break
    n++
  }
  return n
}

/* -------------------------------------------------------------------------- */
/* Learning-specific communication                                            */
/* -------------------------------------------------------------------------- */

/**
 * ADJUST the communication plan; never replace it.
 *
 * THE SEAM THAT KEEPS THE THREE LAYERS APART.
 *
 * If this returned a plan of its own, "explain X" and "teach me X" would be
 * produced by two different code paths and would drift until they felt like
 * two different products. Taking a plan and returning a plan means every
 * improvement to communication intelligence is inherited by teaching for free,
 * and every teaching-specific decision is visibly a DELTA that can be read and
 * argued with.
 */
export function teachingAdjustments(
  base: CommunicationPlan,
  learner: Learner,
  conceptId: string,
): CommunicationPlan {
  const mastery = masteryOf(learner, conceptId)
  const misconception = learner.misconceptions.get(conceptId)

  const representations = [...base.representations]
  const define = [...base.define]
  const omit = [...base.omit]
  const notes: string[] = [base.because]

  if (mastery === 'unknown' || mastery === 'exposed') {
    if (!representations.includes('worked-example')) representations.unshift('worked-example')
    notes.push('new material: show the mechanism running before describing it')
  }

  if (misconception) {
    /* A known wrong belief is not corrected by a fresh explanation --- the
       learner already has one that fits. It has to be CONTRASTED against the
       thing they believe, which is a different piece of content. */
    if (!representations.includes('comparison')) representations.unshift('comparison')
    notes.push('a specific misconception is on record; contrast against it rather than restating')
  }

  if (mastery === 'competent' || mastery === 'mastered') {
    /* Re-teaching something they hold is the fastest way to lose a learner's
       attention, and the cost is not just boredom --- it teaches them that
       the system does not track what they know. */
    omit.push('re-explanation of what this learner already holds')
    notes.push('already competent: retrieve and stretch rather than teach')
  }

  return {
    ...base,
    representations,
    define,
    omit,
    /* Progressive is forced ON for genuinely new material regardless of what
       the base plan decided, because the checkpoint between beats is the only
       moment the system finds out whether any of it landed. */
    progressive: base.progressive || mastery === 'unknown' || mastery === 'exposed',
    because: notes.join('; '),
  }
}
