// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { Canvas } from '../src/Canvas'
import type { SpeechRecognitionLike } from '../src/voice'
import { clearPreparedVoice, prepareNaturalVoice, startNaturalSpeech } from '../src/natural-voice'

let contexts: AudioGraph[], requests: { text: string; signal: AbortSignal }[]
class AudioGraph {
  state = 'suspended'; destination = {}; sources: AudioPiece[] = []
  constructor() { contexts.push(this) }
  resume = async () => { this.state = 'running' }
  suspend = async () => { this.state = 'suspended' }
  close = async () => { this.state = 'closed' }
  decodeAudioData = async (_bytes: ArrayBuffer) => ({ duration: 1 })
  createBufferSource() { const source = new AudioPiece(); this.sources.push(source); return source }
}
class AudioPiece {
  buffer: unknown; onended: (() => void) | null = null; playing = false
  connect() {}
  start() { this.playing = true }
  stop() { this.playing = false; this.onended?.() }
  end() { this.playing = false; this.onended?.() }
}
beforeEach(() => {
  contexts = []; requests = []
  vi.stubGlobal('AudioContext', AudioGraph)
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    requests.push({ text: JSON.parse(options!.body as string).text, signal: options!.signal as AbortSignal })
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } })
  }))
})
afterEach(() => { cleanup(); clearPreparedVoice(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('reads the complete original text in bounded pieces and completes after the last audible piece', async () => {
  const text = 'Dr. Rao measured 3.14 cm.\n\n' + ' 😀 Compare both sides, then explain why. '.repeat(12)
  const done = vi.fn(), error = vi.fn(), progress: number[] = []
  const playback = startNaturalSpeech(text, done, error, index => progress.push(index))
  for (let i = 0; i < 30; i++) {
    await waitFor(() => expect(contexts[0].sources.length > i || done.mock.calls.length > 0).toBe(true))
    if (done.mock.calls.length) break
    expect(done).not.toHaveBeenCalled()
    contexts[0].sources[i].end()
  }
  await waitFor(() => expect(done).toHaveBeenCalledOnce())
  expect(requests.map(request => request.text).join('')).toBe(text)
  expect(requests.every(request => request.text.length <= 512)).toBe(true)
  expect(progress.map(index => text.slice(index)).every(value => value.length > 0)).toBe(true)
  expect(progress[0]).toBe(0); expect(error).not.toHaveBeenCalled()
  expect(contexts[0].state).toBe('closed'); playback.stop()
})
it('interrupts immediately and rejects a late network response without playing it', async () => {
  let finish!: (response: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal('fetch', (_url: unknown, options: RequestInit) => { signal = options.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve }) })
  const done = vi.fn(), error = vi.fn()
  const playback = startNaturalSpeech('An answer that must not play later.', done, error)
  playback.stop(); finish(new Response(new Uint8Array([1])))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(signal.aborted).toBe(true); expect(contexts[0].sources).toHaveLength(0)
  expect(contexts[0].state).toBe('closed'); expect(done).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
})
it('stops the current audio and ignores its queued completion while cancelling the prefetched piece', async () => {
  const done = vi.fn(), error = vi.fn()
  const playback = startNaturalSpeech('One clear sentence. Another follows it.', done, error)
  await waitFor(() => expect(contexts[0].sources).toHaveLength(1))
  const source = contexts[0].sources[0], late = source.onended!
  expect(source.playing).toBe(true)
  playback.stop(); late()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(source.playing).toBe(false); expect(requests.every(request => request.signal.aborted)).toBe(true)
  expect(done).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
})
it('pauses and resumes the same audio context without regenerating the voice', async () => {
  const playback = startNaturalSpeech('Keep this thought in view.')
  await waitFor(() => expect(contexts[0].sources).toHaveLength(1))
  const count = requests.length
  expect(playback.pause(true)).toBe(true)
  await waitFor(() => expect(contexts[0].state).toBe('suspended'))
  expect(playback.pause(false)).toBe(true)
  await waitFor(() => expect(contexts[0].state).toBe('running'))
  expect(requests).toHaveLength(count)
  playback.stop(); expect(playback.pause(false)).toBe(false)
})
it.each([503, 429])('recovers from voice service HTTP %s without fake completion', async status => {
  vi.stubGlobal('fetch', async () => new Response('unavailable', { status }))
  const done = vi.fn(), error = vi.fn()
  startNaturalSpeech('Try this idea.', done, error)
  await waitFor(() => expect(error).toHaveBeenCalledOnce())
  expect(done).not.toHaveBeenCalled(); expect(contexts[0].state).toBe('closed')
})
it('reuses the context unlocked by the microphone gesture after an asynchronous model reply', async () => {
  prepareNaturalVoice(); prepareNaturalVoice()
  await Promise.resolve()
  expect(contexts).toHaveLength(1); expect(contexts[0].state).toBe('running')
  await new Promise(resolve => setTimeout(resolve, 10))
  const playback = startNaturalSpeech('An asynchronous reply.')
  await waitFor(() => expect(contexts[0].sources).toHaveLength(1))
  expect(contexts).toHaveLength(1); playback.stop()
})
it('preserves gesture-unlocked audio through complete Canvas conversation and interruption turns', async () => {
  localStorage.clear()
  const microphones: SpeechRecognitionLike[] = []
  class Recognition {
    lang = ''; interimResults = false; continuous = false
    onresult: SpeechRecognitionLike['onresult'] = null; onend = null; onerror = null
    start() {} stop() {} constructor() { microphones.push(this) }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  vi.stubGlobal('fetch', async (url: string) => url.endsWith('health')
    ? Response.json({ modelConfigured: true, naturalVoice: true })
    : url.endsWith('lesson') ? Response.json({ lesson: { explanation: 'A single idea.', blocks: [] } })
    : new Response(new Uint8Array([1, 2, 3])))
  render(React.createElement(Canvas))
  await waitFor(() => expect(screen.queryByText(/Teaching is not connected/)).toBeNull())
  await new Promise(resolve => setTimeout(resolve, 0))
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  const ask = () => act(() => microphones.at(-1)!.onresult?.({ results: [[{ transcript: 'Explain something.' }]] }))
  ask()
  await waitFor(() => expect(contexts[0].sources).toHaveLength(1))
  expect(contexts).toHaveLength(1)
  act(() => contexts[0].sources[0].end())
  await waitFor(() => expect(microphones).toHaveLength(2))
  ask()
  await waitFor(() => expect(contexts[0].sources).toHaveLength(2))
  expect(contexts).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }))
  expect(contexts[0].sources[1].playing).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'End voice' }))
  expect(contexts[0].state).toBe('closed')
})
it('reports blocked activation rather than remaining silently stuck', async () => {
  vi.useFakeTimers()
  class Blocked extends AudioGraph { resume = () => new Promise<void>(() => {}) }
  vi.stubGlobal('AudioContext', Blocked)
  const done = vi.fn(), error = vi.fn()
  startNaturalSpeech('Blocked audio.', done, error)
  await vi.advanceTimersByTimeAsync(5001)
  expect(error).toHaveBeenCalledOnce(); expect(done).not.toHaveBeenCalled()
  expect(contexts[0].state).toBe('closed'); expect(contexts[0].sources).toHaveLength(0)
})
it.each(['', '   '])('rejects empty speech before allocating audio resources', text => {
  expect(() => startNaturalSpeech(text)).toThrow('No voice text'); expect(contexts).toHaveLength(0)
})
it('supports browsers without Web Audio by reporting unavailability', () => {
  vi.stubGlobal('AudioContext', undefined)
  prepareNaturalVoice(); expect(() => startNaturalSpeech('An idea.')).toThrow('Audio unavailable')
})
it('closes an unused prepared context when voice mode ends', async () => {
  prepareNaturalVoice(); clearPreparedVoice(); clearPreparedVoice()
  expect(contexts[0].state).toBe('closed')
})
it('bounds downloaded audio before decoding it', async () => {
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)))
  const error = vi.fn()
  startNaturalSpeech('Too much audio.', undefined, error)
  await waitFor(() => expect(error).toHaveBeenCalledOnce())
  expect(contexts[0].sources).toHaveLength(0)
})
it('reports decoder failure and never claims successful playback', async () => {
  class Broken extends AudioGraph { decodeAudioData = async () => { throw new Error('corrupt waveform') } }
  vi.stubGlobal('AudioContext', Broken)
  const error = vi.fn(), done = vi.fn()
  startNaturalSpeech('Corrupt audio.', done, error)
  await waitFor(() => expect(error).toHaveBeenCalledOnce()); expect(done).not.toHaveBeenCalled()
})
