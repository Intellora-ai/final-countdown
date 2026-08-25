import React from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { loadPlannedSubjects } from '../../almanac/curriculum'
import { createAlmanacClient, type AlmanacClient } from '../../almanac/client'
import { storedLessonFor } from '../../almanac/lesson'
import { recordAttempt } from '../../almanac/attempts'
import { validateLesson } from '../spec/validate'
import type { Lesson } from '../spec/spec'
import { TeachView } from '../teach/TeachView'
import type { SubjectLike } from '../../almanac/resolve'

/**
 * The screen `Start` opens: one concept, taught.
 *
 * The lesson is written by the model, on the server, for THIS student. The
 * server chooses the teaching strategy from what the browser reports -- how
 * many times this concept has been opened, and whether it was carried over
 * unfinished -- and the browser never picks one itself.
 *
 * THE FALLBACK RULE, and it is the important one:
 *   A stored lesson is used ONLY when it is for the same concept. Teaching gas
 *   pressure to a student who opened photosynthesis is worse than teaching
 *   nothing: they would mark photosynthesis done afterwards and Almanac would
 *   never show it again. Three lessons are stored. Everything else gets an
 *   honest failure that names the concept.
 *
 * `cls` is passed IN rather than read from the dashboard store: a canvas
 * screen reaching into the dashboard's data layer drags it under this
 * directory's stricter typecheck, and the project's scope rules forbid the
 * coupling in the other direction too.
 */
export function LearnView({
  subjects,
  cls = null,
  almanac,
}: {
  subjects?: readonly SubjectLike[]
  cls?: string | null
  almanac?: AlmanacClient
} = {}) {
  const { conceptId = '' } = useParams()
  const location = useLocation()
  const passed = (location.state ?? {}) as { carriedFrom?: string; attempts?: number }

  const client = React.useMemo(() => almanac ?? createAlmanacClient(), [almanac])

  const [loaded, setLoaded] = React.useState<readonly SubjectLike[]>([])
  React.useEffect(() => {
    if (subjects !== undefined) return
    let live = true
    void loadPlannedSubjects(cls).then((found) => {
      if (live) setLoaded(found)
    })
    return () => {
      live = false
    }
  }, [subjects, cls])

  const available = subjects ?? loaded

  const named = React.useMemo(() => {
    for (const subject of available) {
      for (const chapter of subject.chapters) {
        const concept = chapter.concepts.find((c) => c.id === conceptId)
        if (concept) return { concept: concept.name, chapter: chapter.name, subject: subject.name }
      }
    }
    return null
  }, [available, conceptId])

  type State =
    | { phase: 'writing' }
    | { phase: 'taught'; lesson: Lesson; stored: boolean; strategy?: string }
    | { phase: 'failed'; reason: string }

  const [state, setState] = React.useState<State>({ phase: 'writing' })

  /* Depth is ADDED, never substituted.
   *
   * When the learner's own turns show a gap, a second lesson is asked for with
   * `cognitive_overload` -- which the server's policy turns into decomposition
   * -- and it is rendered BELOW the first. Replacing the lesson would take away
   * the part they had already got through, which is the opposite of help, and
   * the brief is explicit that the whole concept is covered first. */
  const [deeper, setDeeper] = React.useState<Lesson | null>(null)
  const deepening = React.useRef(false)

  const goDeeper = React.useCallback(() => {
    if (deepening.current) return
    deepening.current = true
    void client
      .lesson({
        concept: named?.concept ?? conceptId,
        ...(named?.subject === undefined ? {} : { subject: named.subject }),
        diagnosis: 'cognitive_overload',
      })
      .then((result) => {
        if (!result.ok) return
        const checked = validateLesson(result.lesson)
        if (checked.ok) setDeeper(checked.lesson)
      })
  }, [client, conceptId, named])

  React.useEffect(() => {
    if (conceptId === '') return
    /* Wait for the name before asking. The model teaches "Pressure of a gas";
     * sending the id would ask it to teach a database key. */
    if (named === null && available.length > 0) {
      setState({ phase: 'failed', reason: `This device does not know a concept called ${conceptId}.` })
      return
    }
    if (named === null && subjects === undefined) return

    let live = true
    /* Counted HERE, once, as the concept is opened. The server's policy
       escalates on this number -- worked example, then a different
       representation, then an analogy -- so without a count that survives
       leaving the page every visit would be the first visit and the teaching
       would never change. */
    const attempts = recordAttempt(conceptId)
    void client
      .lesson({
        concept: named?.concept ?? conceptId,
        ...(named?.subject === undefined ? {} : { subject: named.subject }),
        attempts,
        ...(passed.carriedFrom === undefined ? {} : { carriedFrom: passed.carriedFrom }),
      })
      .then((result) => {
        if (!live) return
        if (result.ok) {
          const checked = validateLesson(result.lesson)
          if (checked.ok) {
            setState({ phase: 'taught', lesson: checked.lesson, stored: false, ...(result.strategy === undefined ? {} : { strategy: result.strategy }) })
            return
          }
          /* A lesson that fails the canvas gate is not shown. The server
           * validates too; this is the second of the two checks the project
           * keeps on purpose, because a lesson can arrive from a source that
           * never met the first one. */
          setState({ phase: 'failed', reason: 'The lesson that came back could not be trusted, so it was not shown.' })
          return
        }

        /* Same concept only. A near match is still the wrong topic. */
        const stored = storedLessonFor(conceptId)
        if (stored !== null) {
          setState({ phase: 'taught', lesson: stored, stored: true })
          return
        }
        setState({ phase: 'failed', reason: result.reason })
      })
    return () => {
      live = false
    }
  }, [client, conceptId, named, available.length, subjects, passed.attempts, passed.carriedFrom])

  if (state.phase === 'taught') {
    return (
      <div data-shell="pad">
        {state.stored && (
          <p className="td-sub" role="status" style={{ color: 'var(--warning)' }}>
            The server could not be reached, so this is the stored lesson for this
            concept. It is the right topic, but it is not written for you.
          </p>
        )}
        <TeachView
          lesson={state.lesson}
          mode="2d"
          ask={(question) => client.ask(question)}
          onStruggling={goDeeper}
        />

        {deeper !== null && (
          <section aria-label="A slower way through this">
            <h2 className="td-h1">Let us go through that more slowly</h2>
            <TeachView lesson={deeper} mode="2d" ask={(question) => client.ask(question)} />
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="td-wrap" data-shell="pad">
      <p className="mono-crumb">{named ? `${named.subject} · ${named.chapter}` : 'Concept'}</p>
      <h1 className="td-h1">{named ? named.concept : conceptId}</h1>

      {state.phase === 'writing' ? (
        <p className="td-sub" role="status">Writing this lesson for you…</p>
      ) : (
        <p className="td-sub" role="alert" style={{ color: 'var(--destructive)' }}>{state.reason}</p>
      )}

      <p className="td-sub">
        <Link to="/today">Back to today</Link>
      </p>
    </div>
  )
}
