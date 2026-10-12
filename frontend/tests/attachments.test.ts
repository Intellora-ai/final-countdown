// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { extractText, readAttachment } from '../src/attachments'
import { File as NodeFile } from 'node:buffer'
import { strToU8, zipSync } from 'fflate'

const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: {} }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf-test-worker.js' }))
beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function document(pages: number, content: (page: number) => unknown[] = page => [{ str: 'Page ' + page }]) {
  const destroy = vi.fn(async () => {})
  const getPage = vi.fn(async (page: number) => ({ getTextContent: async () => ({ items: content(page) }) }))
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: pages, getPage }), destroy })
  return { destroy, getPage }
}

it('reads supported PDF page counts in order and releases the document processor', async () => {
  for (const count of [1, 2, 499, 500]) {
    const current = document(count)
    const text = await extractText('notes.pdf', new Uint8Array())
    expect(text).toBe(Array.from({ length: count }, (_, index) => 'Page ' + (index + 1)).join('\n\n'))
    expect(current.getPage.mock.calls.map(([page]) => page)).toEqual(Array.from({ length: count }, (_, index) => index + 1))
    expect(current.destroy).toHaveBeenCalledExactlyOnceWith()
  }
})

it('rejects excessive PDF page counts before extracting pages and releases resources', async () => {
  for (const count of [501, 1000, 10000]) {
    const current = document(count)
    await expect(extractText('notes.pdf', new Uint8Array())).rejects.toThrow('PDF exceeds 500 pages')
    expect(current.getPage).not.toHaveBeenCalled()
    expect(current.destroy).toHaveBeenCalledExactlyOnceWith()
  }
})

it('keeps reading PDF pages until the text budget is reached', async () => {
  const current = document(10, page => [{ str: String(page) + 'x'.repeat(100000) }, { markedContent: true }])
  const text = await extractText('notes.pdf', new Uint8Array())
  expect(text).toContain('1' + 'x'.repeat(100))
  expect(text).toContain('5' + 'x'.repeat(100))
  expect(text).not.toContain('6' + 'x'.repeat(100))
  expect(text.length).toBeLessThanOrEqual(500000)
  expect(current.getPage).toHaveBeenCalledTimes(5)
  expect(current.destroy).toHaveBeenCalledExactlyOnceWith()
})

it('releases the PDF processor if loading or page extraction fails', async () => {
  const unavailable = document(1)
  unavailable.getPage.mockRejectedValueOnce(new Error('Unreadable PDF page'))
  await expect(extractText('notes.pdf', new Uint8Array())).rejects.toThrow('Unreadable PDF page')
  expect(unavailable.destroy).toHaveBeenCalledExactlyOnceWith()
  const destroy = vi.fn(async () => {})
  pdf.getDocument.mockReturnValue({ promise: Promise.reject(new Error('Unreadable PDF document')), destroy })
  await expect(extractText('notes.pdf', new Uint8Array())).rejects.toThrow('Unreadable PDF document')
  expect(destroy).toHaveBeenCalledExactlyOnceWith()
})

it('rejects empty and whitespace uploads but returns readable text unchanged', async () => {
  for (const content of ['', ' ', '\n\t', 'original evidence', 'αβ — 你好']) {
    const attachment = readAttachment(new NodeFile([content], 'notes.custom', { type: 'text/plain' }) as unknown as File)
    if (content.trim()) await expect(attachment).resolves.toEqual({ name: 'notes.custom', text: content })
    else await expect(attachment).rejects.toThrow('No readable text found')
  }
})

it('bounds processed image payloads, downsizes large dimensions and closes decoded resources on success and failure', async () => {
  for (const length of [100, 500000, 500001]) {
    const close = vi.fn()
    const bitmap = { width: 2048, height: 1024, close }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const image = 'data:image/jpeg;base64,'.padEnd(length, 'A')
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(image)
    const file = new NodeFile(['image bytes are decoded by the browser'], 'diagram.png', { type: 'image/png' })
    const result = readAttachment(file as unknown as File)
    if (length > 500000) await expect(result).rejects.toThrow('Image is too detailed')
    else await expect(result).resolves.toEqual({ name: 'diagram.png', image })
    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1024, 512)
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 512)
    expect(close).toHaveBeenCalledExactlyOnceWith()
    getContext.mockRestore(); encode.mockRestore()
  }
})

it('reads EPUB reading order from manifest references even when package and chapter filenames have arbitrary extensions', async () => {
  const files = {
    'META-INF/container.xml': strToU8('<container><rootfile full-path="book/package.custom"/></container>'),
    'book/package.custom': strToU8('<package><manifest><item id="a" href="chapters/one.content" media-type="application/xhtml+xml"/><item id="b" href="two" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'),
    'book/chapters/one.content': strToU8('<html><body><p>Second chapter evidence.</p></body></html>'),
    'book/two': strToU8('<html><body><p>First chapter evidence.</p></body></html>'),
  }
  await expect(extractText('book.epub', zipSync(files))).resolves.toBe('First chapter evidence.\n\nSecond chapter evidence.')
})

it('rejects an EPUB expansion larger than the local budget even when the compressed upload is tiny', async () => {
  const files = {
    'META-INF/container.xml': strToU8('<container><rootfile full-path="book.opf"/></container>'),
    'book.opf': strToU8('<package><manifest><item id="a" href="one.xhtml"/></manifest><spine><itemref idref="a"/></spine></package>'),
    'one.xhtml': strToU8('<html><body>Ordinary chapter text.</body></html>'),
    'compressed-image.bin': new Uint8Array(20 * 1024 * 1024 + 1),
  }
  const archive = zipSync(files)
  expect(archive.byteLength).toBeLessThan(100000)
  await expect(extractText('book.epub', archive)).rejects.toThrow('Expanded EPUB exceeds 20 MB')
})
