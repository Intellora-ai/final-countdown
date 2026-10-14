// @vitest-environment jsdom
import React from 'react'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Canvas } from '../src/Canvas'
import { learnerKey } from '../src/learner'

const historyKey = 'visual-canvas/v1'
const answer = { title: 'Recovered lesson', explanation: 'An explanation worth keeping.', blocks: [], check: 'Can you explain the idea?' }
const saved = (id = 'old') => ({ id, question: `Question ${id}`, lesson: { ...answer, title: `Lesson ${id}` } })

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

function transport(reply: unknown = { lesson: answer }) {
  const send = vi.fn<typeof fetch>().mockImplementation(async url => Response.json(String(url).endsWith('health') ? { modelConfigured: true } : reply))
  vi.stubGlobal('fetch', send)
  return send
}
function ask(question = 'Explain this idea') {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: question } })
  fireEvent.submit(screen.getByLabelText('Your question').closest('form')!)
}
function settings() {
  fireEvent.click(screen.getByRole('button', { name: 'Saved lessons' }))
  fireEvent.click(screen.getByText('Learning memory', { selector: 'summary' }))
}
function backup(content: unknown) {
  const file = new File([], 'learning.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => typeof content === 'string' ? content : JSON.stringify(content) })
  return file
}
function textFile(name: string, content: string) {
  const file = new File([content], name, { type: 'text/plain' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(content).buffer, configurable: true })
  return file
}
function requestBody(send: ReturnType<typeof transport>, index = 0) {
  return JSON.parse(send.mock.calls.filter(([url]) => url === '/api/lesson')[index][1]!.body as string)
}
function expectBlankBoard() {
  const board = screen.getByRole('region', { name: 'Blank canvas' })
  expect(board.childElementCount).toBe(0)
  expect(board.textContent).toBe('')
  expect(screen.queryByRole('region', { name: 'Answer canvas' })).toBeNull()
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).disabled).toBe(false)
}

it('opens a selected history entry, focuses its composer, and starts a separate topic with no ancestors', async () => {
  const first = saved('first'), second = saved('second')
  localStorage.setItem(historyKey, JSON.stringify([first, second]))
  const send = transport(); render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Discard this draft when changing lessons' } })
  settings()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Saved lessons' })).getByRole('button', { name: 'Lesson first' }))
  expect(screen.getByRole('heading', { name: 'Lesson first', level: 1 })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Saved lessons' }).getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(screen.getByLabelText('Your question'))
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('')
  fireEvent.click(screen.getByLabelText('Keep conversation context'))
  fireEvent.click(screen.getByRole('button', { name: 'Try it below ↓' }))
  expect((screen.getByLabelText('Keep conversation context') as HTMLInputElement).checked).toBe(true)
  ask('Continue first')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).memory).toEqual([{ question: first.question, lesson: first.lesson }])
  expect(JSON.parse(localStorage.getItem(historyKey)!).at(-1).parentId).toBe('first')
  fireEvent.click(screen.getByRole('button', { name: '+ New topic' }))
  expectBlankBoard()
  expect(document.activeElement).toBe(screen.getByLabelText('Your question'))
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByLabelText('Keep conversation context')).toBeNull()
  ask('A new subject')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send, 1).memory).toEqual([])
  expect(JSON.parse(localStorage.getItem(historyKey)!).at(-1).parentId).toBeUndefined()
})

it('honors an unchecked conversation-context control without attaching a parent', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  const send = transport(); render(<Canvas />)
  fireEvent.click(screen.getByLabelText('Keep conversation context'))
  ask()
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).memory).toEqual([])
  expect(JSON.parse(localStorage.getItem(historyKey)!).at(-1).parentId).toBeUndefined()
})

it.each([
  {
    collision: 'the question but not the explanation',
    older: { question: 'Describe the mechanism.', explanation: 'The mechanism follows a reversible step.' },
    selected: { question: 'Describe the mechanism.', explanation: 'The mechanism responds to a different constraint.' },
  },
  {
    collision: 'the explanation but not the question',
    older: { question: 'Describe the mechanism in the first setting.', explanation: 'The mechanism preserves the same relationship.' },
    selected: { question: 'Describe the mechanism in the second setting.', explanation: 'The mechanism preserves the same relationship.' },
  },
])('retains independent recalled learning when boards share only $collision', async ({ older, selected }) => {
  const olderLesson = { explanation: older.explanation, blocks: [] }
  const selectedLesson = { explanation: selected.explanation, blocks: [] }
  localStorage.setItem(historyKey, JSON.stringify([
    { id: 'older-independent-board', question: older.question, lesson: olderLesson },
    { id: 'selected-independent-board', question: selected.question, lesson: selectedLesson },
  ]))
  const send = transport(); render(<Canvas />)
  ask('Continue the mechanism explanation.')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  const body = requestBody(send)
  expect(body.memory).toEqual([{ question: selected.question, lesson: selectedLesson }])
  expect(body.recall).toBe(`Earlier question: ${older.question}\nAnswer: ${older.explanation}`)
  expect(JSON.parse(localStorage.getItem(historyKey)!).at(-1).parentId).toBe('selected-independent-board')
})

