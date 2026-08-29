import React, { useEffect, useMemo, useState } from 'react'
import { plannedSubjects, primePlannedCurriculum, isPlannedCurriculumReady } from './almanac/plannedCurriculum'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore, useNarrow } from './hooks/useStore'
import CURRICULUM from './data/curriculum'
import { Sidebar } from './components/Sidebar'
import { SetupFlow } from './components/SetupFlow'
import { TodayView } from './components/TodayView'
import { ChapterView } from './components/ChapterView'
import { Placeholder } from './components/Placeholder'

/* THE SCENE IS LOADED ON DEMAND, AND THE BUDGET IS WHY.
 *
 * Imported statically it pulled KaTeX, d3-scale, every panel and the whole
 * explanation canvas into the entry chunk: initial JavaScript went to 186.55
 * KB gzip against this repo's stated 150 KB ceiling. A learner opening Today
 * has no use for a typesetting engine. As a lazy route it becomes a chunk that
 * arrives only when someone actually opens the canvas, and three.js — already
 * lazy one level deeper — arrives only when the 3D panel first mounts. */
/* ONE CANVAS ROUTE NOW, WHERE THERE WERE TWO.
 *
 * `/canvas/gas` and `/canvas/lessons` were two entry points to two components:
 * a single hand-built gas lesson, and a gallery. Both are gone with the canvas
 * they belonged to. The engine that replaced them treats a lesson as data, so
 * "which lesson" is a choice made INSIDE the canvas rather than a different URL
 * and a different component — one route is the whole surface.
 *
 * The two old paths still resolve (see the redirects below) because they were
 * linked from elsewhere and a dead bookmark is a worse outcome than a redirect
 * nobody notices. */
const CanvasRoute = React.lazy(() => import('./canvas/CanvasRoute'))

/* WHERE A DOUBT GOES WHEN THE LESSON CANNOT ANSWER IT.
 *
 * The canvas answers first from the page the learner is looking at, and that
 * refusal used to be the end of the road: the learner admitted confusion, was
 * told this page does not cover it, and nothing caught them. This is the catch.
 *
 * THE OPEN WEB, NOT ONE SITE — AND WHAT CHANGED TO MAKE THAT POSSIBLE.
 * This used to call Wikipedia directly, and not by preference. A general engine
 * needs an account and a key; a key cannot ship to a browser, because devtools
 * and the network tab both hand it over; and a browser may not even READ a page
 * that did not opt into CORS. Wikipedia needed no key and sends CORS headers,
 * so it was the only source reachable from a page, and `engine.ts`'s general
 * seam sat there correct and unusable.
 *
 * `vite-plugin-search.ts` is the server those two problems needed. The key
 * stays in the server's environment, the server does the fetching, and this
 * calls a relative route on its own origin — so the browser never learns which
 * vendor answered and never holds a credential. Wikipedia may still come back
 * as a result; it simply has no privileged position any more.
 *
 * IMPORTED LAZILY, INSIDE THE CALL. A static import would put the retrieval
 * layer in the entry chunk for every learner including the ones who never get
 * stuck. This way it arrives on the first question the lesson cannot answer,
 * and never otherwise. */
const searchTheWeb = (query: string, options: Record<string, unknown>) =>
  import('./websearch/webSearchClient').then((m) => m.searchTheWeb(query, options))

/* The practice map. Lazy for the same reason the canvas is: it carries the
 * whole curriculum and its own stylesheet, and a learner on /today should not
 * pay for either. Nothing outside `src/practice/` imports it, and it imports
 * nothing from the canvas or the dashboard. */
const PracticeView = React.lazy(() => import('./practice/PracticeView'))
const TutorView = React.lazy(() => import('./tutor/TutorView'))

/* The teaching screen is LAZY for the same reason the practice view is: it
 * pulls in the whole canvas renderer, and a learner sitting on /today should
 * not download it to look at a list.
 *
 * Imported eagerly, it took the initial bundle from 70 KB to 186 KB and the
 * budget gate refused the change -- correctly. */
