import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadPlannedSubjects } from '../../almanac/curriculum'
import type { SubjectLike } from '../../almanac/resolve'

/**
 * The screen `Start` opens, for one concept.
 *
 * PHASE 3 SCOPE, STATED RATHER THAN IMPLIED. Start now carries the concept id
 * to a real route. The LESSON is Phase 4: `TeachView` requires a validated
 * `Lesson`, and the only thing that can produce one is `/api/lesson`, which
 * nothing calls yet.
 *
 * So this screen names the concept and says the lesson is not connected. That
 * is a deliberate state, not an oversight -- Goal 2 forbids a broken frame,
 * and a blank page with an id in the URL is a broken frame. Its test asserts
 * the "not connected" wording precisely so that Phase 4 cannot land without
 * this being rewritten.
 */
/* `cls` is passed IN rather than read from the dashboard store.
 *
 * The first version imported `data/store` directly, and that dragged the whole
 * dashboard store under `tsconfig.canvas.json`, which is stricter than the one
 * it had been checked by. Five pre-existing `possibly undefined` errors in
 * files this change never touched appeared at once -- proved with `git stash`
 * that they were absent at HEAD.
 *
 * Loosening the canvas config to accept them would have been the wrong repair.
 * The real fault is a canvas screen reaching into the dashboard's data layer,
 * which the project's own scope rules forbid in the other direction too. */
export function LearnView({
  subjects,
  cls = null,
}: { subjects?: readonly SubjectLike[]; cls?: string | null } = {}) {
  const { conceptId = '' } = useParams()

  /* Loaded here rather than passed down from the router, so mounting this
   * screen stays one line in App.tsx. The prop overrides it, which is how the
   * tests drive the naming without booting a student. */
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

  return (
    <div className="td-wrap" data-shell="pad">
      {/* No inline sizes. `mono-crumb` and `td-sub` already carry their own
        * type scale, and Law 4 refuses an arbitrary letter-spacing or font
        * size written at the call site -- correctly: a size chosen here is a
        * size the design system does not know about. */}
      <p className="mono-crumb">{named ? `${named.subject} · ${named.chapter}` : 'Concept'}</p>
      <h1 className="td-h1">{named ? named.concept : conceptId}</h1>
      {/* The id is shown UNDER the name, and only when there is a name to be
        * under. Printing it twice when the curriculum has no name for it says
        * the same thing to the student in two places and reads as a fault. */}
      {named && (
        <p className="td-sub" style={{ fontFamily: 'var(--font-mono)' }}>{conceptId}</p>
      )}

      <p className="td-sub" role="status" style={{ color: 'var(--warning)' }}>
        The teaching screen is not connected yet. This concept was carried here
        correctly; the lesson itself arrives when the canvas is wired to the
        planner.
      </p>

      <p className="td-sub">
        <Link to="/today">Back to today</Link>
      </p>
    </div>
  )
}
