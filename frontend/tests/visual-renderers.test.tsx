// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Diagram } from '../src/Diagram'
import { Scene } from '../src/Scene'
import { Visual } from '../src/Visual'
import { WrittenReply } from '../src/WrittenReply'
import { fontMeasure } from '../src/text-layout'
import { diagramLayout } from '../src/diagram-layout'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('selects one diagram idea, toggles it off, and clears selection without affecting other ideas', () => {
  render(<Diagram block={{ kind: 'diagram', title: 'Connections', nodes: [{ id: 'one', label: 'First idea' }, { id: 'two', label: 'Second idea' }], edges: [{ from: 'one', to: 'two' }] }} />)
  const first = screen.getByRole('button', { name: 'First idea' })
  const second = screen.getByRole('button', { name: 'Second idea' })
  expect(first.getAttribute('aria-pressed')).toBe('false')
  expect(second.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(first)
  expect(first.getAttribute('aria-pressed')).toBe('true')
  expect(second.getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: 'Clear selection · First idea' })).toBeTruthy()
  fireEvent.click(first)
  expect(first.getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByRole('button', { name: /Clear selection/ })).toBeNull()
  fireEvent.click(second)
  expect(second.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection · Second idea' }))
  expect(second.getAttribute('aria-pressed')).toBe('false')
})

it('draws complete diagram connections and emphasizes only the selected idea relationships', () => {
  const view = render(<Diagram block={{ kind: 'diagram', title: 'Connections', nodes: [{ id: 'one', label: 'First idea' }, { id: 'two', label: 'Second idea' }, { id: 'three', label: 'Third idea' }], edges: [{ from: 'one', to: 'two', label: 'Leads to' }, { from: 'two', to: 'three' }] }} />)
  const paths = [...view.container.querySelectorAll('path[marker-end]')]
  expect(paths).toHaveLength(2)
  expect(view.container.querySelectorAll('.edge-note')).toHaveLength(1)
  expect(view.container.querySelector('.edge-note')!.textContent).toBe('Leads to')
  const directionColor = view.container.querySelector('marker path')!.getAttribute('fill')
  for (const path of paths) {
    expect(path.getAttribute('d')).toMatch(/^M/)
    expect(path.getAttribute('d')).toContain('L')
    expect(path.getAttribute('stroke-width')).toBe('2')
    expect(path.getAttribute('stroke')).toBe(directionColor)
  }
  fireEvent.click(screen.getByRole('button', { name: 'First idea' }))
  expect(paths[0].getAttribute('stroke-width')).toBe('4')
  expect(paths[1].getAttribute('stroke-width')).toBe('2')
  expect(paths[0].getAttribute('stroke')).not.toBe(paths[1].getAttribute('stroke'))
  expect(paths[0].getAttribute('stroke')).toBe(directionColor)
  expect(paths[1].getAttribute('stroke')).not.toBe(directionColor)
  fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }))
  expect(paths.map(path => path.getAttribute('stroke-width'))).toEqual(['2', '2'])
  expect(paths[0].getAttribute('stroke')).toBe(paths[1].getAttribute('stroke'))
})

it('measures ordinary writing normally and bold idea labels with their actual browser font metrics', () => {
  vi.stubGlobal('CanvasRenderingContext2D', function CanvasRenderingContext2D() {})
  const context = { font: '', measureText(value: string) {
    const size = Number(this.font.match(/([\d.]+)px/)![1])
    return { width: Array.from(value).length * size * (this.font.startsWith('bold ') ? 1 : 0.5) }
  } }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const sample = 'abcdef'
  expect(fontMeasure(20)(sample)).toBe(60)
  expect(fontMeasure(20, true)(sample)).toBe(120)
  expect(fontMeasure(20, false)(sample)).toBe(60)
  const label = 'W'.repeat(60)
  const drawing = diagramLayout({ kind: 'diagram', title: 'Measured bold writing', nodes: [{ id: 'one', label }, { id: 'two', label: 'Other' }], edges: [] })
  const node = drawing.nodes[0]
  // Even using the whole node width, these native bold glyph advances require
  // this many lines; the frame must have room for each line's font height.
  expect(node.height).toBeGreaterThanOrEqual(Math.ceil(label.length * 25 / node.width) * 25)
})

