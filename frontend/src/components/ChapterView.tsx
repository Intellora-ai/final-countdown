import React, { useEffect, useMemo, useRef, useState } from 'react'
import { plannedSubjects } from '../almanac/plannedCurriculum'
import { useParams } from 'react-router-dom'
import CURRICULUM from '../data/curriculum'
import { store } from '../data/store'
import { Button } from '../ui/Button'
import { nodeStyle, stateLabel } from '../lib/format'
import type { Chapter, Concept } from '../types'

const NODEW = 176, CARDW = 244, CARDH = 62, CHROME = 36

export function ChapterView() {
  const { subjectId, chapterId } = useParams()
  const st = store.student()!
  const subjects = plannedSubjects(st.cls).filter((s) => st.subjects.indexOf(s.id) >= 0)
  const sub = subjects.find((s) => s.id === subjectId)
  const ch: Chapter | null = sub ? (sub.chapters.find((c) => c.id === chapterId) || sub.chapters[0]) : null

  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [confirm, setConfirm] = useState(false)
  const panEl = useRef<HTMLDivElement | null>(null)
  const dragged = useRef(false)

  useEffect(() => { setSel(null); setZoom(1); setPan({ x: 0, y: 0 }) }, [chapterId])

  /* pan / zoom — verbatim behavior: drag pans; wheel zooms only with a
   * modifier so the page keeps its scroll. */
  useEffect(() => {
    const el = panEl.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width && r.height) setBox({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0
    const units = () => {
      const svg = el.querySelector('svg'), r = el.getBoundingClientRect()
      const vb = svg && (svg as SVGSVGElement).viewBox ? (svg as SVGSVGElement).viewBox.baseVal : null
      if (!vb || !vb.width || !vb.height || !r.width || !r.height) return 1
      const scale = Math.min(r.width / vb.width, r.height / vb.height)
      return scale > 0 ? 1 / scale : 1
    }
    const down = (e: PointerEvent) => {
      dragging = true; dragged.current = false
      el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'
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
    const stop = () => { dragging = false; el.style.cursor = 'grab'; setTimeout(() => { dragged.current = false }, 0) }
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return
      e.preventDefault()
      setZoom((z) => Math.max(0.5, Math.min(2.4, z * (e.deltaY > 0 ? 0.92 : 1.08))))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', stop)
    el.addEventListener('pointercancel', stop)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', stop); el.removeEventListener('pointercancel', stop)
      el.removeEventListener('wheel', wheel)
    }
  }, [chapterId])

  if (!ch || !sub) return null
  const concepts = ch.concepts
  const lay = CURRICULUM.layout(concepts)
  const cstate = (cId: string) => store.stateOf(ch.id, cId)

  /* the concept the learner is actually on */
  const currentConcept = (): Concept | null => {
    const inProg = concepts.find((c) => cstate(c.id) === 'inProgress')
    if (inProg) return inProg
    const ready = concepts.find((c) => {
      const v = cstate(c.id)
      if (v === 'completed' || v === 'mastered') return false
      return store.prereqsMet(ch, c)
    })
    if (ready) return ready
    return concepts.find((c) => { const v = cstate(c.id); return v !== 'completed' && v !== 'mastered' }) || concepts[concepts.length - 1]
  }
  const cur = currentConcept()

  const begin = (cId: string) => {
    const v = cstate(cId)
    /* The write stays; the navigation to the learning canvas does not, while
     * that canvas is disconnected. Beginning a concept marks it in progress
     * and the map updates in front of the learner. */
    if (v !== 'inProgress' && v !== 'mastered') store.setConceptState(ch.id, cId, 'inProgress', 'session')
  }

  /* viewBox frames the graph's own bounds — zoom 1 fits every chapter. */
  const bw = box.w || 900, bh = box.h || 520
  const vw = bw / zoom, vh = bh / zoom
  const vx = lay.width / 2 - vw / 2 + pan.x, vy = lay.height / 2 - vh / 2 + pan.y

  /* berth-seeking anchored box: four candidates hugging the node, scored at
   * their CLAMPED position; covering the selected node is the worst outcome. */
  const card = useMemo(() => {
    if (!sel) return null
    const selPos = lay.pos[sel]
    const selC = concepts.find((c) => c.id === sel)
    if (!selPos || !selC) return null
    const ns2 = nodeStyle(cstate(sel))
    const cw = CARDW / zoom, chh = CARDH / zoom, gap = 16
    const others = concepts.map((c) => lay.pos[c.id]).filter((p) => p && p !== selPos)
    const nodePx = { px: (selPos.x - vx) * zoom, py: (selPos.y - vy) * zoom }
    const nw = NODEW * zoom, nh = 46 * zoom
    const hitsPx = (px: number, py: number) => {
      const gx0 = px / zoom + vx, gy0 = py / zoom + vy
      return others.filter((p) => !(gx0 + cw < p.x || gx0 > p.x + NODEW || gy0 + chh < p.y || gy0 > p.y + 46)).length
    }
    const cands = [
      { px: nodePx.px + nw + gap, py: nodePx.py + nh / 2 - CARDH / 2 },
      { px: nodePx.px - gap - CARDW, py: nodePx.py + nh / 2 - CARDH / 2 },
      { px: nodePx.px + nw / 2 - CARDW / 2, py: nodePx.py + nh + gap },
      { px: nodePx.px + nw / 2 - CARDW / 2, py: nodePx.py - gap - CARDH }
    ].map((c) => {
      const px = Math.max(6, Math.min(Math.max(6, bw - CARDW - 6), c.px))
      const py = Math.max(6, Math.min(Math.max(6, bh - CARDH - CHROME), c.py))
      const selfHit = !(px + CARDW < nodePx.px || px > nodePx.px + nw || py + CARDH < nodePx.py || py > nodePx.py + nh)
      const chromeHit = py + CARDH > bh - CHROME ? 1 : 0
      const drift = Math.abs(px - c.px) + Math.abs(py - c.py)
      return { px, py, score: (selfHit ? 9000 : 0) + hitsPx(px, py) * 1000 + chromeHit * 600 + drift * 3 }
    }).sort((a, b) => a.score - b.score)
    const pick = cands[0]
    const bx0 = pick.px / zoom + vx, by0 = pick.py / zoom + vy
    const bx1 = bx0 + cw, by1 = by0 + chh
    const ncx = selPos.x + NODEW / 2, ncy = selPos.y + 23
    const ex = Math.max(bx0, Math.min(bx1, ncx)), ey = Math.max(by0, Math.min(by1, ncy))
    return { left: Math.round(pick.px), top: Math.round(pick.py), edge: ns2.stroke, stateCol: ns2.sub,
      lead: { x1: ncx, y1: ncy, x2: ex, y2: ey } }
  }, [sel, zoom, pan.x, pan.y, box.w, box.h, chapterId, store.rev])

  const selC = sel ? concepts.find((c) => c.id === sel) || null : null
  const selSt = selC ? cstate(selC.id) : 'notStarted'
  const starter = (selC && selSt !== 'mastered' && selSt !== 'completed') ? selC : cur
  const doneCount = concepts.filter((c) => { const v = cstate(c.id); return v === 'completed' || v === 'mastered' }).length
  const declared = selC ? store.sourceOf(ch.id, selC.id) === 'declared' : false

  return (
    <div style={{ animation: 'osIn .3s cubic-bezier(.16,1,.3,1)' }}>
      <div className="chp-head" data-shell="pad">
        <div className="mono-crumb" style={{ letterSpacing: '.18em', marginBottom: 12 }}>{sub.name.toUpperCase()} · {st.cls}</div>
        <h1 className="chp-h1">{ch.name}</h1>
        {starter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '0 0 16px' }}>
            <button className="start-pill" onClick={() => begin(starter.id)}>
              {cstate(starter.id) === 'inProgress' ? 'Continue concept' : 'Start concept'}
            </button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)' }}>{starter.name} · {starter.minutes} min</span>
          </div>
        )}
        <div className="chp-meta">
          <span className="m">{concepts.length} atomic concepts</span>
          <span className="m">{doneCount} completed or mastered</span>
          <span className="m">{concepts.reduce((n, c) => n + c.minutes, 0)} min of concepts</span>
          <span className="legend">
            <span><span style={{ width: 9, height: 9, borderRadius: 2, border: '1px dashed var(--agabi-neutral-500)', boxSizing: 'border-box' }} />Not started</span>
            <span><span style={{ width: 9, height: 9, borderRadius: 2, border: '1.5px solid var(--accent)', boxSizing: 'border-box' }} />In progress</span>
            <span><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(26,173,166,.38)' }} />Completed</span>
            <span><span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--accent)' }} />Mastered</span>
          </span>
          {selC && selSt !== 'mastered' && (
            <button data-tap="text" className="linkish" style={{ fontSize: 12.5 }} onClick={() => setConfirm(true)}>Mark {selC.name} as mastered</button>
          )}
          {selC && declared && (
            <button className="linkish" style={{ fontSize: 12.5, color: 'var(--accent)' }} onClick={() => store.undeclare(ch.id, selC.id)}>Undo mastery of {selC.name}</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--background)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 5, display: 'flex', gap: 7, alignItems: 'center' }}>
            <button data-tap="icon" className="zbtn" onClick={() => setZoom((z) => Math.max(0.5, z / 1.18))}>−</button>
            <button data-tap="icon" className="zbtn" onClick={() => setZoom((z) => Math.min(2.4, z * 1.18))}>+</button>
            <button className="zfit" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Fit</button>
          </div>
          <span style={{ position: 'absolute', right: 16, bottom: 16, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--agabi-neutral-500)' }}>Drag · ⌘ scroll zooms</span>

          <div ref={panEl} onClick={() => { if (!dragged.current && sel) setSel(null) }}
            style={{ width: '100%', height: '100%', minHeight: 520, cursor: 'grab', touchAction: 'none', overflow: 'hidden' }}>
            <svg viewBox={vx.toFixed(1) + ' ' + vy.toFixed(1) + ' ' + vw.toFixed(1) + ' ' + vh.toFixed(1)}
              width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minHeight: 520 }}
              role="img" aria-label="Atomic concept map for this chapter">
              {concepts.map((c) => (c.deps || []).map((d) => {
                const q = lay.pos[d], p = lay.pos[c.id]
                if (!q || !p) return null
                const x1 = q.x + NODEW / 2, y1 = q.y + 46, x2 = p.x + NODEW / 2, y2 = p.y
                const my = (y1 + y2) / 2
                const dSt = cstate(d)
                const live = dSt === 'mastered' || dSt === 'completed'
                return <path key={c.id + d} d={'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2}
                  fill="none" stroke={live ? 'rgba(26,173,166,.62)' : 'var(--agabi-neutral-700)'} strokeWidth={live ? 1.6 : 1.2} />
              }))}
              {concepts.map((c) => {
                const p = lay.pos[c.id]
                if (!p) return null
                const v = cstate(c.id)
                const ns = nodeStyle(v)
                const isSel = sel === c.id
                const toggle = () => setSel(isSel ? null : c.id)
                return (
                  <g key={c.id} tabIndex={0} role="button" aria-pressed={isSel}
                    aria-label={c.name + ', ' + stateLabel(v) + ', ' + c.minutes + ' minutes'}
                    style={{ cursor: 'pointer', outlineOffset: 3 }}
                    onClick={(e) => { if (dragged.current) return; e.stopPropagation(); toggle() }}
                    onKeyDown={(e) => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); e.stopPropagation(); toggle() }}>
                    <rect x={p.x - 6} y={p.y - 6} width={NODEW + 12} height={58} rx={17} fill="none" stroke="var(--accent)" strokeWidth={1.25}
                      opacity={isSel ? 1 : (cur && cur.id === c.id && !sel ? 0.4 : 0)} style={{ transition: 'opacity .22s ease' }} />
                    <rect x={p.x} y={p.y} width={NODEW} height={46} rx={12} fill={ns.fill}
                      stroke={isSel ? 'var(--foreground)' : ns.stroke} strokeWidth={isSel ? 2 : ns.sw}
                      strokeDasharray={isSel ? 'none' : ns.dash} />
                    <foreignObject x={p.x} y={p.y} width={NODEW} height={46} style={{ pointerEvents: 'none' }}>
                      <div style={{ width: '100%', height: 46, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 13px', boxSizing: 'border-box' }}>
                        <div style={{ fontSize: c.name.length > 26 ? 11.5 : 13, lineHeight: 1.2, color: ns.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color: ns.sub, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap' }}>{stateLabel(v)}</div>
                      </div>
                    </foreignObject>
                  </g>
                )
              })}
              {card && <line x1={card.lead.x1} y1={card.lead.y1} x2={card.lead.x2} y2={card.lead.y2}
                stroke={card.edge} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.85} />}
            </svg>
          </div>

          {card && selC && (
            <div style={{ position: 'absolute', zIndex: 6, left: card.left, top: card.top, width: CARDW,
              background: 'var(--card)', border: '1.5px solid ' + card.edge, borderRadius: 12,
              boxShadow: '0 10px 26px rgba(0,0,0,.42)', animation: 'osPop .19s cubic-bezier(.16,1,.3,1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: card.stateCol, whiteSpace: 'nowrap' }}>{stateLabel(selSt)}</span>
                {selSt !== 'mastered' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{selC.minutes} min</span>}
                <span style={{ flex: 1, minWidth: 4 }} />
                <button className="box-start" onClick={() => begin(selC.id)}>
                  {selSt === 'inProgress' ? 'Continue' : (selSt === 'completed' || selSt === 'mastered') ? 'Review' : 'Start'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirm && selC && (
        <div className="modal-scrim">
          <div className="modal">
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 23, letterSpacing: '-.015em', margin: '0 0 12px' }}>Are you sure?</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--agabi-neutral-300)', margin: '0 0 8px' }}>
              You're marking <span style={{ color: 'var(--foreground)' }}>{selC.name}</span> as permanently mastered without requiring the system's full learning evidence.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted-foreground)', margin: '0 0 24px' }}>
              It will be recorded as your declaration, kept separate from mastery the system observed. You can undo it later.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button onClick={() => { setConfirm(false); store.declare(ch.id, selC.id) }}>Yes, mark as mastered</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
