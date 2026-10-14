// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Canvas } from '../src/Canvas'

// The browser adapter already rejects obsolete events. Retain its callbacks here
// to verify Canvas also rejects events queued before an adapter was stopped.
const voice = vi.hoisted(() => ({
  startListening: vi.fn(), stopSpeaking: vi.fn(), speak: vi.fn(),
}))
vi.mock('../src/voice', () => ({ recognitionAvailable: () => true, ...voice }))
type MicrophoneCallbacks = { text: (text: string) => void; end: () => void; fail: () => void; stop: ReturnType<typeof vi.fn> }
type PlaybackCallbacks = { text: string; end: () => void; fail: () => void }
let microphones: MicrophoneCallbacks[], playback: PlaybackCallbacks[]
const lesson = { title: 'A queued answer', explanation: 'Readable explanation', blocks: [] }

beforeEach(() => {
  localStorage.clear(); microphones = []; playback = []; vi.clearAllMocks()
  voice.startListening.mockImplementation((text, end, fail) => {
    const stop = vi.fn(); microphones.push({ text, end, fail, stop }); return stop
  })
  voice.speak.mockImplementation((text, end, fail) => { playback.push({ text, end, fail }); return true })
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => Response.json(String(url).endsWith('health') ? { modelConfigured: true } : { lesson })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('rejects queued microphone text, completion and error after changing topics', async () => {
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  fireEvent.click(screen.getByRole('button', { name: '+ New topic' }))
  expect(microphones[0].stop).toHaveBeenCalled()
  act(() => { microphones[0].text('Obsolete transcript'); microphones[0].end(); microphones[0].fail() })
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('Working on your question…')).toBeNull()
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
  await screen.findByText('Model configured')
})

it('does not report silence when recognition ends after delivering its transcript', async () => {
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => { microphones[0].text('A complete spoken question'); microphones[0].end() })
  await waitFor(() => expect(playback).toHaveLength(1))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(playback[0].text).toBe(lesson.explanation)
  expect(localStorage.getItem('visual-canvas/v1')).toContain('A complete spoken question')
})

it('ignores queued playback completion and error after stopping manual playback', async () => {
  localStorage.setItem('visual-canvas/v1', JSON.stringify([{ id: 'saved', question: 'Prior question', lesson }]))
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
  fireEvent.click(screen.getByRole('button', { name: 'Stop speaking' }))
  act(() => { playback[0].end(); playback[0].fail() })
  expect(voice.stopSpeaking).toHaveBeenCalled()
  expect(screen.queryByText('Speaking…')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(microphones).toHaveLength(0)
  expect(screen.getByRole('region', { name: 'Answer canvas' })).toBeTruthy()
  await screen.findByText('Model configured')
})

it('finishes manual playback without starting the microphone', async () => {
  localStorage.setItem('visual-canvas/v1', JSON.stringify([{ id: 'saved', question: 'Prior question', lesson }]))
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
  act(() => playback[0].end())
  expect(screen.queryByText('Speaking…')).toBeNull()
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy()
  expect(microphones).toHaveLength(0)
  await screen.findByText('Model configured')
})

it('keeps a newer request alive when a cancelled request has a queued timeout callback', async () => {
  const actualTimeout = window.setTimeout.bind(window)
  const queued: (() => void)[] = []
  vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 70000 && typeof handler === 'function') queued.push(handler as () => void)
    return actualTimeout(handler, delay, ...args)
  }) as typeof window.setTimeout)
  const pending: { finish: (response: Response) => void; signal: AbortSignal }[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    if (String(url).endsWith('health')) return Response.json({ modelConfigured: true })
    return new Promise<Response>(finish => pending.push({ finish, signal: options!.signal as AbortSignal }))
  }))
  render(<Canvas />)
  const input = screen.getByLabelText('Your question')
  fireEvent.change(input, { target: { value: 'First request' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  fireEvent.click(screen.getByRole('button', { name: 'Stop answer' }))
  fireEvent.change(input, { target: { value: 'Second request' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  act(() => queued[0]())
  expect(pending[0].signal.aborted).toBe(true)
  expect(pending[1].signal.aborted).toBe(false)
  expect(screen.getByText('Working on your question…')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { pending[0].finish(Response.json({ lesson })); pending[1].finish(Response.json({ lesson })) })
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)).toHaveLength(1)
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)[0].question).toBe('Second request')
})
