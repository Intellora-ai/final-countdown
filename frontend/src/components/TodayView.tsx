import React from 'react'
import { useNavigate } from 'react-router-dom'
import { store } from '../data/store'
import { Button } from '../ui/Button'
import { SUBCOL, stateLabel } from '../lib/format'

export function TodayView() {
  const nav = useNavigate()
  const st = store.student()!
  const plan = store.plan()
  const reserve = plan.reserve || 10
  const budget = st.minutes || 120

  const start = (chId: string, cId: string) => {
    const cur = store.stateOf(chId, cId)
    /* The write, which was always the durable half of starting. The record,
     * the sidebar counts, today's plan and the node still move together.
     *
     * The navigation is gone: it went to the learning canvas, which is
     * disconnected while its design is reconsidered. Pressing start therefore
     * marks the concept in progress and shows that immediately, rather than
     * opening something that should not be opened yet. */
    if (cur !== 'inProgress' && cur !== 'mastered') store.setConceptState(chId, cId, 'inProgress', 'session')
  }

  return (
    <div className="td-wrap" data-shell="pad">
      <h1 className="td-h1">Today's learning</h1>
      <p className="td-sub">Your next learning actions for today.</p>

      <div className="td-alloc">
        <span className="mono-crumb" style={{ letterSpacing: '.18em' }}>Allocated</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--foreground)' }}>{plan.allocated + reserve} of {budget} min</span>
        <span style={{ flex: 1, minWidth: 120, height: 4, borderRadius: 3, background: 'var(--muted)', overflow: 'hidden', display: 'flex' }}>
          {plan.items.map((p, i) => (
            <span key={i} style={{ display: 'block', height: 4, width: ((p.minutes / budget) * 100).toFixed(2) + '%', background: SUBCOL[p.subject.id] || 'var(--agabi-neutral-300)' }} />
          ))}
          <span style={{ display: 'block', height: 4, width: ((reserve / budget) * 100).toFixed(2) + '%', background: 'var(--warning)' }} />
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)' }}>Every subject gets at least one concept</span>
      </div>

      {plan.items.map((p, i) => (
        <div key={i} className="td-row">
          <div className="td-subj">
            <div className="s1" style={{ color: SUBCOL[p.subject.id] || 'var(--agabi-neutral-300)' }}>{p.subject.name}</div>
            <div className="s2">{p.chapter.name}</div>
          </div>
          <div className="td-main">
            <div className="td-concept">{p.concept.name}</div>
            <div className="td-state">{stateLabel(store.stateOf(p.chapter.id, p.concept.id))} · {p.chapter.name}</div>
          </div>
          <div className="td-min">{p.minutes} min</div>
          <Button size="md" onClick={() => start(p.chapter.id, p.concept.id)}>Start</Button>
        </div>
      ))}

      <div className="td-row">
        <div className="td-subj"><div className="s1" style={{ color: 'var(--warning)' }}>Misconception</div></div>
        <div className="td-main">
          <div className="td-concept">Misconception practice</div>
          <div className="td-state">Practice the concept you are currently struggling with.</div>
        </div>
        <div className="td-min">{reserve} min</div>
        <Button size="md" variant="secondary" onClick={() => nav('/misconception')}>Start</Button>
      </div>
    </div>
  )
}
