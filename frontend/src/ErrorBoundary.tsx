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
 * renders plain elements with inline styles and no imports beyond React. The
 * CSS variables are the ones the shell already sets in `App.tsx`; if the
 * stylesheet itself is what failed they resolve to nothing and the text falls
 * back to the browser default, which is still readable. That is the point.
 *
 * IT REPORTS, IT DOES NOT SWALLOW.
 * The error is re-logged in `componentDidCatch`. A boundary that shows a
 * friendly screen and drops the cause is a worse outcome than the blank page:
 * the symptom is hidden AND the evidence is gone. Note that the LOG is not
 * the handling — `getDerivedStateFromError` changes control flow by moving
 * the component into its error state. The log is the evidence trail beside
 * it, which is why this is not a catch-and-continue.
 */

export interface ErrorBoundaryProps {
  readonly children: React.ReactNode
}

interface ErrorBoundaryState {
  readonly error: unknown
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

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[error-boundary] the application stopped rendering:', error, info.componentStack)
  }

  override render(): React.ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <div
        role="alert"
        /* `.dark` is where `styles/tokens/colors.css` remaps the semantic
         * aliases, and `App.tsx` is what normally supplies it. This boundary
         * mounts OUTSIDE App by design, so without repeating the class the
         * recovery screen falls back to the light palette and renders as a
         * white page inside a dark product. Measured in a browser on
         * 2026-08-25: readable, but visibly not the same application. */
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
          <button type="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
