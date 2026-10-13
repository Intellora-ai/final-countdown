// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Canvas } from '../src/Canvas'
import type { SpeechRecognitionLike } from '../src/voice'
import { learnerKey } from '../src/learner'

const answer = { explanation: 'A natural spoken answer.', blocks: [] }
let microphones: SpeechRecognitionLike[], utterances: { text: string; onend: (() => void) | null; onerror: (() => void) | null }[]
beforeEach(() => {
  localStorage.clear(); microphones = []; utterances = []
  class Recognition {
    lang = ''; interimResults = false; continuous = false
    onresult: SpeechRecognitionLike['onresult'] = null; onerror: SpeechRecognitionLike['onerror'] = null; onend: SpeechRecognitionLike['onend'] = null
    start = vi.fn(); stop = vi.fn(); constructor() { microphones.push(this) }
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

it('waits for attached material before allowing a spoken turn', async () => {
  const send = transport()
  let finishReading!: (bytes: ArrayBuffer) => void
  const file = new File(['lesson notes'], 'notes.txt', { type: 'text/plain' })
  Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { finishReading = resolve }) })
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [file] } })
  expect(screen.getByText('Reading files locally…')).toBeTruthy()
  expect((screen.getByLabelText('Attach files or photos') as HTMLInputElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Ask about these notes' } })
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Start voice' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  expect(microphones).toHaveLength(0)
  await act(async () => { finishReading(new TextEncoder().encode('Use these attached lesson notes.').buffer) })
  expect((screen.getByRole('button', { name: 'Start voice' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Explain my notes' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  const request = send.mock.calls.find(([url]) => url === '/api/lesson')!
  expect(JSON.parse(request[1]!.body as string).attachments).toEqual([{ name: 'notes.txt', text: 'Use these attached lesson notes.' }])
})

it('pauses a live microphone when the learner attaches material and rejects its late transcript', async () => {
  const send = transport()
  let finishReading!: (bytes: ArrayBuffer) => void
  const file = new File(['notes'], 'notes.txt', { type: 'text/plain' })
  Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { finishReading = resolve }) })
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  const lateResult = microphones[0].onresult!
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [file] } })
  expect(screen.queryByText('Listening… pause when you finish.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  act(() => lateResult({ results: [[{ transcript: 'A stale spoken question' }]] }))
  expect(send.mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('')
  await act(async () => { finishReading(new TextEncoder().encode('Ready notes.').buffer) })
  expect((screen.getByRole('button', { name: 'Start voice' }) as HTMLButtonElement).disabled).toBe(false)
})

it('ends voice while an answer is pending, aborts its request, and leaves no late audio or saved answer', async () => {
  let finish!: (response: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    if (String(url).endsWith('health')) return Response.json({ modelConfigured: true })
    signal = options!.signal as AbortSignal
    return new Promise<Response>(resolve => { finish = resolve })
  }))
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'A pending voice turn' }]] }))
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByLabelText('Attach files or photos') as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'End voice' }))
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(Response.json({ lesson: answer })) })
  expect(utterances).toHaveLength(0)
  expect(localStorage.getItem('visual-canvas/v1')).toBeNull()
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  expect(screen.queryByText('Working on your question…')).toBeNull()
})
it('interrupts spoken playback immediately and never restarts listening from its obsolete completion', async () => {
  transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Explain this' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  const lateEnd = utterances[0].onend!, lateError = utterances[0].onerror!
  const synthesis = window.speechSynthesis as unknown as { cancel: ReturnType<typeof vi.fn> }
  const cancelledBefore = synthesis.cancel.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }))
  expect(synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelledBefore)
  expect(microphones).toHaveLength(2)
  act(() => { lateEnd(); lateError() })
  expect(microphones).toHaveLength(2)
  expect(screen.getByText('Listening… pause when you finish.')).toBeTruthy()
  expect(screen.queryByText('Speaking…')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})
