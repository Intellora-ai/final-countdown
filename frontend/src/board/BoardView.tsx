/* THE ROUTE — an infinite blackboard teaching one step at a time.
 *
 * The pipeline: fixture source (untrusted) → validateBoard → TeachingPlan →
 * useTeachingSession releases steps one by one → each released step is placed
 * in WORLD SPACE and revealed on its timeline. The camera looks at the
 * current step; the learner can wander, and the board respects it.
 *
 * WHAT IS DELIBERATELY ABSENT AT SESSION START: every future step. Not
 * hidden — absent. The React tree below contains released steps and nothing
 * else, block code arrives lazily when a step first needs its type, and the
 * proof harness asserts both from outside.
 *
 * CULLING: a released step whose rect leaves the camera window (±1 viewport)
 * keeps its data and its SIZE — a placeholder holds its exact measured box so
 * the world never reflows — but its content unmounts. The current step is
 * never culled.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BlackboardShell } from './shell/BlackboardShell'
import { NoticeBar } from './shell/NoticeBar'
import { BoardEmpty, BoardError, BoardLoading } from './shell/BoardStates'
import { BoardViewport, CameraWorld } from './camera/CameraWorld'
import { useCamera } from './camera/useCamera'
import { snapToGrid, visibleWorldRect, rectsIntersect, type WorldRect } from './camera/camera'
import { validateBoard } from './renderer/validateBoard'
import { ConnectorLayer } from './shell/ConnectorLayer'
import { useBoardSource } from './hooks/useBoardSource'
import { FIXTURES, featuredFixtures } from './fixtures'
import { planFromBoard, planFromSteps } from './teaching/plan'
import { useTeachingSession, type ReleasedStep } from './teaching/useTeachingSession'
import { StepView } from './teaching/StepView'
import { TeachingControls, CheckpointPanel } from './teaching/TeachingControls'
import { AccessibleLesson } from './teaching/AccessibleLesson'
import type { TeachingPlan, TeachingStep } from './teaching/types'
import type { Notice } from './types/learningBoard'
import { mark } from './perf/marks'
import { registerBoardHarness } from './perf/harness'
import { registeredTypes } from './renderer/blockRegistry'

mark('canvas-route-start')

/* World layout: a step column 760 units wide; steps drift right/down like a
 * teacher working across a board. Snapped to the 8px world grid. */
const STEP_W = 720
const STEP_GAP_Y = 80
const STEP_DRIFT_X = 112
const EST_STEP_H = 360

/* The scripted lesson's extra worked example — authored, so "show another
 * example" offers real content or does not appear at all. */
const CHEM_EXTRA: TeachingStep = {
  id: 'extra-example',
  purpose: 'practice',
  title: 'A worked example',
  blocks: [{
    id: 'extra-worked',
    type: 'example',
    prompt: 'How much heat melts 0.5 kg of ice at 0 °C?',
    input: 'm = 0.5 kg · L (fusion of ice) = 334,000 J/kg',
    working: ['Q = m · L', 'Q = 0.5 × 334,000', 'Q = 167,000 J'],
    result: 'Q = 167 kJ — all of it spent breaking the arrangement, none on temperature.',
  }],
  checkpoint: { question: 'Shall we move forward?', continueLabel: 'Move forward', unclearLabel: 'Explain again' },
}

interface Placement { rect: WorldRect; measured: boolean }

export function BoardView() {
  /* The URL owns which board is open. Two things follow from that and both
   * matter: a scenario can be linked to and reloaded, and the gallery can hand
   * over without this component needing to know the gallery exists. An id that
   * names no fixture falls through to useBoardSource, which already reports it
   * as a board that could not be found. */
  const [params, setParams] = useSearchParams()
  const fixtureId = params.get('fixture') ?? FIXTURES[0].id
  const setFixtureId = useCallback(
    (id: string) => setParams({ fixture: id }, { replace: true }),
    [setParams],
  )
  /* Everything stateful about a lesson lives below this key: switch the
   * fixture and the camera, placements and session REMOUNT. A fresh lesson
   * cannot inherit a stale session, because the components holding one are
   * gone. */
  return <TeachingBoard key={fixtureId} fixtureId={fixtureId} setFixtureId={setFixtureId} />
}

