import React from 'react'
import { plannedSubjects } from '../almanac/plannedCurriculum'
import { useNavigate, useLocation } from 'react-router-dom'
import CURRICULUM from '../data/curriculum'
import { store } from '../data/store'
import { SUBCOL, TEAL } from '../lib/format'

export function Sidebar(props: {
  open: Record<string, boolean>
  setOpen: (o: Record<string, boolean>) => void
  onNavigate: () => void            // lets the shell close the drawer on phones
}) {
  const nav = useNavigate()
  const loc = useLocation()
  const st = store.student()
  if (!st) return null
  const chosen = plannedSubjects(st.cls).filter((s) => st.subjects.indexOf(s.id) >= 0)
  const roll = store.rollups()
  const plan = store.plan()
  const isToday = loc.pathname === '/today' || loc.pathname === '/'
  const ph = (k: string) => loc.pathname === '/' + k
  const go = (path: string) => { nav(path); props.onNavigate() }

  return (
    <aside data-shell="aside" className="sb">
      <div className="sb-brand">
        <span className="sb-mark"><span /></span>
        <span className="sb-name">Blackboard<br />Learning OS</span>
      </div>

      <button className="sb-today" onClick={() => go('/today')} style={{
        borderLeft: '2px solid ' + (isToday ? TEAL : 'transparent'),
        background: isToday ? 'rgba(26,173,166,.09)' : 'transparent',
        color: isToday ? 'var(--foreground)' : 'var(--agabi-neutral-300)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase' }}>Today</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--accent)' }}>{plan.items.length + 1}</span>
      </button>

      <div className="sb-cap">Curriculum</div>

      {chosen.map((sb) => {
        const sr = roll.subjects[sb.id] || { done: 0, total: 0 }
        const open = !!props.open[sb.id]
        return (
          <div key={sb.id} style={{ marginBottom: 2 }}>
            <button className="sb-subj" onClick={() => props.setOpen({ ...props.open, [sb.id]: !open })}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted-foreground)', width: 8, flex: 'none' }}>{open ? '▾' : '▸'}</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: SUBCOL[sb.id] || 'var(--agabi-neutral-300)' }}>{sb.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted-foreground)' }}>{sr.done}/{sr.total}</span>
            </button>
            {open && (
              <div style={{ padding: '2px 0 8px 0', animation: 'osFade .2s ease' }}>
                {sb.chapters.map((c) => {
                  const cr = roll.chapters[c.id] || { done: 0, total: c.concepts.length, inProgress: 0, complete: false }
                  const active = loc.pathname === '/chapter/' + sb.id + '/' + c.id
                  return (
                    <button key={c.id} className="sb-ch" onClick={() => go('/chapter/' + sb.id + '/' + c.id)}
                      style={{ background: active ? 'rgba(26,173,166,.09)' : 'transparent' }}>
                      <span className="sb-rail">
                        <i style={{ top: 0, bottom: 0, width: 1 }} />
                        <i style={{ top: 14, width: 9, height: 1 }} />
                      </span>
                      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 16px 7px 4px' }}>
                        <span style={{ width: 7, height: 7, flex: 'none', borderRadius: 2,
                          background: cr.complete ? TEAL : cr.done > 0 ? 'rgba(26,173,166,.34)' : 'transparent',
                          border: '1px solid ' + (cr.complete || cr.done > 0 || cr.inProgress > 0 ? TEAL : 'var(--agabi-neutral-500)') }} />
                        <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.4, color: active ? 'var(--foreground)' : 'var(--agabi-neutral-300)' }}>{c.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--muted-foreground)' }}>{cr.done}/{c.concepts.length}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ borderTop: '1px solid var(--border)', margin: '18px 0 0', paddingTop: 12 }}>
        {([['practice', 'Practice'], ['quick-question', 'Ask quick question']] as const).map(([k, label]) => (
          <button key={k} className="sb-ph" onClick={() => go('/' + k)} style={{
            borderLeft: '2px solid ' + (ph(k) ? TEAL : 'transparent'),
            background: ph(k) ? 'rgba(26,173,166,.09)' : 'transparent',
            color: ph(k) ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '18px 18px 0', borderTop: '1px solid var(--border)', marginTop: 18 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 10 }}>Signed in as</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {store.students().map((p) => (
            <button key={p.id} className="sb-prof" onClick={() => { store.switchStudent(p.id); props.onNavigate(); nav(store.hasPlan() ? '/today' : '/setup') }}
              style={{ border: '1px solid ' + (p.current ? 'rgba(26,173,166,.5)' : 'var(--border)'), background: p.current ? 'rgba(26,173,166,.09)' : 'transparent' }}>
              <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center',
                background: p.current ? 'var(--accent)' : 'var(--muted)', color: p.current ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)', fontSize: 9 }}>{p.initials}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, color: p.current ? 'var(--foreground)' : 'var(--agabi-neutral-300)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '.1em', color: 'var(--muted-foreground)' }}>{p.cls ? p.cls + ' · ' + p.done + ' done' : 'No plan yet'}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 18px 0', borderTop: '1px solid var(--border)', marginTop: 'auto', flex: 'none' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>Daily budget</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--agabi-neutral-200)' }}>{st.minutes || 0} min / day</div>
        <button data-tap="text" className="linkish" style={{ marginTop: 12 }} onClick={() => go('/setup')}>Edit plan</button>
      </div>
    </aside>
  )
}
