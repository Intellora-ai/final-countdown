// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
 *
 * WHY STORAGE AND NAVIGATION ARE INJECTED, AND WHAT THAT COSTS.
 * Probed in this exact environment, not assumed:
 *
 *     URL: http://localhost:3000/
 *     localStorage type: undefined
 *     reload descriptor: {"writable":false,"enumerable":true,"configurable":false}
 *
 * jsdom here provides NO localStorage at all and a `reload` that cannot be
 * redefined. So a unit test cannot observe either real effect, and pretending
 * otherwise would be a test of the stub. The component takes both as optional
 * props defaulting to the real browser objects, and these tests pass a real
 * Map-backed fake — the assertions below are on that object genuinely being
 * emptied, not on a spy having been called. The REAL localStorage effect is
 * proven separately in a browser, which is the only place it can be.
 */

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  vi.restoreAllMocks()
  cleanup()
})

function Boom({ thrown }: { readonly thrown: unknown }): React.ReactElement {
  throw thrown
}

/** A real object with real state, so "was it emptied" is a fact, not a spy. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return { map, api: { clear: () => map.clear() } }
}

const BANNER = 'Something went wrong'
const CHILD = 'the application, rendering normally'

describe('the error boundary, which is the only thing standing between a render error and a blank page', () => {
  it('recovers on its own when the address changes after a crash, without a reload', async () => {
    /* MEASURED 2026-09-02: one crashed screen (`#/chapter/science/...`) and
       every address after it showed "Something went wrong" until the page was
       reloaded -- /today included. The boundary mounts OUTSIDE the router, so
       a hash change never remounts it and the caught error simply stayed. A
       learner who hit one bad link lost the whole app. */
    window.location.hash = '#/broken'
    function OnlyBrokenThrows(): React.ReactElement {
      if (window.location.hash === '#/broken') throw new Error('this screen is broken')
      return <p>healthy screen</p>
    }
    render(
      <ErrorBoundary>
        <OnlyBrokenThrows />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()

    window.location.hash = '#/today'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(await screen.findByText('healthy screen')).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).toBeNull()
  })

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
    expect(screen.getByRole('button', { name: /^reload the page$/i })).toBeInTheDocument()

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

  /* ─────────────────────────────────────────────────────────────────────────
   * ESCAPING A CRASH THAT THE SAVED DATA ITSELF CAUSES.
   *
   * Measured in a browser on 2026-08-25. Writing this into localStorage:
   *
   *     localStorage['learning-os/v2'] = '{"students":"not-an-array","v":2}'
   *
   * makes the application throw on load. `data/store.ts:29` reads it with
   * `JSON.parse(raw) as DB` — a TypeScript cast, which is erased at runtime
   * and checks nothing — so wrong-typed data enters the app as if it were
   * valid. The boundary catches the throw, so the page is no longer blank.
   *
   * But the value SURVIVES, so reloading re-reads the same poison. Loaded
   * three times in a row the result was crash, crash, crash, with "Reload the
   * page" as the only control. That is a permanent lockout: the user cannot
   * get out from inside the application at all, and their only escape is
   * devtools.
   *
   * A recovery screen whose only action leads straight back to the same crash
   * is not a recovery screen. These tests are for the way out.
   * ───────────────────────────────────────────────────────────────────────── */
  describe('when the saved data is what crashed the application', () => {
    it('offers a way out that is not the reload which caused the crash', () => {
      const { api } = fakeStorage({ 'learning-os/v2': 'poison' })
      render(
        <ErrorBoundary storage={api} reload={vi.fn()}>
          <Boom thrown={new Error('poisoned by saved state')} />
        </ErrorBoundary>,
      )

      expect(screen.getByRole('button', { name: /reset saved data/i })).toBeInTheDocument()
    })

    it('actually empties the saved data, rather than only saying so', () => {
      const { map, api } = fakeStorage({
        'learning-os/v2': '{"students":"not-an-array","v":2}',
        'practice-run': 'anything',
      })
      const reload = vi.fn()

      render(
        <ErrorBoundary storage={api} reload={reload}>
          <Boom thrown={new Error('poisoned by saved state')} />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /reset saved data/i }))

      /* The real effect on a real object. A button that claims to clear and
       * does not is exactly the lie this suite exists to catch. */
      expect(map.size).toBe(0)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('leaves the saved data alone when the plain reload is chosen', () => {
      const { map, api } = fakeStorage({ 'learning-os/v2': 'precious' })
      const reload = vi.fn()

      render(
        <ErrorBoundary storage={api} reload={reload}>
          <Boom thrown={new Error('something unrelated to storage')} />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /^reload the page$/i }))

      /* The pair. Without this, "reset clears storage" is satisfied by a
       * boundary that clears on EVERY button, which would destroy the progress
       * of every user who hit an unrelated transient error. */
      expect(map.get('learning-os/v2')).toBe('precious')
      expect(map.size).toBe(1)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('says so and does NOT reload when the browser refuses to clear', () => {
      /* Safari in private mode, and any browser with site data blocked, throw
       * from localStorage. Reloading anyway would drop the user straight back
       * into the same crash while implying the reset had worked. */
      const reload = vi.fn()
      const refusing = {
        clear: () => {
          throw new DOMException('denied', 'SecurityError')
        },
      }

      render(
        <ErrorBoundary storage={refusing} reload={reload}>
          <Boom thrown={new Error('poisoned by saved state')} />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /reset saved data/i }))

      expect(screen.getByRole('alert')).toHaveTextContent(/could not clear/i)
      expect(reload).not.toHaveBeenCalled()

      const reported = consoleError.mock.calls.some((call) =>
        call.map(String).join(' ').includes('[error-boundary]'),
      )
      expect(reported).toBe(true)
    })

    /* ───────────────────────────────────────────────────────────────────────
     * A DROPPED CONNECTION IS NOT A REASON TO ERASE ANYONE'S PROGRESS.
     *
     * Found by the offline engine on 2026-08-25, and it was a defect in THIS
     * component rather than one it caught. Three of this app's routes are
     * `React.lazy`, so opening one with the network down fails to fetch the
     * chunk and React throws. Captured verbatim from a real browser with the
     * context set offline:
     *
     *   TypeError: Failed to fetch dynamically imported module:
     *     http://localhost:5174/src/tutor/TutorView.tsx
     *
     * The boundary caught it — but then offered "Reset saved data and reload"
     * to a student whose only problem was a tunnel or a lift. One tap and
     * every lesson they had finished is gone, for a fault that had nothing to
     * do with their data. The screen was correct about the crash and
     * catastrophic about the remedy.
     * ─────────────────────────────────────────────────────────────────────── */
    it.each([
      ['Chromium', 'Failed to fetch dynamically imported module: /src/tutor/TutorView.tsx'],
      ['Firefox', 'error loading dynamically imported module: /src/tutor/TutorView.tsx'],
      ['WebKit', 'Importing a module script failed.'],
    ])('offers no data reset for a failed chunk load (%s wording)', (_engine, message) => {
      const { api } = fakeStorage({ 'learning-os/v2': 'precious' })

      render(
        <ErrorBoundary storage={api} reload={vi.fn()}>
          <Boom thrown={new TypeError(message)} />
        </ErrorBoundary>,
      )

      /* The destructive button must be absent, not merely de-emphasised. */
      expect(screen.queryByRole('button', { name: /reset saved data/i })).toBeNull()
      expect(screen.getByRole('button', { name: /reload the page/i })).toBeInTheDocument()
    })

    it('names the connection as the cause when a chunk fails to load', () => {
      render(
        <ErrorBoundary storage={fakeStorage().api} reload={vi.fn()}>
          <Boom thrown={new TypeError('Failed to fetch dynamically imported module: /x.js')} />
        </ErrorBoundary>,
      )

      /* "Something went wrong" is true and useless here. A student who is
       * offline can act on being told they are offline. */
      expect(screen.getByRole('alert')).toHaveTextContent(/connection/i)
    })

    it('still offers the reset for an error that is NOT a chunk load', () => {
      /* The pair. Without this, "hide reset for network errors" is satisfied
       * by hiding it always — which is mutant M9 again, and which puts every
       * user back in the permanent lockout this whole section exists to end. */
      const { api } = fakeStorage({ 'learning-os/v2': 'poison' })

      render(
        <ErrorBoundary storage={api} reload={vi.fn()}>
          <Boom thrown={new TypeError('Cannot read properties of undefined (reading map)')} />
        </ErrorBoundary>,
      )

      expect(screen.getByRole('button', { name: /reset saved data/i })).toBeInTheDocument()
    })

    it('offers no reset at all when there is no storage to reset', () => {
      /* Not hypothetical: this very test environment has no localStorage, and
       * a button that cannot do anything is worse than an absent one — it
       * promises an escape that will not arrive.
       *
       * THIS TEST WAS STRENGTHENED BECAUSE A MUTANT SURVIVED IT.
       * Mutation run 2026-08-25, mutant M13 "change `storage !== undefined` to
       * `storage != null`, so an explicit null falls back to real storage",
       * SURVIVED. It survived because jsdom here has no localStorage either
       * way, so both behaviours looked identical and the assertion was
       * measuring the ENVIRONMENT rather than the component. Installing a real
       * window.localStorage first makes the two outcomes differ: under M13 the
       * fallback finds it and renders the button. Re-running M13 against the
       * version below kills it. */
      const present = fakeStorage({ 'learning-os/v2': 'something' })
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: present.api,
      })

      render(
        <ErrorBoundary storage={null} reload={vi.fn()}>
          <Boom thrown={new Error('anything')} />
        </ErrorBoundary>,
      )

      expect(screen.getByRole('alert')).toHaveTextContent(BANNER)
      /* `null` means "there is none", and it must WIN over the ambient
       * localStorage that does exist in this test. */
      expect(screen.queryByRole('button', { name: /reset saved data/i })).toBeNull()
    })

    it('finds real storage on its own when the prop is left off entirely', () => {
      /* The pair for the test above. Without this, "explicit null hides the
       * button" is satisfied by a component that never renders the button at
       * all — which is exactly mutant M9, and which would leave every real
       * user locked out again. */
      const present = fakeStorage({ 'learning-os/v2': 'poison' })
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: present.api,
      })

      render(
        <ErrorBoundary reload={vi.fn()}>
          <Boom thrown={new Error('anything')} />
        </ErrorBoundary>,
      )

      expect(screen.getByRole('button', { name: /reset saved data/i })).toBeInTheDocument()
    })
  })
})
