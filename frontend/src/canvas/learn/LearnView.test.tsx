// @vitest-environment jsdom
/* The teaching screen, fed by the server.
 *
 * WHAT MUST BE TRUE
 *   1. Opening a concept asks the server to teach THAT concept, and reports
 *      what it knows about the student so the server can pick a strategy.
 *   2. A lesson that comes back is taught -- rendered by the canvas, which
 *      re-validates it before a student sees a word of it.
 *   3. When the server cannot be reached, a STORED lesson is used only if it
 *      is for the same concept, and the student is told it is stored.
 *   4. When there is no stored lesson either, the screen says why. It never
 *      teaches a different topic and never renders an empty frame.
 *
 * WHY 3 IS THE ONE THAT MATTERS
 *   Teaching gas pressure to a student who opened photosynthesis is worse than
 *   teaching nothing: they would mark photosynthesis done afterwards, and
 *   Almanac would never show it again.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LearnView } from './LearnView'
import { gasPressure } from '../lessons/gasPressure'
import type { AlmanacClient } from '../../almanac/client'
import type { SubjectLike } from '../../almanac/resolve'

afterEach(cleanup)

const SUBJECTS: SubjectLike[] = [
  {
    id: 'science', name: 'Science',
    chapters: [{ id: 'ch', name: 'Matter', concepts: [{ id: 'gas-pressure', name: 'Pressure of a gas' }] }],
  },
]

function teacher(result: unknown): AlmanacClient {
  return { lesson: vi.fn().mockResolvedValue(result), day: vi.fn(), markDone: vi.fn() } as unknown as AlmanacClient
}

function open(conceptId: string, almanac: AlmanacClient, state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/learn/${conceptId}`, state }]}>
      <Routes>
        <Route path="/learn/:conceptId" element={<LearnView subjects={SUBJECTS} almanac={almanac} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('asking the server to teach this concept', () => {
  it('asks for the concept by NAME, with its subject', async () => {
    /* The model teaches "Pressure of a gas", not "gas-pressure". Sending the
     * id would ask it to teach a database key. */
    const almanac = teacher({ ok: true, lesson: gasPressure, strategy: 'worked_example' })
    open('gas-pressure', almanac)

    await waitFor(() => expect(almanac.lesson).toHaveBeenCalled())
    /* Length asserted before indexing: under this directory's stricter
     * typecheck `calls[0]` is possibly undefined, and reading it optionally
     * would let a NO-CALL satisfy the check silently. */
    const calls = vi.mocked(almanac.lesson).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toMatchObject({ concept: 'Pressure of a gas', subject: 'Science' })
  })

  it('reports that the concept is backlog, so the server can teach it differently', async () => {
    const almanac = teacher({ ok: true, lesson: gasPressure })
    open('gas-pressure', almanac, { carriedFrom: '2026-08-24' })

    await waitFor(() => expect(almanac.lesson).toHaveBeenCalled())
    const calls = vi.mocked(almanac.lesson).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toMatchObject({ carriedFrom: '2026-08-24' })
  })
})

describe('teaching the lesson that came back', () => {
  it('renders the lesson through the canvas', async () => {
    const almanac = teacher({ ok: true, lesson: gasPressure, strategy: 'analogy' })
    open('gas-pressure', almanac)

    expect(await screen.findByText(gasPressure.question)).toBeInTheDocument()
  })

  it('no longer shows the "not connected yet" placeholder', async () => {
    /* Phase 3 shipped that message deliberately so Phase 4 could not land
     * without removing it. This is the check that retires it. */
    const almanac = teacher({ ok: true, lesson: gasPressure })
    open('gas-pressure', almanac)

    await screen.findByText(gasPressure.question)
    expect(screen.queryByText(/not connected yet/i)).not.toBeInTheDocument()
  })
})

describe('when the server cannot be reached', () => {
  it('teaches the STORED lesson when it is for the same concept, and says it is stored', async () => {
    const almanac = teacher({ ok: false, reason: 'the planner could not be reached' })
    open('gas-pressure', almanac)

    expect(await screen.findByText(gasPressure.question)).toBeInTheDocument()
    /* Queried by its words, not by role: the canvas mounts its own live region
     * for announcements, so `role="status"` is ambiguous once a lesson is on
     * screen. The wording is what the student actually reads. */
    expect(await screen.findByText(/stored lesson for this/i)).toBeInTheDocument()
  })

  it('teaches NOTHING when the stored lesson is for a different concept', async () => {
    /* The whole point. There is no stored lesson for photosynthesis, and gas
     * pressure is not an acceptable substitute for it. */
    const almanac = teacher({ ok: false, reason: 'the planner could not be reached' })
    render(
      <MemoryRouter initialEntries={['/learn/photosynthesis']}>
        <Routes>
          <Route
            path="/learn/:conceptId"
            element={<LearnView subjects={[{ id: 's', name: 'Science', chapters: [{ id: 'c', name: 'Ch', concepts: [{ id: 'photosynthesis', name: 'Photosynthesis' }] }] }]} almanac={almanac} />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be reached/i)
    expect(screen.queryByText(gasPressure.question)).not.toBeInTheDocument()
  })

  it('names the concept it could not teach, so the student is not left guessing', async () => {
    const almanac = teacher({ ok: false, reason: 'the model could not be reached' })
    render(
      <MemoryRouter initialEntries={['/learn/photosynthesis']}>
        <Routes>
          <Route path="/learn/:conceptId" element={<LearnView subjects={[]} almanac={almanac} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/photosynthesis/)).toBeInTheDocument()
  })
})

describe('while it is being written', () => {
  it('says the lesson is being prepared rather than showing an empty page', async () => {
    const almanac = { lesson: vi.fn(() => new Promise(() => {})), day: vi.fn(), markDone: vi.fn() } as unknown as AlmanacClient
    open('gas-pressure', almanac)

    expect(await screen.findByRole('status')).toHaveTextContent(/writing|preparing/i)
  })
})
