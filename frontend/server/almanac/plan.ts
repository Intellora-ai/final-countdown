/**
 * ALMANAC — deciding one student's day.
 *
 * A pure function. The same inputs always produce the same day, which is what
 * lets the day be written down once and never move under the student.
 *
 * THE ONE RULE EVERYTHING ELSE SERVES
 *     Only the student marks a concept done. Nothing here writes it. The
 *     planner reads `done` and never adds to it, so a topic can only leave the
 *     plan by the student saying it is finished. A planner allowed to mark its
 *     own work complete would erase the backlog quietly, and the student would
 *     lose work they never did.
 *
 * WHY UNFINISHED WORK IS UNCONDITIONAL
 *     Carried-over items are added before anything else and are never dropped
 *     for want of budget. Dropping them would mean the app silently forgetting
 *     something it had already asked for — the exact failure the backlog exists
 *     to prevent. New work is what gets squeezed when the day is full.
 *
 * WHY THE MINIMUM BEATS THE BUDGET
 *     The daily minute figure is a preference. "At least two topics" is a rule
 *     the student set. When they collide the rule wins, and `allocated` reports
 *     the overrun rather than hiding it. In practice they cannot collide: the
 *     smallest budget offered is 90 minutes and two concepts cost at most 50.
 *
 * WHY ONE CONCEPT PER SUBJECT
 *     That is what mixing means here, and it is what makes the ceiling equal
 *     the number of subjects chosen. Choose one subject and the day is one
 *     topic; choose four and it is at most four, one from each.
 */

export interface ConceptLike {
  readonly id: string
  readonly name: string
  readonly minutes: number
  readonly deps: readonly string[]
}

export interface ChapterLike {
  readonly id: string
  readonly name: string
  readonly concepts: readonly ConceptLike[]
}

export interface SubjectLike {
  readonly id: string
  readonly name: string
  readonly chapters: readonly ChapterLike[]
}

export interface PlannedItem {
  readonly conceptId: string
  readonly subjectId: string
  readonly chapterId: string
  readonly minutes: number
  /** The date this first appeared on a plan, when it is not today's. */
  readonly carriedFrom?: string
}

export interface DayPlan {
  readonly date: string
  readonly items: readonly PlannedItem[]
  readonly allocated: number
  readonly capacity: number
}

export interface AlmanacState {
  readonly date: string
  readonly dailyMinutes: number
  readonly subjects: readonly SubjectLike[]
  readonly done: ReadonlySet<string>
  readonly yesterday?: DayPlan
}

/** At least this many topics, unless there are not that many left to teach. */
function floorFor(subjectCount: number): number {
  return Math.min(2, subjectCount)
}

/** Ready to teach: not finished, and everything it depends on is finished. */
function isEligible(concept: ConceptLike, done: ReadonlySet<string>): boolean {
  if (done.has(concept.id)) return false
  return concept.deps.every((dep) => done.has(dep))
}

/** The first concept of a subject the student can start today, in syllabus order. */
function nextIn(subject: SubjectLike, done: ReadonlySet<string>): PlannedItem | undefined {
  for (const chapter of subject.chapters) {
    for (const concept of chapter.concepts) {
      if (isEligible(concept, done)) {
        return {
          conceptId: concept.id,
          subjectId: subject.id,
          chapterId: chapter.id,
          minutes: concept.minutes,
        }
      }
    }
  }
  return undefined
}

export function planDay(state: AlmanacState): DayPlan {
  const { date, dailyMinutes, subjects, done, yesterday } = state

  const minimum = floorFor(subjects.length)
  const chosen = new Set(subjects.map((subject) => subject.id))

  /* Yesterday's unfinished work, in the order it was set.
   *
   * Unconditional on budget — dropping it would mean silently forgetting
   * something already asked for — but NOT unconditional on the subject still
   * being chosen. Changing subjects would otherwise leave yesterday's chemistry
   * on the plan forever, with no way left to reach it. */
  const carried: PlannedItem[] = (yesterday?.items ?? [])
    .filter((item) => !done.has(item.conceptId) && chosen.has(item.subjectId))
    .map((item) => ({
      ...item,
      /* Keep the ORIGINAL date. Re-stamping it each morning would make a topic
       * that has waited a week look one day old forever. */
      carriedFrom: item.carriedFrom ?? yesterday?.date ?? date,
    }))

  const items: PlannedItem[] = [...carried]
  const usedSubjects = new Set(items.map((item) => item.subjectId))
  let allocated = items.reduce((total, item) => total + item.minutes, 0)

  /* Sorted by id so the plan does not depend on the order the caller happened
   * to pass the subjects in. */
  const remaining = [...subjects]
    .filter((subject) => !usedSubjects.has(subject.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  /* There is deliberately no separate `items.length >= subjects.length` guard.
   * A mutation run proved it unreachable: `remaining` already excludes every
   * subject already represented, so at most one concept per chosen subject can
   * ever be added. Code no test can defend is code that quietly stops being
   * true, so the ceiling is left to the structure that actually enforces it,
   * and asserted directly in the tests. */
  for (const subject of remaining) {
    const candidate = nextIn(subject, done)
    if (candidate === undefined) continue

    const fits = allocated + candidate.minutes <= dailyMinutes
    const belowFloor = items.length < minimum
    if (!fits && !belowFloor) continue

    items.push(candidate)
    allocated += candidate.minutes
  }

  return { date, items, allocated, capacity: dailyMinutes }
}