it.each([
  [-2, 2, -3, 3, 2],
  [1, 3, -3, 3, 1],
  [-3, -1, -3, 3, 1],
  [-2, 2, 1, 3, 1],
  [-2, 2, -3, -1, 1],
  [1, 3, 1, 3, 0],
  [-3, -1, -3, -1, 0],
  [0, 2, 0, 3, 2],
])('keeps plot axes inside the visible window (%s,%s) × (%s,%s)', (xMin, xMax, yMin, yMax, expectedAxes) => {
  const plot = { type: 'plot' as const, expression: 'x', x: 40, y: 80, width: 320, height: 240, xMin, xMax, yMin, yMax }
  const view = render(<Scene controls={false} block={{ kind: 'scene', title: 'Coordinates', width: 400, height: 400, elements: [plot] }} />)
  const lines = [...view.container.querySelectorAll('line')]
  expect(lines).toHaveLength(expectedAxes)
  for (const line of lines) {
    for (const name of ['x1', 'x2']) expect(Number(line.getAttribute(name))).toBeGreaterThanOrEqual(plot.x)
    for (const name of ['x1', 'x2']) expect(Number(line.getAttribute(name))).toBeLessThanOrEqual(plot.x + plot.width)
    for (const name of ['y1', 'y2']) expect(Number(line.getAttribute(name))).toBeGreaterThanOrEqual(plot.y)
    for (const name of ['y1', 'y2']) expect(Number(line.getAttribute(name))).toBeLessThanOrEqual(plot.y + plot.height)
  }
})

it('keeps standalone SVG titles available to screen readers without duplicating board writing', () => {
  const view = render(<Visual block={{ kind: 'svg', title: 'Artwork description', source: '<svg viewBox="0 0 100 100"><text x="10" y="20">Canvas writing</text></svg>' }} />)
  expect(screen.getByRole('heading', { name: 'Artwork description' }).classList.contains('sr-only')).toBe(true)
  view.rerender(<Visual block={{ kind: 'steps', title: 'Instructions', items: ['First step', 'Second step'] }} />)
  expect(screen.getByRole('heading', { name: 'Instructions' }).classList.contains('sr-only')).toBe(false)
})

it('fits native measured scene content outside the original page and ignores unusable native bounds', () => {
  // jsdom does not implement native SVG measurement. Supply the browser boundary
  // and assert the visible coordinate window rather than internal state.
  const before = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox')
  try {
    for (const bounds of [{ x: -80, y: -40, width: 900, height: 700 }, { x: NaN, y: 0, width: 900, height: 700 }]) {
      Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => bounds })
      const view = render(<Scene controls={false} block={{ kind: 'scene', title: 'Measured scene', width: 400, height: 300, elements: [{ type: 'rect', x: -80, y: -40, width: 900, height: 700 }] }} />)
      const [x, y, width, height] = view.container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number)
      expect([x, y, width, height].every(Number.isFinite)).toBe(true)
      if (Number.isFinite(bounds.x)) {
        expect(x).toBeLessThanOrEqual(bounds.x)
        expect(y).toBeLessThanOrEqual(bounds.y)
        expect(x + width).toBeGreaterThanOrEqual(bounds.x + bounds.width)
        expect(y + height).toBeGreaterThanOrEqual(bounds.y + bounds.height)
      } else expect([x, y, width, height]).toEqual([0, 0, 400, 300])
      view.unmount()
    }
  } finally {
    if (before) Object.defineProperty(SVGElement.prototype, 'getBBox', before)
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
  }
})

