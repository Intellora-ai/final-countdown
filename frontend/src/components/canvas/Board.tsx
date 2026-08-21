/* THE BOARD — where the lesson is constructed in front of the learner.
 *
 * WORLD COORDINATES, NOT PIXELS. The viewBox frames the board's own bounds, so
 * zoom 1 fits the scene on any panel size with nothing to measure. This is the
 * same approach the chapter map already uses, deliberately: two different
 * camera models in one product would be two different sets of bugs.
 *
 * THE CAMERA IS LEARNER STATE. Pan, zoom and focus persist through the store,
 * keyed by chapter, concept and representation, and are restored on reopen. The
 * tutor drawing the next step never moves the camera. If it did, a learner who
 * zoomed into the particle box to look closely would be yanked away for reasons
 * they did not cause — and would learn to stop zooming.
 *
 * ONE STEP, ONE ACTION. Every step past the first is gated on the learner
 * asking for it. The board writes, then waits. That is the difference between a
 * lesson being constructed and a lesson being played at someone.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Concept } from '../../types'
import { store } from '../../data/store'
import { OperationLog } from '../../lib/operations'
import { VariableStore } from '../../lib/variables'
import { scriptFor, type LessonScript, type AskOption } from '../../lib/lesson-script'
import { buildConceptScene } from '../../lib/scene'
import { Handwritten, DrawnPath, usePrefersReducedMotion } from './Handwriting'
import { Button } from '../../ui/Button'

/* World bounds. Tall enough that every band below has its own space: the
 * question, the label, the figure and its caption, the prediction, the recorded
 * answer and the reveal never share a row. Overlap here is not a cosmetic
 * problem — two handwritten lines on top of each other are unreadable, and the
 * board's whole claim is that the learner can follow what is being written. */
const WORLD = { w: 1200, h: 800 }

/* One place the vertical rhythm is decided, so a new step cannot silently land
 * on an existing one. */
const BAND = {
  question: 70,
  label: 150,
  figureTop: 200,
  figureHeight: 190,
  ask: 496,
  record: 548,
  note: 596,
  reveal: 646,
}
const REPRESENTATION_ID = 'lesson-board'
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.4

