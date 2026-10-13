// @vitest-environment jsdom
import React from 'react'
import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Scene } from '../src/Scene'
import SvgArtwork from '../src/SvgArtwork'
import { Visual } from '../src/Visual'
import { WrittenReply } from '../src/WrittenReply'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const scene = { kind: 'scene' as const, title: 'A saved drawing', width: 400, height: 300, elements: [{ type: 'text' as const, x: 40, y: 60, label: 'Read & remember <this>', width: 300 }] }
const source = '<svg viewBox="0 0 400 300"><circle cx="{{offset}}" cy="150" r="{{radius}}"/><text x="10" y="30">Diameter: {{2*radius}}</text></svg>'
const parameters = [
  { id: 'radius', label: 'Radius', min: 10, max: 100, value: 40, step: 1 },
  { id: 'offset', label: 'Position', min: 100, max: 300, value: 200, step: 5 },
]
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (xml: string, options: { contentType: 'image/svg+xml' }) => { window: { document: Document; close(): void } }
}
function exportedXml(xml: string) {
  // Inspect exact exported bytes in an isolated Node XML document. JSDOM's
  // defaults disable scripts and external resources; malformed XML throws.
  const isolated = new JSDOM(xml, { contentType: 'image/svg+xml' })
  const document = isolated.window.document
  isolated.window.close()
  return document
}
function imageXml() {
  const url = screen.getByAltText('Explore circles').getAttribute('src')!
  return exportedXml(decodeURIComponent(url.slice(url.indexOf(',') + 1)))
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(blob)
  })
}
function downloadBrowser() {
  // Keep the real Blob, FileReader and XMLSerializer. jsdom omits native
  // object URLs and file downloads; capture those two browser boundaries.
  const blobs: Blob[] = []
  const create = vi.fn((blob: Blob) => { blobs.push(blob); return `blob:export-${blobs.length}` })
  const revoke = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const clicks: { href: string; filename: string }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push({ href: this.href, filename: this.download }) })
  const expiration: (() => void)[] = []
  const browserTimeout = window.setTimeout.bind(window)
  vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 1000 && typeof handler === 'function') { expiration.push(() => handler(...args)); return 1234 }
    return browserTimeout(handler, delay, ...args)
  }) as typeof window.setTimeout)
  return { blobs, create, revoke, clicks, expiration }
}

