// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { speak, startListening, stopSpeaking, type SpeechRecognitionLike } from '../src/voice'

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
