// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { recognitionAvailable, speak, startListening, stopSpeaking, type SpeechRecognitionLike } from '../src/voice'

afterEach(() => { stopSpeaking(); vi.unstubAllGlobals() })

function microphone() {
  let recognition: SpeechRecognitionLike
  class Recognition {
    lang = ''; interimResults = false; continuous = false
    onresult: SpeechRecognitionLike['onresult'] = null
    onerror: SpeechRecognitionLike['onerror'] = null
    onend: SpeechRecognitionLike['onend'] = null
    start = vi.fn(); stop = vi.fn()
    constructor() { recognition = this }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  const text = vi.fn(), done = vi.fn(), error = vi.fn()
  const stop = startListening(text, done, error)
  return { recognition: recognition!, text, done, error, stop }
}
function speaker() {
  class Utterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
  const synthesis = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  vi.stubGlobal('speechSynthesis', synthesis)
  return synthesis
}
it('does not submit a late recognition result after the learner stops', () => {
  const { recognition, text, stop } = microphone()
  const lateResult = recognition.onresult!
  stop()
  lateResult({ results: [[{ transcript: 'obsolete question' }]] })
  expect(text).not.toHaveBeenCalled()
})
it('delivers one transcript and completes only once', () => {
  const { recognition, text, done } = microphone()
  const result = recognition.onresult!, end = recognition.onend!
  result({ results: [[{ transcript: 'Why does this happen?' }]] })
  result({ results: [[{ transcript: 'Why does this happen?' }]] })
  end(); end()
  expect(text).toHaveBeenCalledExactlyOnceWith('Why does this happen?')
  expect(done).toHaveBeenCalledTimes(1)
})
it('does not complete or submit after a recognition error', () => {
  const { recognition, text, done, error } = microphone()
  const result = recognition.onresult!, end = recognition.onend!, fail = recognition.onerror!
  fail(); end(); result({ results: [[{ transcript: 'late' }]] }); fail()
  expect(error).toHaveBeenCalledTimes(1)
  expect(done).not.toHaveBeenCalled()
  expect(text).not.toHaveBeenCalled()
})
it('stopping recognition twice is harmless even if the browser throws', () => {
  const { recognition, stop } = microphone()
  recognition.stop = () => { throw new Error('Already stopped') }
  expect(() => { stop(); stop() }).not.toThrow()
})
it('reports constructor failures through the callback', () => {
  vi.stubGlobal('SpeechRecognition', class { constructor() { throw new Error('Unavailable') } })
  const error = vi.fn()
  expect(() => startListening(vi.fn(), vi.fn(), error)).not.toThrow()
  expect(error).toHaveBeenCalledOnce()
})
it('preserves decimals and abbreviations in one utterance', () => {
  const synthesis = speaker()
  expect(speak('Dr. Rao measured 3.14 cm. Why?')).toBe(true)
  expect(synthesis.speak.mock.calls[0][0].text).toBe('Dr. Rao measured 3.14 cm. Why?')
})
it('cancels the whole answer without late speech or completion', () => {
  const synthesis = speaker(), done = vi.fn(), error = vi.fn()
  speak('First. Second.', done, error)
  const utterance = synthesis.speak.mock.calls[0][0]
  const end = utterance.onend, fail = utterance.onerror
  stopSpeaking(); end(); fail()
  expect(synthesis.speak).toHaveBeenCalledTimes(1)
  expect(done).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
it('replacement speech ignores the previous utterance completion', () => {
  const synthesis = speaker(), oldDone = vi.fn(), newDone = vi.fn()
  speak('Old answer.', oldDone)
  const oldEnd = synthesis.speak.mock.calls[0][0].onend
  speak('New answer.', newDone)
  const newEnd = synthesis.speak.mock.calls[1][0].onend
  oldEnd(); newEnd(); newEnd()
  expect(oldDone).not.toHaveBeenCalled()
  expect(newDone).toHaveBeenCalledTimes(1)
})
it('returns false when speech cannot start, including empty input', () => {
  const synthesis = speaker()
  expect(speak('   ')).toBe(false)
  synthesis.speak.mockImplementation(() => { throw new Error('Audio device unavailable') })
  expect(speak('Answer')).toBe(false)
})

it('ignores empty and interim results, then delivers the full finalized transcript without language corruption', () => {
  const { recognition, text, done } = microphone()
  const interim = Object.assign([{ transcript: 'unfinished' }], { isFinal: false })
  const blank = Object.assign([{ transcript: '   ' }], { isFinal: true })
  recognition.onresult!({ results: [interim, blank] })
  expect(text).not.toHaveBeenCalled()
  const finalized = [
    Object.assign([{ transcript: 'क्या होता है?' }], { isFinal: true }),
    Object.assign([{ transcript: 'Explain 3.14 and café.' }], { isFinal: true }),
    interim,
  ]
  recognition.onresult!({ results: finalized })
  recognition.onend!()
  expect(text).toHaveBeenCalledExactlyOnceWith('क्या होता है? Explain 3.14 and café.')
  expect(done).toHaveBeenCalledOnce()
})
it('stops a failed microphone before notifying the interface and never accepts later text', () => {
  const { recognition, text, done, error } = microphone()
  const result = recognition.onresult!, end = recognition.onend!
  error.mockImplementation(() => expect(recognition.stop).toHaveBeenCalledOnce())
  recognition.onerror!()
  result({ results: [[{ transcript: 'Late speech after denial' }]] }); end()
  expect(error).toHaveBeenCalledOnce()
  expect(text).not.toHaveBeenCalled()
  expect(done).not.toHaveBeenCalled()
})
it('uses the browser fallback recognizer when the standard API is unavailable', () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  const text = vi.fn(), done = vi.fn(), error = vi.fn()
  const fallbackRecognition = vi.fn(function (this: SpeechRecognitionLike) {
    Object.assign(this, { lang: '', interimResults: false, continuous: false, onresult: null, onerror: null, onend: null, start: vi.fn(), stop: vi.fn() })
  })
  vi.stubGlobal('webkitSpeechRecognition', fallbackRecognition)
  expect(recognitionAvailable()).toBe(true)
  const stopFallback = startListening(text, done, error)
  const active = fallbackRecognition.mock.instances[0] as SpeechRecognitionLike
  active.onresult!({ results: [[{ transcript: 'A fallback browser question' }]] })
  active.onend!()
  expect(text).toHaveBeenCalledExactlyOnceWith('A fallback browser question')
  expect(done).toHaveBeenCalledOnce()
  expect(error).not.toHaveBeenCalled()
  stopFallback()
})
it('reports unavailable recognition once without claiming microphone support', () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
  expect(recognitionAvailable()).toBe(false)
  const text = vi.fn(), done = vi.fn(), error = vi.fn()
  const stop = startListening(text, done, error)
  stop(); stop()
  expect(error).toHaveBeenCalledOnce()
  expect(text).not.toHaveBeenCalled()
  expect(done).not.toHaveBeenCalled()
})
it('reports playback errors once without treating them as completed answers', () => {
  const synthesis = speaker(), done = vi.fn(), error = vi.fn()
  expect(speak('A spoken answer.', done, error)).toBe(true)
  const utterance = synthesis.speak.mock.calls[0][0]
  const failed = utterance.onerror, ended = utterance.onend
  failed(); ended(); failed()
  expect(error).toHaveBeenCalledOnce()
  expect(done).not.toHaveBeenCalled()
  expect(utterance.onend).toBeNull()
  expect(utterance.onerror).toBeNull()
})
it('returns false when the browser has no speech engine and never throws on unavailable cancellation', () => {
  vi.stubGlobal('speechSynthesis', undefined)
  vi.stubGlobal('SpeechSynthesisUtterance', undefined)
  expect(speak('Please speak.')).toBe(false)
  expect(() => stopSpeaking()).not.toThrow()
  const synthesis = speaker()
  synthesis.cancel.mockImplementation(() => { throw new Error('Audio device disconnected') })
  expect(() => stopSpeaking()).not.toThrow()
})

it('asks the browser to finish one spoken turn on a pause instead of retaining a continuous microphone stream', () => {
  const { recognition } = microphone()
  expect(recognition.continuous).toBe(false)
  expect(recognition.interimResults).toBe(false)
  expect(recognition.start).toHaveBeenCalledOnce()
})

it.each([
  [true, false],
  [false, true],
  [false, false],
])('declines playback without throwing when speech engine=%s and utterance API=%s', (enginePresent, utterancePresent) => {
  const synthesis = speaker()
  if (!enginePresent) vi.stubGlobal('speechSynthesis', undefined)
  if (!utterancePresent) vi.stubGlobal('SpeechSynthesisUtterance', undefined)
  expect(speak('A readable answer.')).toBe(false)
  expect(synthesis.speak).not.toHaveBeenCalled()
})

it.each([
  ['fr-CA', 'fr-CA'],
  ['hi-IN', 'hi-IN'],
  ['zh-Hant-TW', 'zh-Hant-TW'],
  ['', 'en-US'],
])('uses browser locale %s for both recognition and playback, falling back only when empty', (locale, expected) => {
  vi.stubGlobal('navigator', { language: locale })
  const { recognition } = microphone()
  const synthesis = speaker()
  expect(speak('A multilingual teaching reply.')).toBe(true)
  expect(recognition.lang).toBe(expected)
  expect(synthesis.speak.mock.calls[0][0].lang).toBe(expected)
})
