// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import React from 'react'
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


})