it('rejects corrupt browser history and opens an empty board', async () => {
  localStorage.setItem(historyKey, '{broken JSON')
  transport(); render(<Canvas />); settings()
  expect(screen.getByText('No lessons yet.')).toBeTruthy()
  expectBlankBoard()
  await screen.findByText('Model configured')
})

it('still boots and allows a session when browser storage cannot be read', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
  const send = transport(); render(<Canvas />); settings()
  expect((screen.getByLabelText('Use and update memory') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Learning memory') as HTMLTextAreaElement).value).toBe('')
  ask()
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).learner).toBe('')
})

it('edits, erases and persists the memory preference, then omits disabled memory from a request', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  localStorage.setItem(learnerKey, 'Old preference')
  const send = transport({ lesson: { ...answer, learner: 'Provider replacement' } }); render(<Canvas />); settings()
  fireEvent.change(screen.getByLabelText('Learning memory'), { target: { value: 'Prefer worked examples' } })
  expect(localStorage.getItem(learnerKey)).toBe('Prefer worked examples')
  fireEvent.click(screen.getByRole('button', { name: 'Erase memory' }))
  expect(localStorage.getItem(learnerKey)).toBe('')
  fireEvent.change(screen.getByLabelText('Learning memory'), { target: { value: 'Private preference' } })
  fireEvent.click(screen.getByLabelText('Use and update memory'))
  expect(localStorage.getItem(learnerKey + '/enabled')).toBe('false')
  ask('Question old')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send)).toMatchObject({ remember: false, learner: '', recall: '' })
  expect(localStorage.getItem(learnerKey)).toBe('Private preference')
})

it('starts with a previously disabled memory preference and persists re-enabling it', async () => {
  localStorage.setItem(learnerKey + '/enabled', 'false')
  transport(); render(<Canvas />); settings()
  expect((screen.getByLabelText('Use and update memory') as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByLabelText('Use and update memory'))
  expect(localStorage.getItem(learnerKey + '/enabled')).toBe('true')
  await screen.findByText('Model configured')
})

it('replaces learning notes with the provider update when remembering is enabled', async () => {
  localStorage.setItem(learnerKey, 'Original preference')
  const send = transport({ lesson: { ...answer, learner: 'Prefers visual worked examples.' } }); render(<Canvas />)
  ask()
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).learner).toBe('Original preference')
  expect(localStorage.getItem(learnerKey)).toBe('Prefers visual worked examples.')
  settings()
  expect((screen.getByLabelText('Learning memory') as HTMLTextAreaElement).value).toBe('Prefers visual worked examples.')
})

it('keeps editable memory in this session and explains failed preference and note saves', async () => {
  transport(); render(<Canvas />); settings()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  fireEvent.change(screen.getByLabelText('Learning memory'), { target: { value: 'Session-only notes' } })
  expect(screen.getByRole('alert').textContent).toBe('Learning memory could not be saved in this browser.')
  expect((screen.getByLabelText('Learning memory') as HTMLTextAreaElement).value).toBe('Session-only notes')
  fireEvent.click(screen.getByLabelText('Use and update memory'))
  expect(screen.getByRole('alert').textContent).toBe('Memory preference could not be saved.')
  expect((screen.getByLabelText('Use and update memory') as HTMLInputElement).checked).toBe(false)
  await screen.findByText('Model configured')
})

