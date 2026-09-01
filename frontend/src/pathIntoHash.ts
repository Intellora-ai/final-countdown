/**
 * A PATH-STYLE URL, MOVED INTO THE HASH THIS APPLICATION ACTUALLY ROUTES ON.
 *
 * `Root.tsx` mounts a `HashRouter`, so the route is whatever follows `#`. The
 * PATH is not routing information at all -- it only decides which file the
 * server hands back. A dev server and any host with a rewrite hand back
 * `index.html` for every path, so `/canvas` loads the application perfectly,
 * arrives with an empty hash, and the router does what it is supposed to do
 * with an empty route: sends her to the default one.
 *
 * MEASURED, and this is why it needed fixing rather than documenting:
 *
 *   http://localhost:5173/canvas     ->  #/today   topic box: NO
 *   http://localhost:5173/#/canvas   ->  #/canvas  topic box: YES
 *
 * Nothing errors. Nothing is logged. The address bar still reads `/canvas`
 * while the screen shows the dashboard, which has no topic box on it at all --
 * so the reasonable conclusion for the person looking at it is that the canvas
 * is broken, or that they cannot type. A silent redirect to somewhere else is
 * worse than a 404, because a 404 tells the truth.
 *
 * WHY A PURE FUNCTION AND NOT A LINE IN `main.tsx`. `main.tsx` calls
 * `createRoot(...).render()` at module scope, so importing it to check anything
 * mounts the whole application -- the exact reason `Root.tsx` exists. This is
 * the decision; `main.tsx` only performs it.
 *
 * @returns the URL to replace the current one with, or null to leave it alone.
 */
export function hashTargetFor(location: {
  origin: string
  pathname: string
  hash: string
  search: string
}): string | null {
  /* A hash is already present, so a route was asked for. Even `#/` is a
     deliberate answer to "which route", and moving the path on top of it would
     overrule the more specific instruction with the less specific one. */
  if (location.hash !== '') return null

  /* The root path is not a route that went missing -- it is the ordinary way to
     open the application, and the router's own default is the right answer. */
  if (location.pathname === '' || location.pathname === '/') return null

  /* A file, not a route. `/vite.svg` and `/assets/x.js` reach this function
     only if something has gone very wrong, but rewriting them would turn a
     missing asset into a mystery route rather than a 404. */
  if (/\.[a-zA-Z0-9]+$/.test(location.pathname)) return null

  /* `search` is carried, not dropped. A link with a query on it means the query
     to whoever sent it, and losing it silently is the same class of defect as
     losing the path. */
  return `${location.origin}/#${location.pathname}${location.search}`
}