it('inspects raw export XML without sanitizing content, executing scripts or repairing malformed XML', () => {
  const xml = exportedXml('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>document.documentElement.setAttribute("data-executed", "true")</script><text>&lt;script&gt; remains literal</text></svg>')
  expect(xml.documentElement.hasAttribute('data-executed')).toBe(false)
  expect(xml.querySelector('script')!.textContent).toContain('setAttribute')
  expect(xml.querySelector('text')!.textContent).toBe('<script> remains literal')
  expect(() => exportedXml('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toThrow()
  expect(() => exportedXml('<svg xmlns="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg"/>')).toThrow()
})

it.each(['scene', 'svg'])('keeps %s zoom between a readable half-size and four times size, then fits the page', kind => {
  if (kind === 'scene') render(<Scene block={scene} />)
  else render(<SvgArtwork title="Explore circles" source={source} parameters={parameters} />)
  const drawing = screen.getByRole('img')
  expect(drawing.style.width).toBe('100%')
  for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
  expect(screen.getByText('50%')).toBeTruthy()
  expect(drawing.style.width).toBe('50%')
  for (let i = 0; i < 24; i++) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(screen.getByText('400%')).toBeTruthy()
  expect(drawing.style.width).toBe('400%')
  fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
  expect(drawing.style.width).toBe('100%')
  expect(screen.getByText('100%')).toBeTruthy()
  expect(screen.getByLabelText(/^Pan /).getAttribute('tabindex')).toBe('0')
})

it('updates independent SVG controls, exports exactly the current drawing and restores defaults for a new source', () => {
  const view = render(<SvgArtwork title="Explore circles" source={source} parameters={parameters} />)
  // Check accessible control identities once. Reuse their DOM references while
  // changing the full SVG data URL: jsdom reparses it during style-based queries.
  const radius = screen.getByRole('slider', { name: 'Radius' })
  const position = screen.getByRole('slider', { name: 'Position' })
  fireEvent.change(radius, { target: { value: '75' } })
  fireEvent.change(position, { target: { value: '250' } })
  const current = imageXml()
  expect(current.querySelector('circle')!.getAttribute('r')).toBe('75')
  expect(current.querySelector('circle')!.getAttribute('cx')).toBe('250')
  expect(current.querySelector('text')!.textContent).toBe('Diameter: 150')
  expect(radius.parentElement!.querySelector('output')!.textContent).toBe('75')
  // a[href] retains the native link semantics and visible name without jsdom's
  // computed-style selector repeatedly parsing the full embedded font URL.
  const exported = screen.getByText('Save SVG', { selector: 'a[href]' }) as HTMLAnchorElement
  expect(exported.getAttribute('href')).toBe(screen.getByAltText('Explore circles').getAttribute('src'))
  expect(exported.download).toBe('artwork.svg')
  expect(current.documentElement.getAttribute('width')).toBe('400')
  expect(current.documentElement.getAttribute('height')).toBe('300')
  fireEvent.click(screen.getByRole('button', { name: 'Reset controls' }))
  expect(imageXml().querySelector('circle')!.getAttribute('r')).toBe('40')
  expect(imageXml().querySelector('circle')!.getAttribute('cx')).toBe('200')
  fireEvent.change(radius, { target: { value: '90' } })
  view.rerender(<SvgArtwork title="Explore circles" source={source.replace('Diameter:', 'New diameter:')} parameters={parameters} />)
  expect((screen.getByLabelText('Radius', { selector: 'input[type=range]' }) as HTMLInputElement).value).toBe('40')
  expect(imageXml().querySelector('text')!.textContent).toBe('New diameter: 80')
})

it('leaves failed SVG explanations readable, hides unusable exports and recovers with corrected artwork', async () => {
  const view = render(<Visual block={{ kind: 'svg', title: 'Explore circles', source: '<svg viewBox="0 0 400 300"><path fill="url(#missing)"/></svg>' }} fallbackText="The radius measures the distance from the centre." />)
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('missing SVG definition: missing')
  expect(screen.queryByRole('link', { name: 'Save SVG' })).toBeNull()
  expect(screen.queryByRole('img', { name: 'Explore circles' })).toBeNull()
  expect(screen.getByRole('img', { name: 'Written answer' }).textContent!.replace(/\s/g, '')).toBe('The radius measures the distance from the centre.'.replace(/\s/g, ''))
  view.rerender(<Visual block={{ kind: 'svg', title: 'Explore circles', source: '<svg viewBox="0 0 400 300"><circle cx="200" cy="150" r="40"/></svg>' }} />)
  await screen.findByRole('img', { name: 'Explore circles' })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('img', { name: 'Written answer' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Save SVG' })).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Explore' })).toBeNull()
  view.rerender(<SvgArtwork title="Explore circles" source="not an svg document" />)
  expect(screen.getByRole('alert').textContent).toContain('complete SVG drawing')
  expect(screen.queryByRole('img')).toBeNull()
})

it('exports a standalone, fitted scene with its font and paper, then releases the temporary download URL', async () => {
  const browser = downloadBrowser()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['font bytes'], { type: 'font/ttf' }) }))
  const descriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox')
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: -60, y: -30, width: 600, height: 450 }) })
  try {
    render(<Scene block={scene} />)
    const live = screen.getByRole('img')
    // Chromium serializes an unnamespaced xmlns attribute correctly; jsdom
    // duplicates it. A namespaced declaration keeps its real serializer usable.
    live.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg')
    const box = live.getAttribute('viewBox')!.split(' ').map(Number)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save SVG' }))
    await waitFor(() => expect(browser.create).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(fetch).toHaveBeenCalledWith('/fonts/Caveat.ttf')
    expect(browser.blobs[0].type).toBe('image/svg+xml')
    const xml = exportedXml(await readBlob(browser.blobs[0]))
    expect(xml.querySelector('parsererror')).toBeNull()
    expect(xml.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(xml.documentElement.getAttribute('viewBox')).toBe(box.join(' '))
    expect(xml.documentElement.getAttribute('width')).toBe(String(box[2]))
    expect(xml.documentElement.getAttribute('height')).toBe(String(box[3]))
    const paper = xml.documentElement.querySelector(':scope > rect')!
    expect(['x', 'y', 'width', 'height'].map(attr => Number(paper.getAttribute(attr)))).toEqual(box)
    expect(paper.getAttribute('fill')).toBe('#fffdf8')
    expect(xml.querySelector('style')!.textContent).toContain("@font-face{font-family:Caveat;src:url('data:font/ttf;base64,Zm9udCBieXRlcw==')}")
    expect(xml.querySelector('text')!.textContent!.replace(/\s/g, '')).toBe(scene.elements[0].label.replace(/\s/g, ''))
    expect(xml.querySelector('script')).toBeNull()
    expect(live.querySelector('style, rect')).toBeNull()
    expect(live.style.width).toBe('125%')
    expect(browser.clicks).toEqual([{ href: 'blob:export-1', filename: 'blackboard.svg' }])
    expect(browser.revoke).not.toHaveBeenCalled()
    expect(browser.expiration).toHaveLength(1)
    browser.expiration[0]()
    expect(browser.revoke).toHaveBeenCalledWith('blob:export-1')
  } finally {
    if (descriptor) Object.defineProperty(SVGElement.prototype, 'getBBox', descriptor)
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
  }
})