it('displays an unsaved answer after storage failure and clears the warning once persistence recovers', async () => {
  transport(); render(<Canvas />)
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
  ask()
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(screen.getByRole('alert').textContent).toContain('This answer will be lost when this tab closes')
  expect(localStorage.getItem(historyKey)).toBeNull()
  write.mockRestore()
  ask('Save another answer')
  await waitFor(() => expect(localStorage.getItem(historyKey)).not.toBeNull())
  expect(JSON.parse(localStorage.getItem(historyKey)!)).toHaveLength(2)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('exports the current learner and complete history as JSON and releases the download URL', async () => {
  vi.useFakeTimers()
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  localStorage.setItem(learnerKey, 'Remember concrete examples')
  let exported!: Blob
  const create = vi.fn((blob: Blob) => { exported = blob; return 'blob:learning-backup' }), revoke = vi.fn()
  const NativeURL = URL
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = create; static revokeObjectURL = revoke })
  vi.stubGlobal('Blob', NodeBlob)
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  transport(); render(<Canvas />); settings()
  fireEvent.click(screen.getByRole('button', { name: 'Export learning' }))
  expect(JSON.parse(await exported.text())).toEqual({ learner: 'Remember concrete examples', entries: [saved()] })
  expect(exported.type).toBe('application/json')
  const link = download.mock.instances[0] as HTMLAnchorElement
  expect(link.download).toBe('blackboard-learning.json')
  expect(link.href).toBe('blob:learning-backup')
  expect(revoke).not.toHaveBeenCalled()
  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:learning-backup')
})

it('restores an empty backup into a blank board and treats an empty file selection as a no-op', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  transport(); render(<Canvas />); settings()
  fireEvent.change(screen.getByLabelText('Restore learning'), { target: { files: [] } })
  expect(screen.getByRole('heading', { name: 'Lesson old', level: 1 })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Restore learning'), { target: { files: [backup({ learner: 'New goals', entries: [] })] } })
  await screen.findByRole('region', { name: 'Blank canvas' })
  expectBlankBoard()
  expect(localStorage.getItem(historyKey)).toBe('[]')
  expect(localStorage.getItem(learnerKey)).toBe('New goals')
  expect(screen.getByText('No lessons yet.')).toBeTruthy()
  expect(screen.queryByLabelText('Keep conversation context')).toBeNull()
})

it.each([
  ['invalid JSON', '{this is not JSON'],
  ['invalid schema', { learner: 100, entries: [] }],
  ['invalid lesson', { learner: '', entries: [{ id: 'bad', question: 'Bad saved entry', lesson: { explanation: null } }] }],
])('preserves current lessons and notes when a backup has %s', async (_reason, content) => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  localStorage.setItem(learnerKey, 'Keep these notes')
  transport(); render(<Canvas />); settings()
  fireEvent.change(screen.getByLabelText('Restore learning'), { target: { files: [backup(content)] } })
  expect((await screen.findByRole('alert')).textContent).toContain('Could not restore the learning backup')
  expect(screen.getByRole('heading', { name: 'Lesson old', level: 1 })).toBeTruthy()
  expect(JSON.parse(localStorage.getItem(historyKey)!)).toEqual([saved()])
  expect(localStorage.getItem(learnerKey)).toBe('Keep these notes')
})

it('reports a backup storage failure without repainting the current lesson', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  transport(); render(<Canvas />); settings()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Browser storage unavailable') })
  fireEvent.change(screen.getByLabelText('Restore learning'), { target: { files: [backup({ learner: '', entries: [] })] } })
  expect((await screen.findByRole('alert')).textContent).toContain('check available browser storage')
  expect(screen.getByRole('heading', { name: 'Lesson old', level: 1 })).toBeTruthy()
})

it('erases all learning and attached material while cancelling a pending answer', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  localStorage.setItem(learnerKey, 'Earlier learning')
  let finish!: (response: Response) => void, signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (String(url).endsWith('health')) return Response.json({ modelConfigured: true })
    signal = init!.signal as AbortSignal
    return new Promise<Response>(resolve => { finish = resolve })
  }))
  render(<Canvas />); settings()
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [textFile('old.txt', 'Old attached lesson')] } })
  await screen.findByRole('button', { name: 'Remove old.txt' })
  ask()
  fireEvent.click(screen.getByRole('button', { name: 'Erase all learning' }))
  expect(signal.aborted).toBe(true)
  expect(screen.getByText('No lessons yet.')).toBeTruthy()
  expectBlankBoard()
  expect(screen.queryByRole('button', { name: 'Remove old.txt' })).toBeNull()
  expect(localStorage.getItem(historyKey)).toBeNull()
  expect(localStorage.getItem(learnerKey)).toBe('')
  await act(async () => { finish(Response.json({ lesson: answer })) })
  expect(localStorage.getItem(historyKey)).toBeNull()
  expect(screen.queryByRole('region', { name: 'Answer canvas' })).toBeNull()
})

