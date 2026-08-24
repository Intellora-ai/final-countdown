// @vitest-environment jsdom
/* The screen Start opens.
 *
 * WHAT THIS SCREEN IS AND IS NOT, in this phase
 *   Phase 3's job is that Start carries the concept id somewhere real. The
 *   LESSON is Phase 4's job: `TeachView` takes a validated `Lesson`, and the
 *   only thing that can produce one is `/api/lesson`, which nothing calls yet.
 *
 *   So this screen names the concept it was opened for and says plainly that
 *   the lesson is not connected. That is a deliberate, honest state, and it is
 *   the reason there is a test for it: Goal 2 forbids rendering a broken
 *   frame, and a blank page with a concept id in the URL is a broken frame.
 *
 *   The check below is what stops this quietly becoming permanent. It asserts
 *   the screen says WHICH concept and says it is not connected -- so when
 *   Phase 4 lands, this test fails and has to be rewritten to the real thing.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { LearnView } from './LearnView'

afterEach(cleanup)

function open(conceptId: string) {
  return render(
    <MemoryRouter initialEntries={[`/learn/${conceptId}`]}>
      <Routes>
        <Route path="/learn/:conceptId" element={<LearnView subjects={[]} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the screen Start opens', () => {
  it('names the concept it was opened for', async () => {
    open('c-photosynthesis')
    expect(await screen.findByText(/c-photosynthesis/)).toBeInTheDocument()
  })

  it('says the lesson is not connected yet, rather than showing an empty frame', async () => {
    open('c-photosynthesis')
    expect(await screen.findByRole('status')).toHaveTextContent(/not connected yet/i)
  })

  it('uses the concept\'s real name when the curriculum has one', async () => {
    render(
      <MemoryRouter initialEntries={['/learn/c1']}>
        <Routes>
          <Route
            path="/learn/:conceptId"
            element={
              <LearnView
                subjects={[{ id: 's', name: 'Science', chapters: [{ id: 'ch', name: 'Light', concepts: [{ id: 'c1', name: 'Reflection' }] }] }]}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Reflection')).toBeInTheDocument()
  })

  it('offers a way back, so the student is not stranded', async () => {
    open('c1')
    expect(await screen.findByRole('link', { name: /today/i })).toHaveAttribute('href', '/today')
  })
})

describe('mounted the way the router mounts it, with no props', () => {
  it('still renders, and still names the concept it was opened for', async () => {
    /* App.tsx renders `<LearnView />`. If the no-prop path threw or rendered
     * nothing, Start would land on a blank page and the only test above would
     * still pass, because every one of them passes `subjects` explicitly. */
    render(
      <MemoryRouter initialEntries={['/learn/c-unknown-here']}>
        <Routes>
          <Route path="/learn/:conceptId" element={<LearnView />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/c-unknown-here/)).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent(/not connected yet/i)
  })
})
