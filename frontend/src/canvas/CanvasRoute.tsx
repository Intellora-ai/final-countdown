import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { AnyResolver } from './teach/contract'
import { lessonResolver } from './teach/doubt'
import { engineResolver } from './teach/engineResolver'
import { webResolver, type SearchResult } from './teach/webResolver'
import { cssVariables } from './design/tokens'
import { billBecomesLaw } from './lessons/billBecomesLaw'
import { classifierEvaluation } from './lessons/classifierEvaluation'
import { gasPressure } from './lessons/gasPressure'
/* Engine output, not hand-authored. `learning-os` generates these from two
   learners with IDENTICAL knowledge and different histories — see
   `learning_os/api/demo.py`, whose `--check` keeps them from drifting. The
   picker shows the ENGINE choosing differently, not a human writing twice. */
import learnerA from './lessons/generated/learner-a-first-attempt.json'
import learnerB from './lessons/generated/learner-b-preferred-mechanism-failed.json'
/* NOT engine output. Prose written by hand to the same contract, because the
   fake model writes badly on purpose (see `llm/client.py`) and thin skeletons
   cannot show what the contract does to real sentences. Labelled as
   hand-written wherever it appears, so nobody reads it as a model's work. */
import byHand from './lessons/handwritten/contract-honoured-by-hand.json'
import { validateLesson, type Issue } from './spec/validate'
import { TeachView } from './teach/TeachView'

import './design/canvas.css'
import './route.css'

/**
 * The canvas, inside this app.
 *
 * WHAT REPLACED WHAT
 * ------------------
 * This is the second canvas to live at `src/canvas/`. The first one rendered a
 * single hand-built gas lesson and a gallery beside it; its panels stated their
 * own positions, so every new lesson meant a new coordinate table and a new
 * component. It is gone. What sits here now is the engine: a lesson is DATA, a
 * layout is DERIVED from that data, and adding a subject adds a file of content
 * rather than a file of code. The three lessons below are unrelated on purpose
 * — physics, civics, machine learning — because three subjects that lay out
 * differently through one engine is the only real evidence that the engine is
 * reading the content rather than repeating a template.
 *
 * WHY THIS FILE IS THIN
 * ---------------------
 * Everything specific to teaching lives in `teach/`. This file knows three
 * things the engine must not: that there is a dashboard to go back to, which
 * lessons this product ships, and that a learner may want the 3D view. Keeping
 * those here is what lets `spec/`, `layout/` and `render/` stay portable — they
 * have no idea they are inside a study app.
 */

const LESSONS = [
  { id: 'gas', label: 'Physics', spec: gasPressure },
  { id: 'bill', label: 'Civics', spec: billBecomesLaw },
  { id: 'ml', label: 'Machine learning', spec: classifierEvaluation },
  // The last three are the engine's, not an author's. A and B share a knowledge
  // state and differ only in what has already been tried on them, so the two
  // sitting side by side is the adaptation claim rendered rather than asserted.
  { id: 'engine-a', label: 'Engine: first attempt', spec: learnerA },
  { id: 'engine-b', label: 'Engine: preferred mechanism failed', spec: learnerB },
  { id: 'by-hand', label: 'Same contract, written by hand', spec: byHand },
] as const

/**
 * How the canvas reaches a source outside the lesson, if it has one.
 *
 * A FUNCTION PASSED IN, NOT A MODULE IMPORTED HERE. Two reasons, both real.
 *
 * The first is the bundle. `src/websearch` is not tiny, and a static import
 * would land it in whichever chunk this file belongs to whether or not anyone
 * ever asks a question. `App.tsx` hands down a loader that `import()`s it on
 * first use, so a learner who never gets stuck never downloads it.
 *
 * The second is the type-checker. `tsconfig.canvas.json` checks this directory
 * under `noUncheckedIndexedAccess`, a flag `src/websearch` was not written
 * against; importing it from here drags the whole directory into that stricter
 * project. Taking a function keeps the dependency one-way and erased.
 */
export type WebSearch = (query: string, options: Record<string, unknown>) => Promise<SearchResult>

