// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Canvas } from '../src/Canvas'

const lesson = { title: 'Energy transfer', explanation: 'Energy moves between stores.', blocks: [{ kind: 'steps', title: 'Observe', items: ['Lift the object.', 'Release it.'] }], check: 'What changes as it falls?' }
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows generated content, persists it, and sends the selected lesson with a follow-up', async () => {
  const send = vi.fn<typeof fetch>().mockImplementation(async (url) => Response.json(String(url).endsWith('health') ? { modelConfigured: true } : { lesson }))
  vi.stubGlobal('fetch', send)
  const view = render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain energy transfer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Teach me ↗' }))
  await screen.findByRole('heading', { name: 'Energy transfer', level: 1 })
  expect(screen.getByText('Release it.')).toBeTruthy()
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)[0].question).toBe('Explain energy transfer')
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why?' } })
  fireEvent.click(screen.getByRole('button', { name: 'Teach me ↗' }))
  await waitFor(() => expect(send).toHaveBeenCalledTimes(3))
  expect(JSON.parse(send.mock.calls[2][1]!.body as string).previous).toEqual(lesson)
  await waitFor(() => expect(screen.getByLabelText('Your question').getAttribute('disabled')).toBeNull())
  view.unmount(); render(<Canvas />)
  await screen.findByRole('heading', { name: 'Energy transfer', level: 1 })
})
it('keeps the question on failure and never substitutes a stored example', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: false }) : Response.json({ error: 'Connect a model.' }, { status: 503 })))
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain waves' } })
  fireEvent.click(screen.getByRole('button', { name: 'Teach me ↗' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Connect a model.')
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Explain waves')
  expect(localStorage.getItem('visual-canvas/v1')).toBeNull()
})
