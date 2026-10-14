// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractText, passages, readAttachment } from '../src/attachments'
import { learnerKey, mergeMemory, readLearner, retrieve, tokens } from '../src/learner'
import { calculate } from '../src/math'

const maxFile = 20 * 1024 * 1024
const asFile = (file: NodeFile) => file as unknown as File
const archive = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])))
const container = (path = 'book.opf') => `<container><rootfiles><rootfile full-path="${path}"/></rootfiles></container>`
const packageXml = (manifest: string, spine: string) => `<package><manifest>${manifest}</manifest><spine>${spine}</spine></package>`

beforeEach(() => localStorage.clear())
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

describe('upload text boundaries', () => {
  it('rejects oversized files before reading or decoding them', async () => {
    const bytes = new Uint8Array(maxFile + 1)
    await expect(extractText('notes.txt', bytes)).rejects.toThrow('File exceeds the 20 MB local processing limit.')
    const file = new NodeFile([bytes], 'diagram.png', { type: 'image/png' })
    const read = vi.spyOn(file, 'arrayBuffer')
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    await expect(readAttachment(asFile(file))).rejects.toThrow('File exceeds the 20 MB local processing limit.')
    expect(read).not.toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
  })

  it('accepts the exact byte limit while bounding the returned text', async () => {
    const bytes = new Uint8Array(maxFile).fill(65)
    await expect(extractText('notes.txt', bytes)).resolves.toBe('A'.repeat(500000))
    const text = '证据'.repeat(250001)
    await expect(extractText('notes.custom', strToU8(text))).resolves.toBe(text.slice(0, 500000))
  })

  it('preserves readable UTF-8 and supported whitespace regardless of extension', async () => {
    const content = 'café\t你好\nالعَرَبِيَّة\r\nगणित'
    await expect(extractText('notes.BIN', strToU8(content))).resolves.toBe(content)
    await expect(extractText('empty.txt', new Uint8Array())).resolves.toBe('')
  })

  it('rejects malformed UTF-8 and binary controls instead of silently replacing bytes', async () => {
    for (const bytes of [[0xc3, 0x28], [0xe2, 0x82], [0xff]]) {
      await expect(extractText('notes.txt', new Uint8Array(bytes))).rejects.toThrow()
    }
    for (const control of [0, 1, 8, 14, 31]) {
      await expect(extractText('notes.txt', new Uint8Array([65, control, 66]))).rejects.toThrow('This binary format cannot be read.')
    }
  })

  it('sanitizes recognized markup extensions and keeps paragraph boundaries', async () => {
    const content = '<style>hidden styles</style><noscript>Fallback evidence</noscript><h1>Title</h1><p>First<script>hidden script</script></p><div>Second<br>Third</div>'
    for (const name of ['notes.HTML', 'notes.htm', 'notes.xml', 'notes.svg']) {
      await expect(extractText(name, strToU8(content))).resolves.toBe('Fallback evidence Title First Second Third')
    }
  })

  it('propagates browser file read errors and bounds successful attachment names', async () => {
    const failed = new NodeFile(['evidence'], 'notes.txt', { type: 'text/plain' })
    vi.spyOn(failed, 'arrayBuffer').mockRejectedValue(new Error('File could not be read'))
    await expect(readAttachment(asFile(failed))).rejects.toThrow('File could not be read')
    const name = '书'.repeat(205) + '.txt'
    await expect(readAttachment(asFile(new NodeFile(['original evidence'], name)))).resolves.toEqual({ name: name.slice(0, 200), text: 'original evidence' })
  })

  it('rejects markup whose only contents are removed during extraction', async () => {
    const file = new NodeFile(['<script>do not run this</script><style>not evidence</style>'], 'empty.html')
    await expect(readAttachment(asFile(file))).rejects.toThrow('No readable text found.')
  })
})

