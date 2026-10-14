// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { recognitionAvailable, speak, startListening, stopSpeaking, type SpeechRecognitionLike } from '../src/voice'
import * as voice from '../src/voice'

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
  class Utterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; onboundary: ((event: { charIndex: number }) => void) | null = null; constructor(public text: string) {} }
  const synthesis = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), paused: false }
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

it('reports browser boundary positions unchanged for multilingual and supplementary Unicode text', () => {
  const synthesis = speaker(), progress = vi.fn()
  const text = 'हाय 👋 café, 3.14!'
  expect(speak(text, undefined, undefined, progress)).toBe(true)
  const utterance = synthesis.speak.mock.calls[0][0]
  const indices = [0, text.indexOf('👋'), text.indexOf('café'), text.length - 1]
  for (const charIndex of indices) utterance.onboundary?.({ charIndex })
  expect(progress.mock.calls).toEqual(indices.map(index => [index]))
  expect(utterance.text).toBe(text)
})

it('ignores nonfinite, fractional and out-of-range boundaries while accepting both valid endpoint indices', () => {
  const synthesis = speaker(), progress = vi.fn()
  const text = 'A valid spoken answer'
  speak(text, undefined, undefined, progress)
  const utterance = synthesis.speak.mock.calls[0][0]
  for (const charIndex of [-1, 0.5, NaN, Infinity, -Infinity, text.length, text.length + 1]) utterance.onboundary?.({ charIndex })
  expect(progress).not.toHaveBeenCalled()
  utterance.onboundary?.({ charIndex: 0 }); utterance.onboundary?.({ charIndex: text.length - 1 })
  expect(progress.mock.calls).toEqual([[0], [text.length - 1]])
})

it.each(['stop', 'end', 'error', 'replacement'])('detaches progress on %s and ignores an already queued boundary from that utterance', reason => {
  const synthesis = speaker(), progress = vi.fn(), replacementProgress = vi.fn()
  speak('The original answer', undefined, undefined, progress)
  const utterance = synthesis.speak.mock.calls[0][0]
  const queuedBoundary = utterance.onboundary
  queuedBoundary?.({ charIndex: 0 })
  expect(progress).toHaveBeenCalledExactlyOnceWith(0)
  if (reason === 'stop') stopSpeaking()
  else if (reason === 'end') utterance.onend()
  else if (reason === 'error') utterance.onerror()
  else speak('The replacement answer', undefined, undefined, replacementProgress)
  expect(utterance.onboundary).toBeNull()
  queuedBoundary?.({ charIndex: 4 })
  expect(progress).toHaveBeenCalledExactlyOnceWith(0)
  expect(replacementProgress).not.toHaveBeenCalled()
  if (reason === 'replacement') {
    synthesis.speak.mock.calls[1][0].onboundary?.({ charIndex: 4 })
    expect(replacementProgress).toHaveBeenCalledExactlyOnceWith(4)
  }
})

it('keeps playback completion compatible when no progress callback is supplied', () => {
  const synthesis = speaker(), done = vi.fn()
  expect(speak('A legacy caller', done)).toBe(true)
  const utterance = synthesis.speak.mock.calls[0][0]
  expect(() => utterance.onboundary?.({ charIndex: 0 })).not.toThrow()
  utterance.onend()
  expect(done).toHaveBeenCalledOnce()
})

it('pauses and resumes the same browser utterance without cancelling or replaying it', () => {
  const synthesis = speaker(), done = vi.fn(), progress = vi.fn()
  synthesis.pause.mockImplementation(function (this: unknown) { expect(this).toBe(synthesis) })
  synthesis.resume.mockImplementation(function (this: unknown) { expect(this).toBe(synthesis) })
  speak('Continue this answer', done, undefined, progress)
  const utterance = synthesis.speak.mock.calls[0][0]
  const cancellations = synthesis.cancel.mock.calls.length
  expect(voice.pauseSpeaking?.(true)).toBe(true)
  expect(synthesis.pause).toHaveBeenCalledOnce()
  expect(synthesis.resume).not.toHaveBeenCalled()
  expect(voice.pauseSpeaking?.(false)).toBe(true)
  expect(synthesis.resume).toHaveBeenCalledOnce()
  expect(synthesis.cancel).toHaveBeenCalledTimes(cancellations)
  expect(synthesis.speak).toHaveBeenCalledOnce()
  utterance.onboundary?.({ charIndex: 9 }); utterance.onend()
  expect(progress).toHaveBeenCalledExactlyOnceWith(9)
  expect(done).toHaveBeenCalledOnce()
})

it('returns false for unavailable browser pause and resume support', () => {
  vi.stubGlobal('speechSynthesis', undefined)
  expect(voice.pauseSpeaking?.(true)).toBe(false)
  expect(voice.pauseSpeaking?.(false)).toBe(false)
  vi.stubGlobal('speechSynthesis', {})
  expect(voice.pauseSpeaking?.(true)).toBe(false)
  expect(voice.pauseSpeaking?.(false)).toBe(false)
})

it.each([true, false])('returns false rather than throwing when the browser rejects paused=%s', paused => {
  const synthesis = speaker()
  synthesis[paused ? 'pause' : 'resume'].mockImplementation(() => { throw new Error('Audio device unavailable') })
  expect(voice.pauseSpeaking?.(paused)).toBe(false)
  expect(synthesis.cancel).not.toHaveBeenCalled()
})

it('clears a paused engine after cancelling so the next answer can speak', () => {
  const synthesis = speaker()
  synthesis.pause.mockImplementation(() => { synthesis.paused = true })
  synthesis.resume.mockImplementation(() => { synthesis.paused = false })
  speak('The paused answer')
  voice.pauseSpeaking(true)
  expect(synthesis.paused).toBe(true)
  stopSpeaking()
  expect(synthesis.paused).toBe(false)
  expect(synthesis.resume).toHaveBeenCalledOnce()
  expect(synthesis.cancel.mock.invocationCallOrder.at(-1)).toBeLessThan(synthesis.resume.mock.invocationCallOrder[0])
  expect(speak('The next answer')).toBe(true)
  expect(synthesis.speak).toHaveBeenCalledTimes(2)
})
