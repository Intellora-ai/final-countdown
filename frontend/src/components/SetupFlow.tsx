import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CURRICULUM from '../data/curriculum'
import { store } from '../data/store'
import { Button } from '../ui/Button'
import { pretty, iso, TEAL } from '../lib/format'

type Phase = 'intro' | 'ask' | 'confirm'

export function SetupFlow() {
  const nav = useNavigate()
  const st = store.student()
  const [phase, setPhase] = useState<Phase>(store.hasPlan() ? 'ask' : 'intro')   // Edit plan re-enters the questions, matching the mockup
  const [step, setStep] = useState(0)
  const [cls, setCls] = useState<string | null>(st?.cls ?? null)
  const [stream, setStream] = useState<string | null>(st?.stream ?? null)
  const [subjects, setSubjects] = useState<string[]>(st?.subjects?.slice() ?? [])
  const [minutes, setMinutes] = useState<number | null>(st?.minutes ?? null)
  const [deadlines, setDeadlines] = useState<Record<string, string>>({ ...(st?.deadlines ?? {}) })

  const avail = cls ? CURRICULUM.subjectsFor(cls, stream) : []
  const chosen = avail.filter((s) => subjects.indexOf(s.id) >= 0)
  const steps: string[] = ['class']
  if (cls && CURRICULUM.needsStream(cls)) steps.push('stream')
  steps.push('subjects', 'time')
  chosen.forEach((s) => steps.push('deadline:' + s.id))
  const cur = steps[step] || null
  const isLast = step >= steps.length - 1
  const dl = cur && cur.indexOf('deadline:') === 0 ? cur.split(':')[1] : null
  const soon = new Date(); soon.setMonth(soon.getMonth() + 4)

  let title = '', help = '', footer = ''
  let options: { label: string; meta: string; single: boolean; sel: boolean; on: () => void }[] = []
  let isDate = false, ready = false
  if (cur === 'class') {
    title = 'Which class are you in?'; help = 'Pick one. Everything else follows from this.'
    options = CURRICULUM.classes.map((c) => ({ label: c, meta: '', single: true, sel: cls === c,
      on: () => { setCls(c); setStream(null); setSubjects([]); setDeadlines({}) } }))
    ready = !!cls
  } else if (cur === 'stream') {
    title = 'Which stream are you in?'; help = 'Your stream decides which subjects are available.'
    options = CURRICULUM.streams.map((t) => ({ label: t, meta: '', single: true, sel: stream === t,
      on: () => { setStream(t); setSubjects([]); setDeadlines({}) } }))
    ready = !!stream
  } else if (cur === 'subjects') {
    title = 'Which subjects do you want to learn?'; help = 'Choose as many as you like. At least one is required.'
    options = avail.map((sub) => ({ label: sub.name, meta: sub.chapters.length + ' chapters', single: false,
      sel: subjects.indexOf(sub.id) >= 0,
      on: () => setSubjects(subjects.indexOf(sub.id) >= 0 ? subjects.filter((x) => x !== sub.id) : [...subjects, sub.id]) }))
    ready = subjects.length > 0
    footer = subjects.length ? subjects.length + ' selected' : ''
  } else if (cur === 'time') {
    title = 'How much total time can you study each day?'
    help = 'This is the total across every subject you picked — not per subject.'
    options = CURRICULUM.dayOptions.map((o) => ({ label: o.label, meta: o.minutes + ' min total', single: true,
      sel: minutes === o.minutes, on: () => setMinutes(o.minutes) }))
    ready = !!minutes
  } else if (dl) {
    const sub = chosen.find((x) => x.id === dl)
    title = 'When do you want to be ready for ' + (sub ? sub.name : 'this subject') + '?'
    help = 'Each subject gets its own deadline.'
    isDate = true; ready = !!deadlines[dl]
    footer = 'Subject ' + (chosen.findIndex((x) => x.id === dl) + 1) + ' of ' + chosen.length
  }

  const build = () => {
    store.savePlan({ cls: cls!, stream, subjects, minutes: minutes!, deadlines })
    nav('/today')
  }
  const back = () => {
    if (step > 0) { setStep(step - 1); return }
    if (store.hasPlan()) nav('/today')          // never strand a learner with a plan
    else setPhase('intro')
  }

  return (
    <div className="su-wrap">
      <div className="su-col">
        <div className="su-brand">
          <span className="su-mark"><span /></span>
          <span className="su-eyebrow">Blackboard · Learning OS</span>
        </div>

        {phase === 'intro' && (
          <div>
            <h1 className="su-h1">What do you want to learn?</h1>
            <p className="su-lede">We'll set up your learning plan in a few simple steps.</p>
            <Button onClick={() => { setPhase('ask'); setStep(0) }}>Get started</Button>
            {store.hasPlan() && (
              <button className="linkish" style={{ display: 'block', marginTop: 20, fontSize: 13, color: 'var(--muted-foreground)' }}
                onClick={() => nav('/today')}>Back to my plan</button>
            )}
          </div>
        )}

        {phase === 'ask' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
              <span className="su-step">Step {step + 1} of {steps.length}</span>
              <span className="su-bar"><span style={{ width: (((step + 1) / steps.length) * 100).toFixed(1) + '%' }} /></span>
            </div>
            <h1 className="su-h2">{title}</h1>
            <p className="su-help">{help}</p>

            {!isDate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 34 }}>
                {options.map((o) => (
                  <button key={o.label} className="su-opt" onClick={o.on}
                    style={{ borderColor: o.sel ? 'rgba(26,173,166,.62)' : undefined, background: o.sel ? 'rgba(26,173,166,.1)' : undefined }}>
                    <span style={{ width: 17, height: 17, flex: 'none', borderRadius: o.single ? '50%' : 5,
                      border: '1.5px solid ' + (o.sel ? TEAL : 'var(--agabi-neutral-500)'),
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 7, height: 7, borderRadius: o.single ? '50%' : 5, background: o.sel ? TEAL : 'transparent' }} />
                    </span>
                    <span className="lbl">{o.label}</span>
                    <span className="meta">{o.meta}</span>
                  </button>
                ))}
              </div>
            )}

            {isDate && dl && (
              <div style={{ marginBottom: 34 }}>
                <label htmlFor="os-date" className="su-key" style={{ display: 'block', flex: 'none', marginBottom: 10 }}>Target date</label>
                <input id="os-date" type="date" className="su-date" value={deadlines[dl] || ''}
                  onChange={(e) => setDeadlines({ ...deadlines, [dl]: e.target.value })} />
                <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 10 }}>
                  {deadlines[dl] ? 'Ready for ' + pretty(deadlines[dl]) + '.' : 'Suggested: around ' + pretty(iso(soon)) + '.'}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <Button disabled={!ready} onClick={() => { if (!ready) return; if (isLast) setPhase('confirm'); else setStep(step + 1) }}>
                {isLast ? 'Review plan' : 'Continue'}
              </Button>
              <Button variant="ghost" onClick={back}>Back</Button>
              <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>{footer}</span>
            </div>
          </div>
        )}

        {phase === 'confirm' && (
          <div>
            <div className="su-step" style={{ marginBottom: 22 }}>Confirm your plan</div>
            <h1 className="su-h2" style={{ marginBottom: 32 }}>Here's your learning plan.</h1>
            <div className="su-row"><span className="su-key">Class</span><span style={{ fontSize: 16 }}>{cls}</span></div>
            {stream && <div className="su-row"><span className="su-key">Stream</span><span style={{ fontSize: 16 }}>{stream}</span></div>}
            <div className="su-row"><span className="su-key">Subjects</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {chosen.map((x) => <span key={x.id} style={{ fontSize: 16 }}>{x.name}</span>)}
              </span>
            </div>
            <div className="su-row"><span className="su-key">Total daily time</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 16 }}>{CURRICULUM.dayOptions.find((o) => o.minutes === minutes)?.label ?? minutes + ' min'}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 5 }}>Across all subjects together — not per subject.</span>
              </span>
            </div>
            <div className="su-row" style={{ borderBottom: '1px solid var(--border)' }}><span className="su-key">Deadlines</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chosen.map((x) => (
                  <span key={x.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                    <span style={{ fontSize: 15.5, minWidth: 130 }}>{x.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--accent)' }}>{pretty(deadlines[x.id])}</span>
                  </span>
                ))}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32 }}>
              <Button onClick={build}>Build my learning plan</Button>
              <Button variant="secondary" onClick={() => { setPhase('ask'); setStep(0) }}>Edit</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
