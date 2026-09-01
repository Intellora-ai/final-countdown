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

  /*
   * WHETHER THE CURRICULUM FINISHED, WHICH ITS CONTENTS CANNOT ANSWER.
   *
   * `loaded` starts `[]` and a failed load leaves it `[]`, so "still coming"
   * and "never coming" were the same value -- and the effect below reads
   * `available.length > 0` to tell them apart. It cannot. A rejected load (a
   * chunk that 404s after a deploy, a dropped connection on the first visit)
   * therefore parked the screen on "Writing this lesson for you…" with no
   * request in flight and nothing on its way, forever.
   *
   * Adding a `catch` that sets `[]` fixes nothing, for the same reason: the
   * value it writes is the value already there. What was missing is not a
   * handler, it is the FACT -- did this settle? -- so that is what is stored.
   */
  const [curriculumSettled, setCurriculumSettled] = React.useState(false)

  React.useEffect(() => {
    if (subjects !== undefined) return
    let live = true
    setCurriculumSettled(false)
    void loadPlannedSubjects(cls)
      .then((found) => {
        if (!live) return
        setLoaded(found)
        setCurriculumSettled(true)
      })
      .catch(() => {
        /* Settled, and empty. The effect below then says plainly that this
           device does not know the concept -- which is true, because the file
           describing it never arrived -- and that is a sentence she can act on
           rather than a spinner she cannot. */
        if (!live) return
        setLoaded([])
        setCurriculumSettled(true)
      })
    return () => {
      live = false
    }
  }, [subjects, cls])

  const available = subjects ?? loaded
  /*
   * IS THERE ANY POINT WAITING LONGER?
   *
   * Two ways the answer is no, and only the first one existed:
   *
   *   available.length > 0   a curriculum arrived and this concept is not in
   *                          it. Unchanged.
   *   settled, and empty     the LOAD finished with nothing -- it failed, or
   *                          the class genuinely has no subjects. This is the
   *                          case that had no way to be true, and the screen
   *                          waited on it forever.
   *
   * The second half is deliberately restricted to `subjects === undefined`,
   * which means "this component is doing the loading". A caller that hands in
   * `[]` directly is not reporting a failed load; it is a test or a screen
   * saying "no curriculum, ask anyway", and it keeps exactly the behaviour it
   * had -- `LearnView.test.tsx:145` is that caller, and it asks the server and
   * reports the server's own reason.
   */
  const curriculumIsIn = available.length > 0 || (subjects === undefined && curriculumSettled)

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
    | {
        phase: 'taught'
        lesson: Lesson
        stored: boolean
        strategy?: string
        teaching?: 'answer'
        /* See `LessonResult.partial`: the gate refused this and the salvage
           ladder rescued it by removing blocks, so it is true and smaller. */
        partial?: boolean
      }
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
        /*
         * THE LATCH OPENS AGAIN WHEN NOTHING ARRIVED, AND IT NEVER DID.
         *
         * `deepening.current` was set to true and reset nowhere, so the FIRST
         * failure -- one dropped request, one rate-limited minute, one lesson
         * that missed the gate -- closed this door for the rest of the session.
         * A learner who says she is stuck, gets nothing, and says it again is
         * answered by silence, and there is no button, reload or navigation
         * inside this screen that reopens it.
         *
         * It stays SHUT on success, which is the case it was written for: a
         * second identical deeper lesson under the first is noise, and the
         * whole point of this path is that depth is added once, not stacked.
         */
        if (!result.ok) {
          deepening.current = false
          return
        }
        const checked = validateLesson(result.lesson)
        if (!checked.ok) {
          deepening.current = false
          return
        }
        setDeeper(checked.lesson)
      })
  }, [client, conceptId, named])

  /*
   * A NEW CONCEPT STARTS EMPTY, AND IT DID NOT.
   *
   * `/learn/:conceptId` is ONE route, so React Router keeps the SAME component
   * when only the id changes -- no unmount, no remount, and every piece of
   * state below survives the move. Nothing reset any of it, so opening a second
   * concept from the sidebar left, on screen:
   *
   *   state    the PREVIOUS concept's whole lesson, under the NEW concept's
   *            heading, for as long as the new one took to write -- and
   *            permanently if the new one failed, because a failure sets
   *            `phase: 'failed'` only when it arrives.
   *   deeper   the slower explanation of the previous concept, still stacked
   *            underneath, now attached to a topic it was not written for.
   *
   * That is the exact failure `LearnView`'s own header calls worse than
   * teaching nothing: "Teaching gas pressure to a student who opened
   * photosynthesis". The header guarded the FALLBACK against it and left the
   * front door open.
   *
   * DECLARED BEFORE THE FETCH EFFECT ON PURPOSE. Effects run in order, so on a
   * concept change this clears first and the request below starts from a blank
   * screen. The old request cannot win afterwards: its cleanup has already set
   * `live = false`.
   */
  React.useEffect(() => {
    setState({ phase: 'writing' })
    setDeeper(null)
    /* The latch belongs to the lesson that is showing. Carried across, a
       learner who asked for depth on the last concept could not ask again on
       this one. */
    deepening.current = false
  }, [conceptId])

  React.useEffect(() => {
    if (conceptId === '') return
    /* Wait for the name before asking. The model teaches "Pressure of a gas";
     * sending the id would ask it to teach a database key. */
    /* ASKED OF THE LOAD, NOT OF ITS CONTENTS. This read `available.length > 0`,
       which cannot tell a curriculum that failed from one still arriving --
       see `curriculumSettled` above. */
    if (named === null && curriculumIsIn) {
      setState({ phase: 'failed', reason: `This device does not know a concept called ${conceptId}.` })
      return
    }
    if (named === null) return

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
          /*
           * JUDGED AT THE LEVEL THE SERVER PRODUCED, NOT AT THE DEFAULT.
           *
           * `validateLesson(x)` with no level means `'lesson'` -- the strict
           * arc: an opening definition, a closing progression, something shown.
           * The server now authors ONE CONCEPT for a fresh topic (see
           * `handler.ts`, `/api/lesson`), and a concept owes none of that. It
           * is one idea, and the server itself validated it at `'answer'`.
           *
           * MEASURED, in the browser: the server answered 200 in 1.98s with a
           * good concept -- `misconception + prose + table` -- and this line
           * refused it with "The lesson that came back could not be trusted,
           * so it was not shown." A learner pressed Start and was told her
           * lesson was untrustworthy because THIS page asked it for an arc the
           * server never promised.
           *
           * `route` is present only on a concept, so it is the signal rather
           * than a flag anyone has to remember to set. `AskView` records paying
           * for this exact mistake and fixing it with `teaching="answer"`; this
           * is the same fix, one screen over.
           */
          const level = result.route === undefined ? undefined : ('answer' as const)
          const checked = validateLesson(result.lesson, level === undefined ? {} : { teaching: level })
          if (checked.ok) {
            setState({
              phase: 'taught',
              lesson: checked.lesson,
              stored: false,
              ...(result.strategy === undefined ? {} : { strategy: result.strategy }),
              ...(level === undefined ? {} : { teaching: level }),
              ...(result.partial === true ? { partial: true } : {}),
            })
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
    /* `curriculumIsIn` replaces `available.length` and `subjects`: it is the
       fact this effect actually branches on, and the two it replaces could
       change without changing the answer -- which re-ran the effect, and
       `recordAttempt` with it, for nothing. */
  }, [client, conceptId, named, curriculumIsIn, passed.carriedFrom])

  if (state.phase === 'taught') {
    return (
      <div data-shell="pad">
        {state.stored && (
          <p className="td-sub" role="status" style={{ color: 'var(--warning)' }}>
            The server could not be reached, so this is the stored lesson for this
            concept. It is the right topic, but it is not written for you.
          </p>
        )}
        {state.partial === true && (
          /* SAID, NOT IMPLIED. The salvage ladder kept what passed and removed
             what did not, so this is a true but SHORTER answer. Rendering it
             with the same chrome as a whole lesson told the learner it was
             everything there was, and the one useful action -- ask again -- is
             the one thing she could not know to take. Beside the lesson rather
             than instead of it: what survived is worth reading. */
          <p className="td-sub" role="status" style={{ color: 'var(--warning)' }}>
            Part of this answer did not pass the check, so it was left out. What
            is here is correct, but it is not the whole explanation — ask again
            for another way through it.
          </p>
        )}
        <TeachView
          lesson={state.lesson}
          mode="2d"
          /* THE SAME LEVEL THIS SCREEN JUST JUDGED IT BY. `TeachView`
             re-validates what it is handed, and with no level that means
             `'lesson'` -- so a concept would clear the gate above and be
             refused by the identical gate one component later, under "This
             lesson was refused". Passing the level is what makes the two gates
             one gate. `AskView` states the same reason beside its own. */
          {...(state.teaching === undefined ? {} : { teaching: state.teaching })}
          /* THE CONTEXT IS FORWARDED, NOT DROPPED. `createAnswering` now hands
             over the lesson a question was asked inside; this arrow took one
             argument, so it threw that away one line after it was built and
             the server authored a whole new lesson for every doubt. */
          ask={(question, context) => client.ask(question, context)}
          onStruggling={goDeeper}
        />

        {deeper !== null && (
          <section aria-label="A slower way through this">
            <h2 className="td-h1">Let us go through that more slowly</h2>
            <TeachView lesson={deeper} mode="2d" ask={(question, context) => client.ask(question, context)} />
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