it('ends a silent microphone session visibly and allows a typed question afterwards', async () => {
  const send = transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onend!())
  expect(screen.getByRole('alert').textContent).toContain('No speech was received')
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  expect(send.mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'My typed recovery question' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByRole('region', { name: 'Answer canvas' })
  expect(utterances).toHaveLength(0)
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)[0].question).toBe('My typed recovery question')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('ends voice on playback failure while keeping the generated answer readable', async () => {
  transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'A spoken question' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  const lateEnd = utterances[0].onend!
  act(() => utterances[0].onerror!())
  expect(screen.getByRole('alert').textContent).toContain('Audio playback failed')
  expect(screen.getByRole('region', { name: 'Answer canvas' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  act(() => lateEnd())
  expect(microphones).toHaveLength(1)
  expect(screen.queryByText('Speaking…')).toBeNull()
})
it.each([
  ['provider outage', 503, { error: 'Teaching provider is temporarily unavailable.' }],
  ['invalid answer', 200, { lesson: { explanation: null, blocks: [] } }],
  ['quota exhausted', 429, { error: 'Your daily teaching budget is exhausted.' }],
])('keeps a voice question for typed recovery after %s', async (_name, status, body) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health')
    ? Response.json({ modelConfigured: true }) : Response.json(body, { status })))
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Please explain my question' }]] }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  expect(screen.queryByText('Working on your question…')).toBeNull()
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Please explain my question')
  expect(utterances).toHaveLength(0)
  expect(localStorage.getItem('visual-canvas/v1')).toBeNull()
})
it('unmounting stops the microphone and rejects callbacks retained by the browser', () => {
  const send = transport(), view = render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  const lateResult = microphones[0].onresult!, lateError = microphones[0].onerror!, lateEnd = microphones[0].onend!
  view.unmount()
  expect(microphones[0].stop).toHaveBeenCalledOnce()
  act(() => { lateResult({ results: [[{ transcript: 'Obsolete question' }]] }); lateError(); lateEnd() })
  expect(send.mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
  expect(utterances).toHaveLength(0)
})

it.each([
  [true, 'Model configured'],
  [false, 'Model not configured'],
  ['true', 'Model not configured'],
  [null, 'Model not configured'],
])('reports the actual server model configuration for health value %s', async (configured, label) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ modelConfigured: configured })))
  render(<Canvas />)
  await screen.findByText(label)
  expect(screen.queryByText('Checking connection…')).toBeNull()
  expect(Boolean(screen.queryByText(/Teaching isn’t connected yet/))).toBe(configured !== true)
})

it('waits for a spoken answer to finish updating learning before export, restore, or memory edits', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health')
    ? Response.json({ modelConfigured: true }) : new Promise<Response>(resolve => { finish = resolve })))
  render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Saved lessons' }))
  fireEvent.click(screen.getByText('Learning memory', { selector: 'summary' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Remember this explanation' }]] }))
  for (const element of [
    screen.getByText('Export learning'),
    screen.getByLabelText('Restore learning'),
    screen.getByLabelText('Learning memory'),
    screen.getByText('Erase memory'),
    screen.getByLabelText('Use and update memory'),
  ]) expect((element as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { finish(Response.json({ lesson: answer })) })
  for (const element of [screen.getByText('Export learning'), screen.getByLabelText('Restore learning')])
    expect((element as HTMLButtonElement).disabled).toBe(false)
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)[0].question).toBe('Remember this explanation')
})

it('offers Stop answer for a typed pending request and discards the cancelled reply', async () => {
  let finish!: (response: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    if (String(url).endsWith('health')) return Response.json({ modelConfigured: true })
    signal = options!.signal as AbortSignal
    return new Promise<Response>(resolve => { finish = resolve })
  }))
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'A typed question waiting on the provider' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Stop answer' }))
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(Response.json({ lesson: answer })) })
  expect(localStorage.getItem('visual-canvas/v1')).toBeNull()
  expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('A typed question waiting on the provider')
})
it('restores a valid learning backup and uses the restored conversation for a spoken follow-up', async () => {
  const restored = { explanation: 'Remember the restored explanation.', blocks: [] }
  const file = new File([], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify({ learner: 'Prefers geometric examples.', entries: [
    { id: 'restored', question: 'The saved topic', lesson: restored },
  ] }) })
  const send = transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Saved lessons' }))
  fireEvent.change(screen.getByLabelText('Restore learning'), { target: { files: [file] } })
  await screen.findByRole('region', { name: 'Answer canvas' })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(localStorage.getItem(learnerKey)).toBe('Prefers geometric examples.')
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Explain the saved idea further' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  const request = send.mock.calls.find(([url]) => url === '/api/lesson')!
  expect(JSON.parse(request[1]!.body as string).memory).toEqual([{ question: 'The saved topic', lesson: restored }])
  expect(JSON.parse(request[1]!.body as string).learner).toBe('Prefers geometric examples.')
})
it('keeps only the selected conversation ancestors when older saved topics and branches exist', async () => {
  const rootAnswer = { explanation: 'The root topic.', blocks: [] }
  const branchAnswer = { explanation: 'The selected branch.', blocks: [] }
  const unrelatedAnswer = { explanation: 'An unrelated topic.', blocks: [] }
  localStorage.setItem('visual-canvas/v1', JSON.stringify([
    { id: 'unrelated', question: 'Unrelated question', lesson: unrelatedAnswer },
    { id: 'root', question: 'Root question', lesson: rootAnswer },
    { id: 'other-branch', parentId: 'root', question: 'A sibling question', lesson: unrelatedAnswer },
    { id: 'branch', parentId: 'root', question: 'Selected branch question', lesson: branchAnswer },
  ]))
  const send = transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Continue our discussion' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  const request = send.mock.calls.find(([url]) => url === '/api/lesson')!
  expect(JSON.parse(request[1]!.body as string).memory).toEqual([
    { question: 'Root question', lesson: rootAnswer },
    { question: 'Selected branch question', lesson: branchAnswer },
  ])
})