it('clears the visible board and explains when saved lessons cannot be erased from storage', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  transport(); render(<Canvas />); settings()
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked') })
  fireEvent.click(screen.getByRole('button', { name: 'Erase all learning' }))
  expect(screen.getByRole('alert').textContent).toBe('Could not erase saved lessons.')
  expectBlankBoard()
  expect(JSON.parse(localStorage.getItem(historyKey)!)).toEqual([saved()])
  await screen.findByText('Model configured')
})

it('enforces the attachment count before reading files and preserves attachments after a failed batch', async () => {
  transport(); render(<Canvas />)
  const guidance = /Relevant excerpts are sent with your question\. Photos need a vision-capable model\./
  expect(screen.queryByText(guidance)).toBeNull()
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: null } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [textFile('first.txt', 'Useful original material')] } })
  await screen.findByRole('button', { name: 'Remove first.txt' })
  expect(screen.getByText(guidance)).toBeTruthy()
  const additional = ['a.txt', 'b.txt', 'c.txt'].map(name => textFile(name, 'Additional text'))
  const reads = additional.map(file => vi.spyOn(file, 'arrayBuffer'))
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: additional } })
  expect(screen.getByRole('alert').textContent).toBe('Attach up to three files at once.')
  reads.forEach(read => expect(read).not.toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [textFile('blank.txt', '   ')] } })
  expect((await screen.findByRole('alert')).textContent).toContain('No readable text found')
  expect(screen.getByRole('button', { name: 'Remove first.txt' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Remove blank.txt' })).toBeNull()
  expect(screen.queryByText('Reading files locally…')).toBeNull()
  expect((screen.getByLabelText('Attach files or photos') as HTMLInputElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Remove first.txt' }))
  expect(screen.queryByText(guidance)).toBeNull()
})

it('recovers after an opaque attachment read failure and does not send a question before reading finishes', async () => {
  const send = transport(); render(<Canvas />)
  let fail!: (reason: unknown) => void
  const file = textFile('unreadable.txt', 'Anything')
  Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((_resolve, reject) => { fail = reject }), configurable: true })
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [file] } })
  ask('Wait for the document')
  expect(send.mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
  expect(screen.getByText('Reading files locally…')).toBeTruthy()
  await act(async () => { fail('Opaque browser failure') })
  expect(screen.getByRole('alert').textContent).toBe('The file could not be read.')
  expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).attachments).toEqual([])
})

it('sends a processed image together with relevant text excerpts', async () => {
  const send = transport()
  const image = 'data:image/jpeg;base64,QUJD'
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(image)
  render(<Canvas />)
  fireEvent.change(screen.getByLabelText('Attach files or photos'), { target: { files: [new File(['pixels'], 'diagram.png', { type: 'image/png' }), textFile('notes.txt', 'Evidence about energy transfer.')] } })
  await screen.findByRole('button', { name: 'Remove diagram.png' })
  expect(close).toHaveBeenCalledOnce()
  ask('Explain energy transfer')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).attachments).toEqual([{ name: 'diagram.png', image }, { name: 'notes.txt', text: 'Evidence about energy transfer.' }])
})

it('keeps a newly edited draft when the preceding answer arrives', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: true }) : new Promise<Response>(resolve => { finish = resolve })))
  render(<Canvas />); ask('The submitted question')
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'My next question' } })
  await act(async () => { finish(Response.json({ lesson: answer })) })
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('My next question')
  expect(JSON.parse(localStorage.getItem(historyKey)!)[0].question).toBe('The submitted question')
})

it('rejects blank and overlong typed submissions without contacting the teaching endpoint', async () => {
  const send = transport(); render(<Canvas />)
  ask('   '); ask('x'.repeat(1001))
  expect(send.mock.calls.filter(([url]) => url === '/api/lesson')).toHaveLength(0)
  expect(screen.queryByText('Working on your question…')).toBeNull()
  expect(localStorage.getItem(historyKey)).toBeNull()
  await screen.findByText('Model configured')
})

it.each([
  ['missing provider error', () => Response.json({}, { status: 502 }), 'The answer could not be created.'],
  ['transport failure', () => Promise.reject('Opaque transport failure'), 'The answer could not be created.'],
  ['unreadable provider JSON', () => new Response('{broken JSON'), 'JSON'],
])('preserves the typed question and exits busy state after %s', async (_reason, reply, message) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('health') ? Response.json({ modelConfigured: true }) : reply()))
  render(<Canvas />); ask('Keep this question')
  expect((await screen.findByRole('alert')).textContent).toContain(message)
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Keep this question')
  expect(screen.queryByText('Working on your question…')).toBeNull()
  expect(localStorage.getItem(historyKey)).toBeNull()
})

