import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore, useNarrow } from './hooks/useStore'
import CURRICULUM from './data/curriculum'
import { Sidebar } from './components/Sidebar'
import { SetupFlow } from './components/SetupFlow'
import { TodayView } from './components/TodayView'
import { ChapterView } from './components/ChapterView'
import { Placeholder } from './components/Placeholder'
import { BoardView, GalleryView } from './board'

/* THE SCENE IS LOADED ON DEMAND, AND THE BUDGET IS WHY.
 *
 * Imported statically it pulled KaTeX, d3-scale, every panel and the whole
 * explanation canvas into the entry chunk: initial JavaScript went to 186.55
 * KB gzip against this repo's stated 150 KB ceiling. A learner opening Today
 * has no use for a typesetting engine. As a lazy route it becomes a chunk that
 * arrives only when someone actually opens the canvas, and three.js — already
 * lazy one level deeper — arrives only when the 3D panel first mounts. */
const GasPressureScene = React.lazy(() =>
  import('./board/scene/GasPressureScene').then((m) => ({ default: m.GasPressureScene })),
)

function SceneFallback() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: '#0e1113', color: '#5b666f',
      fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '.18em',
      textTransform: 'uppercase',
    }}>
      Opening the canvas…
    </div>
  )
}

export default function App() {
  const store = useStore()
  const narrow = useNarrow()
  const loc = useLocation()
  const [drawer, setDrawer] = useState<boolean | null>(null)   // null = follow breakpoint default
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const drawerOpen = drawer === null ? !narrow : drawer

  /* Crossing the breakpoint resets the drawer to the sane default. */
  const [wasNarrow, setWasNarrow] = useState(narrow)
  useEffect(() => { if (narrow !== wasNarrow) { setWasNarrow(narrow); setDrawer(null) } }, [narrow, wasNarrow])

  const st = store.db ? store.student() : null
  useEffect(() => {
    if (st && Object.keys(open).length === 0 && st.subjects.length) setOpen({ [st.subjects[0]]: true })
  }, [st && st.id])

  if (!store.db) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>Loading…</div>
  }

  const hasPlan = store.hasPlan()
  const inSetup = loc.pathname === '/setup'
  if (!hasPlan && !inSetup) return <Navigate to="/setup" replace />

  if (inSetup) return <SetupFlow />

  /* THE EXPLANATION CANVAS OWNS THE WHOLE WINDOW.
   *
   * It is returned BEFORE the shell rather than inside it, because the shell
   * is not decoration it can sit under: the sidebar takes a column and the top
   * bar takes a strip, and a board whose layout is stated in exact coordinates
   * cannot be handed an unpredictable fraction of the screen. Every other
   * route keeps the curriculum around it; this one replaces it, and the back
   * button in its own chrome is how the learner returns. */
  if (loc.pathname === '/canvas/gas') {
    return (
      <React.Suspense fallback={<SceneFallback />}>
        <GasPressureScene />
      </React.Suspense>
    )
  }

  const closeOnPhone = () => { if (narrow) setDrawer(false) }

  return (
    <div className="dark" style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <div data-shell="shell" style={{ position: 'relative' }}>
        <div data-shell="row" style={{ display: 'flex', alignItems: 'stretch', minHeight: '100vh' }}>
          {drawerOpen && <>
            <Sidebar open={open} setOpen={setOpen} onNavigate={closeOnPhone} />
            <div data-shell="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
          </>}
          <main data-shell="main" role="main" style={{ flex: 1, minWidth: 0 }}>
            <TopBar drawerOpen={drawerOpen} toggle={() => setDrawer(!drawerOpen)} />
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<TodayView />} />
              <Route path="/chapter/:subjectId/:chapterId" element={<ChapterView />} />
              <Route path="/practice" element={<Placeholder kind="practice" />} />
              <Route path="/quick-question" element={<Placeholder kind="quick-question" />} />
              <Route path="/misconception" element={<Placeholder kind="misconception" />} />
              {/* THE LEARNING CANVAS IS BACK, ON A NEW ENGINE.
                *
                * It was disconnected in 7ad4f6d because the design was wrong:
                * every board rendered through one twelve-column grid, every
                * block's width was a per-type constant, and no two lessons
                * could differ in shape. That is what changed — the board now
                * composes its own layout from what the content IS, and blocks
                * share one reactive model instead of each owning private
                * state. The gallery is declared before the board so the more
                * specific path wins regardless of matcher order changes. */}
              <Route path="/canvas/gallery" element={<GalleryView />} />
              <Route path="/canvas" element={<BoardView />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  )
}

function TopBar({ drawerOpen, toggle }: { drawerOpen: boolean; toggle: () => void }) {
  const store = useStore()
  const loc = useLocation()
  const st = store.student()
  let crumb = 'Today'
  const m = loc.pathname.match(/^\/chapter\/([^/]+)\/([^/]+)$/)
  if (m && st) {
    const sub = CURRICULUM.subjectsFor(st.cls, st.stream).find((s) => s.id === m[1])
    const ch = sub && sub.chapters.find((c) => c.id === m[2])
    crumb = sub ? sub.name + ' · ' + (ch ? ch.name : '') : 'Chapter'
  } else if (loc.pathname !== '/today' && loc.pathname !== '/') crumb = loc.pathname.slice(1)
  return (
    <div className="topbar">
      <button className="toggle" onClick={toggle}>{drawerOpen ? 'Hide curriculum' : 'Curriculum'}</button>
      <span className="mono-crumb">{crumb}</span>
      <span style={{ flex: 1, minWidth: 12 }} />
      <span className="mono-crumb" style={{ letterSpacing: '.14em' }}>{st ? (st.cls || '') + (st.stream ? ' · ' + st.stream : '') : ''}</span>
    </div>
  )
}