function TeachingBoard({ fixtureId, setFixtureId }: { fixtureId: string; setFixtureId: (id: string) => void }) {
  const src = useBoardSource(fixtureId)
  const camera = useCamera()

  /* source → validated (+notices), synchronously. */
  const validated = useMemo(() => {
    if (src.status !== 'ok') return null
    return validateBoard(src.source)
  }, [src])

  /* validated → plan. The scripted chemistry lesson arrives by dynamic
   * import so it stays in its own chunk; every other board compiles through
   * planFromBoard. Stale async results are discarded on fixture switch. */
  const [prepared, setPrepared] = useState<
    | { plan: TeachingPlan; extras?: { anotherExample?: TeachingStep }; notices: Notice[]; title: string; subtitle?: string | null }
    | { error: string; notices: Notice[] }
    | { empty: true; notices: Notice[]; title: string }
    | null
  >(null)

  useEffect(() => {
    setPrepared(null)
    if (!validated) return
    if (validated.status === 'failed') { setPrepared({ error: validated.error, notices: validated.notices }); return }
    const board = validated.board
    if (board.blocks.length === 0) { setPrepared({ empty: true, notices: validated.notices, title: board.title }); return }
    let alive = true
    if (fixtureId === 'change-of-state') {
      void import('./teaching/lessons/change-of-state.lesson').then((m) => {
        if (!alive) return
        setPrepared({
          plan: planFromSteps(m.CHANGE_OF_STATE_LESSON, m.CHANGE_OF_STATE_LESSON.steps),
          extras: { anotherExample: CHEM_EXTRA },
          notices: validated.notices, title: board.title, subtitle: board.subtitle,
        })
      })
    } else {
      setPrepared({ plan: planFromBoard(board), notices: validated.notices, title: board.title, subtitle: board.subtitle })
    }
    return () => { alive = false }
  }, [validated, fixtureId])

  /* ── world placement ─────────────────────────────────────────────────── */
  const placements = useRef(new Map<string, Placement>())
  const [, bumpLayout] = useState(0)

  const placeStep = useCallback((index: number, stepId: string): WorldRect => {
    const existing = placements.current.get(stepId)
    if (existing) return existing.rect
    /* y = sum of everything above; x drifts alternately. */
    let y = 64
    for (const p of placements.current.values()) y = Math.max(y, p.rect.y + p.rect.height + STEP_GAP_Y)
    const rect: WorldRect = {
      x: snapToGrid((index % 2) * STEP_DRIFT_X),
      y: snapToGrid(y),
      width: STEP_W,
      height: EST_STEP_H,
    }
    placements.current.set(stepId, { rect, measured: false })
    return rect
  }, [])

  const measureStep = useCallback((stepId: string, height: number) => {
    const p = placements.current.get(stepId)
    if (!p || (p.measured && Math.abs(p.rect.height - height) < 1)) return
    const grew = height - p.rect.height
    p.rect.height = height
    p.measured = true
    /* Push later steps down by the delta so nothing overlaps. */
    let after = false
    for (const [, q] of placements.current) {
      if (q === p) { after = true; continue }
      if (after) q.rect.y += grew
    }
    bumpLayout((n) => n + 1)
  }, [])

  const onStepReleased = useCallback((index: number, _clar: boolean) => {
    /* Focus the new step — unless the learner wandered away on purpose. */
    requestAnimationFrame(() => {
      const id = [...placements.current.keys()][index]
      const p = id ? placements.current.get(id) : null
      if (p) camera.focusRect(p.rect, { respectManual: index > 0 })
    })
  }, [camera])

  const session = useTeachingSession(
    prepared && 'plan' in prepared ? prepared.plan : null,
    prepared && 'plan' in prepared ? prepared.extras : undefined,
    onStepReleased,
  )

  /* Register placements for newly released steps, then focus. */
  useEffect(() => {
    session.released.forEach((r, i) => placeStep(i, r.step.id))
    const last = session.released[session.released.length - 1]
    if (last) {
      const p = placements.current.get(last.step.id)
      if (p) camera.focusRect(p.rect, { respectManual: session.released.length > 1 })
    }
    // placement map only grows; focusing depends on count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.released.length])

  /* ── harness registration (DEV-only; no-op in production) ─────────────── */
  const sessionRef = useRef(session)
  sessionRef.current = session
  useEffect(() => registerBoardHarness({
    getReleasedStepIds: () => sessionRef.current.released.map((r) => r.step.id),
    getReleasedBlocks: () => sessionRef.current.released.flatMap((r) =>
      r.step.blocks.map((b) => ({ id: b.id, type: b.type }))),
    /* Zero by construction today: nothing fetches ahead. Phase 6 replaces this
     * getter with the coordinator's buffered count, and the ≤1 invariant then
     * has something real to measure. */
    getPrefetchedStepCount: () => 0,
    getPlacements: () => [...placements.current.entries()].map(([stepId, p]) => ({
      stepId, x: p.rect.x, y: p.rect.y, width: p.rect.width, height: p.rect.height, measured: p.measured,
    })),
    getStatus: () => sessionRef.current.status,
    continueNext: () => sessionRef.current.continueNext(),
    registeredBlockTypes: registeredTypes(),
  }), [])

  /* ── render ──────────────────────────────────────────────────────────── */
  const eyebrow = src.status === 'ok' ? src.eyebrow : ''
  const title = prepared && 'title' in prepared && prepared.title ? prepared.title : src.status === 'failed' ? 'Learning canvas' : 'Loading…'
  const notices: Notice[] = prepared?.notices ?? []

  /* Only the featured boards get a pill. Twenty-five pills is not a choice —
   * it is a wall, and on a phone it is a wall that scrolls. The rest live in
   * the gallery, one link away. */
  const picker = (
    <div data-board="picker" role="group" aria-label="Choose a board">
      {featuredFixtures().map((f) => (
        <button key={f.id} type="button" data-board="picker-pill"
          data-active={f.id === fixtureId ? 'true' : 'false'}
          onClick={() => setFixtureId(f.id)}>
          {f.label}
        </button>
      ))}
      <Link to="/canvas/gallery" data-board="picker-pill" data-link="true">
        All scenarios
      </Link>
    </div>
  )

  /* viewport rect for culling, from the committed camera. */
  const viewportDims = useRef({ w: 1200, h: 800 })
  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    camera.viewportRef(el)
    if (el) viewportDims.current = { w: el.clientWidth, h: el.clientHeight }
  }, [camera])

  const cullWindow = visibleWorldRect(camera.camera, viewportDims.current.w, viewportDims.current.h, 1)

  const releasedBlocks = session.released.flatMap((r) => r.step.blocks)
  const releasedConnectors = session.released.flatMap((r) => r.step.connectors ?? [])
  const [worldEl, setWorldEl] = useState<HTMLElement | null>(null)
  const worldRef = useCallback((el: HTMLDivElement | null) => { camera.worldRef(el); setWorldEl(el) }, [camera])

  return (
    <BlackboardShell
      variant="camera"
      eyebrow={eyebrow}
      title={title}
      subtitle={prepared && 'subtitle' in prepared ? prepared.subtitle ?? null : null}
      picker={picker}
      cameraControls={{ onZoomIn: camera.zoomIn, onZoomOut: camera.zoomOut, onReset: camera.resetToFocus }}
      overlay={
        <>
          {notices.length > 0 && <div data-board="overlay-notices"><NoticeBar notices={notices} /></div>}
          {src.status === 'ok' && prepared && 'error' in prepared && (
            <div data-board="overlay-state"><BoardError message={prepared.error} /></div>
          )}
          {src.status === 'ok' && prepared && 'empty' in prepared && (
            <div data-board="overlay-state"><BoardEmpty /></div>
          )}
          {src.status === 'failed' && <div data-board="overlay-state"><BoardError message={src.error} /></div>}
          {(src.status === 'loading' || session.status === 'loading') && prepared === null && src.status !== 'failed' && (
            <div data-board="overlay-state"><BoardLoading /></div>
          )}
          {prepared && 'plan' in prepared && session.status === 'error' && (
            <div data-board="overlay-state"><BoardError message={session.error ?? 'The lesson stopped.'} /></div>
          )}
          {prepared && 'plan' in prepared && (
            <>
              <CheckpointPanel session={session} />
              <TeachingControls session={session} />
              {session.status === 'complete' && (
                <div data-board="lesson-done" role="status">Lesson complete.</div>
              )}
            </>
          )}
        </>
      }
    >
      <BoardViewport ref={viewportRef}>
        <CameraWorld ref={worldRef}>
          {session.released.map((r, i) => {
            const isCurrent = i === session.released.length - 1
            const p = placements.current.get(r.step.id)
            const rect = p?.rect ?? placeStep(i, r.step.id)
            const culled = !isCurrent && p?.measured && !rectsIntersect(rect, cullWindow)
            return (
              <WorldStep key={r.step.id} released={r} rect={rect} culled={!!culled}
                isCurrent={isCurrent} onMeasure={measureStep} />
            )
          })}
          <ConnectorLayer connectors={releasedConnectors} blocks={releasedBlocks} gridEl={worldEl} />
        </CameraWorld>
      </BoardViewport>
      <AccessibleLesson released={session.released} />
    </BlackboardShell>
  )
}

function WorldStep({
  released, rect, culled, isCurrent, onMeasure,
}: {
  released: ReleasedStep
  rect: WorldRect
  culled: boolean
  isCurrent: boolean
  onMeasure: (stepId: string, height: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || culled) return
    const ro = new ResizeObserver(() => onMeasure(released.step.id, el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [released.step.id, culled, onMeasure])

  return (
    <section
      ref={ref}
      data-board="world-step"
      /* The harness audits mounted content against the session's released
       * ids; without the id on the element, "was this step released?" is not
       * answerable from outside. */
      data-step-id={released.step.id}
      data-current={isCurrent ? 'true' : 'false'}
      style={{ left: rect.x, top: rect.y, width: rect.width, ...(culled ? { height: rect.height } : {}) }}
      aria-label={released.step.title ?? released.step.id}
    >
      {culled ? (
        <div data-board="step-culled" aria-hidden="true" />
      ) : (
        <>
          <p data-board="step-purpose">{released.step.purpose}</p>
          {released.step.title && <h2 data-board="step-title">{released.step.title}</h2>}
          <StepView released={released} isCurrent={isCurrent} />
        </>
      )}
    </section>
  )
}
