import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './scene.css'
import { WORLD_W, WORLD_H, L, EDGE_CARDS } from './layout'
import { GAS_MODEL } from './gasModel'
import { createModelStore, useResolved } from '../model/modelStore'
import { formatValue } from '../model/resolve'
import { useViewport, fitViewport, MIN_SCALE, MAX_SCALE } from './useViewport'
import { Connectors, type Wire } from './Connectors'
import { CausalChain } from './panels/CausalChain'
import { EquationPanel, Katex } from './panels/EquationPanel'
import { PressureGraph } from './panels/PressureGraph'
import { ConceptMap } from './panels/ConceptMap'
import { Thermometer } from './panels/Thermometer'
import { Gauge } from './panels/Gauge'
import { ParticleBox2D } from './panels/ParticleBox2D'
import { SketchNote } from './panels/SketchNote'
import {
  DimensionToggle, ZoomRail, IconBack, IconLayers, IconPanel, IconZoom, IconFit,
} from './chrome/SceneChrome'

const ParticleBox3D = React.lazy(() =>
  import('./panels/ParticleBox3D').then((m) => ({ default: m.ParticleBox3D })),
)

/* THE EXPLANATION CANVAS.
 *
 * One question, six panels, and the claim that they are all the same argument.
 * The layout table in ./layout.ts holds every position in the reference's own
 * 1408x768 frame; this file places things at those coordinates and wires them
 * to one model. Nothing here computes physics and nothing here invents a
 * number: every value on screen is read from GAS_MODEL through the store.
 *
 * WHY THE PANELS ARE ABSOLUTELY POSITIONED, having spent the morning arguing
 * that layout should be computed. Because THIS board is a diagram, and the
 * position of a thing in a diagram is meaning: the cube sits left of the chain
 * because it is what the chain is about, and the sketch sits under the cube
 * because it is a marginal note on it. A packing algorithm would be free to
 * put the sketch top-right, and would be wrong. Computed layout is for boards
 * whose blocks have no spatial relationship; stated layout is for boards whose
 * blocks do. The engine has to support both, and this is the second one.
 */

function Node({ x, y, w, children, className, style }: {
  x: number; y: number; w?: number
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`scene-node ${className ?? ''}`} style={{ left: x, top: y, width: w, ...style }}>
      {children}
    </div>
  )
}

function Badge({ n }: { n: number }) {
  return <span className="sc-badge">{n}</span>
}

function PanelHead({ n, title, sub, x, y }: { n: number; title: string; sub?: string; x: number; y: number }) {
  return (
    <Node x={x} y={y}>
      <div className="sc-head">
        <Badge n={n} />
        <span className="sc-head-text">
          <h2 className="sc-title">{title}</h2>
          {sub && <p className="sc-sub">{sub}</p>}
        </span>
      </div>
    </Node>
  )
}

const CHAIN = [
  { label: 'Temperature ↑', tone: 'cause' as const, icon: 'heat' as const },
  { label: 'Faster particle motion', tone: 'middle' as const },
  { label: 'Increased kinetic energy', tone: 'middle' as const },
  { label: 'More frequent wall collisions', tone: 'middle' as const, icon: 'impact' as const },
  { label: 'Pressure ↑', tone: 'effect' as const },
]

const MAP_NODES = [
  { id: 'temp', label: 'Temperature', x: 74, y: 8, accent: true },
  { id: 'ke', label: 'KE', x: 14, y: 54 },
  { id: 'press', label: 'Pressure', x: 0, y: 110 },
  { id: 'vol', label: 'Volume', x: 74, y: 152 },
  { id: 'coll', label: 'Collisions', x: 142, y: 94, accent: true },
]
const MAP_EDGES = [
  { from: 'temp', to: 'coll' },
  { from: 'ke', to: 'coll' },
  { from: 'press', to: 'coll' },
  { from: 'vol', to: 'coll' },
]

