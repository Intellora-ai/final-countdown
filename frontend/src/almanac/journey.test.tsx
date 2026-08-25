// @vitest-environment jsdom
/* THE WHOLE JOURNEY, with nothing faked in the middle.
 *
 * Every other test in this project doubles something: the dashboard tests give
 * TodayView a fake client, the contract test drives the handler without a
 * screen, the ledger tests run without either. Each one proves its own layer
 * and none of them proves the layers agree -- which is exactly how a chain that
 * was dead for every real student passed every check in the suite.
 *
 * So this one wires the REAL component to the REAL client to the REAL handler
 * to the REAL ledger, and walks the chain a student walks:
 *
 *   open /today  ->  request  ->  planner  ->  ledger  ->  reply  ->  rows
 *      -> press Done  ->  ledger written  ->  TOMORROW no longer offers it
 *      -> reopen today  ->  the SAME frozen day comes back
 *
 * The only thing doubled is the network, and only because there is no socket in
 * a test runner. The bytes crossing it are the real ones.
 *
 * AND THE STUDENT IS SEEDED THE WAY SETUP SEEDS ONE. `cls` comes from
 * `CURRICULUM.classes` and the subjects from what the setup screen offers --
 * not from values typed here. A fixture that does not match reality is a test
 * that proves the code works on the fixture.
 */

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../server/handler.ts'
import { createLedger } from '../../server/almanac/ledger.ts'
import { memoryStore } from '../../server/almanac/ledger.test.ts'
import { createAlmanacClient } from './client'
import { selectableSubjects } from '../components/SetupFlow'
import { TodayView } from '../components/TodayView'
import { store } from '../data/store'
import CURRICULUM from '../data/curriculum'
import type { DB } from '../types'

const STUDENT_ID = 'stu_journey'
const REAL_CLASS = CURRICULUM.classes[0] as string
const TODAY = '2026-08-25'
const TOMORROW = '2026-08-26'

const model: ModelPort = { lesson: async () => ({}) }
const search: SearchPort = { search: async () => [] }

/** The real client speaking to the real handler. Only the socket is missing. */
function wired(almanac: ReturnType<typeof createLedger>) {
  const handle = createHandler({ model, search, almanac })
  return createAlmanacClient({
    fetchImpl: async (url, init) => {
      const res = await handle({ method: init.method, path: url, body: JSON.parse(init.body) })
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body }
    },
  })
}

beforeAll(async () => {
  /* Seeded exactly as setup seeds a student: the class value the setup screen
     writes, and subjects taken from what that screen offers. */
  const offered = await selectableSubjects(REAL_CLASS)
  expect(offered.length, 'setup offers no subjects, so this journey proves nothing').toBeGreaterThan(0)

  const db: DB = {
    students: {
      [STUDENT_ID]: {
        id: STUDENT_ID, name: 'Journey', avatarHue: 0, cls: REAL_CLASS, stream: null,
        subjects: offered.slice(0, 2).map((s) => s.id),
        minutes: 120, deadlines: {}, createdAt: 0, lastActiveAt: 0,
      },
    },
    progress: {}, activity: {}, currentId: STUDENT_ID,
  }
  await store.init({ load: async () => db, subscribe: () => () => {}, commit: async () => {}, close: () => {} })
})

afterEach(cleanup)

function openToday(client: ReturnType<typeof createAlmanacClient>, date: string) {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route path="/today" element={<TodayView almanac={client} today={date} />} />
        <Route path="/learn/:conceptId" element={<div data-testid="teaching" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a student opens today, finishes something, and comes back tomorrow', () => {
  it('walks the whole chain without anything being faked in the middle', async () => {
    const almanac = createLedger(memoryStore())
    const client = wired(almanac)

    /* 1 — the day arrives, from the planner, with real concepts on it. */
    const view = openToday(client, TODAY)
    const rows = await screen.findAllByTestId('day-row')
    expect(rows.length, 'the planner produced no day for a real student').toBeGreaterThan(0)

    /* Every row names a real concept, not "Unknown (id)". That is the exact
       symptom of the two curricula disagreeing. */
    expect(view.container.textContent).not.toMatch(/Unknown \(/)

    const finished = rows[0]!.getAttribute('data-concept')!
    expect(finished.length).toBeGreaterThan(0)

    /* 2 — Done, and it is the ONLY thing pressed. */
    await act(async () => {
      fireEvent.click(within(rows[0]!).getByRole('button', { name: /^done$/i }))
    })
    await waitFor(() => {
      expect(within(screen.getAllByTestId('day-row')[0]!).getByRole('button', { name: /done/i })).toBeDisabled()
    })
    cleanup()

    /* 3 — reopening TODAY gives the same frozen day back, marked or not. */
    openToday(client, TODAY)
    const again = await screen.findAllByTestId('day-row')
    expect(again.map((r) => r.getAttribute('data-concept'))).toEqual(
      rows.map((r) => r.getAttribute('data-concept')),
    )
    cleanup()

    /* 4 — TOMORROW does not offer the finished concept again. This is the
       promise the whole product is built on. */
    openToday(client, TOMORROW)
    const tomorrow = await screen.findAllByTestId('day-row')
    expect(tomorrow.map((r) => r.getAttribute('data-concept'))).not.toContain(finished)
  })

  it('brings unfinished work back tomorrow, marked as backlog in the student\'s own words', async () => {
    const almanac = createLedger(memoryStore())
    const client = wired(almanac)

    openToday(client, TODAY)
    const today = await screen.findAllByTestId('day-row')
    const untouched = today.map((r) => r.getAttribute('data-concept'))
    cleanup()

    openToday(client, TOMORROW)
    const tomorrow = await screen.findAllByTestId('day-row')

    const carried = tomorrow.filter((r) => r.getAttribute('data-backlog') === 'true')
    expect(carried.length, 'nothing came back, so unfinished work was silently dropped').toBeGreaterThan(0)
    for (const row of carried) {
      expect(untouched).toContain(row.getAttribute('data-concept'))
      expect(row.textContent).toMatch(/Backlog — set on 2026-08-25/)
    }
  })

  it('opens the teaching screen for the concept the student pressed', async () => {
    const client = wired(createLedger(memoryStore()))
    openToday(client, TODAY)

    const rows = await screen.findAllByTestId('day-row')
    await act(async () => {
      fireEvent.click(within(rows[0]!).getByRole('button', { name: /^start$/i }))
    })

    expect(await screen.findByTestId('teaching')).toBeInTheDocument()
  })
})

describe('what the chain refuses to do', () => {
  it('never marks anything done on its own, however many times the day is opened', async () => {
    /* Only the student writes completion. If merely LOOKING at a day retired
       work from it, a student would lose topics they never studied. */
    const almanac = createLedger(memoryStore())
    const client = wired(almanac)

    openToday(client, TODAY)
    const first = (await screen.findAllByTestId('day-row')).map((r) => r.getAttribute('data-concept'))
    cleanup()
    openToday(client, TODAY)
    cleanup()
    openToday(client, TOMORROW)

    const tomorrow = (await screen.findAllByTestId('day-row')).map((r) => r.getAttribute('data-concept'))
    for (const concept of first) {
      expect(tomorrow, `${concept} disappeared without anyone marking it done`).toContain(concept)
    }
  })
})
