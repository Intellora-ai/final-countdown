import React from 'react'
import ReactDOM from 'react-dom/client'
import { Root } from './Root'
import { hashTargetFor } from './pathIntoHash'
import './styles/index.css'

/* The tree itself lives in `Root.tsx` so a test can import it without this
 * file's `createRoot(...).render()` mounting the application as a side effect.
 * Everything this file still decides — StrictMode, which DOM node, which
 * stylesheet — is untestable from here by nature, and now that is ALL that is
 * untestable from here. */
/* BEFORE THE ROUTER MOUNTS, so `/canvas` reaches the canvas rather than
 * silently showing the dashboard under a URL that still says `/canvas`.
 * `replace` rather than `assign`: the address that never routed should not sit
 * in the back button waiting to be returned to. See `pathIntoHash.ts`. */
const moved = hashTargetFor(window.location)
if (moved !== null) window.location.replace(moved)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
