// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Canvas } from '../src/Canvas'

const lesson = { title: 'Prior lesson', explanation: 'An earlier answer.', blocks: [] }
beforeEach(() => {
  localStorage.setItem('visual-canvas/v1', JSON.stringify([{ id: 'old', question: 'Unrelated topic', lesson }]))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
function transport() {
  const send = vi.fn<typeof fetch>().mockImplementation(async url => Response.json(String(url).endsWith('health') ? { modelConfigured: true } : { lesson }))
  vi.stubGlobal('fetch', send)
  return send
}
async function ask(send: ReturnType<typeof transport>) {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'A fresh question' } })
  fireEvent.submit(screen.getByLabelText('Your question').closest('form')!)
  await waitFor(() => expect(send.mock.calls.some(([url]) => url === '/api/lesson')).toBe(true))
  return JSON.parse(send.mock.calls.find(([url]) => url === '/api/lesson')![1]!.body as string)
}
it('New topic sends no previous topic in memory', async () => {
  const send = transport()
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: /New topic/ }))
  const body = await ask(send)
  expect(body.memory).toEqual([])
  expect(body.previous).toBeUndefined()
})
it('turning context off removes it from the request entirely', async () => {
  const send = transport()
  render(<Canvas />)
  fireEvent.click(screen.getByLabelText('Keep conversation context'))
  const body = await ask(send)
  expect(body.memory).toEqual([])
  expect(body.previous).toBeUndefined()
})
it('unmount aborts the outstanding request and discards its late response', async () => {
  let finish!: (response: Response) => void
  let signal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    if (String(url).endsWith('health')) return Response.json({ modelConfigured: true })
    signal = options?.signal
    return new Promise<Response>(resolve => { finish = resolve })
  }))
  const view = render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Slow request' } })
  fireEvent.submit(screen.getByLabelText('Your question').closest('form')!)
  view.unmount()
  expect(signal?.aborted).toBe(true)
  finish(Response.json({ lesson }))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)).toHaveLength(1)
})
it('keeps a new draft typed while a previous answer is arriving', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: true }) : new Promise<Response>(resolve => { finish = resolve })))
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'First question' } })
  fireEvent.submit(screen.getByLabelText('Your question').closest('form')!)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'My next thought' } })
  finish(Response.json({ lesson }))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)).toHaveLength(2))
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('My next thought')
})
it('does not overwrite saved work with an answer cancelled by New topic', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: true }) : new Promise<Response>(resolve => { finish = resolve })))
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Old request' } })
  fireEvent.submit(screen.getByLabelText('Your question').closest('form')!)
  fireEvent.click(screen.getByRole('button', { name: /New topic/ }))
  finish(Response.json({ lesson }))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(screen.getByRole('region', { name: 'Blank canvas' }).textContent).toBe('')
  expect(screen.queryByRole('region', { name: 'Answer canvas' })).toBeNull()
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('')
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)).toHaveLength(1)
})
it('bounds UTF-8 context while retaining the latest text from an oversized visual', async () => {
  const oversized = { explanation: 'Remember this explanation.', blocks: [{ kind: 'scene', title: 'A large drawing', elements: Array.from({ length: 100 }, (_, i) => ({ type: 'text', x: i, y: i, label: '界'.repeat(1000) })) }] }
  localStorage.setItem('visual-canvas/v1', JSON.stringify([{ id: 'old', question: 'Describe this drawing', lesson: oversized }]))
  const send = transport(); render(<Canvas />)
  const body = await ask(send)
  expect(new TextEncoder().encode(JSON.stringify(body)).byteLength).toBeLessThanOrEqual(64000)
  expect(body.memory).toHaveLength(1)
  expect(body.memory[0].lesson.explanation).toBe('Remember this explanation.')
  expect(body.memory[0].lesson.blocks).toEqual([])
})
