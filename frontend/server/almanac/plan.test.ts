/* Tests for planDay — the rule that decides a student's day.
 *
 * DESIRED OUTCOME
 *   A student opens the app and sees a day's work that is theirs: it never
 *   repeats something they finished, it never quietly drops something they did
 *   not, and it does not change under them once the day has started.
 *
 * THE RULES, AS ASSERTIONS
 *   R1  A concept the student marked done NEVER appears again.
 *   R2  A concept planned yesterday and not marked done appears again today,
 *       flagged as carried over.
 *   R3  A concept whose prerequisites are not all done is never planned.
 *   R4  Items per day: at most one per chosen subject; at least
 *       min(2, subjectsChosen) while enough concepts are eligible.
 *   R5  At most ONE concept per subject per day — that is what mixing means.
 *   R6  Every concept's minutes sit in the 10-25 band the planner works in.
 *   R7  Allocated minutes stay inside the student's daily budget, except that
 *       the minimum item count is a floor.
 *   R8  The same inputs always produce the same plan.
 *
 * WHY ONLY THE STUDENT MARKS DONE
 *   Nothing here writes `done`. The planner reads it. A planner that could mark
 *   its own work finished would quietly erase the backlog rule, and a student
 *   would lose work they never completed.
 */

import { describe, expect, it } from 'vitest'

import { planDay, type AlmanacState, type DayPlan } from './plan.ts'

/* ---- a small, explicit curriculum ---- */

function concept(id: string, minutes = 15, deps: string[] = []) {
  return { id, name: id, minutes, deps }
}

function subject(id: string, conceptIds: readonly string[], minutes = 15) {
  return {
    id,
    name: id,
    chapters: [{ id: `${id}-ch1`, name: `${id} chapter`, concepts: conceptIds.map((c) => concept(c, minutes)) }],
  }
}

const MATHS = subject('maths', ['m1', 'm2', 'm3', 'm4'])
const PHYSICS = subject('physics', ['p1', 'p2', 'p3', 'p4'])
const CHEM = subject('chemistry', ['c1', 'c2', 'c3', 'c4'])
const BIO = subject('biology', ['b1', 'b2', 'b3', 'b4'])

function state(overrides: Partial<AlmanacState> = {}): AlmanacState {
  return {
    date: '2026-08-25',
    dailyMinutes: 120,
    subjects: [MATHS, PHYSICS],
    done: new Set<string>(),
    yesterday: undefined,
    ...overrides,
  }
}

const ids = (plan: DayPlan) => plan.items.map((i) => i.conceptId)

describe('R1 — a finished concept never comes back', () => {
  it('skips a concept the student marked done', () => {
    const plan = planDay(state({ done: new Set(['m1']) }))
    expect(ids(plan)).not.toContain('m1')
  })

  it('moves on to the next concept in that subject instead', () => {
    const plan = planDay(state({ done: new Set(['m1']) }))
    expect(ids(plan)).toContain('m2')
  })

  it('never returns a done concept even when it was on yesterday’s plan', () => {
    /* Finishing yesterday's work is exactly how it should leave the plan. */
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [{ conceptId: 'm1', subjectId: 'maths', chapterId: 'maths-ch1', minutes: 15 }],
      allocated: 15,
      capacity: 120,
    }
    const plan = planDay(state({ done: new Set(['m1']), yesterday }))
    expect(ids(plan)).not.toContain('m1')
  })
})

