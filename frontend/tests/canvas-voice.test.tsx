// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Canvas } from '../src/Canvas'
import type { SpeechRecognitionLike } from '../src/voice'

const answer = { explanation: 'A natural spoken answer.', blocks: [] }
let microphones: SpeechRecognitionLike[], utterances: { text: string; onend: (() => void) | null; onerror: (() => void) | null }[]
beforeEach(() => {
  localStorage.clear(); microphones = []; utterances = []
  class Recognition {
    lang = ''; interimResults = false; continuous = false
    onresult: SpeechRecognitionLike['onresult'] = null; onerror: SpeechRecognitionLike['onerror'] = null; onend: SpeechRecognitionLike['onend'] = null
    start() {} stop() {} constructor() { microphones.push(this) }
  }
  class Utterance { onend = null; onerror = null; constructor(public text: string) {} }
  vi.stubGlobal('SpeechRecognition', Recognition)
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: (utterance: typeof utterances[number]) => utterances.push(utterance) })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function transport() {
  const send = vi.fn<typeof fetch>().mockImplementation(async url => Response.json(String(url).endsWith('health') ? { modelConfigured: true } : { lesson: answer }))
  vi.stubGlobal('fetch', send); return send
}
it('runs two spoken turns using the latest answer as follow-up context', async () => {
  const send = transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'First voice question' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  expect(utterances[0].text).toBe(answer.explanation)
  act(() => utterances[0].onend!())
  expect(microphones).toHaveLength(2)
  act(() => microphones[1].onresult!({ results: [[{ transcript: 'And why?' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(2))
  const calls = send.mock.calls.filter(([url]) => url === '/api/lesson')
  expect(JSON.parse(calls[1][1]!.body as string).memory).toEqual([{ question: 'First voice question', lesson: answer }])
  fireEvent.click(screen.getByRole('button', { name: 'End voice' }))
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  expect(screen.queryByText('Listening… pause when you finish.')).toBeNull()
})
it('handles synchronous microphone denial without being stuck listening', () => {
  transport()
  vi.stubGlobal('SpeechRecognition', class { constructor() { throw new Error('Permission denied') } })
  render(<Canvas />); fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  expect(screen.getByRole('alert').textContent).toContain('Microphone input failed')
  expect(screen.queryByText('Listening… pause when you finish.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
})
it('interrupts pending generation and ignores its late answer', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: true }) : new Promise<Response>(resolve => { finish = resolve })))
  render(<Canvas />); fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Wait for an answer' }]] }))
  fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }))
  await act(async () => { finish(Response.json({ lesson: answer })) })
  expect(utterances).toHaveLength(0)
  expect(localStorage.getItem('visual-canvas/v1')).toBeNull()
  expect(screen.getByText('Listening… pause when you finish.')).toBeTruthy()
})
it('prevents manual playback from cancelling an active voice request', () => {
  localStorage.setItem('visual-canvas/v1', JSON.stringify([{ id: 'saved', question: 'Earlier', lesson: answer }]))
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: true }) : new Promise<Response>(() => {})))
  render(<Canvas />); fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Follow-up' }]] }))
  expect((screen.getByRole('button', { name: 'Read aloud' }) as HTMLButtonElement).disabled).toBe(true)
})
