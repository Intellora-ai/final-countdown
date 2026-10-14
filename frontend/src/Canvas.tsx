import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { lessonSchema, type Lesson } from './lesson'
import { learnerKey, readLearner, mergeMemory, retrieve } from './learner'
import { passages, readAttachment, type Attachment } from './attachments'
import { WrittenReply } from './WrittenReply'
import { Visual } from './Visual'
import { pauseSpeaking, recognitionAvailable, speak, startListening, stopSpeaking } from './voice'
import { clearPreparedVoice, prepareNaturalVoice } from './natural-voice'

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
  while (memory.length > 1 && bytes() > 64000) memory.shift()
  if (bytes() > 64000) memory = memory.map(turn => ({ ...turn, lesson: { ...turn.lesson, blocks: [] } }))
  return memory
}
function captionAt(text: string, index: number) {
  const paragraph = text.indexOf('\n', index), word = text.indexOf(' ', index + 90)
  return text.slice(index, Math.min(paragraph < 0 ? text.length : paragraph, word < 0 ? text.length : word))
}

export function Canvas() {
  const [entries, setEntries] = useState(readHistory)
  const [learner, setLearner] = useState(readLearner)
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem(learnerKey + '/enabled') !== 'false' } catch { return true } })
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [reading, setReading] = useState(false)
  function saveLearner(value: string) {
    setLearner(value)
    try { localStorage.setItem(learnerKey, value) } catch { setStorageError('Learning memory could not be saved in this browser.') }
  }
  function exportLearning() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ learner, entries }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'blackboard-learning.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function restoreLearning(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Learning backup exceeds 20 MB.')
      const backup = z.object({ learner: z.string().max(2000), entries: historySchema }).parse(JSON.parse(await file.text()))
      endVoice(); cancelRequest()
      freshBoard.current = undefined
      localStorage.setItem(storageKey, JSON.stringify(backup.entries)); localStorage.setItem(learnerKey, backup.learner)
      setEntries(backup.entries); setLearner(backup.learner); setActive(backup.entries.at(-1)?.id ?? null); setFollowUp(backup.entries.length > 0); setError('')
    } catch { setError('Could not restore the learning backup. Use an exported Blackboard JSON file and check available browser storage.') }
  }
  async function addFiles(files: FileList | null) {
    if (!files) return
    if (attachments.length + files.length > 3) { setError('Attach up to three files at once.'); return }
    endVoice(); setReading(true); setError('')
    try { const results = await Promise.all([...files].map(readAttachment)); setAttachments(current => [...current, ...results]) }
    catch (err) { setError(err instanceof Error ? err.message : 'The file could not be read.') }
    finally { setReading(false) }
  }
  const [active, setActive] = useState<string | null>(() => entries.at(-1)?.id ?? null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [naturalVoice, setNaturalVoice] = useState(false)
  const [followUp, setFollowUp] = useState(() => entries.length > 0)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState<number>()
  const [followTeacher, setFollowTeacher] = useState(true)
  const [boardZoom, setBoardZoom] = useState(1)
  const boardRef = useRef<HTMLDivElement>(null)
  const freshBoard = useRef<string>()
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
  const transcript = entry ? [entry.lesson.explanation, entry.lesson.check].filter(Boolean).join('\n') : ''
  const caption = progress === undefined ? '' : captionAt(transcript, progress)

  useEffect(() => {
    if (!followTeacher || progress === undefined) return
    const board = boardRef.current, row = board?.querySelector('[data-active=true]')
    if (!board || !row) return
    const viewport = board.getBoundingClientRect(), ink = row.getBoundingClientRect()
    if (ink.top < viewport.top + 24 || ink.bottom > viewport.bottom - 24)
      board.scrollBy?.({ top: ink.top - viewport.top - board.clientHeight / 2, behavior: 'auto' })
  }, [progress, followTeacher])

  useEffect(() => {
    const health = new AbortController()
    fetch('/api/health', { signal: health.signal }).then(r => {
      if (!r.ok) throw new Error(); return r.json()
    }).then(r => { if (!health.signal.aborted) { setConnected(r.modelConfigured === true); setNaturalVoice(r.naturalVoice === true) } })
      .catch(() => { if (!health.signal.aborted) setError('The teaching server is unavailable. Restart the development server.') })
    return () => {
      health.abort(); requestRef.current?.abort(); requestRef.current = null
      voiceRun.current++
      stopListeningRef.current(); stopSpeaking(); clearPreparedVoice()
    }
  }, [])

  function stopAudio() {
    voiceRun.current++; stopListeningRef.current(); stopSpeaking()
    setListening(false); setSpeaking(false)
    setPaused(false); setProgress(undefined)
  }
  function endVoice() { voiceEnabled.current = false; setVoiceOn(false); stopAudio(); clearPreparedVoice() }
  function cancelRequest() { requestRef.current?.abort(); requestRef.current = null; setBusy(false) }
  function select(id: string | null) {
    freshBoard.current = undefined
    endVoice(); cancelRequest(); setActive(id); setFollowUp(id !== null)
    setQuestion(''); setError(''); setVoiceError(''); setHistoryOpen(false)
    inputRef.current?.focus()
  }
  function voiceFailed(message: string) { endVoice(); setVoiceError(message) }
  function readAloud(lesson: Lesson) {
    stopAudio(); setVoiceError(''); setSpeaking(true)
    const run = voiceRun.current
    const transcript = [lesson.explanation, lesson.check].filter(Boolean).join('\n')
    setProgress(0)
    const started = speak(transcript, () => {
      if (run !== voiceRun.current) return
      setSpeaking(false)
      setProgress(undefined)
      if (voiceEnabled.current) listenRef.current()
    }, () => {
      if (run === voiceRun.current) voiceFailed(naturalVoice ? 'Natural voice is unavailable. Try again or select Browser voice.' : 'Audio playback failed. You can read the answer or try Read aloud again.')
    }, index => {
      if (run !== voiceRun.current) return
      setProgress(index)
    }, naturalVoice)
    if (!started) voiceFailed('Spoken answers are unavailable in this browser.')
  }
  async function submit(spoken?: string) {
    const value = (spoken ?? question).trim()
    if (reading) return
    if (!value || value.length > 1000) {
      if (spoken) voiceFailed('Please ask a shorter question, up to 1,000 characters.')
      return
    }
    if (spoken === undefined) endVoice(); else stopAudio()
    cancelRequest(); setBusy(true); setError(''); setVoiceError('')
    const controller = new AbortController(); requestRef.current = controller
    const timer = window.setTimeout(() => {
      if (requestRef.current !== controller) return
      cancelRequest(); endVoice(); setError('The answer took too long. Please try again.')
    }, 70000)
    const parent = followUp ? entry : undefined
    const recent = context(entries, parent, value)
    const included = new Set(entries.filter(e => recent.some(turn => turn.question === e.question && turn.lesson.explanation === e.lesson.explanation)).map(e => e.id))
    try {
      const response = await fetch('/api/lesson', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: value, memory: recent,
          remember, learner: remember ? learner : '',
          recall: remember ? retrieve(entries, value, included) : '',
          attachments: attachments.map(a => a.text ? { name: a.name, text: passages(a.text, value) } : a),
        }),
      })
      const result = await response.json()
      // A transport can still finish after cancellation. It must not repaint or save.
      if (controller.signal.aborted || requestRef.current !== controller) return
      if (!response.ok) throw new Error(result.error ?? 'The answer could not be created.')
      const lesson = lessonSchema.parse(result.lesson)
      if (remember && typeof result.lesson.learner === 'string') saveLearner(mergeMemory(learner, result.lesson.learner))
      const next = [...entries, { id: crypto.randomUUID(), parentId: parent?.id, question: value, lesson }]
      freshBoard.current = next.at(-1)!.id
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
    if (naturalVoice && !prepareNaturalVoice()) { voiceFailed('Audio playback is unavailable in this browser. Select Browser voice or type your question.'); return }
    voiceEnabled.current = true; setVoiceOn(true); setListening(true)
    const run = voiceRun.current
    let received = false
    stopListeningRef.current = startListening(text => {
      if (run !== voiceRun.current) return
      received = true; setListening(false); setQuestion(text); submitRef.current(text)
    }, () => {
      if (run !== voiceRun.current) return
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
      <details className="learner-settings"><summary>Learning memory</summary>
        <label><input type="checkbox" checked={remember} disabled={busy} onChange={e => { setRemember(e.target.checked); try { localStorage.setItem(learnerKey + '/enabled', String(e.target.checked)) } catch { setStorageError('Memory preference could not be saved.') } }} /> Use and update memory</label>
        <textarea aria-label="Learning memory" disabled={busy} value={learner} maxLength={2000} placeholder="Your goals, preferences and learning so far…" onChange={e => saveLearner(e.target.value)} />
        <p>Editable notes and relevant older answers help personalize new topics. Files stay in this tab. No account or cross-device sync.</p>
        <button disabled={busy || reading} onClick={exportLearning}>Export learning</button>
        <label>Restore learning<input type="file" accept="application/json,.json" disabled={busy || reading} aria-label="Restore learning" onChange={e => { void restoreLearning(e.target.files?.[0]); e.target.value = '' }} /></label>
        <button disabled={busy} onClick={() => saveLearner('')}>Erase memory</button>
        <button disabled={reading} onClick={() => { endVoice(); cancelRequest(); setEntries([]); setAttachments([]); setActive(null); saveLearner(''); try { localStorage.removeItem(storageKey) } catch { setStorageError('Could not erase saved lessons.') } }}>Erase all learning</button>
      </details>
    </aside>
    <main id="canvas">
      <header><div className="toolbar"><button className="history-toggle" aria-label="Saved lessons" aria-expanded={historyOpen} aria-controls="lesson-history" onClick={() => setHistoryOpen(!historyOpen)}>☰</button><a className="brand" href="#canvas">Blackboard</a></div><div className="toolbar"><span className="connection">{connected === null ? 'Checking connection…' : connected ? 'Model configured' : 'Model not configured'}</span><select aria-label="Board zoom" value={boardZoom} onChange={event => setBoardZoom(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select><button className="new-topic" aria-label="+ New topic" onClick={() => select(null)}>+ New topic</button></div></header>
      {connected === false && <p className="notice" role="status">Teaching isn’t connected yet. Saved lessons still open. The server needs a model endpoint and model name.</p>}
      <div className="board-stage" ref={boardRef}>
      <div className="board-content" style={{ zoom: boardZoom }}>
      {entry ? <article key={entry.id}>
        <p className="sr-only">Question: {entry.question}</p>
        <div className="lesson-heading">{entry.lesson.title && <h1>{entry.lesson.title}</h1>}</div>
        <section className="answer-board" aria-label="Answer canvas">
          <p className="sr-only">{entry.lesson.explanation}</p>
          <WrittenReply text={entry.lesson.explanation} progress={progress} reveal={freshBoard.current === entry.id} />
          {entry.lesson.blocks.length > 0 && <div className="visuals">{entry.lesson.blocks.map((block, i) => <Visual block={block} key={i} />)}</div>}
        </section>
        {entry.lesson.check && <section className="check"><span>Your turn</span><p data-active={progress !== undefined && progress >= entry.lesson.explanation.length + 1 ? 'true' : undefined}>{entry.lesson.check}</p><button onClick={() => { setFollowUp(true); inputRef.current?.focus() }}>Try it below ↓</button></section>}
      </article> : <section className="blank-board" aria-label="Blank canvas" />}
      </div>
      </div>
      {entry && <div className="teaching-controls">
        <label>Voice <select aria-label="Voice" value={naturalVoice ? 'natural' : 'browser'} disabled={speaking} onChange={event => setNaturalVoice(event.target.value === 'natural')}><option value="natural">Natural (English)</option><option value="browser">Browser</option></select></label>
        <button disabled={busy} onClick={() => speaking ? endVoice() : readAloud(entry.lesson)}>{speaking ? 'Stop speaking' : 'Read aloud'}</button>
        <button aria-pressed={followTeacher} onClick={() => setFollowTeacher(!followTeacher)}>Follow teacher</button>
        {speaking && <button onClick={() => { if (pauseSpeaking(!paused)) setPaused(!paused); else voiceFailed('Playback controls are unavailable. You can stop reading and try again.') }}>{paused ? 'Resume reading' : 'Pause reading'}</button>}
      </div>}
      {speaking && caption && <p className="voice-caption" aria-label="Voice caption" aria-live="off">{caption}</p>}
      <div className="composer"><form onSubmit={event => { event.preventDefault(); void submit() }}>
        {entry && <label className="follow-up"><input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} /> Keep conversation context</label>}
        <div className="file-input"><label>Attach files or photos<input type="file" multiple disabled={reading || busy} aria-label="Attach files or photos" onChange={e => { void addFiles(e.target.files); e.target.value = '' }} /></label>
          {attachments.map((a, i) => <span key={i}>{a.name}<button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments(current => current.filter((_, index) => index !== i))}>×</button></span>)}
          {reading && <p role="status">Reading files locally…</p>}
          {attachments.length > 0 && <p>Relevant excerpts are sent with your question. Photos need a vision-capable model.</p>}
        </div>
        <div className="input-row"><textarea ref={inputRef} aria-label="Your question" placeholder={entry ? 'Ask a follow-up, or try answering…' : 'What would you like to learn?'} value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} rows={2} /><div className="composer-actions">
          {recognitionAvailable() && <button type="button" disabled={reading && !voiceOn} onClick={() => voiceOn ? (endVoice(), cancelRequest()) : listen()}>{voiceOn ? 'End voice' : 'Start voice'}</button>}
          {voiceOn && (speaking || busy) && <button type="button" onClick={listen}>Interrupt</button>}
          {busy && !voiceOn ? <button type="button" onClick={cancelRequest}>Stop answer</button> : <button type="submit" disabled={busy || reading || !question.trim()}>Send</button>}
        </div></div>
        {listening && <p role="status">Listening… pause when you finish.</p>}{speaking && <p role="status">Speaking…</p>}{busy && <p role="status">Working on your question…</p>}
        {error && <p role="alert">{error}</p>}{voiceError && <p role="alert">{voiceError}</p>}{storageError && <p role="alert">{storageError}</p>}
      </form></div>
    </main>
  </div>
}
