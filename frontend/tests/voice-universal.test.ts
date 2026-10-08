// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { recognitionAvailable, speak, splitSpeech, startListening, stopSpeaking } from '../src/voice'

afterEach(() => vi.unstubAllGlobals())

describe('voice text chunking invariants', () => {
  for (let i = 0; i < 300; i++) it(`preserves complete sentence ${i}`, () => {
    const source = `Opening ${i}. Middle ${i}! Closing ${i}?`
    expect(splitSpeech(source).join(' ')).toBe(source)
    expect(splitSpeech(source).every(part => part.trim().length > 0)).toBe(true)
  })
})

describe('voice recognition invariants', () => {
  for (let i = 0; i < 100; i++) it(`delivers one final transcript ${i}`, () => {
    let result: string[] = []
    let instance: { onresult: ((event: unknown) => void) | null; start: () => void; stop: () => void } | undefined
    class FakeRecognition { lang = ''; interimResults = false; continuous = false; onresult: ((event: unknown) => void) | null = null; onerror = () => {}; onend = () => {}; start = () => {}; stop = () => {} }
    vi.stubGlobal('SpeechRecognition', class extends FakeRecognition { constructor() { super(); instance = this } })
    const stop = startListening(text => result.push(text), () => {}, () => {})
    expect(recognitionAvailable()).toBe(true)
    instance!.onresult?.({ results: [[{ transcript: `Question ${i}` }]] })
    instance!.onresult?.({ results: [[{ transcript: `Duplicate ${i}` }]] })
    expect(result).toEqual([`Question ${i}`])
    stop()
  })
})

describe('voice synthesis invariants', () => {
  for (let i = 0; i < 100; i++) it(`queues and completes spoken chunks ${i}`, () => {
    const spoken: { text: string; onend?: () => void }[] = []
    const synthesis = { cancel: vi.fn(), speak: (utterance: { text: string; onend?: () => void }) => spoken.push(utterance) }
    vi.stubGlobal('speechSynthesis', synthesis)
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; onend?: () => void; onerror?: () => void; lang = ''; rate = 0; pitch = 0; constructor(text: string) { this.text = text } })
    const done = vi.fn()
    expect(speak(`First ${i}. Second ${i}!`, done)).toBe(true)
    expect(spoken).toHaveLength(1)
    spoken[0].onend?.()
    expect(spoken).toHaveLength(2)
    spoken[1].onend?.()
    expect(done).toHaveBeenCalledOnce()
    stopSpeaking()
    expect(synthesis.cancel).toHaveBeenCalled()
  })
})
