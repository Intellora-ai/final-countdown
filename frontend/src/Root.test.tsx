// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { Root } from './Root'

/**
 * THE ROOT OF THE TREE, AND THE TWO THINGS THAT MUST BE TRUE AT IT.
 *
 * 1. Every route is wrapped in the error boundary, so no throw can blank the
 *    page. A boundary that exists but is not mounted protects nothing, and
 *    `import { ErrorBoundary }` merely resolving is exactly the kind of green
 *    that means nothing.
 *
 * 2. React Router is told to use `startTransition` for route changes. Its own
 *    v6.30.6 source decides this by strict identity:
 *
 *      if (renderFuture?.v7_startTransition === undefined) { logDeprecation(...) }
 *
 *    Without the flag, route changes are applied synchronously. Three of this
 *    app's routes are `React.lazy` (App.tsx:63), and a synchronous update that
 *    mounts a not-yet-downloaded lazy component makes React throw rather than
 *    show the Suspense fallback:
 *
 *      A component suspended while responding to synchronous input.
 *      The update that suspended should be wrapped with startTransition.
 *
 *    That error was captured in a browser on 2026-08-25, at <Route.Provider>.
 *
 * THE VACUITY CHECK LIVES IN ITS OWN FILE, AND THAT IS NOT TIDINESS.
 * The router warns through a module-level `alreadyWarned` map — once per
 * module instance, for the life of the process. `vi.resetModules()` does not
 * help, because vitest externalises node_modules and hands every test in a
 * file the SAME router. So the first render in this process is the only one
 * that can ever warn, and a must-fail case sharing this file would read as
 * silent no matter how the flag was set. `Root.no-flag.test.tsx` holds it
 * instead, where it gets a fresh process and a router that has not yet
 * spoken. Deleting that file removes the only evidence that the assertion
 * below can fail at all.
 *
 * HONESTY ABOUT WHAT THESE TESTS DO AND DO NOT PROVE. The crash above was
 * intermittent — 2 blank loads in ~19, then 21 clean — and was never made to
 * happen on demand. So NO test here claims to prove the crash is fixed. They
 * prove the two things that ARE checkable: the router no longer runs in the
 * mode that produces it, and a throw of any origin now lands on a readable
 * screen instead of an empty one. The unproven half is named, not dressed up.
 */

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

/** The single child of an element, insisted upon rather than assumed. */
function soleChild(element: React.ReactElement): React.ReactElement {
  const children = (element.props as { children: React.ReactNode }).children
  const list = React.Children.toArray(children)
  expect(list).toHaveLength(1)
  return list[0] as React.ReactElement
}

const FUTURE_FLAG = 'v7_startTransition'

describe('the root of the application tree', () => {
  it('mounts the error boundary ABOVE the router, so a throw from any route is caught', () => {
    const tree = Root()

    /* Identity, not a name string: a rename cannot fake this, and deleting the
     * wrapper cannot survive it. */
    expect(tree.type).toBe(ErrorBoundary)

    const router = soleChild(tree)
    expect(router.type).toBe(HashRouter)

    const app = soleChild(router)
    expect(app.type).toBe(App)
  })

  it('tells the router to use startTransition, by the exact value its source tests for', () => {
    const router = soleChild(Root())

    /* react-router 6.30.6 checks `=== undefined`, so the assertion is on the
     * VALUE and not merely on the key being present. */
    expect((router.props as { future?: Record<string, unknown> }).future?.[FUTURE_FLAG]).toBe(true)
  })

  it('emits no future-flag warning when the real root renders in a browser DOM', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await React.act(async () => {
      root.render(<Root />)
    })
    await React.act(async () => {
      root.unmount()
    })
    host.remove()

    const messages = warn.mock.calls.map((call) => call.map(String).join(' '))
    expect(messages.filter((m) => m.includes(FUTURE_FLAG))).toEqual([])
  })
})