it.each(['font response', 'font download', 'font reader', 'network'])('shows an actionable scene export error for a failed %s and lets the learner retry', async failure => {
  const browser = downloadBrowser()
  const font = { ok: true, blob: async () => new Blob(['verified font']) }
  const request = vi.fn().mockResolvedValue(font)
  if (failure === 'font response') request.mockResolvedValueOnce({ ok: false })
  if (failure === 'font download') request.mockResolvedValueOnce({ ok: true, blob: async () => { throw new Error('Interrupted stream') } })
  if (failure === 'network') request.mockRejectedValueOnce(new TypeError('Network unavailable'))
  if (failure === 'font reader') vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(function (this: FileReader) { this.dispatchEvent(new ProgressEvent('error')) })
  vi.stubGlobal('fetch', request)
  render(<Scene block={scene} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save SVG' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The drawing could not be exported. Please try again.')
  expect(browser.create).not.toHaveBeenCalled()
  expect(browser.clicks).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Save SVG' }))
  expect(screen.queryByRole('alert')).toBeNull()
  await waitFor(() => expect(browser.create).toHaveBeenCalledTimes(1))
  expect(browser.clicks[0].filename).toBe('blackboard.svg')
  expect(request).toHaveBeenCalledTimes(2)
})

it('keeps saved steps and comparison boards ordered and readable as semantic lists and tables', () => {
  const view = render(<Visual block={{ kind: 'steps', title: 'A saved method', items: ['Observe', 'Measure', 'Compare'] }} />)
  const items = within(screen.getByRole('list')).getAllByRole('listitem')
  expect(items.map(item => item.querySelector('p')!.textContent)).toEqual(['Observe', 'Measure', 'Compare'])
  expect(items.map(item => item.querySelector('span')!.textContent)).toEqual(['1', '2', '3'])
  view.rerender(<Visual block={{ kind: 'comparison', title: 'Saved comparison', columns: ['Property', 'Observation'], rows: [['Size', 'Large'], ['Colour', 'Blue']] }} />)
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Property', 'Observation'])
  expect(within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent))).toEqual([['Size', 'Large'], ['Colour', 'Blue']])
  expect(screen.queryByRole('list')).toBeNull()
})