export function Board({
  subjectName,
  chapterName,
  chapterId,
  concept,
}: {
  subjectName: string
  chapterName: string
  chapterId: string
  concept: Concept
}) {
  const reduced = usePrefersReducedMotion()

  /* One log, one variable store, created once per opened concept. Every
   * representation reads from these and holds no copy of its own. */
  const [engine] = useState(() => {
    const log = new OperationLog()
    const variables = new VariableStore({ emit: (op) => log.append(op) })
    const scene = buildConceptScene({ chapterId, concept, log, variables })
    return { log, variables, scene }
  })
  const { log, variables, scene } = engine
  const script: LessonScript | null = useMemo(
    () => scriptFor(chapterId, concept.id),
    [chapterId, concept.id],
  )

  /* ── camera ─────────────────────────────────────────────────────────────
   * Restored from the store on open; the deterministic fit is the fallback,
   * never an override. */
  const saved = useMemo(
    () => store.canvasCamera(chapterId, concept.id, REPRESENTATION_ID),
    [chapterId, concept.id],
  )
  const [zoom, setZoom] = useState(() => saved?.zoom ?? 1)
  const [pan, setPan] = useState(() => saved?.pan ?? { x: 0, y: 0 })
  const panEl = useRef<HTMLDivElement | null>(null)
  const dragged = useRef(false)

  /* Persist on settle rather than on every pointermove: a drag is one camera
   * decision, not two hundred writes to the adapter. */
  const persist = useCallback(
    (next: { pan: { x: number; y: number }; zoom: number }) => {
      store.saveCanvasCamera(chapterId, concept.id, REPRESENTATION_ID, {
        pan: next.pan,
        zoom: next.zoom,
        focusObjectId: null,
        representationId: REPRESENTATION_ID,
      })
    },
    [chapterId, concept.id],
  )

  useEffect(() => {
    const el = panEl.current
    if (!el) return
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0
    const units = () => {
      const svg = el.querySelector('svg') as SVGSVGElement | null
      const r = el.getBoundingClientRect()
      const vb = svg?.viewBox?.baseVal
      if (!vb || !vb.width || !vb.height || !r.width || !r.height) return 1
      const scale = Math.min(r.width / vb.width, r.height / vb.height)
      return scale > 0 ? 1 / scale : 1
    }
    const down = (e: PointerEvent) => {
      dragging = true
      dragged.current = false
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
      sx = e.clientX; sy = e.clientY
      setPan((p) => { ox = p.x; oy = p.y; return p })
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (Math.abs(dx) + Math.abs(dy) > 4) dragged.current = true
      const k = units()
      setPan({ x: ox - dx * k, y: oy - dy * k })
    }
    const stop = () => {
      if (!dragging) return
      dragging = false
      el.style.cursor = 'grab'
      // The learner finished a camera decision — record it.
      setPan((p) => { setZoom((z) => { persist({ pan: p, zoom: z }); return z }); return p })
      setTimeout(() => { dragged.current = false }, 0)
    }
    /* Plain wheel belongs to the page. Zoom is opt-in with a modifier, the same
     * gesture every map application uses. */
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return
      e.preventDefault()
      setZoom((z) => {
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * (e.deltaY > 0 ? 0.92 : 1.08)))
        setPan((p) => { persist({ pan: p, zoom: next }); return p })
        return next
      })
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', stop)
    el.addEventListener('pointercancel', stop)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', stop)
      el.removeEventListener('pointercancel', stop)
      el.removeEventListener('wheel', wheel)
    }
  }, [persist])

  const nudgeZoom = useCallback((factor: number) => {
    setZoom((z) => {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor))
      setPan((p) => { persist({ pan: p, zoom: next }); return p })
      return next
    })
  }, [persist])

  const fit = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    persist({ pan: { x: 0, y: 0 }, zoom: 1 })
    log.append({
      chapterId, conceptId: concept.id, type: 'camera_change', source: 'learner',
      payload: { action: 'fit' },
    })
  }

  /* The viewBox frames the BOARD's own bounds, never the panel's pixel size.
   *
   * Deriving vh from the panel height cropped the board at zoom 1: a 478px-tall
   * panel against a 640-unit world put the frame at y=81 and cut the question
   * off the top, which is exactly the bug the chapter map's comment warns
   * about. Sizing from the world and letting preserveAspectRatio letterbox it
   * means zoom 1 fits every board on every panel with nothing to measure. */
  const vw = WORLD.w / zoom
  const vh = WORLD.h / zoom
  const vx = WORLD.w / 2 - vw / 2 + pan.x
  const vy = WORLD.h / 2 - vh / 2 + pan.y
  const viewBox = `${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`

  /* ── step player ────────────────────────────────────────────────────────
   * `shown` is how many steps have been played. Step 0 plays on open; every
   * later one waits for the learner. */
  const [shown, setShown] = useState(1)
  const [writing, setWriting] = useState(true)
  const [prediction, setPrediction] = useState<AskOption | null>(null)
  const [, force] = useState(0)
  useEffect(() => variables.subscribe(() => force((n) => n + 1)), [variables])

  const steps = script?.steps ?? []
  const current = steps[shown - 1]
  const next = steps[shown]

  const record = useCallback(
    (index: number, extra?: Record<string, unknown>) => {
      const step = steps[index]
      if (!step) return
      log.append({
        chapterId, conceptId: concept.id, type: step.opType, source: 'ai',
        payload: { stepId: step.id, ...extra },
      })
    },
    [steps, log, chapterId, concept.id],
  )

  // The opening step is logged by the scene builder; later steps log as played.
  const advance = useCallback(() => {
    if (!next) return
    setShown((n) => n + 1)
    setWriting(true)
    record(shown)
  }, [next, shown, record])

  const answer = (option: AskOption) => {
    setPrediction(option)
    log.append({
      chapterId, conceptId: concept.id, type: 'predict', source: 'learner',
      payload: { stepId: current?.id, optionId: option.id, label: option.label },
    })
    // The learner's answer IS the action that unlocks the next step.
    setShown((n) => n + 1)
    setWriting(true)
  }

  const awaitingAnswer = current?.body.kind === 'ask' && !prediction
  const finished = shown >= steps.length && !writing
  const temperature = script?.interactiveVariableId
    ? variables.get(script.interactiveVariableId)
    : undefined
  const temperatureUnlocked = finished && Boolean(temperature)

  if (!script) return <UnscriptedBoard scene={scene} concept={concept} chapterName={chapterName} subjectName={subjectName} />

  return (
    <div className="cv-board" data-shell="pad">
      <div className="cv-crumb mono-crumb">{subjectName} · {chapterName}</div>

      <div className="cv-stage" ref={panEl} style={{ cursor: 'grab' }}>
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="cv-svg"
          role="img"
          aria-label={`Learning board for ${concept.name}. ${describe(steps, shown, prediction)}`}
        >
          <defs>
            <marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>
          <SceneObjects
            steps={steps}
            shown={shown}
            writing={writing}
            onWritten={() => setWriting(false)}
            prediction={prediction}
            reduced={reduced}
          />
        </svg>

        <div className="cv-cam" role="group" aria-label="Board camera">
          {/* Functional updater, not the closed-over `zoom`. Two clicks inside one
              render both read the same stale value, so the second press is lost —
              which is exactly what a learner clicking + twice would notice. */}
          <button className="cv-cam-btn" onClick={() => nudgeZoom(1.18)} aria-label="Zoom in">+</button>
          <button className="cv-cam-btn" onClick={() => nudgeZoom(1 / 1.18)} aria-label="Zoom out">−</button>
          <button className="cv-cam-btn" onClick={fit} aria-label="Fit the board">Fit</button>
        </div>
      </div>

      <div className="cv-controls">
        {awaitingAnswer && current?.body.kind === 'ask' && (
          <div className="cv-ask" role="group" aria-label={current.body.prompt}>
            {current.body.options.map((option) => (
              <button key={option.id} className="cv-option" onClick={() => answer(option)}>
                {option.label}
              </button>
            ))}
          </div>
        )}

        {!awaitingAnswer && next && (
          <Button onClick={advance} disabled={writing}>
            {writing ? 'writing…' : 'Continue'}
          </Button>
        )}

        {temperatureUnlocked && temperature && (
          <label className="cv-slider">
            <span className="cv-slider-label">
              {temperature.symbol} {temperature.name}
            </span>
            <input
              type="range"
              min={temperature.min}
              max={temperature.max}
              step={temperature.step}
              value={Number(temperature.value)}
              onChange={(e) => variables.set(temperature.variableId, Number(e.target.value), 'learner')}
              aria-label={`${temperature.name} in kelvin`}
            />
            <output className="cv-slider-value">
              {String(temperature.value)}{temperature.unit}
            </output>
          </label>
        )}
      </div>

      <p className="cv-progress" aria-live="polite">
        Step {Math.min(shown, steps.length)} of {steps.length} · {log.semanticStepCount()} semantic
        operations recorded
      </p>
    </div>
  )
}

