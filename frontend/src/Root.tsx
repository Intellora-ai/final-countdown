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
 */
export function Root() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  )
}
