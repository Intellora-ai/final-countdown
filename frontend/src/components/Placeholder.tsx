import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'

const COPY: Record<string, { eyebrow: string; title: string }> = {
  practice: { eyebrow: 'Sidebar · practice', title: 'Practice' },
  'quick-question': { eyebrow: 'Sidebar · ask quick question', title: 'Quick question' },
  misconception: { eyebrow: 'Today · misconception practice', title: 'Misconception practice' },
  canvas: { eyebrow: 'Today · concept', title: 'Learning canvas' }
}

/* The Learning Canvas plugs in here later: replace the 'canvas' branch with the
 * real surface; the Start actions already write inProgress before arriving. */
export function Placeholder({ kind }: { kind: string }) {
  const nav = useNavigate()
  const c = COPY[kind] || COPY.canvas
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