/* Text the screen reader gets, so the board is not a picture with no content. */
function describe(steps: LessonScript['steps'], shown: number, prediction: AskOption | null): string {
  const played = steps.slice(0, shown).map((s) => {
    const b = s.body
    if (b.kind === 'write' || b.kind === 'reveal') return b.text
    if (b.kind === 'figure') return b.caption
    if (b.kind === 'ask') return b.prompt
    if (b.kind === 'causal') return b.chain.join(', which causes ')
    if (b.kind === 'record') return prediction ? `You predicted: ${prediction.label}.` : ''
    return ''
  })
  return played.filter(Boolean).join(' ')
}

function SceneObjects({
  steps, shown, writing, onWritten, prediction, reduced,
}: {
  steps: LessonScript['steps']
  shown: number
  writing: boolean
  onWritten: () => void
  prediction: AskOption | null
  reduced: boolean
}) {
  return (
    <>
      {steps.slice(0, shown).map((step, i) => {
        const isLast = i === shown - 1
        const active = isLast ? true : true
        const done = isLast ? onWritten : undefined
        const b = step.body

        if (b.kind === 'write') {
          const y = b.role === 'question' ? BAND.question : b.role === 'concept-label' ? BAND.label : BAND.note
          const size = b.role === 'question' ? 30 : b.role === 'concept-label' ? 24 : 20
          return (
            <foreignObject key={step.id} x={60} y={y - size} width={WORLD.w - 120} height={size * 2.6}>
              <div className={`cv-line cv-line-${b.role}`}>
                <Handwritten
                  text={b.text}
                  size={size}
                  tone={b.role === 'question' ? 'ink' : b.role === 'note' ? 'muted' : 'accent'}
                  active={active}
                  onDone={done}
                />
              </div>
            </foreignObject>
          )
        }

        if (b.kind === 'figure') return <ParticleBox key={step.id} caption={b.caption} active={active} onDone={done} reduced={reduced} />
        if (b.kind === 'causal') return <CausalChain key={step.id} chain={b.chain} active={active} onDone={done} />
        if (b.kind === 'ask') {
          return (
            <foreignObject key={step.id} x={60} y={BAND.ask} width={WORLD.w - 120} height={58}>
              <div className="cv-line cv-line-ask">
                <Handwritten text={b.prompt} size={22} tone="ink" active={active} onDone={done} />
              </div>
            </foreignObject>
          )
        }
        if (b.kind === 'record') {
          return (
            <foreignObject key={step.id} x={60} y={BAND.record} width={WORLD.w - 120} height={48}>
              <div className="cv-line cv-line-note">
                <Handwritten
                  text={prediction ? `you said: ${prediction.label}` : ''}
                  size={21}
                  tone="accent"
                  active={active}
                  onDone={done}
                />
              </div>
            </foreignObject>
          )
        }
        if (b.kind === 'reveal') {
          return (
            <foreignObject key={step.id} x={60} y={BAND.reveal} width={WORLD.w - 120} height={130}>
              <div className="cv-reveal">
                <Handwritten text={b.annotation ?? ''} size={22} tone="accent" active={active} onDone={done} />
                <p className="cv-reveal-body">{b.text}</p>
              </div>
            </foreignObject>
          )
        }
        return null
      })}
    </>
  )
}