describe('actual EPUB archive failures and paths', () => {
  it('rejects corrupt ZIP data and archives missing their container', async () => {
    await expect(extractText('broken.epub', strToU8('not a ZIP archive'))).rejects.toThrow()
    await expect(extractText('missing.epub', archive({ 'book.opf': '<package/>' }))).rejects.toThrow('Incomplete EPUB package.')
  })

  it.each(['<container/>', '<container><rootfile/></container>', '<container><rootfile full-path=""/></container>', '<container><rootfile>'])('rejects a container without a usable package path: %s', async xml => {
    await expect(extractText('book.epub', archive({ 'META-INF/container.xml': xml }))).rejects.toThrow('Invalid EPUB container.')
  })

  it('rejects a container pointing at a missing package', async () => {
    await expect(extractText('book.epub', archive({ 'META-INF/container.xml': container('missing/package.opf') }))).rejects.toThrow('Incomplete EPUB package.')
  })

  it.each([
    ['', '<itemref idref="missing"/>'],
    ['<item id="chapter"/>', '<itemref idref="chapter"/>'],
    ['<item id="chapter" href=""/>', '<itemref idref="chapter"/>'],
    ['<item id="chapter" href="one.xhtml"/>', '<itemref/>'],
  ])('rejects a spine entry without a manifest chapter (%s, %s)', async (manifest, spine) => {
    await expect(extractText('book.epub', archive({ 'META-INF/container.xml': container(), 'book.opf': packageXml(manifest, spine) }))).rejects.toThrow('Invalid EPUB reading order.')
  })

  it('rejects a valid chapter reference whose file is absent', async () => {
    await expect(extractText('book.epub', archive({
      'META-INF/container.xml': container(),
      'book.opf': packageXml('<item id="chapter" href="missing.xhtml"/>', '<itemref idref="chapter"/>'),
    }))).rejects.toThrow('Incomplete EPUB package.')
  })

  it('resolves root-level packages, percent-encoded filenames, relative paths and fragments', async () => {
    await expect(extractText('BOOK.EPUB', archive({
      'META-INF/container.xml': container(),
      'book.opf': packageXml('<item id="chapter" href="chapters/../chapter%20one.xhtml?edition=2#start"/>', '<itemref idref="chapter"/>'),
      'chapter one.xhtml': '<html><body><p>Original chapter evidence.</p></body></html>',
    }))).resolves.toBe('Original chapter evidence.')
  })

  it('reports an unreadable upload for a package without any readable spine content', async () => {
    const bytes = archive({ 'META-INF/container.xml': container(), 'book.opf': '<package><manifest/><spine/></package>' })
    await expect(readAttachment(asFile(new NodeFile([bytes], 'empty.epub')))).rejects.toThrow('No readable text found.')
  })

  it('bounds genuine EPUB chapter text after following reading order', async () => {
    const text = 'A'.repeat(500001)
    await expect(extractText('large.epub', archive({
      'META-INF/container.xml': container(),
      'book.opf': packageXml('<item id="chapter" href="one.xhtml"/>', '<itemref idref="chapter"/>'),
      'one.xhtml': `<html><body><p>${text}</p></body></html>`,
    }))).resolves.toBe(text.slice(0, 500000))
  })
})