export function GasPressureScene() {
  const navigate = useNavigate()
  const store = useMemo(() => createModelStore(GAS_MODEL), [])
  const model = useResolved(store)
  const [dim, setDim] = useState<'2D' | '3D'>('3D')

  /* The camera starts at 1:1 and is corrected by autoFit as soon as the
   * element reports a real size. It never reads window.innerWidth: this scene
   * is a route inside an app, and the window is not the box it lives in. */
  const { vp, ref, panning, zoomTo, reset, autoFit, handlers } = useViewport({ x: 0, y: 0, scale: 1 })

  useEffect(() => autoFit(WORLD_W, WORLD_H), [autoFit])

  /* No zero-size guard here: fitViewport refuses a degenerate measurement on
   * its own, so every caller gets the same safe answer without remembering to
   * ask for it. */
  const fit = () => {
    const el = ref.current
    if (el) reset(fitViewport(WORLD_W, WORLD_H, el.clientWidth, el.clientHeight))
  }

  /* Every wire on the board, in world coordinates. */
  const wires: Wire[] = useMemo(() => {
    const out: Wire[] = [
      /* cube ➜ equations */
      { from: [472, 372], to: [592, 372], bow: 46 },
      /* the long return from the chain's PRESSURE down and back to the equation */
      { from: [1172, 250], to: [712, 292], bow: 150, reverse: true },
      /* equations ➜ graph */
      { from: [852, 372], to: [872, 372], bow: 12 },
      /* graph ➜ simulation */
      { from: [1030, 502], to: [1030, 540], bow: 8 },
      /* concept map ➜ simulation */
      { from: [856, 606], to: [884, 606], bow: 16 },
    ]
    for (const c of EDGE_CARDS) {
      if (c.side === 'left') out.push({ from: [c.x + 168, c.anchorY], to: [214, 372], bow: 70 })
      else out.push({ from: [1196, 372], to: [c.x - 6, c.anchorY], bow: 70 })
    }
    return out
  }, [])

  return (
    <div className="scene">
      <div
        className="scene-viewport"
        ref={ref}
        data-panning={panning}
        {...handlers}
      >
        <div
          className="scene-world"
          style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})` }}
        >
          <Connectors wires={wires} width={WORLD_W} height={WORLD_H} />

          {/* ── the question ─────────────────────────────────────────── */}
          <h1 className="scene-title" style={{ top: L.title.y }}>
            <em>Why does increasing temperature</em> <span>increase pressure in a gas?</span>
            <svg className="scene-title-rule" width={L.title.ruleW} height={6} aria-hidden="true">
              <path d={`M2 4 Q ${L.title.ruleW / 2} -1 ${L.title.ruleW - 2} 4`}
                fill="none" stroke="var(--sc-accent)" strokeWidth={1.4} opacity={0.75} />
            </svg>
          </h1>

          {/* ── ① particle model ─────────────────────────────────────── */}
          <PanelHead n={1} title="Particle model" sub="(constant volume)" x={L.p1Head.x - 29} y={L.p1Head.y} />

          <Node x={L.p1Cube.x} y={L.p1Cube.y} w={L.p1Cube.w}>
            {dim === '3D' ? (
              <React.Suspense fallback={<ParticleBox2D store={store} varId="T" width={L.p1Cube.w} height={L.p1Cube.h} />}>
                <ParticleBox3D store={store} tempVar="T" width={L.p1Cube.w} height={L.p1Cube.h} />
              </React.Suspense>
            ) : (
              <ParticleBox2D store={store} varId="T" width={L.p1Cube.w} height={L.p1Cube.h} />
            )}
          </Node>

          <Node x={L.p1GasNote.x} y={L.p1GasNote.y}>
            <span className="sc-note">gas</span>
            <svg width={44} height={26} style={{ display: 'block', marginTop: -2, marginLeft: -34 }} aria-hidden="true">
              <path d="M42 2 C 30 8, 18 14, 6 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              <path d="M4 16 L4 23 L11 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
            </svg>
          </Node>

          <Node x={L.p1SpeedNote.x} y={L.p1SpeedNote.y}>
            <svg width={40} height={12} style={{ display: 'block', marginLeft: -46 }} aria-hidden="true">
              <line x1={38} y1={6} x2={6} y2={6} stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
              <path d="M11 2.5 L5 6 L11 9.5" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
            </svg>
            <span className="sc-note">speed</span>
            <svg width={40} height={14} style={{ display: 'block', marginTop: 4 }} aria-hidden="true">
              <line x1={2} y1={7} x2={34} y2={7} stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
              <path d="M29 3.5 L35 7 L29 10.5" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
            </svg>
          </Node>

          <Node x={L.p1Caption.x} y={L.p1Caption.y} w={140}>
            <span className="sc-note" style={{ fontStyle: 'normal', lineHeight: 1.35, display: 'block' }}>
              gas particles<br />shove the container
            </span>
          </Node>

          {/* ── ② causal chain ───────────────────────────────────────── */}
          <Node x={L.p2Badge.x} y={L.p2Badge.y}><Badge n={2} /></Node>
          <Node x={L.p2Chain.x} y={L.p2Chain.y}>
            <CausalChain steps={CHAIN} />
          </Node>
          <Node x={1150} y={214}>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 42, color: 'var(--sc-ink)' }}>P</span>
          </Node>

          {/* ── ③ the relation ───────────────────────────────────────── */}
          <Node x={L.p3Badge.x} y={L.p3Badge.y}><Badge n={3} /></Node>
          <Node x={L.p3Body.x} y={L.p3Body.y} w={L.p3Body.w}>
            <EquationPanel
              relation="P \propto T"
              constants="Constant V, n"
              law="PV = nRT"
              emphasise="RT"
            />
          </Node>

          {/* ── ④ pressure against temperature ───────────────────────── */}
          <Node x={L.p4Badge.x} y={L.p4Badge.y}><Badge n={4} /></Node>
          <Node x={L.p4Head.x} y={L.p4Head.y}>
            <h2 className="sc-title">Pressure vs Temperature</h2>
          </Node>
          <Node x={L.p4Graph.x} y={L.p4Graph.y}>
            <PressureGraph store={store} xVar="T" yVar="P" width={L.p4Graph.w} height={L.p4Graph.h} />
          </Node>

          {/* ── ⑤ live simulation ────────────────────────────────────── */}
          <Node x={L.p5Badge.x} y={L.p5Badge.y}><Badge n={5} /></Node>
          <Node x={L.p5Head.x} y={L.p5Head.y}>
            <h2 className="sc-title">Physical simulation</h2>
          </Node>
          <Node x={L.p5Panel.x} y={L.p5Panel.y} w={L.p5Panel.w}>
            <div className="sc-panel" data-no-pan style={{
              height: L.p5Panel.h,
              display: 'grid',
              gridTemplateColumns: '52px 1fr 84px',
              alignItems: 'center',
              padding: '12px 14px',
              gap: 6,
            }}>
              <Thermometer store={store} varId="T" min={100} max={600} unit="K" height={126} />
              <div style={{ display: 'grid', placeItems: 'center' }}>
                {dim === '3D' ? (
                  <React.Suspense fallback={<ParticleBox2D store={store} varId="T" width={126} height={122} />}>
                    <ParticleBox3D store={store} tempVar="T" width={132} height={140} spin={-0.5} showVectors={false} />
                  </React.Suspense>
                ) : (
                  <ParticleBox2D store={store} varId="T" width={126} height={122} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--sc-ink-dim)' }}>Pressure</span>
                <Gauge store={store} valueId="P" spanFrom="T" size={64} />
              </div>
            </div>
          </Node>

          {/* ── ⑥ concept map ────────────────────────────────────────── */}
          <Node x={L.p6Badge.x} y={L.p6Badge.y}><Badge n={6} /></Node>
          <Node x={L.p6Map.x} y={L.p6Map.y}>
            <ConceptMap nodes={MAP_NODES} edges={MAP_EDGES} height={190} />
          </Node>

          {/* ── the margin sketch ────────────────────────────────────── */}
          <Node x={L.sketch.x} y={L.sketch.y}>
            <SketchNote width={L.sketch.w} />
          </Node>

          {/* ── the graph continues past the frame ───────────────────── */}
          {EDGE_CARDS.map((c, i) => (
            <Node key={i} x={c.x} y={c.y}>
              <div className="sc-card" style={{ minWidth: 128 }}>
                <div className="sc-card-title">{c.title}</div>
                {c.sub && <div className="sc-card-sub">{c.sub}</div>}
              </div>
            </Node>
          ))}

          <Node x={L.sparkle.x} y={L.sparkle.y}>
            <svg width={40} height={40} viewBox="0 0 40 40" className="sc-spark" aria-hidden="true">
              <path d="M20 2 C22 13, 27 18, 38 20 C27 22, 22 27, 20 38 C18 27, 13 22, 2 20 C13 18, 18 13, 20 2 Z"
                fill="currentColor" />
            </svg>
          </Node>
        </div>
      </div>

      {/* ── chrome, in screen space ────────────────────────────────── */}
      <button className="sc-round sc-chrome" style={{ left: 18, top: 12 }}
        onClick={() => navigate('/today')} aria-label="Back">
        <IconBack />
      </button>

      <div className="sc-pill sc-chrome" style={{ left: '50%', top: 12, transform: 'translateX(-50%)' }}>
        <input className="sc-ask" placeholder="Ask anything…" aria-label="Ask a question" />
      </div>

      <DimensionToggle value={dim} onChange={setDim} style={{ position: 'absolute', right: 76, top: 13, zIndex: 40 }} />
      <button className="sc-round sc-chrome" style={{ right: 20, top: 13 }} aria-label="Layers">
        <IconLayers />
      </button>

      <ZoomRail scale={vp.scale} min={MIN_SCALE} max={MAX_SCALE} onZoom={zoomTo}
        style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 40 }} />

      <div className="sc-chrome" style={{ left: 18, bottom: 12, display: 'flex', gap: 8 }}>
        <button className="sc-square" aria-label="Toggle sidebar"><IconPanel /></button>
        <button className="sc-square" onClick={() => zoomTo(1)} aria-label="Actual size"><IconZoom /></button>
        <button className="sc-square" onClick={fit} aria-label="Fit to screen"><IconFit /></button>
      </div>

      <DimensionToggle value={dim} onChange={setDim} style={{ position: 'absolute', right: 76, bottom: 12, zIndex: 40 }} />
      <button className="sc-round sc-chrome" style={{ right: 20, bottom: 12 }} aria-label="Layers">
        <IconLayers />
      </button>

      {/* The one thing the reference cannot show: what the board knows when a
        * formula is broken. Silent is the failure mode this codebase refuses. */}
      {model.problems.length > 0 && (
        <div className="sc-chrome" role="status" style={{
          left: '50%', bottom: 60, transform: 'translateX(-50%)',
          background: 'rgba(120,30,30,0.35)', border: '1px solid rgba(255,120,120,0.35)',
          borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#ffd9d9',
        }}>
          {model.problems[0]}
        </div>
      )}
    </div>
  )
}