describe('R2 — unfinished work carries over, and says so', () => {
  it('brings yesterday’s unfinished concept back today', () => {
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [{ conceptId: 'm1', subjectId: 'maths', chapterId: 'maths-ch1', minutes: 15 }],
      allocated: 15,
      capacity: 120,
    }
    expect(ids(planDay(state({ yesterday })))).toContain('m1')
  })

  it('marks it as carried over, with the date it was first set', () => {
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [{ conceptId: 'm1', subjectId: 'maths', chapterId: 'maths-ch1', minutes: 15 }],
      allocated: 15,
      capacity: 120,
    }
    const carried = planDay(state({ yesterday })).items.find((i) => i.conceptId === 'm1')
    expect(carried?.carriedFrom).toBe('2026-08-24')
  })

  it('keeps the ORIGINAL date when a concept is carried twice', () => {
    /* Otherwise a topic sitting untouched for a week looks a day old forever,
     * and the student never sees how long it has been waiting. */
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [{ conceptId: 'm1', subjectId: 'maths', chapterId: 'maths-ch1', minutes: 15, carriedFrom: '2026-08-20' }],
      allocated: 15,
      capacity: 120,
    }
    const carried = planDay(state({ yesterday })).items.find((i) => i.conceptId === 'm1')
    expect(carried?.carriedFrom).toBe('2026-08-20')
  })

  it('puts carried work before new work', () => {
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [{ conceptId: 'p1', subjectId: 'physics', chapterId: 'physics-ch1', minutes: 15 }],
      allocated: 15,
      capacity: 120,
    }
    expect(ids(planDay(state({ yesterday })))[0]).toBe('p1')
  })

  it('does not flag a brand new concept as carried over', () => {
    const plan = planDay(state())
    expect(plan.items.every((i) => i.carriedFrom === undefined)).toBe(true)
  })
})

describe('R3 — prerequisites must be finished first', () => {
  it('does not plan a concept whose prerequisite is unfinished', () => {
    const gated = {
      id: 'maths',
      name: 'maths',
      chapters: [{
        id: 'maths-ch1',
        name: 'c',
        concepts: [concept('m1'), concept('m2', 15, ['m1'])],
      }],
    }
    const plan = planDay(state({ subjects: [gated], done: new Set() }))
    expect(ids(plan)).not.toContain('m2')
  })

  it('unlocks it once the prerequisite is marked done', () => {
    const gated = {
      id: 'maths',
      name: 'maths',
      chapters: [{
        id: 'maths-ch1',
        name: 'c',
        concepts: [concept('m1'), concept('m2', 15, ['m1'])],
      }],
    }
    const plan = planDay(state({ subjects: [gated], done: new Set(['m1']) }))
    expect(ids(plan)).toContain('m2')
  })
})

describe('R3 — a locked subject contributes nothing', () => {
  it('plans nothing from a subject whose only concept is still locked', () => {
    /* Written after a mutation run: deleting the prerequisite check entirely
     * left every earlier R3 test green, because the planner takes the FIRST
     * eligible concept and that was the ungated one either way. This subject
     * has nothing BUT a locked concept, so the check is the only thing
     * standing between the student and a topic they cannot yet follow. */
    const locked = {
      id: 'locked',
      name: 'locked',
      chapters: [{ id: 'locked-ch1', name: 'c', concepts: [concept('L1', 15, ['never-done'])] }],
    }
    const plan = planDay(state({ subjects: [MATHS, locked] }))
    expect(plan.items.map((i) => i.subjectId)).toEqual(['maths'])
  })

  it('plans it once the thing it waits on is finished', () => {
    const locked = {
      id: 'locked',
      name: 'locked',
      chapters: [{ id: 'locked-ch1', name: 'c', concepts: [concept('L1', 15, ['gate'])] }],
    }
    const plan = planDay(state({ subjects: [MATHS, locked], done: new Set(['gate']) }))
    expect(ids(plan)).toContain('L1')
  })
})

describe('a subject the student has dropped', () => {
  it('does not carry over work from a subject that is no longer chosen', () => {
    /* Changing subjects should not leave yesterday's chemistry sitting on the
     * plan forever with no way to reach it. */
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [
        { conceptId: 'c1', subjectId: 'chemistry', chapterId: 'chemistry-ch1', minutes: 15 },
        { conceptId: 'm1', subjectId: 'maths', chapterId: 'maths-ch1', minutes: 15 },
      ],
      allocated: 30,
      capacity: 120,
    }
    const plan = planDay(state({ subjects: [MATHS, PHYSICS], yesterday }))
    expect(ids(plan)).not.toContain('c1')
  })

  it('still carries the work from subjects that are still chosen', () => {
    const yesterday: DayPlan = {
      date: '2026-08-24',
      items: [
        { conceptId: 'c1', subjectId: 'chemistry', chapterId: 'chemistry-ch1', minutes: 15 },
        { conceptId: 'm1', subjectId: 'maths', chapterId: 'maths-ch1', minutes: 15 },
      ],
      allocated: 30,
      capacity: 120,
    }
    expect(ids(planDay(state({ subjects: [MATHS, PHYSICS], yesterday })))).toContain('m1')
  })
})

