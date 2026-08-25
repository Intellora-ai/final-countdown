// @vitest-environment jsdom
/* The dashboard, wired to Almanac.
 *
 * DESIRED OUTCOME
 *   The list on screen is the day Almanac WROTE DOWN. The student can mark a
 *   row done and nothing else can. Work carried over from an earlier day is
 *   obviously carried over. Start opens the teaching screen for that concept.
 *
 * WHAT MUST BE TRUE, and each of these is a check below
 *   1. Rows come from the planner's reply, not from a local recomputation.
 *   2. Done is the only control that records completion, and it records the
 *      concept the student actually pressed it on.
 *   3. A carried row is marked, in red, from the token layer -- no raw colour.
 *   4. Start navigates carrying the concept id.
 *   5. When the planner cannot be reached the screen SAYS SO. It never shows a
 *      locally computed list as if it were the frozen day.
 *
 * WHY 5 IS THE ONE THAT MATTERS MOST
 *   A fallback list that looks identical to the real one is worse than an
 *   error. The student works through a day the planner never wrote, marks it
 *   done against a ledger that never hears, and tomorrow it all comes back.
 */

import '@testing-library/jest-dom/vitest'
/* `fireEvent`, not `user-event`: that package is not a dependency of this
 * project and adding one is a tripwire in CLAUDE.md. The existing DOM tests
 * here use `fireEvent` for the same reason. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { TodayView, localDate } from './TodayView'
import { store } from '../data/store'
import { loadPlannedSubjects } from '../almanac/curriculum'
import type { SubjectLike } from '../almanac/resolve'
import type { AlmanacClient, DayPlan, PlannedItem } from '../almanac/client'
import type { DB } from '../types'

const STUDENT_ID = 'stu_test'
const TODAY = '2026-08-25'

/** Real ids out of the real curriculum, so resolution is genuinely exercised
 *  -- hard-coded ids would pass against a resolver that echoes its input.
 *
 *  Deliberately taken from DEEP in each subject rather than the front. The
 *  first version of this helper used the first chapter's first concept, and
 *  the "shows every concept" check then PASSED against the old component,
 *  which ignores the planner entirely and renders a locally computed plan.
 *  Both lists start at the front of the same curriculum, so the names
 *  coincided and the check proved nothing.
 *
 *  A local recomputation orders by dependencies and deadlines and fills the
 *  whole budget. Picking mid-curriculum concepts, and asserting the row set
 *  matches EXACTLY, is what makes the planner's reply the only thing that can
 *  satisfy it. */
let PLANNED: readonly SubjectLike[] = []

function realItems(): PlannedItem[] {
  const subjects = PLANNED
  const picked: PlannedItem[] = []
  for (const subject of subjects.slice(0, 2)) {
    const chapter = subject.chapters[Math.min(2, subject.chapters.length - 1)]
    const concepts = chapter?.concepts ?? []
    const concept = concepts[Math.min(1, concepts.length - 1)]
    if (chapter && concept) {
      picked.push({
        conceptId: concept.id, subjectId: subject.id, chapterId: chapter.id, minutes: concept.minutes ?? 15,
      })
    }
  }
  return picked
}

/** The concept names for a set of planned items, read out of the curriculum. */
function namesFor(items: PlannedItem[]): string[] {
  const subjects = PLANNED
  return items.map((i) =>
    subjects.find((s) => s.id === i.subjectId)!.chapters.find((c) => c.id === i.chapterId)!
      .concepts.find((c) => c.id === i.conceptId)!.name,
  )
}

function dayOf(items: PlannedItem[]): DayPlan {
  return { date: TODAY, items, allocated: items.reduce((n, i) => n + i.minutes, 0), capacity: 120 }
}

function fakeAlmanac(day: DayPlan, markDone = vi.fn().mockResolvedValue({ ok: true })): AlmanacClient {
  return { day: vi.fn().mockResolvedValue({ ok: true, day }), markDone } as unknown as AlmanacClient
}

function memoryAdapter(db: DB) {
  return { load: async () => db, subscribe: () => () => {}, commit: async () => {}, close: () => {} }
}

beforeAll(async () => {
  /* The GENERATED curriculum, which is what Almanac plans from. Seeding the
   * student from the dashboard's older module would give them subject ids the
   * planner has never heard of -- `physics` in class 9, for one. */
  PLANNED = await loadPlannedSubjects('9')
  const subjects = PLANNED.slice(0, 2).map((s) => s.id)
  const db: DB = {
    students: {
      [STUDENT_ID]: {
        id: STUDENT_ID, name: 'Test', avatarHue: 0, cls: '9', stream: null,
        subjects, minutes: 120, deadlines: {}, createdAt: 0, lastActiveAt: 0,
      },
    },
    progress: {}, activity: {}, currentId: STUDENT_ID,
  }
  await store.init(memoryAdapter(db))
})

