export type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null
  onerror: (() => void) | null; onend: (() => void) | null
  start: () => void; stop: () => void
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}
export function recognitionAvailable() {
  const w = window as VoiceWindow
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}
export function startListening(onText: (text: string) => void, onDone: () => void, onError: () => void) {
  let recognition: SpeechRecognitionLike | undefined
  let active = true, delivered = false
  const detach = () => {
    active = false
    if (recognition) recognition.onresult = recognition.onerror = recognition.onend = null
  }
  const stop = () => {
    if (!active) return
    detach()
    try { recognition?.stop() } catch { /* The browser may already have stopped. */ }
  }
  try {
    const w = window as VoiceWindow
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) throw new Error('Recognition unavailable')
    recognition = new Ctor()
    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = event => {
      if (!active || delivered) return
      const text = Array.from(event.results).filter(result => result.isFinal !== false)
        .map(result => result[0]?.transcript ?? '').join(' ').trim()
      if (text) { delivered = true; onText(text) }
    }
    recognition.onend = () => { if (active) { detach(); onDone() } }
    recognition.onerror = () => { if (active) { stop(); onError() } }
    recognition.start()
  } catch { stop(); onError() }
  return stop
}

// One browser utterance owns the whole answer. Cancelling it cannot start a queue.
let discardSpeech: (() => void) | undefined
export function stopSpeaking() {
  discardSpeech?.()
  discardSpeech = undefined
  try { window.speechSynthesis?.cancel() } catch { /* No active audio device. */ }
}
export function speak(text: string, onDone?: () => void, onError?: () => void) {
  stopSpeaking()
  if (!text.trim() || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false
  let active = true
  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = navigator.language || 'en-US'
    const detach = () => { active = false; utterance.onend = utterance.onerror = null }
    discardSpeech = detach
    const finish = (callback?: () => void) => {
      if (!active) return
      detach(); discardSpeech = undefined; callback?.()
    }
    utterance.onend = () => finish(onDone)
    utterance.onerror = () => finish(onError)
    window.speechSynthesis.speak(utterance)
    return true
  } catch { stopSpeaking(); return false }
}
