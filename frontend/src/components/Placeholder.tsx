import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'

/* The three surfaces that genuinely are not designed yet. The canvas is no
 * longer one of them: `/canvas/:chapterId/:conceptId` renders CanvasView, so a
 * `canvas` entry here would be a second, dead definition of a live route. */
const COPY: Record<string, { eyebrow: string; title: string }> = {
  practice: { eyebrow: 'Sidebar · practice', title: 'Practice' },
  'quick-question': { eyebrow: 'Sidebar · ask quick question', title: 'Quick question' },
  misconception: { eyebrow: 'Today · misconception practice', title: 'Misconception practice' }
}

export function Placeholder({ kind }: { kind: string }) {
  const nav = useNavigate()
  const c = COPY[kind] || COPY.practice
  return (
    <div className="ph-wrap">
      <div style={{ textAlign: 'center' }}>
        <div className="mono-crumb" style={{ letterSpacing: '.2em', marginBottom: 18 }}>{c.eyebrow}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 38, letterSpacing: '-.025em', margin: 0 }}>{c.title}</h1>
        <p style={{ fontSize: 16, color: 'var(--muted-foreground)', margin: '14px 0 32px' }}>Not designed yet.</p>
        <Button variant="secondary" onClick={() => nav(-1)}>Back</Button>
      </div>
    </div>
  )
}