it('rejects an oversized backup before reading it and preserves the learner’s current saved work', async () => {
  localStorage.setItem('visual-canvas/v1', JSON.stringify([{ id: 'prior', question: 'Current lesson', lesson: answer }]))
  localStorage.setItem(learnerKey, 'Current learning preferences.')
  const file = new File(['x'.repeat(20 * 1024 * 1024 + 1)], 'oversized-backup.json', { type: 'application/json' })
  const read = vi.fn(async () => JSON.stringify({ learner: 'Unwanted replacement.', entries: [] }))
  Object.defineProperty(file, 'text', { value: read })
  transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Saved lessons' }))
  fireEvent.change(screen.getByLabelText('Restore learning'), { target: { files: [file] } })
  expect((await screen.findByRole('alert')).textContent).toContain('Could not restore the learning backup')
  expect(read).not.toHaveBeenCalled()
  expect(screen.getByRole('region', { name: 'Answer canvas' })).toBeTruthy()
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)[0].question).toBe('Current lesson')
  expect(localStorage.getItem(learnerKey)).toBe('Current learning preferences.')
})

it('removes only the chosen attachment and sends the remaining material with the spoken turn', async () => {
  const files = ['remove.txt', 'keep.txt'].map(name => {
    const file = new File([name], name, { type: 'text/plain' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(`Read ${name} material.`).buffer })
    return file
  })
  const send = transport(); render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files } })
  fireEvent.click(await screen.findByRole('button', { name: 'Remove remove.txt' }))
  expect(screen.queryByRole('button', { name: 'Remove remove.txt' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Remove keep.txt' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'Explain the attached material' }]] }))
  await waitFor(() => expect(utterances).toHaveLength(1))
  const request = send.mock.calls.find(([url]) => url === '/api/lesson')!
  expect(JSON.parse(request[1]!.body as string).attachments).toEqual([{ name: 'keep.txt', text: 'Read keep.txt material.' }])
})
it('ends an overlong spoken turn with a useful error instead of leaving voice mode stalled', () => {
  const send = transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
  act(() => microphones[0].onresult!({ results: [[{ transcript: 'q'.repeat(1001) }]] }))
  expect(screen.getByRole('alert').textContent).toContain('Please ask a shorter question')
  expect(screen.getByRole('button', { name: 'Start voice' })).toBeTruthy()
  expect(screen.queryByText('Listening… pause when you finish.')).toBeNull()
  expect(send.mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
})
it.each([
  ['SVG board', { kind: 'svg', title: 'Generated artwork', source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><circle cx="100" cy="65" r="20"/><text x="10" y="30">An illustration label</text></svg>' }],
  ['diagram', { kind: 'diagram', title: 'Generated relationship', nodes: [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Finish' }], edges: [{ from: 'a', to: 'b' }] }],
])('keeps the complete written explanation once alongside a generated %s', async (_name, block) => {
  const lesson = { explanation: 'The complete explanation remains readable alongside the artwork. Every sentence belongs on the board.', blocks: [block] }
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => Response.json(String(url).endsWith('health') ? { modelConfigured: true } : { lesson })))
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Explain this visually' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  const illustration = await screen.findByRole('img', { name: block.title })
  const writing = screen.getAllByRole('img', { name: 'Written answer' })
  expect(writing).toHaveLength(1)
  expect(writing[0].textContent?.replace(/\s/g, '')).toBe(lesson.explanation.replace(/\s/g, ''))
  if (block.kind === 'svg') {
    const source = decodeURIComponent(illustration.getAttribute('src')!)
    expect(source).toContain('An illustration label')
    expect(source).toContain('cx="100" cy="65" r="20"')
  } else {
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy()
  }
  expect(JSON.parse(localStorage.getItem('visual-canvas/v1')!)[0].lesson.blocks).toEqual(lesson.blocks)
  expect(screen.queryByRole('alert')).toBeNull()
})