it('keeps plain conversation as literal board writing without redundant drawing controls', () => {
  const text = 'A literal <script> label and a short conversational answer.'
  const view = render(<WrittenReply text={text} />)
  expect(view.container.querySelector('text')!.textContent!.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  expect(view.container.querySelector('script')).toBeNull()
  expect(view.container.querySelectorAll('button')).toHaveLength(0)
})

it('reflows diagram frames and scene labels when delayed font metrics become available', async () => {
  let finishFonts!: () => void
  const ready = new Promise<void>(resolve => { finishFonts = resolve })
  const fontsBefore = Object.getOwnPropertyDescriptor(document, 'fonts')
  const boundsBefore = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox')
  let loaded = false
  vi.stubGlobal('CanvasRenderingContext2D', function CanvasRenderingContext2D() {})
  const context = { font: '', measureText: (value: string) => ({ width: Array.from(value).length * (loaded ? 28 : 4) }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 0, height: 0 }) })
  try {
    const label = 'Words that must stay readable inside the idea frame. '.repeat(4)
    const view = render(<><Diagram block={{ kind: 'diagram', title: 'Delayed font', nodes: [{ id: 'one', label }, { id: 'two', label: 'Other idea' }], edges: [] }} /><Scene controls={false} block={{ kind: 'scene', title: 'Delayed label', width: 400, height: 400, elements: [{ type: 'text', x: 40, y: 80, width: 250, label }] }} /><WrittenReply text={label} /></>)
    const frame = view.container.querySelector('foreignObject')!
    const firstHeight = Number(frame.getAttribute('height'))
    const labelDrawing = screen.getByRole('img', { name: 'Delayed label' })
    const firstRows = labelDrawing.querySelectorAll('tspan').length
    const written = screen.getByRole('img', { name: 'Written answer' })
    const firstPageHeight = Number(written.getAttribute('viewBox')!.split(' ')[3])
    loaded = true
    await act(async () => { finishFonts(); await ready })
    expect(Number(frame.getAttribute('height'))).toBeGreaterThan(firstHeight)
    expect(labelDrawing.querySelectorAll('tspan').length).toBeGreaterThan(firstRows)
    expect(Number(written.getAttribute('viewBox')!.split(' ')[3])).toBeGreaterThan(firstPageHeight)
  } finally {
    if (fontsBefore) Object.defineProperty(document, 'fonts', fontsBefore)
    else Reflect.deleteProperty(document, 'fonts')
    if (boundsBefore) Object.defineProperty(SVGElement.prototype, 'getBBox', boundsBefore)
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
  }
})

it('keeps plain lines free of arrowheads and places arrowheads at their indicated endpoint', () => {
  const view = render(<Scene controls={false} block={{ kind: 'scene', title: 'Directions', width: 400, height: 300, elements: [
    { type: 'line', x1: 40, y1: 80, x2: 300, y2: 150 },
    { type: 'arrow', x1: 40, y1: 180, x2: 300, y2: 250 },
  ] }} />)
  const lines = [...view.container.querySelectorAll('line')]
  expect(lines[0].parentElement!.querySelector('path')).toBeNull()
  const arrowhead = lines[1].parentElement!.querySelector('path')!
  expect(arrowhead).toBeTruthy()
  expect(arrowhead.getAttribute('d')).toContain('L300 250')
})

it('centers wrapped shape annotations around the shape while ordinary writing starts at its given baseline', () => {
  const label = 'A label with several readable rows'
  const view = render(<Scene controls={false} block={{ kind: 'scene', title: 'Annotations', width: 600, height: 400, elements: [
    { type: 'circle', x: 150, y: 150, radius: 120, label },
    { type: 'text', x: 350, y: 150, width: 220, label },
  ] }} />)
  const [centered, plain] = [...view.container.querySelectorAll('text')]
  expect(centered.querySelectorAll('tspan').length).toBeGreaterThan(1)
  expect(Number(centered.querySelector('tspan')!.getAttribute('dy'))).toBeLessThan(0)
  expect(plain.querySelector('tspan')!.getAttribute('dy')).toBe('0')
})

it('ignores an old queued font-fit callback after the learner opens a different scene', async () => {
  const fontsBefore = Object.getOwnPropertyDescriptor(document, 'fonts')
  const boundsBefore = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox')
  const queued: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued.push(callback); return queued.length })
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 20, height: 20 }) })
  const ready = Promise.resolve()
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
  try {
    const first = { kind: 'scene' as const, title: 'Current board', width: 900, height: 700, elements: [{ type: 'rect' as const, x: 0, y: 0, width: 20, height: 20 }] }
    const view = render(<Scene controls={false} block={first} />)
    await act(async () => { await ready })
    expect(queued.length).toBeGreaterThan(0)
    // The next board can have a different pending font load while the old
    // measurement is still queued for the next browser frame.
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise<void>(() => {}) } })
    view.rerender(<Scene controls={false} block={{ ...first, width: 400, height: 300 }} />)
    const latestBox = screen.getByRole('img', { name: 'Current board' }).getAttribute('viewBox')
    await act(async () => { queued.forEach(callback => callback(0)) })
    expect(screen.getByRole('img', { name: 'Current board' }).getAttribute('viewBox')).toBe(latestBox)
  } finally {
    if (fontsBefore) Object.defineProperty(document, 'fonts', fontsBefore)
    else Reflect.deleteProperty(document, 'fonts')
    if (boundsBefore) Object.defineProperty(SVGElement.prototype, 'getBBox', boundsBefore)
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
  }
})