describe('R4 and R5 — how many, and from where', () => {
  it('gives a one-subject student exactly one concept a day', () => {
    /* Your rule: choose one subject, and one topic is both the floor and the
     * ceiling. */
    const plan = planDay(state({ subjects: [MATHS] }))
    expect(plan.items).toHaveLength(1)
  })

  it('never plans more concepts than the student has subjects', () => {
    const plan = planDay(state({ subjects: [MATHS, PHYSICS, CHEM] }))
    expect(plan.items.length).toBeLessThanOrEqual(3)
  })

  it('plans at least two when two or more subjects are chosen', () => {
    const plan = planDay(state({ subjects: [MATHS, PHYSICS, CHEM, BIO] }))
    expect(plan.items.length).toBeGreaterThanOrEqual(2)
  })

  it('never plans two concepts from the same subject on one day', () => {
    const plan = planDay(state({ subjects: [MATHS, PHYSICS, CHEM, BIO] }))
    const subjectIds = plan.items.map((i) => i.subjectId)
    expect(new Set(subjectIds).size).toBe(subjectIds.length)
  })

  it('plans nothing at all when every concept is finished', () => {
    const plan = planDay(state({ done: new Set(['m1', 'm2', 'm3', 'm4', 'p1', 'p2', 'p3', 'p4']) }))
    expect(plan.items).toEqual([])
  })

  it('plans what it can when one subject is exhausted', () => {
    const plan = planDay(state({ done: new Set(['m1', 'm2', 'm3', 'm4']) }))
    expect(plan.items.map((i) => i.subjectId)).toEqual(['physics'])
  })
})

describe('R6 and R7 — minutes', () => {
  it('carries each concept’s own minutes onto the plan', () => {
    const plan = planDay(state())
    expect(plan.items.every((i) => i.minutes === 15)).toBe(true)
  })

  it('reports what it allocated and what the budget was', () => {
    const plan = planDay(state({ dailyMinutes: 120 }))
    expect(plan.capacity).toBe(120)
    expect(plan.allocated).toBe(plan.items.reduce((n, i) => n + i.minutes, 0))
  })

  it('stops adding once the budget is used up', () => {
    /* Four subjects, 25 minutes each, 60 minutes of budget: two fit. */
    const heavy = [
      subject('maths', ['m1'], 25),
      subject('physics', ['p1'], 25),
      subject('chemistry', ['c1'], 25),
      subject('biology', ['b1'], 25),
    ]
    const plan = planDay(state({ subjects: heavy, dailyMinutes: 60 }))
    expect(plan.items).toHaveLength(2)
  })

  it('still meets the two-concept floor when the budget is tiny', () => {
    /* The floor is a rule the student asked for; the budget is a preference.
     * The floor wins, and the plan says so by reporting the overrun. */
    const heavy = [subject('maths', ['m1'], 25), subject('physics', ['p1'], 25)]
    const plan = planDay(state({ subjects: heavy, dailyMinutes: 10 }))
    expect(plan.items).toHaveLength(2)
    expect(plan.allocated).toBe(50)
  })
})

describe('R8 — the same day plans the same way', () => {
  it('is deterministic', () => {
    const s = state({ subjects: [MATHS, PHYSICS, CHEM, BIO] })
    expect(ids(planDay(s))).toEqual(ids(planDay(s)))
  })

  it('does not depend on the order subjects arrive in', () => {
    const a = planDay(state({ subjects: [MATHS, PHYSICS] }))
    const b = planDay(state({ subjects: [PHYSICS, MATHS] }))
    expect(ids(a).slice().sort()).toEqual(ids(b).slice().sort())
  })
})

describe('the ceiling, and why there is no separate guard for it', () => {
  it('never exceeds one concept per chosen subject, however many days run', () => {
    /* The ceiling is structural: at most one concept per subject, and only
     * from subjects the student chose. A mutation run showed a separate
     * `items.length >= maximum` guard could be deleted with every test still
     * green, because it is unreachable — so it was removed rather than left as
     * code no test can defend. This is the assertion that keeps the ceiling. */
    const plan = planDay(state({ subjects: [MATHS, PHYSICS, CHEM, BIO], dailyMinutes: 1000 }))
    expect(plan.items.length).toBeLessThanOrEqual(4)
    expect(new Set(plan.items.map((i) => i.subjectId)).size).toBe(plan.items.length)
  })
})

