// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { HashRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * THE CANVAS MUST OPEN FOR A LEARNER WHO HAS NO PLAN YET.
 *
 * `12410da0` fixed the address: `/canvas` became `#/canvas`, and
 * `pathIntoHash.test.ts` pins that half. It pins the JOURNEY TO THE ROUTE and
 * nothing about what the route then renders, which is how the second half
 * shipped broken behind a green suite.
 *
 * `App` gated EVERY path on `store.hasPlan()` before it looked at which path
 * had been asked for, so a profile without class+subjects+minutes was answered
 * with the setup wizard no matter what it requested. That is correct for the
 * dashboard routes -- they are built FROM the plan and would render empty --
 * and wrong for the canvas, which is the one screen that asks the learner what
 * to study instead of reading it from a plan. Nothing under `src/canvas`
 * touches `store`, `student()`, `hasPlan` or `cls`.
 *
 * MEASURED IN CHROMIUM against the dev server, before the fix:
 *
 *   fresh profile                       #/canvas -> #/canvas   topic box: YES
 *   after one click on "New learner"    #/canvas -> #/setup    topic box: NO
 *
 * The second line was not a corner case. `seed()` ships `stu_new` -- "an empty
 * New learner that lands in setup" -- and `Sidebar` persists that choice, so a
 * single click put the profile into localStorage and every later visit to
 * `#/canvas` was answered with the wizard. Reloading did not clear it. A new
 * tab did not clear it. The address bar read `#/setup` while the person held a
 * link that said `#/canvas`, so the only conclusion available to them was that
 * the canvas had been taken away.
 *
 * WHY THE STORE IS REAL AND ONLY THE CANVAS IS STUBBED. The defect lived in the
 * ORDER of two early returns that both read the real store, so a mocked
 * `hasPlan` would be asserting against the mock rather than against the gate.
 * The real `Store` is used, holding the real plan-less DB, and only its ADAPTER
 * is replaced: jsdom here has no `localStorage` (the same absence the zustand
 * persist warnings report across this suite), and a test that depended on it
 * would be asserting about the environment rather than about the gate.
 * `CanvasRoute` is stubbed only because it is a lazy chunk that pulls three.js
 * and KaTeX into jsdom; what is under test is whether the route REACHES it, not
 * what it draws.
 *
 * THE SECOND TEST IS THE ONE THAT CAN FAIL THE WRONG WAY. Moving the canvas
 * above the gate is only correct if the gate still holds for everything else.
 * Delete it and "fix the redirect" could be satisfied by deleting the gate.
 */

/** A saved profile mid-signup: a student exists, a plan does not. */
function planlessDB() {
  return {
    students: {
      stu_new: {
        id: 'stu_new', name: 'New learner', avatarHue: 40,
        cls: null, stream: null, subjects: [], minutes: null,
        deadlines: {}, createdAt: 1, lastActiveAt: 1,
      },
    },
    progress: { stu_new: {} },
    activity: { stu_new: [] },
    currentId: 'stu_new',
  }
}

vi.mock('./canvas/CanvasRoute', () => ({
  default: () => <div data-testid="the-canvas">What do you want to learn?</div>,
}))

/* The store is a module singleton that boots ONCE -- `init` returns early if it
 * already holds an adapter -- so each case needs its own module registry.
 * Sharing one would let the first test's DB be the only one any test ever sees,
 * and the second would pass by inheritance rather than on its own evidence.
 * `store` and `App` are imported from the SAME post-reset registry, or `App`
 * would read a different singleton than the one seeded here. */
async function openAt(route: string) {
  window.location.hash = route
  vi.resetModules()
  const { store } = await import('./data/store')
  await store.init({
    load: () => Promise.resolve(planlessDB() as never),
    subscribe: () => () => {},
    commit: () => Promise.resolve(),
    close: () => {},
  })
  const { default: App } = await import('./App')
  render(<HashRouter><App /></HashRouter>)
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('a learner with no plan, holding a link to the canvas', () => {
  it('is given the canvas, not the setup wizard', async () => {
    await openAt('#/canvas')

    expect(await screen.findByTestId('the-canvas')).toBeInTheDocument()
    expect(screen.queryByText(/set up your learning plan/i)).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/canvas')
  })

  it('is still sent to setup from the routes that are built from a plan', async () => {
    await openAt('#/today')

    /* Asserted on the address rather than on a rendered string: the redirect is
       the behaviour being kept, and a wizard heading could be reworded without
       the gate having changed at all. */
    await vi.waitFor(() => expect(window.location.hash).toBe('#/setup'))
    expect(screen.queryByTestId('the-canvas')).not.toBeInTheDocument()
  })
})