it.each([
  { values: [2, 4], widths: ['50%', '100%'] },
  { values: [0, 0], widths: ['0%', '0%'] },
  { values: [0.25, 0.5], widths: ['25%', '50%'] },
])('renders saved chart values with finite, honest bar lengths for $values', ({ values, widths }) => {
  const view = render(<Visual block={{ kind: 'chart', title: 'Saved measurements', unit: 'cm', points: [{ label: 'First', value: values[0] }, { label: 'Second', value: values[1] }] }} />)
  expect(screen.getByRole('img', { name: `First: ${values[0]} cm, Second: ${values[1]} cm` })).toBeTruthy()
  expect([...view.container.querySelectorAll<HTMLElement>('.bar')].map(bar => bar.style.width)).toEqual(widths)
  expect([...view.container.querySelectorAll('.bar-row')].map(row => row.lastElementChild!.textContent)).toEqual(values.map(value => `${value} cm`))
})

it('dispatches saved diagrams and standalone equations to their interactive and real math renderers', async () => {
  const view = render(<Visual block={{ kind: 'diagram', title: 'Saved relationships', nodes: [{ id: 'a', label: 'Cause' }, { id: 'b', label: 'Effect' }], edges: [{ from: 'a', to: 'b' }] }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cause' }))
  expect(screen.getByRole('button', { name: 'Cause' }).getAttribute('aria-pressed')).toBe('true')
  view.rerender(<Visual block={{ kind: 'math', title: 'Saved equation', latex: '\\frac{a}{b}' }} />)
  await waitFor(() => expect(view.container.querySelector('math mfrac')).toBeTruthy())
  expect(view.container.querySelector('math')!.getAttribute('display')).toBe('block')
  expect(screen.queryByRole('button')).toBeNull()
})

it('preserves scene geometry and annotations, handles undefined plots and typesets equations in their requested region', async () => {
  const view = render(<Visual block={{ kind: 'scene', title: 'Saved geometry', width: 800, height: 500, elements: [
    { type: 'polygon', x: 100, y: 100, radius: 40, sides: 4, rotation: 0, label: 'Square', fill: '#abcdef', color: '#000000', strokeWidth: 5 },
    { type: 'polygon', x: 100, y: 250, radius: 20, sides: 3 },
    { type: 'rect', x: 200, y: 40, width: 120, height: 80, label: 'Rectangle', fill: '#ff0000' },
    { type: 'circle', x: 400, y: 80, radius: 30 },
    { type: 'path', d: 'M20 200 C40 100 60 300 80 200', color: '#000000', strokeWidth: 4, fill: '#abcdef' },
    { type: 'path', d: 'M20 220 L80 220' },
    { type: 'line', x1: 200, y1: 200, x2: 300, y2: 200, label: 'Relation' },
    { type: 'plot', x: 400, y: 200, width: 250, height: 100, expression: 'sqrt(-1)', xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    { type: 'math', x: 50, y: 350, width: 220, height: 90, fontSize: 36, latex: 'x^2' },
    { type: 'math', x: 350, y: 350, latex: 'y^2' },
  ] }} />)
  const polygon = view.container.querySelector('polygon')!
  expect(polygon.getAttribute('points')!.split(' ').map(point => point.split(',').map(Number).map(Math.round))).toEqual([[140, 100], [100, 140], [60, 100], [100, 60]])
  expect(polygon.getAttribute('fill')).toBe('#abcdef')
  expect(polygon.getAttribute('stroke')).toBe('#000000')
  expect(polygon.getAttribute('stroke-width')).toBe('5')
  expect(polygon.parentElement!.querySelector('text')!.textContent).toBe('Square')
  expect(view.container.querySelectorAll('polygon')[1].getAttribute('fill')).toBe('none')
  const rectangle = view.container.querySelector('rect[rx]')!
  expect(['x', 'y', 'width', 'height'].map(key => rectangle.getAttribute(key))).toEqual(['200', '40', '120', '80'])
  expect(rectangle.getAttribute('fill')).toBe('#ff0000')
  const circle = view.container.querySelector('circle')!
  expect(['cx', 'cy', 'r'].map(key => circle.getAttribute(key))).toEqual(['400', '80', '30'])
  expect(circle.getAttribute('fill')).toBe('var(--surface)')
  const path = view.container.querySelector('path')!
  expect(path.getAttribute('d')).toBe('M20 200 C40 100 60 300 80 200')
  expect(path.getAttribute('stroke-width')).toBe('4')
  expect(path.getAttribute('fill')).toBe('#abcdef')
  expect(view.container.querySelectorAll('path')[1].getAttribute('fill')).toBe('none')
  expect([...view.container.querySelectorAll('text')].some(label => label.textContent!.replace(/\s/g, '') === 'No curve could be drawn in this range'.replace(/\s/g, ''))).toBe(true)
  const relation = [...view.container.querySelectorAll('text')].find(label => label.textContent === 'Relation')!
  expect(relation.getAttribute('x')).toBe('250')
  expect(relation.getAttribute('y')).toBe('188')
  const regions = [...view.container.querySelectorAll('foreignObject')]
  expect(['x', 'y', 'width', 'height'].map(key => regions[0].getAttribute(key))).toEqual(['50', '350', '220', '90'])
  expect((regions[0].firstElementChild as HTMLElement).style.fontSize).toBe('36px')
  expect(['width', 'height'].map(key => regions[1].getAttribute(key))).toEqual(['500', '180'])
  await waitFor(() => expect(view.container.querySelectorAll('foreignObject math')).toHaveLength(2))
})

it('does not schedule a font-fit frame after a scene has been removed', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'fonts')
  let complete!: () => void
  const ready = new Promise<void>(resolve => { complete = resolve })
  const schedule = vi.fn()
  vi.stubGlobal('requestAnimationFrame', schedule)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
  try {
    const view = render(<Scene block={scene} />)
    view.unmount()
    await act(async () => { complete(); await ready })
    expect(schedule).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(document, 'fonts', descriptor)
    else Reflect.deleteProperty(document, 'fonts')
  }
})

it('reflows written replies to the observed viewport while keeping readable bounds and disconnecting the observer', () => {
  let availableWidth = 1200
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, top: 0, left: 0, right: availableWidth, bottom: 100, width: availableWidth, height: 100, toJSON: () => ({}) }))
  let resize!: ResizeObserverCallback
  const observe = vi.fn(), disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback }
    observe = observe
    disconnect = disconnect
  })
  const text = 'Every word should stay visible as the viewport changes. '.repeat(12)
  const descriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox')
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 48, y: 64, width: 0, height: 0 }) })
  try {
    const view = render(<WrittenReply text={text} />)
    const page = screen.getByRole('img', { name: 'Written answer' })
    expect(observe).toHaveBeenCalledWith(view.container.firstElementChild)
    const initialHeight = Number(page.getAttribute('viewBox')!.split(' ')[3])
    expect(page.getAttribute('viewBox')!.split(' ')[2]).toBe('800')
    availableWidth = 100
    act(() => resize([], {} as ResizeObserver))
    expect(page.getAttribute('viewBox')!.split(' ')[2]).toBe('320')
    expect(Number(page.getAttribute('viewBox')!.split(' ')[3])).toBeGreaterThan(initialHeight)
    availableWidth = 640
    act(() => resize([], {} as ResizeObserver))
    expect(page.getAttribute('viewBox')!.split(' ')[2]).toBe('640')
    expect(page.textContent!.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
    availableWidth = 0
    act(() => resize([], {} as ResizeObserver))
    expect(page.getAttribute('viewBox')!.split(' ')[2]).toBe('640')
    view.unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  } finally {
    if (descriptor) Object.defineProperty(SVGElement.prototype, 'getBBox', descriptor)
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
  }
})
