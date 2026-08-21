/* THE LEARNING CANVAS — the board the Start actions have always pointed at.
 *
 * WHAT CHANGED FROM THE PLACEHOLDER. `/canvas` used to render "Not designed
 * yet" and know nothing about what the learner had just started. It now carries
 * identity in the URL — `/canvas/:chapterId/:conceptId` — so every object the
 * board will ever draw can be anchored to a real concept, replayed, restored
 * after a refresh, and explained when the learner asks why it is there.
 *
 * WHAT THIS BATCH DELIBERATELY DOES NOT DO. It does not yet write by hand, run
 * a simulation, or construct the eight-step lesson. Those are CS-7 and CS-8 and
 * they arrive on this surface. What lands here is the part everything else
 * stands on: the concept is resolved, its variables are declared into the one
 * store that all representations will read, and the opening operations are
 * logged so the scene is replayable from its first frame rather than from
 * whenever logging was remembered.
 *
 * The board is dark ground with the question at the top and its underline in
 * accent — the composition measured from the reference image, painted entirely
 * from Agabi tokens.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CURRICULUM from '../data/curriculum'
import { store } from '../data/store'
import { Button } from '../ui/Button'
import { stateLabel } from '../lib/format'
import { resolveCanvasIdentity } from '../lib/canvas-identity'
import { OperationLog } from '../lib/operations'
import { VariableStore } from '../lib/variables'
import { buildConceptScene } from '../lib/scene'

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

function Board({
  subjectName,
  chapterName,
  chapterId,
  concept,
}: {
  subjectName: string
  chapterName: string
  chapterId: string
  concept: import('../types').Concept
}) {
  /* One log and one variable store per opened concept, created once. Every
   * representation this board grows will read from these two objects and hold
   * no copy of its own — the property acceptance test T4 measures. */
  const [{ log, variables, scene }] = useState(() => {
    const log = new OperationLog()
    const variables = new VariableStore({
      emit: (op) => log.append(op),
    })
    const scene = buildConceptScene({ chapterId, concept, log, variables })
    return { log, variables, scene }
  })

  const [, force] = useState(0)
  useEffect(() => variables.subscribe(() => force((n) => n + 1)), [variables])

  const conceptState = store.stateOf(chapterId, concept.id)
  const bound = variables.forConcept(chapterId, concept.id)

  return (
    <div className="cv-board" data-shell="pad">
      <div className="cv-crumb mono-crumb">
        {subjectName} · {chapterName}
      </div>

      <h1 className="cv-question">{scene.question}</h1>
      <div className="cv-underline" aria-hidden="true" />

      <div className="cv-meta">
        <span className="cv-chip" data-state={conceptState}>
          {stateLabel(conceptState)}
        </span>
        <span className="cv-meta-item">{concept.minutes} min</span>
        <span className="cv-meta-item">
          {scene.steps} step{scene.steps === 1 ? '' : 's'} so far
        </span>
      </div>

      {bound.length > 0 && (
        <section className="cv-panel" aria-label="Variables in this concept">
          <h2 className="cv-panel-h">Variables</h2>
          <ul className="cv-vars">
            {bound.map((v) => (
              <li key={v.variableId} className="cv-var">
                <span className="cv-var-name">
                  {v.symbol ? <b>{v.symbol}</b> : null} {v.name}
                </span>
                <span className="cv-var-value">
                  {String(v.value)}
                  {v.unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {concept.edges.length > 0 && (
        <section className="cv-panel" aria-label="How this concept connects">
          <h2 className="cv-panel-h">Connections</h2>
          <ul className="cv-edges">
            {concept.edges.map((e) => (
              <li key={`${e.type}:${e.to}`} className="cv-edge">
                <span className="cv-edge-type">{e.type.replace(/_/g, ' ')}</span>
                <span className="cv-edge-to">{e.to.replace(/-/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="cv-note">
        This board is under construction: identity, variables and the operation log are live, and
        the handwritten step-by-step scene lands next. {log.semanticStepCount()} semantic
        operation{log.semanticStepCount() === 1 ? '' : 's'} recorded.
      </p>
    </div>
  )
}
