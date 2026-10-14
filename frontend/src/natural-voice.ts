// The browser plays local-model audio. Only one upcoming piece is prefetched.
let prepared: AudioContext | undefined
export function prepareNaturalVoice() {
  if (prepared) return true
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return false
  try { prepared = new Ctor() } catch { return false }
  void prepared.resume().catch(() => {})
  return true
}
export function clearPreparedVoice() {
  const context = prepared; prepared = undefined
  if (context) void context.close().catch(() => {})
}
export function startNaturalSpeech(text: string, done?: () => void, error?: () => void, progress?: (index: number) => void) {
  if (!text.trim()) throw new Error('No voice text')
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('Audio unavailable')
  const context = prepared ?? new Ctor(), controller = new AbortController()
  const shared = context === prepared
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)].flatMap(sentence =>
    [...sentence.segment.matchAll(/[\s\S]{1,120}(?:\s|$)|[\s\S]{1,120}/gu)].map(match => ({ text: match[0], index: sentence.index + match.index })))
  let active = true, source: AudioBufferSourceNode | undefined, finishPiece: (() => void) | undefined
  const stop = () => {
    if (!active) return
    active = false; controller.abort()
    if (source) { source.onended = null; try { source.stop() } catch { /* Already ended. */ } }
    finishPiece?.(); if (!shared) void context.close().catch(() => {})
  }
  const fail = () => { if (active) { stop(); error?.() } }
  const audio = async (part: typeof parts[number]) => {
    const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: part.text }), signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('Voice unavailable')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Voice audio too large') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    if (!active) throw new Error('Voice cancelled')
    const buffer = new Uint8Array(bytes); let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
    return context.decodeAudioData(buffer.buffer)
  }
  // Resume during the original click, before waiting for model/network work.
  let activationTimer: ReturnType<typeof setTimeout> | undefined
  const unlocked = Promise.race([context.resume(), new Promise<never>((_resolve, reject) => {
    activationTimer = setTimeout(() => reject(new Error('Audio activation timed out')), 5000)
    controller.signal.addEventListener('abort', () => { clearTimeout(activationTimer); reject(new Error('Voice cancelled')) }, { once: true })
  })]).finally(() => clearTimeout(activationTimer))
  let pending = audio(parts[0]); void pending.catch(() => {})
  void (async () => {
    await unlocked
    for (let i = 0; i < parts.length; i++) {
      const buffer = await pending
      if (!active) return
      if (i + 1 < parts.length) { pending = audio(parts[i + 1]); void pending.catch(() => {}) }
      source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination)
      await new Promise<void>(resolve => {
        finishPiece = resolve; source!.onended = () => resolve()
        source!.start(); progress?.(parts[i].index)
      })
      if (!active) return
    }
    stop(); done?.()
  })().catch(fail)
  return { stop, pause(paused: boolean) {
    if (!active) return false
    try { void (paused ? context.suspend() : context.resume()).catch(fail); return true }
    catch { fail(); return false }
  } }
}