/* The particle box: the one figure this lesson needs, drawn rather than faded in.
 * Particles use the Agabi INDIGO ramp — the design ruling keeps teal for
 * explanation and state, and gives physical matter its own family, which is the
 * same split the reference image uses. */
function ParticleBox({ caption, active, onDone, reduced }: { caption: string; active: boolean; onDone?: () => void; reduced: boolean }) {
  const x = 120, y = BAND.figureTop, w = 300, h = BAND.figureHeight
  const particles = useMemo(() => {
    // Fixed lattice, not random: a solid is ordered, and a replayed board must
    // draw the same particles in the same places.
    const out: Array<{ cx: number; cy: number }> = []
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      out.push({ cx: x + 40 + c * 55, cy: y + 34 + r * 40 })
    }
    return out
  }, [])
  return (
    <g>
      <DrawnPath
        d={`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`}
        active={active}
        onDone={onDone}
        stroke="var(--agabi-neutral-600)"
        width={1.4}
        duration={720}
      />
      {particles.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={7}
          className="cv-particle"
          style={{
            opacity: active ? 1 : 0,
            transitionDelay: reduced ? '0ms' : `${300 + i * 18}ms`,
          }}
        />
      ))}
      <foreignObject x={x} y={y + h + 8} width={w + 60} height={54}>
        <div className="cv-line cv-line-caption">
          <span className="hw" data-tone="muted" data-revealed style={{ fontSize: 19 }}>{caption}</span>
        </div>
      </foreignObject>
    </g>
  )
}

/* The typed causal relationship — drawn as real arrows, one after another,
 * because the arrows ARE the claim being made. */
function CausalChain({ chain, active, onDone }: { chain: string[]; active: boolean; onDone?: () => void }) {
  const x0 = 500, y0 = BAND.figureTop + 20, stepY = 62
  return (
    <g>
      {chain.map((label, i) => (
        <g key={label}>
          <foreignObject x={x0} y={y0 + i * stepY - 18} width={620} height={44}>
            <div className="cv-chain-node">{label}</div>
          </foreignObject>
          {i < chain.length - 1 && (
            <DrawnPath
              d={`M ${x0 + 26} ${y0 + i * stepY + 20} L ${x0 + 26} ${y0 + (i + 1) * stepY - 22}`}
              active={active}
              onDone={i === chain.length - 2 ? onDone : undefined}
              width={1.6}
              duration={260}
              markerEnd="url(#cv-arrow)"
            />
          )}
        </g>
      ))}
    </g>
  )
}

/* A concept with no authored script gets an honest board: its real question,
 * its real connections, and no invented lesson. */
function UnscriptedBoard({
  scene, concept, chapterName, subjectName,
}: {
  scene: { question: string; steps: number }
  concept: Concept
  chapterName: string
  subjectName: string
}) {
  return (
    <div className="cv-board" data-shell="pad">
      <div className="cv-crumb mono-crumb">{subjectName} · {chapterName}</div>
      <h1 className="cv-question">{scene.question}</h1>
      <div className="cv-underline" aria-hidden="true" />
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
        No lesson has been written for this concept yet. The board shows what the curriculum
        actually states about it and nothing more — a thin board that is true rather than a full
        one that is invented.
      </p>
    </div>
  )
}
