// The browser plays local-model audio. Only one upcoming piece is prefetched.
// Reuse Kokoro.js 1.2.1's Apache-2.0 abbreviation lexicon, not topic-specific rules.
const abbreviations = new Set('mr mrs ms dr prof sr jr sgt col gen rep sen gov lt maj capt st mt etc co inc ltd dept vs p pg jan feb mar apr jun jul aug sep sept oct nov dec sun mon tu tue tues wed th thu thur thurs fri sat'.split(' '))
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
  const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)]
  const parts: { text: string; index: number }[] = []
  for (let i = 0; i < sentences.length; i++) {
    let segment = sentences[i].segment, index = sentences[i].index
    while (i + 1 < sentences.length) {
      const last = segment.trimEnd().split(/\s+/u).at(-1)!.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}.]+$/u, '')
      if (!abbreviations.has(last.replace(/['’]s$/i, '').replace(/\.+$/, '').toLowerCase()) && !/^(?:[A-Za-z]\.)+$/u.test(last)) break
      segment += sentences[++i].segment
    }
    while (segment.length > 512) {
      const prefix = segment.slice(0, 512)
      const boundary = [...prefix.matchAll(/[,;:]\s|\s/gu)].at(-1)
      const end = boundary ? boundary.index + boundary[0].length : /[\uD800-\uDBFF]$/.test(prefix) ? 511 : 512
      parts.push({ text: segment.slice(0, end), index }); segment = segment.slice(end); index += end
    }
    if (segment) parts.push({ text: segment, index })
  }
  let active = true
  const sources = new Map<AudioBufferSourceNode, () => void>()
  const stop = () => {
    if (!active) return
    active = false; controller.abort()
    for (const [source, finish] of sources) {
      source.onended = null; try { source.stop() } catch { /* Already ended. */ }
      finish()
    }
    if (!shared) void context.close().catch(() => {})
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
    let previous = Promise.resolve(), cursor = context.currentTime
    for (let i = 0; i < parts.length; i++) {
      const buffer = await pending
      if (!active) return
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination)
      const ended = new Promise<void>(resolve => {
        const finish = () => { sources.delete(source); resolve() }
        sources.set(source, finish); source.onended = finish
      })
      const when = Math.max(context.currentTime, cursor)
      cursor = when + buffer.duration; source.start(when)
      // Audio continues on its sample clock even if the UI thread is busy.
      await previous
      if (!active) return
      progress?.(parts[i].index); previous = ended
      if (i + 1 < parts.length) { pending = audio(parts[i + 1]); void pending.catch(() => {}) }
    }
    await previous
    if (!active) return
    stop(); done?.()
  })().catch(fail)
  return { stop, pause(paused: boolean) {
    if (!active) return false
    try { void (paused ? context.suspend() : context.resume()).catch(fail); return true }
    catch { fail(); return false }
  } }
}