afterEach(cleanup)

function ConceptProbe() {
  const { conceptId } = useParams()
  const { state } = useLocation()
  return (
    <div data-testid="teaching-screen" data-carried={(state as { carriedFrom?: string })?.carriedFrom ?? ''}>
      teaching: {conceptId}
    </div>
  )
}

function renderToday(almanac: AlmanacClient) {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route path="/today" element={<TodayView almanac={almanac} today={TODAY} />} />
        <Route path="/learn/:conceptId" element={<ConceptProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the day on screen is the day Almanac wrote', () => {
  it('asks the planner for today, for this student', async () => {
    const items = realItems()
    const almanac = fakeAlmanac(dayOf(items))
    renderToday(almanac)

    await waitFor(() => expect(almanac.day).toHaveBeenCalled())
    expect(vi.mocked(almanac.day).mock.calls[0][0]).toMatchObject({
      studentId: STUDENT_ID, date: TODAY, schoolClass: 9, dailyMinutes: 120,
    })
  })

  it('shows the planner\'s concepts, and ONLY those', async () => {
    /* Exactly, in order. "Contains each name" is satisfied by a component that
     * renders a locally computed plan of its own and happens to include them,
     * which is precisely what the old component did. */
    const items = realItems()
    const names = namesFor(items)
    renderToday(fakeAlmanac(dayOf(items)))

    for (const name of names) {
      expect(await screen.findByText(name)).toBeInTheDocument()
    }
    const rows = await screen.findAllByTestId('day-row')
    expect(rows).toHaveLength(items.length)
    expect(rows.map((r) => r.getAttribute('data-concept'))).toEqual(items.map((i) => i.conceptId))
  })

  it('shows an empty day as an empty day, not as an error', async () => {
    renderToday(fakeAlmanac(dayOf([])))
    expect(await screen.findByText(/nothing left/i)).toBeInTheDocument()
    expect(screen.queryByText(/could not be reached/i)).not.toBeInTheDocument()
  })
})

describe('Done', () => {
  it('records the concept whose row was pressed', async () => {
    const items = realItems()
    const markDone = vi.fn().mockResolvedValue({ ok: true })
    renderToday(fakeAlmanac(dayOf(items), markDone))

    const rows = await screen.findAllByTestId('day-row')
    await act(async () => {
      fireEvent.click(within(rows[1]).getByRole('button', { name: /done/i }))
    })

    expect(markDone).toHaveBeenCalledWith(STUDENT_ID, items[1].conceptId)
  })

  it('is present on every row, once', async () => {
    const items = realItems()
    renderToday(fakeAlmanac(dayOf(items)))

    const rows = await screen.findAllByTestId('day-row')
    expect(rows).toHaveLength(items.length)
    for (const row of rows) {
      expect(within(row).getAllByRole('button', { name: /done/i })).toHaveLength(1)
    }
  })

  it('says so when the planner did not record it, instead of showing it finished', async () => {
    /* Showing a row as done when the ledger never heard is the worst failure
     * here: tomorrow it silently returns and the student cannot tell why. */
    const items = realItems()
    const markDone = vi.fn().mockResolvedValue({ ok: false, reason: 'the planner could not be reached' })
    renderToday(fakeAlmanac(dayOf(items), markDone))

    const rows = await screen.findAllByTestId('day-row')
    await act(async () => {
      fireEvent.click(within(rows[0]).getByRole('button', { name: /done/i }))
    })
    expect(await screen.findByText(/could not be reached/i)).toBeInTheDocument()
  })
})

