import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * THE WHOLE APPLICATION TREE, IN ONE PLACE THAT A TEST CAN IMPORT.
 *
 * This used to be inlined in `main.tsx`, which calls `createRoot(...).render()`
 * at module scope. Importing that file to check its shape would MOUNT the
 * application as a side effect, so the shape was untestable and both of the
 * decisions below were unenforced. Extracting the tree costs one file and buys
 * `Root.test.tsx`.
 *
 * THE BOUNDARY IS OUTSIDE THE ROUTER, NOT INSIDE IT.
 * The crash this was written for surfaced at `<Route.Provider>` — inside the
 * router — and React only unwinds to an ANCESTOR boundary. A boundary mounted
 * within the routed tree would sit below the throw and never see it. Outside,
 * it is an ancestor of everything: the router, the shell, every route and the
 * lazy chunks beneath them.
 *
 * `future.v7_startTransition` IS A BEHAVIOUR CHANGE, NOT A WARNING SILENCER.
 * react-router 6.30.6 applies route changes synchronously unless this is set.
 * Three routes here are `React.lazy` (App.tsx:63), and a synchronous update
 * that mounts a chunk which has not finished downloading makes React throw
 * instead of showing the Suspense fallback — "A component suspended while
 * responding to synchronous input". With the flag, the router wraps its
 * updates in `React.startTransition`, and a transition that suspends shows the
 * fallback, which is the behaviour the routes were written expecting.
 *
 * Setting it to `false` would also silence the console warning while leaving
 * the behaviour exactly as broken. That is why the test asserts the VALUE is
 * `true`, and not merely that the key exists.
 */
export function Root() {
  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true }}>
        <App />
      </HashRouter>
    </ErrorBoundary>
  )
}
