import React from 'react'
import { plannedSubjects } from '../almanac/plannedCurriculum'
import { examSubjects, whyExamIsEmpty } from '../almanac/examSubjects'
import { useNavigate, useLocation } from 'react-router-dom'
import CURRICULUM from '../data/curriculum'
import { store } from '../data/store'
import { SUBCOL, TEAL } from '../lib/format'

export function Sidebar(props: {
  open: Record<string, boolean>
  setOpen: (o: Record<string, boolean>) => void
  onNavigate: () => void            // lets the shell close the drawer on phones
  /* G1: the entrance exam this student is sitting. Its syllabus arrives in the
     same Subject -> Chapter -> Topic shape a class's does, so everything below
     treats it identically -- one code path, no special case. */
  examId?: string | null
}) {
  const nav = useNavigate()
  const loc = useLocation()
  /* Which chapters are unfolded to their topics. Declared BEFORE the early
     return below: a hook after it is the exact hooks-order throw that turned
     `ChapterView` into a blank page. */
  const [openChapters, setOpenChapters] = React.useState<Record<string, boolean>>({})
  const st = store.student()
  if (!st) return null
  const forClass = plannedSubjects(st.cls).filter((s) => st.subjects.indexOf(s.id) >= 0)
  /* G1: the exam's own subjects, under the class's. Until now the four syllabi
     were loaded only by the practice screen, so a student sitting JEE had no
     way into learning at all. */
  const forExam = examSubjects(props.examId ?? null)
  const examEmptyBecause = whyExamIsEmpty(props.examId ?? null)
  const chosen = [...forClass, ...forExam]
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

      {examEmptyBecause !== '' && (
        <p style={{ padding: '6px 16px 10px', fontSize: 11, lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
          {examEmptyBecause}
        </p>
      )}

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
                  const chapterOpen = !!openChapters[c.id]
                  const active = chapterOpen || c.concepts.some((t) => loc.pathname === '/canvas/' + t.id)
                  return (
                    <React.Fragment key={c.id}>
                    <button className="sb-ch" aria-expanded={chapterOpen} onClick={() => setOpenChapters({ ...openChapters, [c.id]: !chapterOpen })}
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
                    {/* Subject -> Chapter -> TOPIC. Each topic is its own canvas; a
                        chapter only unfolds. */}
                    {chapterOpen && (
                      <div style={{ padding: '0 0 6px 0' }}>
                        {c.concepts.map((t) => {
                          const here = loc.pathname === '/canvas/' + t.id
                          return (
                            <button key={t.id} className="sb-ch" data-topic={t.id} onClick={() => go('/canvas/' + t.id)}
                              style={{ background: here ? 'rgba(26,173,166,.09)' : 'transparent' }}>
                              <span className="sb-rail">
                                <i style={{ top: 0, bottom: 0, width: 1 }} />
                                <i style={{ top: 14, width: 9, height: 1 }} />
                              </span>
                              <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4, padding: '6px 16px 6px 22px', color: here ? 'var(--foreground)' : 'var(--agabi-neutral-300)' }}>{t.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    </React.Fragment>
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