export default function CanvasRoute({ search }: { search?: WebSearch } = {}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [lessonId, setLessonId] = useState<string>(LESSONS[0].id)

  /*
   * The chain, in trust order: the page the learner is looking at first, then
   * anywhere else.
   *
   * The lesson always answers first when it can, because a block the author
   * wrote about the exact thing being asked beats a correct paragraph from
   * elsewhere — the learner is looking at that page and has to be able to
   * connect the answer to it. The web rung only exists when a search was
   * supplied; with none, this is exactly the single-resolver behaviour that
   * shipped before, and the refusal stays the honest one.
   */
  const resolvers = useMemo<readonly AnyResolver[]>(() => {
    const chain: AnyResolver[] = [lessonResolver]

    /*
     * The engine second. It is the only rung that can WRITE a new explanation
     * rather than find an existing one -- it knows the syllabus, this learner's
     * history, and which mechanisms have already failed on them. That beats a
     * correct paragraph written for nobody, so it goes ahead of the web.
     *
     * Included unconditionally: when the middleware is absent (a production
     * build, where it is deliberately not mounted) the POST fails and the chain
     * records `failed` and moves on. That costs one request and buys a learner
     * the engine's answer everywhere it IS running, which is the whole of
     * development.
     */
    chain.push(engineResolver())

    if (search) chain.push(webResolver({ search }))
    return chain
  }, [search])

  const chosen = LESSONS.find((l) => l.id === lessonId) ?? LESSONS[0]

  /*
   * Validated once per lesson, not per render.
   *
   * `validateLesson` walks every block and runs the shape invariants, and the
   * teaching view re-renders on every reveal and every doubt. Without the memo
   * the whole spec would be re-parsed each time a learner pressed continue —
   * work whose result cannot have changed, since the lesson is a module
   * constant.
   */
  const result = useMemo(() => validateLesson(chosen.spec), [chosen])

  return (
    <div className="lc-root lc-route" style={cssVariables() as React.CSSProperties}>
      <div className="lc-route-bar">
        <button type="button" className="lc-back" onClick={() => navigate('/today')}>
          Back
        </button>

        <div className="lc-toggle" role="group" aria-label="Lesson">
          {LESSONS.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              aria-pressed={lessonId === lesson.id}
              onClick={() => setLessonId(lesson.id)}
            >
              {lesson.label}
            </button>
          ))}
        </div>

        <div className="lc-route-end">
          {result.ok && result.lesson.subject && (
            <span className="lc-route-subject">{result.lesson.subject}</span>
          )}
          {/*
           * The 3D toggle lives here rather than in the teaching view because
           * it is a preference about how a figure is DRAWN, not a step in the
           * lesson. A learner switching to 3D mid-lesson must not lose their
           * place, and the only way to guarantee that is for the control to sit
           * outside the thing that holds the place.
           */}
          <div className="lc-toggle" role="group" aria-label="View mode">
            <button type="button" aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>
              2D
            </button>
            <button type="button" aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
              3D
            </button>
          </div>
        </div>
      </div>

      <div className="lc-stage">
        {result.ok ? (
          /*
           * `key` on the lesson id, so switching subject starts the new lesson
           * at its beginning. Without it React reuses the component and the
           * learner lands three beats into a lesson they have not begun —
           * position is state, and state must not survive a change of subject.
           */
          <TeachView key={chosen.id} lesson={result.lesson} mode={mode} resolvers={resolvers} />
        ) : (
          <Refusal title="This lesson was refused" issues={result.issues} />
        )}
      </div>
    </div>
  )
}

/**
 * Why a lesson is not being shown.
 *
 * The engine's standing rule is that a failing frame is never painted, because
 * a half-drawn lesson is indistinguishable from a design choice and a learner
 * has no way to tell one from the other. The corollary is this component: if
 * nothing is drawn, the reason has to be visible somewhere, and an empty page
 * is not a reason.
 */
function Refusal({ title, issues }: { title: string; issues: Issue[] }) {
  return (
    <div className="lc-refusal" role="alert">
      <h2>{title}</h2>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.path}</code> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