describe('backlog', () => {
  it('marks a carried row, and says which day it came from', async () => {
    const items = realItems()
    const carried = [{ ...items[0], carriedFrom: '2026-08-24' }, items[1]]
    renderToday(fakeAlmanac(dayOf(carried)))

    const label = await screen.findByText(/backlog/i)
    expect(label).toBeInTheDocument()
    expect(label.textContent).toContain('2026-08-24')
  })

  it('paints it from the token layer, never a raw colour', async () => {
    /* Law 4: no hex, rgb, hsl or named colour outside tokens.ts. The check is
     * on the inline style, because that is where a literal would be written. */
    const items = realItems()
    renderToday(fakeAlmanac(dayOf([{ ...items[0], carriedFrom: '2026-08-24' }])))

    const label = await screen.findByText(/backlog/i)
    const declared = label.getAttribute('style') ?? ''
    expect(declared).toMatch(/var\(--/)
    expect(declared).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })

  it('does not mark today\'s own work as backlog', async () => {
    renderToday(fakeAlmanac(dayOf(realItems())))
    await screen.findAllByTestId('day-row')
    expect(screen.queryByText(/backlog/i)).not.toBeInTheDocument()
  })
})

describe('Start', () => {
  it('carries the backlog date, so the server can teach it differently', async () => {
    /* A carried-over concept comes back because it was NOT finished. Teaching
     * it the same way again is precisely what already did not work, so the
     * server needs to know -- and only this screen knows it. */
    const items = realItems()
    renderToday(fakeAlmanac(dayOf([{ ...items[0], carriedFrom: '2026-08-24' }])))

    const rows = await screen.findAllByTestId('day-row')
    await act(async () => {
      fireEvent.click(within(rows[0]).getByRole('button', { name: /^start$/i }))
    })

    expect(await screen.findByTestId('teaching-screen')).toHaveAttribute('data-carried', '2026-08-24')
  })

  it('carries no backlog date for work set today', async () => {
    const items = realItems()
    renderToday(fakeAlmanac(dayOf(items)))
    const rows = await screen.findAllByTestId('day-row')
    await act(async () => {
      fireEvent.click(within(rows[0]).getByRole('button', { name: /^start$/i }))
    })
    expect(await screen.findByTestId('teaching-screen')).toHaveAttribute('data-carried', '')
  })

  it('opens the teaching screen for that concept', async () => {
    const items = realItems()
    renderToday(fakeAlmanac(dayOf(items)))

    const rows = await screen.findAllByTestId('day-row')
    await act(async () => {
      fireEvent.click(within(rows[1]).getByRole('button', { name: /^start$/i }))
    })

    const screenEl = await screen.findByTestId('teaching-screen')
    expect(screenEl).toHaveTextContent(items[1].conceptId)
  })
})

describe('when the planner cannot be reached', () => {
  it('says so, and shows no list at all', async () => {
    const almanac = {
      day: vi.fn().mockResolvedValue({ ok: false, reason: 'the planner could not be reached' }),
      markDone: vi.fn(),
    } as unknown as AlmanacClient
    renderToday(almanac)

    expect(await screen.findByText(/could not be reached/i)).toBeInTheDocument()
    /* No day rows at all. A list here would be a locally computed day wearing
     * the frozen day's clothes, which is worse than an error: the student
     * would work through it, mark it done against a ledger that never hears,
     * and watch it all come back tomorrow.
     *
     * Scoped to day rows rather than to every Start button on the page,
     * because the Misconception row is independent of the planner and hiding
     * it during a planner outage would be collateral damage. */
    expect(screen.queryAllByTestId('day-row')).toHaveLength(0)
  })

  it('passes the planner\'s own explanation through', async () => {
    const almanac = {
      day: vi.fn().mockResolvedValue({ ok: false, reason: 'the planner is not configured on this server' }),
      markDone: vi.fn(),
    } as unknown as AlmanacClient
    renderToday(almanac)

    expect(await screen.findByText(/not configured on this server/i)).toBeInTheDocument()
  })
})


describe('which day it asks for', () => {
  /* MUTATION EVIDENCE. Swapping `localDate` for `toISOString().slice(0, 10)`
   * survived every check, because nothing exercised it. That swap is a real
   * defect: a student in India opening the app at 00:30 would be shown the
   * PREVIOUS day's plan, and marking work done would write it against the
   * wrong date in a ledger that never rewrites a past day.
   *
   * HONEST LIMIT, stated rather than hidden: on a machine running in UTC the
   * two implementations agree and this mutant is equivalent. The checks below
   * kill it anywhere else, and they pin the intent either way. */
  it('uses the calendar date where the student is, at both ends of the day', () => {
    expect(localDate(new Date(2026, 7, 25, 0, 30))).toBe('2026-08-25')
    expect(localDate(new Date(2026, 7, 25, 23, 30))).toBe('2026-08-25')
  })

  it('agrees with the machine\'s own local calendar for a fixed instant', () => {
    const instant = new Date(Date.UTC(2026, 7, 25, 22, 45))
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected =
      `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`
    expect(localDate(instant)).toBe(expected)
  })

  it('pads single-digit months and days, so the date sorts as text', () => {
    expect(localDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })
})
