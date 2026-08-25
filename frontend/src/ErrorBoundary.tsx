import React from 'react'

/**
 * THE LAST THING BETWEEN A RENDER ERROR AND A BLANK PAGE.
 *
 * Measured before this existed: `grep -rn "componentDidCatch\|
 * getDerivedStateFromError\|ErrorBoundary" frontend/src` returned 0 matches.
 * React's contract is that an uncaught render error unmounts the WHOLE tree,
 * so with no boundary anywhere, any single throw left
 * `document.getElementById('root').innerHTML.length === 0` — a dark, empty
 * page with no text and no way back except retyping the URL. That state was
 * observed twice in a browser session on 2026-08-25.
 *
 * WHY THE RECOVERY UI IMPORTS NOTHING AND STYLES ITSELF INLINE.
 * A boundary that renders through the same component layer that just failed
 * can fail for the same reason, and a boundary that throws while handling a
 * throw is worse than no boundary at all — React unmounts everything and the
 * user is back to the blank page, now with two errors instead of one. So this
 * renders plain elements with inline styles and no imports beyond React. It
 * carries `className="dark"` itself because `styles/tokens/colors.css` remaps
 * the palette under `.dark` and `App.tsx` is what normally supplies it; this
 * boundary mounts outside App, so when App is the thing that died the class
 * dies with it.
 *
 * IT REPORTS, IT DOES NOT SWALLOW.
 * The error is re-logged in `componentDidCatch`. A boundary that shows a
 * friendly screen and drops the cause is a worse outcome than the blank page:
 * the symptom is hidden AND the evidence is gone. Note that the LOG is not
 * the handling — `getDerivedStateFromError` changes control flow by moving
 * the component into its error state. The log is the evidence trail beside
 * it, which is why this is not a catch-and-continue.
 *
 * WHY THERE IS A SECOND BUTTON, AND WHY IT IS DESTRUCTIVE ON PURPOSE.
 * Measured in a browser on 2026-08-25. Putting this into localStorage:
 *
 *     localStorage['learning-os/v2'] = '{"students":"not-an-array","v":2}'
 *
 * makes the application throw on load, because `data/store.ts:29` reads saved
 * state with `JSON.parse(raw) as DB` — a TypeScript cast, erased at runtime,
 * checking nothing. The boundary catches it, so the page is no longer blank.
 * But the poisoned value survives, so reload re-reads it: loaded three times
 * in a row the result was crash, crash, crash. Reload alone is therefore not
 * an escape, it is a loop, and the user's only way out was devtools.
 *
 * Clearing is the escape. It is offered as a SEPARATE, explicitly-labelled
 * action rather than folded into the reload, because most errors are not
 * caused by saved state and silently erasing a learner's progress to recover
 * from a transient fault would be its own defect.
 */

/** The narrow slice of Storage this needs. Injectable so a test can watch it. */
type ClearableStorage = Pick<Storage, 'clear'>

export interface ErrorBoundaryProps {
  readonly children: React.ReactNode
  /**
   * Defaults to `window.localStorage`. Pass `null` to state that there is no
   * storage, which hides the reset control. Present for tests: this project's
   * jsdom environment provides no localStorage at all (probed, not assumed —
   * `typeof window.localStorage` is `undefined` there), so the real effect
   * cannot be observed in a unit test and is proven in a browser instead.
   */
  readonly storage?: ClearableStorage | null
  /** Defaults to a real page reload. Injectable because jsdom has no navigation. */
  readonly reload?: () => void
}

interface ErrorBoundaryState {
  readonly error: unknown
  readonly resetFailed: boolean
}

/** Everything a thrown value might be, rendered as something a person can read. */
function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  /* `null` is the input that turns a naive `error.message` into a second
   * crash, this time inside the boundary where nothing can catch it. jsdom
   * fails on it too — reading `.stack` off null throws before React is even
   * involved. String() is total: it has an answer for null, undefined, a bare
   * string, a number and an object alike. */
  return String(error)
}

/**
 * `window.localStorage`, when there is one.
 *
 * Reading it can THROW rather than return undefined — a browser with site data
 * blocked raises SecurityError on access, not on use. Both outcomes mean the
 * same thing here, so both become `null`, which is a value the caller handles
 * rather than an error nobody catches.
 */
function defaultStorage(): ClearableStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, resetFailed: false }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error }
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[error-boundary] the application stopped rendering:', error, info.componentStack)
  }

  /** `undefined` means "not specified, use the real thing"; `null` means "there is none". */
  private resolveStorage(): ClearableStorage | null {
    return this.props.storage !== undefined ? this.props.storage : defaultStorage()
  }

  private reload = (): void => {
    if (this.props.reload) {
      this.props.reload()
      return
    }
    window.location.reload()
  }

  private reset = (): void => {
    const storage = this.resolveStorage()
    if (!storage) return

    try {
      storage.clear()
    } catch (err) {
      /* NOT a swallow: this changes control flow (no reload happens) and tells
       * both the user and the console. Reloading anyway would drop the user
       * back into the identical crash while implying the reset had worked. */
      console.error('[error-boundary] could not clear the saved data:', err)
      this.setState({ resetFailed: true })
      return
    }
    this.reload()
  }

  override render(): React.ReactNode {
    const { error, resetFailed } = this.state
    if (error === null) return this.props.children

    const storage = this.resolveStorage()

    return (
      <div
        role="alert"
        className="dark"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <div style={{ maxWidth: '40rem', textAlign: 'left' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Something went wrong</h1>
          <p style={{ marginBottom: '1rem' }}>
            This screen stopped working. Your saved progress has not been touched.
          </p>
          {/* The detail stays on screen, not only in a console nobody has open.
            * `pre` because a stack-shaped message is unreadable reflowed. */}
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: '1.25rem',
              opacity: 0.8,
            }}
          >
            {describe(error)}
          </pre>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={this.reload}>
              Reload the page
            </button>
            {/* Absent, not disabled, when there is nothing to clear. A control
              * that cannot act promises an escape that will not arrive. */}
            {storage !== null && (
              <button type="button" onClick={this.reset}>
                Reset saved data and reload
              </button>
            )}
          </div>
          {storage !== null && !resetFailed && (
            <p style={{ marginTop: '0.75rem', opacity: 0.7 }}>
              Reset if reloading keeps landing here. It erases saved progress on this device.
            </p>
          )}
          {resetFailed && (
            <p style={{ marginTop: '0.75rem' }}>
              Could not clear the saved data — this browser refused. Clearing site data for this
              page in browser settings will do the same thing.
            </p>
          )}
        </div>
      </div>
    )
  }
}