const LearnView = React.lazy(() =>
  import('./canvas/learn/LearnView').then((m) => ({ default: m.LearnView })),
)

/* Ask-anything shares the teaching screen's machinery, so it shares its chunk
 * boundary too: a learner on /today pays for neither. */
const AskView = React.lazy(() =>
  import('./canvas/learn/AskView').then((m) => ({ default: m.AskView })),
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

  /* The curriculum is one lazy chunk per class and every screen below reads it
     DURING RENDER, so it is primed here, once, as soon as the student's class
     is known. Until it lands the screens show empty rather than the older
     hand-written syllabus -- an empty sidebar is a visible problem, a sidebar
     full of the wrong subjects is not. */
  const [curriculumReady, setCurriculumReady] = useState(false)
  useEffect(() => {
    if (!st?.cls) return
    let live = true
    void primePlannedCurriculum(st.cls).then(() => {
      if (!live) return
      /* The store caches its plan and its sidebar counts against a revision
         number. Both are computed FROM the curriculum, so a curriculum that
         arrives after the first render would leave those caches holding the
         empty answer for the rest of the session. */
      store.bump()
      setCurriculumReady(isPlannedCurriculumReady(st.cls))
    })
    return () => {
      live = false
    }
  }, [st?.cls])
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
  /* The two retired paths. They land on the canvas rather than on the
   * catch-all, which would have sent an old bookmark silently to /today and
   * looked like the feature had been removed. */
  if (loc.pathname === '/canvas/gas' || loc.pathname === '/canvas/lessons') {
    return <Navigate to="/canvas" replace />
  }

  if (loc.pathname === '/canvas') {
    return (
      <React.Suspense fallback={<SceneFallback />}>
        <CanvasRoute search={searchTheWeb} />
      </React.Suspense>
    )
  }

  const closeOnPhone = () => { if (narrow) setDrawer(false) }

  return (
    <div className="dark" style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <div
        data-shell="shell"
        /* Observable on purpose: "did the curriculum load" is otherwise
           impossible to answer from outside, and a feature nobody can observe
           is indistinguishable from one that never ran. */
        data-curriculum={curriculumReady ? 'ready' : 'loading'}
        style={{ position: 'relative' }}
      >
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

              <Route
              path="/learn/:conceptId"
              element={
                <React.Suspense fallback={<SceneFallback />}>
                  <LearnView cls={st?.cls ?? null} />
                </React.Suspense>
              }
            />
              <Route path="/chapter/:subjectId/:chapterId" element={<ChapterView />} />
              <Route
                path="/practice"
                element={
                  <React.Suspense fallback={<SceneFallback />}>
                    <PracticeView />
                  </React.Suspense>
                }
              />
              {/* BOTH SURFACES KEPT, AND THE OVERLAP IS REPORTED RATHER THAN
                  RESOLVED SILENTLY.

                  Two branches independently built "ask anything". `TutorView`
                  wires `src/agent` -- eleven thousand lines that were an island
                  -- and shows the trace of what actually ran. `AskView` teaches
                  a free question through the canvas, the same screen a planned
                  concept uses.

                  They are different products, not two attempts at one, and
                  deleting either to settle a merge would destroy work nobody
                  asked to lose. `/quick-question` keeps the tutor because that
                  is where it already shipped; the canvas answer gets its own
                  path until the owner picks. */}
              <Route path="/quick-question" element={<TutorView />} />
              <Route
                path="/ask"
                element={
                  <React.Suspense fallback={<SceneFallback />}>
                    <AskView />
                  </React.Suspense>
                }
              />
              <Route path="/misconception" element={<Placeholder kind="misconception" />} />
              {/* The blackboard's two routes are gone with the blackboard itself
                * (see docs/migrations/step-0-blackboard-deletion.md). The
                * explanation canvas is returned above, before the shell, because
                * it owns the whole window — so no /canvas path reaches this list
                * at all, and the catch-all below never sees one. */}
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
    const sub = plannedSubjects(st.cls).find((s) => s.id === m[1])
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
