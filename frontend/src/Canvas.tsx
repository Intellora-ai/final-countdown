import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { lessonSchema, MAX_REQUEST_BYTES, type Lesson } from './lesson'
import { Visual } from './Visual'
import { recognitionAvailable, speak, startListening, stopSpeaking } from './voice'

const historySchema = z.array(z.object({ id: z.string(), parentId: z.string().optional(), question: z.string(), lesson: lessonSchema }))
type Entry = z.infer<typeof historySchema>[number]
const storageKey = 'visual-canvas/v1'
function readHistory(): Entry[] {
  try { return historySchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? '[]')) }
  catch { return [] }
}
// Only ancestors of the selected answer belong to this conversation.
function context(entries: Entry[], entry: Entry | undefined, question: string) {
  const turns: Entry[] = []
  while (entry && turns.length < 8 && !turns.some(turn => turn.id === entry!.id)) {
    turns.unshift(entry)
    entry = entries.find(turn => turn.id === entry!.parentId)
  }
  let memory = turns.map(({ question, lesson }) => ({ question, lesson }))
  const bytes = () => new TextEncoder().encode(JSON.stringify({ question, memory })).byteLength
  while (memory.length > 1 && bytes() > MAX_REQUEST_BYTES) memory.shift()
  if (bytes() > MAX_REQUEST_BYTES) memory = memory.map(turn => ({ ...turn, lesson: { ...turn.lesson, blocks: [] } }))
  return memory
}
export function Canvas() {
  const [entries, setEntries] = useState(readHistory)
  const [active, setActive] = useState<string | null>(() => entries.at(-1)?.id ?? null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [followUp, setFollowUp] = useState(() => entries.length > 0)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceOn, setVoiceOn] = useState(false)
  const voiceEnabled = useRef(false)
  const voiceRun = useRef(0)
  const stopListeningRef = useRef<() => void>(() => {})
  const requestRef = useRef<AbortController | null>(null)
  const submitRef = useRef<(text: string) => void>(() => {})
  const listenRef = useRef<() => void>(() => {})
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const entry = entries.find(e => e.id === active)

  useEffect(() => {
    const health = new AbortController()
    fetch('/api/health', { signal: health.signal }).then(r => {
      if (!r.ok) throw new Error(); return r.json()
    }).then(r => { if (!health.signal.aborted) setConnected(r.modelConfigured === true) })
      .catch(() => { if (!health.signal.aborted) setError('The teaching server is unavailable. Restart the development server.') })
    return () => {
      health.abort(); requestRef.current?.abort(); requestRef.current = null
      voiceEnabled.current = false; voiceRun.current++
      stopListeningRef.current(); stopSpeaking()
    }
  }, [])

  function stopAudio() {
    voiceRun.current++; stopListeningRef.current(); stopSpeaking()
    setListening(false); setSpeaking(false)
  }
  function endVoice() { voiceEnabled.current = false; setVoiceOn(false); stopAudio() }
  function cancelRequest() { requestRef.current?.abort(); requestRef.current = null; setBusy(false) }
  function select(id: string | null) {
    endVoice(); cancelRequest(); setActive(id); setFollowUp(id !== null)
    setQuestion(''); setError(''); setVoiceError(''); setHistoryOpen(false)
    inputRef.current?.focus()
  }
  function voiceFailed(message: string) { endVoice(); setVoiceError(message) }
  function readAloud(lesson: Lesson) {
    stopAudio(); setVoiceError(''); setSpeaking(true)
    const run = voiceRun.current
    const started = speak([lesson.explanation, lesson.check].filter(Boolean).join('\n'), () => {
      if (run !== voiceRun.current) return
      setSpeaking(false)
      if (voiceEnabled.current) listenRef.current()
    }, () => {
      if (run === voiceRun.current) voiceFailed('Audio playback failed. You can read the answer or try Read aloud again.')
    })
    if (!started) voiceFailed('Spoken answers are unavailable in this browser.')
  }
  async function submit(spoken?: string) {
    const value = (spoken ?? question).trim()
    if (!value || value.length > 1000) {
      if (spoken) voiceFailed('Please ask a shorter question, up to 1,000 characters.')
      return
    }
    if (spoken === undefined) endVoice(); else stopAudio()
    cancelRequest(); setBusy(true); setError('')
    const controller = new AbortController(); requestRef.current = controller
    const timer = window.setTimeout(() => {
      if (requestRef.current !== controller) return
      cancelRequest(); endVoice(); setError('The answer took too long. Please try again.')
    }, 70000)
    const parent = followUp ? entry : undefined
    try {
      const response = await fetch('/api/lesson', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: value, memory: context(entries, parent, value) }),
      })
      const result = await response.json()
      // A transport can still finish after cancellation. It must not repaint or save.
      if (controller.signal.aborted || requestRef.current !== controller) return
      if (!response.ok) throw new Error(result.error ?? 'The answer could not be created.')
      const lesson = lessonSchema.parse(result.lesson)
      const next = [...entries, { id: crypto.randomUUID(), parentId: parent?.id, question: value, lesson }]
      setEntries(next); setActive(next.at(-1)!.id); setQuestion(current => current.trim() === value ? '' : current); setFollowUp(true)
      try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError('') }
      catch { setStorageError('Browser storage is full or unavailable. This answer will be lost when this tab closes.') }
      if (voiceEnabled.current) readAloud(lesson)
    } catch (err) {
      if (requestRef.current !== controller) return
      endVoice()
      setError(controller.signal.aborted ? 'The answer took too long. Please try again.' : err instanceof Error ? err.message : 'The answer could not be created.')
    } finally {
      window.clearTimeout(timer)
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false) }
    }
  }
  function listen() {
    cancelRequest(); stopAudio(); setVoiceError('')
    voiceEnabled.current = true; setVoiceOn(true); setListening(true)
    const run = voiceRun.current
    let received = false
    stopListeningRef.current = startListening(text => {
      if (run !== voiceRun.current) return
      received = true; setListening(false); setQuestion(text); submitRef.current(text)
    }, () => {
      if (run !== voiceRun.current) return
      setListening(false)
      if (!received) voiceFailed('No speech was received. Start voice to try again.')
    }, () => {
      if (run === voiceRun.current) voiceFailed('Microphone input failed. Check browser microphone permission, or type your question.')
    })
  }
  // Browser callbacks run later; each turn must use the current conversation.
  submitRef.current = text => { void submit(text) }
  listenRef.current = listen

  return <div className={historyOpen ? 'app history-open' : 'app'}>
    <aside id="lesson-history" hidden={!historyOpen}>
      <h2 className="history-label">Saved lessons</h2>
      <nav aria-label="Saved lessons">{entries.map(e => <button key={e.id} className={active === e.id ? 'history active' : 'history'} onClick={() => select(e.id)}>{e.lesson.title ?? e.question}</button>)}</nav>
      {entries.length === 0 && <p>No lessons yet.</p>}
      <p className="local-note">Saved in this browser.</p>
    </aside>
    <main id="canvas">
      <header><div className="toolbar"><button className="history-toggle" aria-label="Saved lessons" aria-expanded={historyOpen} aria-controls="lesson-history" onClick={() => setHistoryOpen(!historyOpen)}>☰</button><a className="brand" href="#canvas">Blackboard</a></div><div className="toolbar"><span className="connection">{connected === null ? 'Checking connection…' : connected ? 'Model configured' : 'Model not configured'}</span><button className="new-topic" onClick={() => select(null)}>+ New topic</button></div></header>
      {connected === false && <p className="notice" role="status">Teaching isn’t connected yet. Saved lessons still open. The server needs a model endpoint and model name.</p>}
      {entry ? <article key={entry.id}>
        <p className="eyebrow">{entry.question}</p>
        <div className="lesson-heading">{entry.lesson.title && <h1>{entry.lesson.title}</h1>}<button disabled={busy} onClick={() => speaking ? endVoice() : readAloud(entry.lesson)}>{speaking ? 'Stop speaking' : 'Read aloud'}</button></div>
        <div className="explanation">{entry.lesson.explanation.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
        {entry.lesson.blocks.length > 0 && <div className="visuals">{entry.lesson.blocks.map((block, i) => <Visual block={block} key={i} />)}</div>}
        {entry.lesson.check && <section className="check"><span>Your turn</span><p>{entry.lesson.check}</p><button onClick={() => { setFollowUp(true); inputRef.current?.focus() }}>Try it below ↓</button></section>}
      </article> : <section className="welcome"><h1>What do you want<br />to understand?</h1><p>A blank board for your next idea.<br />Ask, sketch it out, and ask again.</p></section>}
      <div className="composer"><form onSubmit={event => { event.preventDefault(); void submit() }}>
        {entry && <label className="follow-up"><input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} /> Keep conversation context</label>}
        <div className="input-row"><textarea ref={inputRef} aria-label="Your question" placeholder={entry ? 'Ask a follow-up, or try answering…' : 'What would you like to learn?'} value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} rows={2} /><div className="composer-actions">
          {recognitionAvailable() && <button type="button" onClick={() => voiceOn ? (endVoice(), cancelRequest()) : listen()}>{voiceOn ? 'End voice' : 'Start voice'}</button>}
          {voiceOn && (speaking || busy) && <button type="button" onClick={listen}>Interrupt</button>}
          {busy && !voiceOn ? <button type="button" onClick={cancelRequest}>Stop answer</button> : <button type="submit" disabled={busy || !question.trim()}>Send</button>}
        </div></div>
        {listening && <p role="status">Listening… pause when you finish.</p>}{speaking && <p role="status">Speaking…</p>}{busy && <p role="status">Working on your question…</p>}
        {error && <p role="alert">{error}</p>}{voiceError && <p role="alert">{voiceError}</p>}{storageError && <p role="alert">{storageError}</p>}
      </form></div>
    </main>
  </div>
}
