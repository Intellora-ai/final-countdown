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
import { logarithms } from './lessons/logarithms'
import { tenses } from './lessons/tenses'
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
import { chatOnce } from '../agent/ports/httpModel'
import { authorLesson } from './teach/authorLesson'
import type { Lesson } from './spec/spec'
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
  { id: 'logs', label: 'Maths', spec: logarithms },
  { id: 'tenses', label: 'English', spec: tenses },
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

/**
 * The local model the learner's own machine is running.
 *
 * Same three variables `TutorView` reads, on purpose. A second set would mean a
 * machine configured for the tutor still could not author a lesson, and the
 * learner would have no way to tell which half they had missed.
 */
/** Shown instead of a refusal when there is no model to refuse anything. */
const NO_MODEL_NOTE =
  'Set VITE_TUTOR_ENDPOINT to a chat-completions URL to author lessons on any topic — '
  + 'for a local runner that is usually http://localhost:11434/v1/chat/completions (Ollama) '
  + 'or http://localhost:1234/v1/chat/completions (LM Studio).'

function readEnv(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  return typeof v === 'string' ? v : ''
}

export default function CanvasRoute({ search }: { search?: WebSearch } = {}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [lessonId, setLessonId] = useState<string>(LESSONS[0].id)

  /* A lesson written for THIS learner, on a topic nobody authored in advance.
     Null until they ask for one; once set it replaces the picked lesson, and
     clearing it hands the picker back. */
  const [topic, setTopic] = useState('')
  const [authored, setAuthored] = useState<Lesson | null>(null)
  const [authoring, setAuthoring] = useState(false)
  const [authorFailed, setAuthorFailed] = useState<Issue[] | null>(null)

  /*
   * WHETHER THERE IS A MODEL TO ASK, KNOWN BEFORE ANYONE ASKS.
   *
   * Without this the button stayed enabled, `chatOnce` threw "no model endpoint
   * is configured", and that arrived under the heading "That lesson was refused
   * — the model answered, and what it produced does not teach". The model was
   * never contacted. Telling a learner their question produced bad teaching
   * when nothing was asked is the worst kind of wrong: it is confident, and it
   * blames the wrong thing.
   *
   * `TutorView` already gets this right by checking up front. This is the same
   * check, in the one place that was missing it.
   */
  const modelEndpoint = readEnv('VITE_TUTOR_ENDPOINT')
  const hasModel = modelEndpoint.trim() !== ''

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

  /**
   * Write a lesson for whatever the learner just asked about.
   *
   * THE REFUSAL IS SHOWN, NOT SWALLOWED. `authorLesson` returns the gate's
   * issues when the model's lesson does not teach, and those reach the screen
   * verbatim. A canvas that quietly fell back to a picked lesson would tell the
   * learner their question had been answered when it had not.
   */
  const askForALesson = async (): Promise<void> => {
    const question = topic.trim()
    if (question === '' || authoring) return

    setAuthoring(true)
    setAuthorFailed(null)
    try {
      const chat = chatOnce({
        endpoint: readEnv('VITE_TUTOR_ENDPOINT'),
        model: readEnv('VITE_TUTOR_MODEL') || undefined,
        apiKey: readEnv('VITE_TUTOR_KEY') || undefined,
        /* A lesson is far longer than a chat reply, and the default 1024 tokens
           truncates the JSON mid-object — which arrives as "no JSON object at
           all" and reads as a model failure rather than a budget one. */
        maxTokens: 4000,
        timeoutMs: 240_000,
      })
      const written = await authorLesson(chat, question)
      if (written.ok) {
        setAuthored(written.lesson)
      } else {
        setAuthored(null)
        setAuthorFailed(written.issues)
      }
    } catch (e) {
      setAuthored(null)
      setAuthorFailed([{ path: '(model)', message: e instanceof Error ? e.message : String(e) }])
    } finally {
      setAuthoring(false)
    }
  }

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
  const picked = useMemo(() => validateLesson(chosen.spec), [chosen])

  /* An authored lesson has ALREADY been through `validateLesson` inside
     `authorLesson` — that is what "ok" means there. Re-parsing it would be work
     whose answer cannot differ. */
  const result: typeof picked = authored === null ? picked : { ok: true, lesson: authored }

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
              aria-pressed={authored === null && lessonId === lesson.id}
              onClick={() => {
                setAuthored(null)
                setAuthorFailed(null)
                setLessonId(lesson.id)
              }}
            >
              {lesson.label}
            </button>
          ))}
        </div>

        {/*
          ANY SUBJECT, NOT A PICKED ONE.
          ------------------------------
          Every lesson above was written by hand, which means the canvas could
          only teach the things somebody had already sat down and authored. This
          asks the learner's own local model for a lesson on anything, and puts
          the answer through exactly the same gate the hand-written ones face —
          so a model that produces a wall of text is refused here as loudly as
          an author would be.
        */}
        <form
          className="lc-ask-topic"
          onSubmit={(e) => {
            e.preventDefault()
            void askForALesson()
          }}
        >
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={hasModel ? 'Teach me anything…' : 'No model configured'}
            aria-label="A topic to be taught"
            title={hasModel ? undefined : NO_MODEL_NOTE}
            disabled={authoring || !hasModel}
          />
          <button type="submit" disabled={authoring || !hasModel || topic.trim() === ''}>
            {authoring ? 'Writing…' : 'Teach me'}
          </button>
        </form>

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

      {authorFailed !== null && (
        <div className="lc-refusal" role="alert">
          <h2>That lesson was refused</h2>
          <p className="lc-caption">
            {/* Two different failures wore one sentence. A model that was never
                reached did not "produce" anything, and saying it did sends the
                reader looking for a teaching problem that does not exist. */}
            {authorFailed.some((i) => i.path === '(model)')
              ? 'The model could not be reached, so nothing was written.'
              : 'The model answered, and what it produced does not teach. It is not being shown.'}
          </p>
          <ul>
            {authorFailed.slice(0, 8).map((issue, i) => (
              <li key={i}>
                <code>{issue.path}</code> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

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
