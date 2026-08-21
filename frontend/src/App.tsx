import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore, useNarrow } from './hooks/useStore'
import CURRICULUM from './data/curriculum'
import { Sidebar } from './components/Sidebar'
import { SetupFlow } from './components/SetupFlow'
import { TodayView } from './components/TodayView'
import { ChapterView } from './components/ChapterView'
import { Placeholder } from './components/Placeholder'
import { BoardView } from './board'

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
