// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

/* WHY THIS FILE EXISTS, MEASURED RATHER THAN ASSERTED.
 *
 * Before this boundary, `grep -rn "componentDidCatch\|getDerivedStateFromError
 * \|ErrorBoundary" frontend/src` returned 0 matches. One throw anywhere in the
 * render tree therefore unmounted the whole application and left
 * `document.getElementById('root').innerHTML.length === 0` — a dark, empty
 * page with no text, no message and no way back except retyping the URL. That
 * exact state was observed twice in a browser session on 2026-08-25, alongside
 * this console error:
 *
 *   A component suspended while responding to synchronous input.
 *   The update that suspended should be wrapped with startTransition.
 *   The above error occurred in the <Route.Provider> component
 *
 * THE ORACLE. "The page rendered something" is not one — a stray whitespace
 * node satisfies it. The oracle here is threefold and every test asserts all
 * the parts that apply to it: the recovery banner is present BY ITS EXACT
 * TEXT, the thrown detail is shown so the failure stays diagnosable, and the
 * children are GONE. The last part is what separates a boundary that replaced
 * the broken tree from one that merely appended a message beside it.
 */

/* React logs the caught error to console.error itself, and the boundary logs
 * it again on purpose. Neither is noise to be silenced globally: the tests
 * that care assert on the call, and the rest would drown the reporter without
 * this. Restored after every test so a leak cannot hide a real console error
 * in a later file. */
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  cleanup()
})

function Boom({ thrown }: { readonly thrown: unknown }): React.ReactElement {
  throw thrown
}

const BANNER = 'Something went wrong'
const CHILD = 'the application, rendering normally'

describe('the error boundary, which is the only thing standing between a render error and a blank page', () => {
  it('renders its children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>{CHILD}</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText(CHILD)).toBeInTheDocument()
    expect(screen.queryByText(BANNER)).toBeNull()
  })

  it('replaces the tree with a readable recovery screen when a child throws an Error', () => {
    render(
      <ErrorBoundary>
        <p>{CHILD}</p>
        <Boom thrown={new Error('a component suspended while responding to synchronous input')} />
      </ErrorBoundary>,
    )

    /* The banner, by its exact words. A user who cannot read the screen has
     * been given nothing, which is the state this whole file exists to end. */
    expect(screen.getByRole('alert')).toHaveTextContent(BANNER)

    /* The detail, so the failure is still diagnosable from the screen itself
     * rather than only from a console nobody has open. */
    expect(screen.getByRole('alert')).toHaveTextContent(
      'a component suspended while responding to synchronous input',
    )

    /* A way out that does not require retyping the URL. */
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()

    /* And the broken tree is GONE, not merely decorated. */
    expect(screen.queryByText(CHILD)).toBeNull()
  })

  it('carries the theme class itself, because it mounts outside the shell that normally sets it', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={new Error('anything')} />
      </ErrorBoundary>,
    )

    /* `styles/tokens/colors.css` remaps --background and --foreground under
     * `.dark`, and `App.tsx` is what supplies that class. This boundary is an
     * ANCESTOR of App, so when App is the thing that died the class dies with
     * it. Found in a browser, not here: the recovery screen rendered as a
     * white page inside a dark product. jsdom applies no cascade, so this
     * asserts the class that drives the palette rather than a computed colour
     * — a computed-style assertion here would be an assertion about the stub. */
    expect(screen.getByRole('alert')).toHaveClass('dark')
  })

  it('recovers when the thrown value is a bare string rather than an Error', () => {
    render(
      <ErrorBoundary>
        <Boom thrown="chunk load failed" />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(BANNER)
    expect(screen.getByRole('alert')).toHaveTextContent('chunk load failed')
  })

  it('recovers when the thrown value is null, which has no message to read', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={null} />
      </ErrorBoundary>,
    )

    /* null is the input that turns a naive `error.message` into a SECOND
     * crash — this time inside the boundary, where nothing can catch it. The
     * banner must survive it. */
    expect(screen.getByRole('alert')).toHaveTextContent(BANNER)
  })

  it('reports the error rather than swallowing it, so the console still names the cause', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={new Error('the cause worth keeping')} />
      </ErrorBoundary>,
    )

    /* A boundary that shows a friendly screen and drops the error is a worse
     * outcome than the blank page: the symptom is hidden AND the cause is
     * gone. The screen recovers; the console keeps the evidence.
     *
     * THIS ASSERTION WAS STRENGTHENED BECAUSE A MUTANT SURVIVED IT.
     * It first read: does ANY console.error call mention the message. Mutation
     * run 2026-08-25, mutant M6 "delete the boundary's console.error report",
     * SURVIVED — because React logs every error a boundary catches all by
     * itself, so the assertion went green against a boundary that reported
     * nothing at all. It was measuring the framework, not this file. Requiring
     * the `[error-boundary]` marker pins the call to THIS component; re-running
     * M6 against the version below kills it. */
    const reportedByTheBoundary = consoleError.mock.calls.some((call) => {
      const line = call.map(String).join(' ')
      return line.includes('[error-boundary]') && line.includes('the cause worth keeping')
    })
    expect(reportedByTheBoundary).toBe(true)
  })
})
