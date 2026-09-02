/**
 * G3 — THE LEARNING PRIORITY ENGINE: what she should do NEXT.
 *
 * Not "what comes next in the book". The curriculum is a graph, not a
 * playlist, and the question is: given this learner, her evidence, the
 * prerequisites and the exam ahead, what is worth doing now?
 *
 *   ALL TOPICS
 *     -> filter by prerequisites satisfied
 *     -> filter by what she has already shown
 *     -> weigh by goal and by graph leverage
 *     -> NEXT-BEST ACTION, with a reason in one sentence
 *
 * TWO ORDERS, KEPT SEPARATE. The canonical curriculum order is what the
 * subject says exists and how its concepts depend on each other -- `deps`,
 * subject-scoped, never cross-applied. The adaptive learner order is what THIS
 * student should do next; it is derived here, every time, and never stored as
 * a schedule. A stored schedule is a plan that goes stale the moment she
 * learns something.
 *
 * WHAT COUNTS AS EVIDENCE is what `memory/evidence.ts` observed her do, and
 * nothing else: an answer is a sign it landed, a plea is a sign it did not.
 * No mastery percentage is invented -- see the note in `explanations.ts` on
 * why a number this software cannot measure poisons every later decision.
 *
 * THE ENGINE MUST BE ABLE TO EXPLAIN ITSELF. Every recommendation carries one
 * sentence a person can disagree with. A syllabus checklist cannot say "this,
 * because three later ideas wait on it and you nearly had it yesterday".
 */
import type { Evidence } from './memory/evidence.ts'
import { isOffSyllabus } from './offSyllabus.ts'

export interface Topic {
  readonly id: string
  readonly name: string
  /** The curriculum's own prerequisite ids, subject-scoped. */
  readonly deps: readonly string[]
}

export interface Syllabus {
  readonly topics: readonly Topic[]
  /** Exam weight per topic; absent means one. Never overrides prerequisites. */
  readonly weights?: Readonly<Record<string, number>>
}

export interface NextBest {
  readonly topicId: string
  readonly name: string
  /** Lower is sooner. */
  readonly rank: number
  /** One sentence, for a person to agree or disagree with. */
  readonly because: string
  /** Prerequisites she has not shown yet; empty means nothing is in the way. */
  readonly blockedBy: readonly string[]
}

/** What she has shown on one topic, from what she typed. */
interface Shown {
  readonly answered: boolean
  readonly pleaded: boolean
  readonly unfinished: boolean
}

function shownOn(evidence: readonly Evidence[] | undefined): Shown {
  if (evidence === undefined || evidence.length === 0) {
    return { answered: false, pleaded: false, unfinished: false }
  }
  const answered = evidence.some((one) => one.kind === 'answer')
  const pleaded = evidence.some((one) => one.kind === 'plea')
  /* Unfinished means the LAST thing she said was that it had not landed --
     not that she ever struggled. Someone who struggled and then answered has
     finished; someone who answered and then pleaded has not. */
  const last = [...evidence].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))[evidence.length - 1]
  return { answered, pleaded, unfinished: last?.kind === 'plea' }
}

function leverageIn(topics: readonly Topic[]): Map<string, number> {
  const count = new Map<string, number>()
  for (const topic of topics) {
    for (const dep of topic.deps) count.set(dep, (count.get(dep) ?? 0) + 1)
  }
  return count
}

export function whatToDoNext(
  syllabus: Syllabus,
  evidence: ReadonlyMap<string, readonly Evidence[]>,
  limit = 10,
): readonly NextBest[] {
  /* G4: OFF-SYLLABUS WORK CHANGES NO PROGRESS. A Class 10 student asking about
     black holes is taught and it stays on her canvas; counting it here would
     say she has covered ground she has not, and every later decision about
     what she is ready for would be made from that. Filtered explicitly rather
     than left to fall out of how the map is keyed, so the guarantee is visible
     where it is made -- and so a future change cannot quietly lose it. */
  const counted = new Map(
    [...evidence].filter(([topicId]) => !isOffSyllabus(topicId, syllabus)),
  )
  const leverage = leverageIn(syllabus.topics)
  const weights = syllabus.weights ?? {}
  const settled = (id: string): boolean => {
    const shown = shownOn(counted.get(id))
    return shown.answered && !shown.unfinished
  }

  const out: NextBest[] = []
  for (const topic of syllabus.topics) {
    const shown = shownOn(counted.get(topic.id))
    /* Done is done: never send her back to something she showed she has. */
    if (shown.answered && !shown.unfinished) continue

    const blockedBy = topic.deps.filter((dep) => !settled(dep))
    const unlocks = leverage.get(topic.id) ?? 0
    const weight = weights[topic.id] ?? 1

    /* RANK. Unfinished first -- she was there, it did not land, and coming back
       tomorrow is cheaper than starting again. Then unblocked topics, sooner
       the more they unlock and the more the exam wants them. Blocked ones come
       last and say what is in the way; they are shown, not hidden, because a
       learner is owed the reason. */
    const rank = (blockedBy.length > 0 ? 100 : 0) + (shown.unfinished ? -50 : 0) - unlocks * 2 - (weight - 1) * 3

    const because = shown.unfinished
      ? 'you were here yesterday and it did not land; finishing it is cheaper than starting again'
      : blockedBy.length > 0
        ? `it needs ${blockedBy.length === 1 ? 'one earlier idea' : `${blockedBy.length} earlier ideas`} you have not shown yet`
        : unlocks > 0 && weight > 1
          ? `nothing is blocking it, ${unlocks} later idea${unlocks === 1 ? '' : 's'} wait on it, and your exam weights it heavily`
          : unlocks > 0
            ? `nothing is blocking it and ${unlocks} later idea${unlocks === 1 ? '' : 's'} wait on it`
            : weight > 1
              ? 'nothing is blocking it and your exam weights it heavily'
              : 'nothing is blocking it, so it is a good place to start'

    out.push({ topicId: topic.id, name: topic.name, rank, because, blockedBy })
  }

  return out
    .sort((a, b) => a.rank - b.rank || (a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0))
    .slice(0, limit)
}