it('times out a stalled answer, aborts its transport and ignores a late rejection', async () => {
  vi.useFakeTimers()
  let fail!: (reason: unknown) => void, signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (String(url).endsWith('health')) return Response.json({ modelConfigured: true })
    signal = init!.signal as AbortSignal
    return new Promise<Response>((_resolve, reject) => { fail = reject })
  }))
  render(<Canvas />); ask('A stalled teaching request')
  await act(async () => { vi.advanceTimersByTime(70000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('alert').textContent).toBe('The answer took too long. Please try again.')
  expect(screen.queryByText('Working on your question…')).toBeNull()
  expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('A stalled teaching request')
  await act(async () => { fail(new Error('Late provider failure')) })
  expect(screen.getByRole('alert').textContent).toBe('The answer took too long. Please try again.')
  expect(localStorage.getItem(historyKey)).toBeNull()
})

it('shows a teaching server connection failure and retains saved lessons', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 503 })))
  render(<Canvas />)
  expect((await screen.findByRole('alert')).textContent).toContain('The teaching server is unavailable')
  expect(screen.getByRole('heading', { name: 'Lesson old', level: 1 })).toBeTruthy()
})

it.each(['resolve', 'reject'])('aborts the health check and safely ignores its late %s on unmount', async outcome => {
  let finish!: (response: Response) => void, fail!: (reason: unknown) => void, signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    signal = init!.signal as AbortSignal
    return new Promise<Response>((resolve, reject) => { finish = resolve; fail = reject })
  }))
  const view = render(<Canvas />); view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => { if (outcome === 'resolve') finish(Response.json({ modelConfigured: true })); else fail(new Error('Late health failure')) })
  expect(view.container.textContent).toBe('')
})

it('offers a readable lesson when manual speech synthesis is unavailable', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
  expect(screen.getByRole('alert').textContent).toBe('Spoken answers are unavailable in this browser.')
  expect(screen.queryByText('Speaking…')).toBeNull()
  expect(screen.getByRole('region', { name: 'Answer canvas' })).toBeTruthy()
  await screen.findByText('Model configured')
})

it('stops manually spoken playback immediately without discarding its lesson', async () => {
  localStorage.setItem(historyKey, JSON.stringify([saved()]))
  class Utterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
  let spoken!: Utterance
  const cancel = vi.fn()
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  vi.stubGlobal('speechSynthesis', { cancel, speak: (utterance: Utterance) => { spoken = utterance } })
  transport(); render(<Canvas />)
  fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
  expect(spoken.text).toBe(answer.explanation + '\n' + answer.check)
  expect(screen.getByText('Speaking…')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Stop speaking' }))
  expect(cancel).toHaveBeenCalled()
  expect(screen.queryByText('Speaking…')).toBeNull()
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeTruthy()
  await screen.findByText('Model configured')
})

it('caps selected conversation ancestors at eight and terminates cyclic imported histories', async () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({ ...saved(String(i)), parentId: i ? String(i - 1) : undefined }))
  localStorage.setItem(historyKey, JSON.stringify(entries))
  const send = transport(); const view = render(<Canvas />); ask('Continue the long conversation')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).memory.map((entry: { question: string }) => entry.question)).toEqual(entries.slice(-8).map(entry => entry.question))
  view.unmount()
  localStorage.setItem(historyKey, JSON.stringify([{ ...saved('cycle'), parentId: 'cycle' }]))
  render(<Canvas />); ask('Continue the cyclic imported conversation')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send, 1).memory).toHaveLength(1)
  expect(requestBody(send, 1).memory[0].question).toBe('Question cycle')
})

it('drops older large conversation turns and strips huge artwork when a single retained turn exceeds the context budget', async () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="10" y="30">' + 'x'.repeat(32000) + '</text></svg>'
  const large = { explanation: 'Large illustrated lesson', blocks: [
    { kind: 'svg', title: 'First illustration', source }, { kind: 'svg', title: 'Second illustration', source },
  ] }
  localStorage.setItem(historyKey, JSON.stringify([{ id: 'root', question: 'Old large lesson', lesson: large }, { id: 'child', parentId: 'root', question: 'Newest large lesson', lesson: large }]))
  const send = transport(); render(<Canvas />); ask('Continue this lesson')
  await screen.findByRole('heading', { name: 'Recovered lesson', level: 1 })
  expect(requestBody(send).memory).toEqual([{ question: 'Newest large lesson', lesson: { ...large, blocks: [] } }])
  expect(new TextEncoder().encode(JSON.stringify({ question: 'Continue this lesson', memory: requestBody(send).memory })).byteLength).toBeLessThan(64000)
})
