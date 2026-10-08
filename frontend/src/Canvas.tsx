import { useEffect, useState } from 'react'
import { z } from 'zod'
import { lessonSchema, type Lesson } from './lesson'
import { Visual } from './Visual'

const historySchema = z.array(z.object({ id: z.string(), question: z.string(), lesson: lessonSchema }))
type Entry = z.infer<typeof historySchema>[number]
const storageKey = 'visual-canvas/v1'
function readHistory(): Entry[] {
  try { return historySchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? '[]')) }
  catch { return [] }
}
export function Canvas() {
  const [entries, setEntries] = useState(readHistory)
  const [active, setActive] = useState<string | null>(() => entries.at(-1)?.id ?? null)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [followUp, setFollowUp] = useState(() => entries.length > 0)
  const entry = entries.find(e => e.id === active)
  useEffect(() => {
    fetch('/api/health').then(r => { if (!r.ok) throw new Error(); return r.json() }).then(r => setConnected(r.modelConfigured === true)).catch(() => setError('The teaching server is unavailable. Restart the development server.'))
  }, [])
  async function submit() {
    const value = question.trim()
    if (!value || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/lesson', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(65000),
        body: JSON.stringify({ question: value, ...(followUp && entry ? { previous: entry.lesson } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'The lesson could not be created.')
      const lesson: Lesson = lessonSchema.parse(result.lesson)
      const next = [...entries, { id: crypto.randomUUID(), question: value, lesson }]
      setEntries(next); setActive(next[next.length - 1].id); setQuestion(''); setFollowUp(true)
      try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError('') }
      catch { setStorageError('Browser storage is full or unavailable. This lesson will be lost when this tab closes.') }
    } catch (err) { setError(err instanceof Error ? err.message : 'The lesson could not be created.') }
    finally { setBusy(false) }
  }
  return <div className="app">
    <aside><a className="brand" href="#canvas"><span>◈</span> Canvas</a><p className="sidebar-note">Understand it. See it. Ask again.</p>
      <button className="new-topic" disabled={busy} onClick={() => { setActive(null); setFollowUp(false); setQuestion(''); setError('') }}>+ New topic</button>
      <h2 className="history-label">Your lessons</h2><nav aria-label="Saved lessons">{entries.map(e => <button key={e.id} disabled={busy} className={active === e.id ? 'history active' : 'history'} onClick={() => { setActive(e.id); setFollowUp(true); setError('') }}>{e.lesson.title}</button>)}</nav>
      <p className="local-note">Lessons stay in this browser. Model answers can be wrong; check important facts.</p>
    </aside>
    <main id="canvas"><header><span>LEARNING CANVAS</span><span className="connection">{connected === null ? 'Checking configuration…' : connected ? 'Model configured' : 'Model not configured'}</span></header>
      {connected === false && <p className="notice" role="status">Teaching isn’t connected yet. Ask the person running this canvas to connect a model. You can still open saved lessons.</p>}
      {entry ? <article><p className="eyebrow">YOU ASKED · {entry.question}</p><h1>{entry.lesson.title}</h1><p className="explanation">{entry.lesson.explanation}</p>{entry.lesson.blocks.length > 0 && <div className="visuals">{entry.lesson.blocks.map((block, i) => <Visual block={block} key={i} />)}</div>}{entry.lesson.check && <section className="check"><span>YOUR TURN</span><p>{entry.lesson.check}</p><button onClick={() => { setFollowUp(true); document.querySelector<HTMLTextAreaElement>('textarea')?.focus() }}>Answer or ask below ↓</button></section>}</article>
        : <section className="welcome"><span className="eyebrow">A SPACE TO FIGURE THINGS OUT</span><h1>What do you want<br />to understand?</h1><p>Ask anything. Get a clear explanation, with visuals when they help. Then work through your questions together.</p></section>}
      <div className="composer"><form onSubmit={event => { event.preventDefault(); void submit() }}>
        {entry && <label className="follow-up"><input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} /> Use this lesson as context</label>}
        <div className="input-row"><textarea aria-label="Your question" placeholder={entry ? 'Ask a question, or try answering the check…' : 'What would you like to learn?'} value={question} maxLength={1000} disabled={busy} onChange={e => setQuestion(e.target.value)} rows={2} /><button type="submit" disabled={busy || !question.trim()}>{busy ? 'Teaching…' : 'Teach me ↗'}</button></div>
        {busy && <p role="status">Working on your question…</p>}{error && <p role="alert">{error}</p>}{storageError && <p role="alert">{storageError}</p>}
      </form></div>
    </main>
  </div>
}
