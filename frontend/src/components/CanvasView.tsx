/* THE LEARNING CANVAS ROUTE — resolve who the board is about, then hand over.
 *
 * This file does one thing: turn a URL into a concept, or say honestly that it
 * cannot. Everything the board does with that concept lives in canvas/Board.tsx,
 * so "which concept is this?" and "what does the lesson look like?" stay two
 * separate questions with two separate answers.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CURRICULUM from '../data/curriculum'
import { store } from '../data/store'
import { Button } from '../ui/Button'
import { resolveCanvasIdentity } from '../lib/canvas-identity'
import { Board } from './canvas/Board'

export function CanvasView() {
  const nav = useNavigate()
  const { chapterId, conceptId } = useParams()
  const student = store.student()

  const subjects = useMemo(() => {
    if (!student) return []
    return CURRICULUM.subjectsFor(student.cls, student.stream).filter(
      (s) => student.subjects.indexOf(s.id) >= 0,
    )
  }, [student])

  const resolution = useMemo(
    () =>
      resolveCanvasIdentity({
        chapterId,
        conceptId,
        subjects,
        lastTouched: store.lastTouched(),
      }),
    [chapterId, conceptId, subjects],
  )

  /* A bare /canvas that DID resolve is rewritten to the identified URL, so a
   * refresh, a bookmark or a back button all land on the same concept. replace,
   * not push: the learner did not navigate twice. */
  const canonical = resolution.kind === 'resolved' ? resolution.canonicalPath : null
  useEffect(() => {
    if (canonical && (!chapterId || !conceptId)) nav(canonical, { replace: true })
  }, [canonical, chapterId, conceptId, nav])

  if (resolution.kind !== 'resolved') {
    return <CanvasNeedsSelection reason={resolution.reason} onBack={() => nav('/today')} />
  }

  const { subject, chapter, concept } = resolution.identity
  return (
    <Board
      key={`${chapter.id}/${concept.id}`}
      subjectName={subject.name}
      chapterName={chapter.name}
      chapterId={chapter.id}
      concept={concept}
    />
  )
}

/* Not a dead end and not a redirect. The learner is told what happened and given
 * the way forward; the heading takes focus so a screen reader announces the
 * change rather than leaving the user on a silently different page. */
function CanvasNeedsSelection({ reason, onBack }: { reason: string; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <div className="ph-wrap">
      <div style={{ textAlign: 'center', maxWidth: 520 }} role="status">
        <div className="mono-crumb" style={{ letterSpacing: '.2em', marginBottom: 18 }}>
          Learning canvas
        </div>
        <h1
          ref={heading}
          tabIndex={-1}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 38,
            letterSpacing: '-.025em',
            margin: 0,
            outline: 'none',
          }}
        >
          Pick a concept to open
        </h1>
        <p style={{ fontSize: 16, color: 'var(--muted-foreground)', margin: '14px 0 32px' }}>
          {reason}
        </p>
        <Button variant="secondary" onClick={onBack}>
          Go to today's learning
        </Button>
      </div>
    </div>
  )
}