describe('a tight budget picks the same subjects whatever order they arrive in', () => {
  it('is not decided by the caller’s array order', () => {
    /* Written after a mutation run: removing the sort left every test green,
     * because the only order test compared SORTED ids and the budget was large
     * enough to fit everything. Here only two of three fit, so which two is a
     * real decision — and it must not depend on argument order. */
    const heavy = [
      subject('alpha', ['a1'], 25),
      subject('beta', ['b1'], 25),
      subject('gamma', ['g1'], 25),
    ]
    const forwards = planDay(state({ subjects: heavy, dailyMinutes: 60 }))
    const backwards = planDay(state({ subjects: [...heavy].reverse(), dailyMinutes: 60 }))

    expect(forwards.items).toHaveLength(2)
    expect(ids(forwards)).toEqual(ids(backwards))
  })
})

describe('over many random histories, the rules always hold', () => {
  /* A single example proves one path. This walks 60 days for many different
   * students, marking work done at random, and checks every rule on every day.
   * A repeat that only happens on day 34 of a particular history is exactly the
   * kind of bug a handful of examples never finds. */
  function seeded(seed: number) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }

  const ALL = [MATHS, PHYSICS, CHEM, BIO]

  it('never repeats a finished concept across sixty days', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const random = seeded(seed)
      const subjects = ALL.slice(0, 1 + Math.floor(random() * 4))
      const done = new Set<string>()
      const everDone: string[] = []
      let yesterday: DayPlan | undefined

      for (let day = 0; day < 60; day += 1) {
        const plan = planDay({
          date: `2026-09-${String((day % 28) + 1).padStart(2, '0')}`,
          dailyMinutes: 120,
          subjects,
          done,
          yesterday,
        })

        for (const item of plan.items) {
          expect(done.has(item.conceptId), `seed ${seed} day ${day}: ${item.conceptId} was already done`).toBe(false)
        }

        for (const item of plan.items) {
          if (random() < 0.4) {
            done.add(item.conceptId)
            everDone.push(item.conceptId)
          }
        }
        yesterday = plan
      }

      expect(new Set(everDone).size).toBe(everDone.length)
    }
  })

  it('never breaks the count rules on any day', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const random = seeded(seed * 7)
      const subjects = ALL.slice(0, 1 + Math.floor(random() * 4))
      const done = new Set<string>()
      let yesterday: DayPlan | undefined

      for (let day = 0; day < 60; day += 1) {
        const plan = planDay({
          date: `2026-09-${String((day % 28) + 1).padStart(2, '0')}`,
          dailyMinutes: 120,
          subjects,
          done,
          yesterday,
        })

        expect(plan.items.length, `seed ${seed} day ${day}`).toBeLessThanOrEqual(subjects.length)

        const used = new Set(plan.items.map((i) => i.subjectId))
        expect(used.size, `seed ${seed} day ${day}: two concepts from one subject`).toBe(plan.items.length)

        for (const item of plan.items) {
          expect(item.minutes).toBeGreaterThanOrEqual(10)
          expect(item.minutes).toBeLessThanOrEqual(25)
        }

        for (const item of plan.items) if (random() < 0.4) done.add(item.conceptId)
        yesterday = plan
      }
    }
  })

  it('never silently drops unfinished work', () => {
    /* Anything planned and not marked done must appear on the next day. */
    for (let seed = 1; seed <= 30; seed += 1) {
      const random = seeded(seed * 13)
      const subjects = ALL.slice(0, 2 + Math.floor(random() * 3))
      const done = new Set<string>()
      let yesterday: DayPlan | undefined

      for (let day = 0; day < 40; day += 1) {
        const plan = planDay({
          date: `2026-09-${String((day % 28) + 1).padStart(2, '0')}`,
          dailyMinutes: 200,
          subjects,
          done,
          yesterday,
        })

        if (yesterday) {
          const unfinished = yesterday.items.filter((i) => !done.has(i.conceptId))
          for (const item of unfinished) {
            expect(
              plan.items.some((p) => p.conceptId === item.conceptId),
              `seed ${seed} day ${day}: ${item.conceptId} was dropped`,
            ).toBe(true)
          }
        }

        for (const item of plan.items) if (random() < 0.35) done.add(item.conceptId)
        yesterday = plan
      }
    }
  })
})