describe('browser image processing boundaries', () => {
  const imageFile = () => asFile(new NodeFile(['browser image bytes'], 'diagram.png', { type: 'image/png' }))

  function browserImage(width: number, height: number) {
    const bitmap = { width, height, close: vi.fn() }
    const decode = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', decode)
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YQ==')
    return { bitmap, decode, context, contextSpy, encode }
  }

  it('propagates image decoder failures before creating a canvas', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('Unsupported image'))
    vi.stubGlobal('createImageBitmap', decode)
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    await expect(readAttachment(imageFile())).rejects.toThrow('Unsupported image')
    expect(decode).toHaveBeenCalledOnce()
    expect(context).not.toHaveBeenCalled()
  })

  it.each([[32, 20, 32, 20], [1024, 2048, 512, 1024], [1, 2048, 1, 1024], [0, 0, 1, 1]])('keeps image dimensions usable for %sx%s', async (width, height, targetWidth, targetHeight) => {
    const browser = browserImage(width, height)
    const name = 'diagram'.repeat(40) + '.png'
    await expect(readAttachment(asFile(new NodeFile(['bytes'], name, { type: 'image/png' })))).resolves.toEqual({ name: name.slice(0, 200), image: 'data:image/jpeg;base64,YQ==' })
    expect(browser.context.fillStyle).toBe('#ffffff')
    expect(browser.context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, targetWidth, targetHeight)
    expect(browser.context.drawImage).toHaveBeenCalledExactlyOnceWith(browser.bitmap, 0, 0, targetWidth, targetHeight)
    expect(browser.encode).toHaveBeenCalledExactlyOnceWith('image/jpeg', 0.8)
    const canvas = browser.contextSpy.mock.instances[0] as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([targetWidth, targetHeight])
    expect(browser.bitmap.close).toHaveBeenCalledExactlyOnceWith()
  })

  it('closes the decoded bitmap when the canvas has no drawing context', async () => {
    const browser = browserImage(100, 100)
    browser.contextSpy.mockReturnValue(null)
    await expect(readAttachment(imageFile())).rejects.toThrow()
    expect(browser.encode).not.toHaveBeenCalled()
    expect(browser.bitmap.close).toHaveBeenCalledExactlyOnceWith()
  })

  it.each(['fillRect', 'drawImage'] as const)('closes the bitmap when %s fails', async method => {
    const browser = browserImage(100, 100)
    browser.context[method].mockImplementation(() => { throw new Error('Canvas drawing failed') })
    await expect(readAttachment(imageFile())).rejects.toThrow('Canvas drawing failed')
    expect(browser.encode).not.toHaveBeenCalled()
    expect(browser.bitmap.close).toHaveBeenCalledExactlyOnceWith()
  })

  it('closes the bitmap when JPEG encoding fails', async () => {
    const browser = browserImage(100, 100)
    browser.encode.mockImplementation(() => { throw new Error('Canvas encoding failed') })
    await expect(readAttachment(imageFile())).rejects.toThrow('Canvas encoding failed')
    expect(browser.bitmap.close).toHaveBeenCalledExactlyOnceWith()
  })
})

describe('excerpt and learner helpers', () => {
  it('uses a floored budget for punctuation-only and unmatched queries', () => {
    expect(passages('Original text.', '???', 8.9)).toBe('Original')
    expect(passages('Original text.', 'missing', 0.9)).toBe('')
    expect(passages('Original text.', 'Original', 0.9)).toBe('')
    expect(passages('a'.repeat(6001), 'missing')).toBe('a'.repeat(6000))
    expect(passages('', 'query')).toBe('')
  })

  it('keeps the original punctuation and evidence near the end of a document', () => {
    const text = 'padding '.repeat(500) + 'β: final evidence!'
    const excerpt = passages(text, 'β', 60)
    expect(excerpt).toContain('β: final evidence!')
    expect(text.endsWith(excerpt)).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(60)
  })

  it('prioritizes rare evidence even after more than 200 repetitive matches', () => {
    const text = 'common filler '.repeat(250) + 'rare: retained evidence.' + ' padding'.repeat(100)
    const excerpt = passages(text, 'common rare', 100)
    expect(excerpt).toContain('rare: retained evidence.')
    expect(excerpt.length).toBeLessThanOrEqual(100)
  })

  it('selects nonoverlapping windows in document order and accounts for their separator', () => {
    const text = 'alpha ' + 'padding '.repeat(200) + 'beta ' + 'ending '.repeat(300)
    const first = text.slice(0, 1000)
    const betaIndex = text.indexOf('beta')
    const second = text.slice(betaIndex - 333, betaIndex - 333 + 1000)
    expect(passages(text, 'alpha beta', 2001)).toBe(first + '\n' + second)
    expect(passages(text, 'alpha beta', 2000)).toBe(first)
  })

  it('scores bounded evidence safely when a boundary creates another query token', () => {
    expect(passages('beta alphabetical', 'beta alpha', 10)).toBe('beta alpha')
  })

  it('reads saved learner memory and handles unavailable storage', () => {
    expect(readLearner()).toBe('')
    localStorage.setItem(learnerKey, 'Retained understanding')
    expect(readLearner()).toBe('Retained understanding')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    expect(readLearner()).toBe('')
    expect(mergeMemory('old', '新'.repeat(2001))).toBe('新'.repeat(2000))
  })

  it('normalizes whole tokens, including compatibility forms, without treating punctuation as a word', () => {
    expect(tokens('??? — \t')).toEqual(new Set())
    expect(tokens('ＣＡＦÉ cafe\u0301 １２３ a_b _x')).toEqual(new Set(['café', '123', 'a', 'b', 'x']))
  })

  it('returns at most three relevant answers in stable order and excludes records', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({ id: String(index), question: `Question ${index}`, lesson: { explanation: `evidence ${index}`, blocks: [] } }))
    expect(retrieve(entries, 'evidence', new Set(['0']))).toBe(entries.slice(1, 4).map(entry => `Earlier question: ${entry.question}\nAnswer: ${entry.lesson.explanation}`).join('\n\n'))
    expect(retrieve(entries, 'evidence', new Set(entries.map(entry => entry.id)))).toBe('')
    expect(retrieve([], 'evidence', new Set())).toBe('')
    expect(retrieve(entries, '???', new Set())).toBe('')
  })

  it('retains terms at the archive-frequency threshold and rejects more common terms', () => {
    for (const matching of [5, 6]) {
      const entries = Array.from({ length: 10 }, (_, index) => ({ id: String(index), question: index < matching ? 'shared' : 'other', lesson: { explanation: `answer ${index}`, blocks: [] } }))
      const result = retrieve(entries, 'shared unknown', new Set())
      if (matching === 5) expect(result).toContain('answer 0')
      else expect(result).toBe('')
    }
  })

  it('caps recalled text without mutating the saved explanation', () => {
    const explanation = 'evidence ' + '学'.repeat(5000)
    const entries = [{ id: 'long', question: 'Long question', lesson: { explanation, blocks: [] } }]
    expect(retrieve(entries, 'evidence', new Set())).toBe(`Earlier question: Long question\nAnswer: ${explanation}`.slice(0, 4000))
    expect(entries[0].lesson.explanation).toBe(explanation)
  })
})

