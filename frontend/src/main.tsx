import React from 'react'
import ReactDOM from 'react-dom/client'
import { Root } from './Root'
import './styles/index.css'

/* The tree itself lives in `Root.tsx` so a test can import it without this
 * file's `createRoot(...).render()` mounting the application as a side effect.
 * Everything this file still decides — StrictMode, which DOM node, which
 * stylesheet — is untestable from here by nature, and now that is ALL that is
 * untestable from here. */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