describe('calculator parser and domain boundaries', () => {
  it.each([
    ['+(2 - 1) * 3', 3], ['2^3^2', 512], ['.5 + 1. + 2E-1', 1.7],
    ['tan(0) + log(e)', 1], ['\t((3))\n', 3], ['1000000000000000', 1e15],
    ['+--3', 3], ['0^0', 1],
  ] as const)('computes valid parser boundary %s', (source, value) => {
    expect(calculate(source)).toBeCloseTo(value)
  })

  it('uses explicitly supplied own variables before built-in names and checks their values', () => {
    expect(calculate('x + pi + e + total_2', 99, { x: 1, pi: 2, e: 3, total_2: 4 })).toBe(10)
    expect(calculate('toString + 1', undefined, { toString: 2 })).toBe(3)
    expect(() => calculate('inherited', undefined, Object.create({ inherited: 7 }))).toThrow('CALCULATION_INVALID')
    for (const value of [NaN, Infinity, -Infinity, 1e15 + 1]) {
      expect(() => calculate('value', undefined, { value })).toThrow('CALCULATION_INVALID')
      expect(() => calculate('x', value)).toThrow('CALCULATION_INVALID')
    }
  })

  it.each(['', ' \n\t ', 'x', '(1+2', 'sin 1', 'sin()', '1e309', '1e', '.', '2 3', 'PI', 'log(0)', '(-1)^.5', '1000000000000001', '1e15 * 2', '1e15 + 1', '1e15 - -1', '1e15 / .1', '0^-1', '2/(1-1)'])('rejects malformed or out-of-domain expression %s', source => {
    expect(() => calculate(source)).toThrow('CALCULATION_INVALID')
  })

  it('applies the expression length limit after trimming', () => {
    const exact = '1' + ' '.repeat(198) + '+'
    expect(() => calculate(exact)).toThrow('CALCULATION_INVALID')
    const valid = '1' + ' '.repeat(196) + '+ 2'
    expect(valid).toHaveLength(200)
    expect(calculate('  ' + valid + '\n')).toBe(3)
    expect(() => calculate(valid + '0')).toThrow('CALCULATION_INVALID')
  })
})
