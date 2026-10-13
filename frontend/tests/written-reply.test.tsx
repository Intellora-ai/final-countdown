// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { WrittenReply } from '../src/WrittenReply'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function fixedMetrics(width = 320) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: 100, width, height: 100, toJSON: () => ({}) })
  vi.stubGlobal('CanvasRenderingContext2D', function CanvasRenderingContext2D() {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: (text: string) => ({ width: Array.from(text).length * 20 }) } as unknown as CanvasRenderingContext2D)
}
const board = () => screen.getByRole('img', { name: 'Written answer' })
const active = () => board().querySelector('[data-active="true"]')

it('keeps the complete literal answer in measured SVG rows, without legacy scene controls', () => {
  fixedMetrics()
  const text = 'First idea.\n\nA literal <script> is text; 😀 and 中文 remain complete.'
  render(<WrittenReply text={text} reveal />)
  expect(board().textContent!.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  expect(board().querySelectorAll('.handwriting-row').length).toBeGreaterThan(2)
  expect(board().querySelector('script, foreignObject')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  expect(active()).toBeNull()
  expect(board().closest('.written-reply')!.getAttribute('data-reveal')).toBe('true')
  expect([...board().querySelectorAll<SVGElement>('.handwriting-row')].map(row => row.style.getPropertyValue('--row-index'))).toEqual([...board().querySelectorAll('.handwriting-row')].map((_, i) => String(i)))
})

it('follows original UTF-16 offsets across collapsed spaces, paragraph breaks and surrogate pairs', () => {
  fixedMetrics()
  const text = '  😀 alpha   beta\n\n   中文 gamma\t delta'
  const view = render(<WrittenReply text={text} progress={text.indexOf('😀')} />)
  expect(active()?.textContent).toContain('😀 alpha')
  view.rerender(<WrittenReply text={text} progress={text.indexOf('😀') + 1} />)
  expect(active()?.textContent).toContain('😀 alpha')
  view.rerender(<WrittenReply text={text} progress={text.indexOf('beta') - 1} />)
  expect(active()?.textContent).toContain('😀 alpha')
  view.rerender(<WrittenReply text={text} progress={text.indexOf('beta')} />)
  expect(active()?.textContent).toBe('beta')
  view.rerender(<WrittenReply text={text} progress={text.indexOf('中文') - 1} />)
  expect(active()?.textContent).toBe('beta')
  view.rerender(<WrittenReply text={text} progress={text.indexOf('中文')} />)
  expect(active()?.textContent).toContain('中文 gamma')
  const chineseHighlight = Number(board().querySelector('.spoken-highlight')!.getAttribute('y'))
  view.rerender(<WrittenReply text={text} progress={text.indexOf('delta')} />)
  expect(active()?.textContent).toBe('delta')
  expect(board().querySelectorAll('[data-active="true"]')).toHaveLength(1)
  expect(Number(board().querySelector('.spoken-highlight')!.getAttribute('y'))).toBeGreaterThan(chineseHighlight)
  expect(board().textContent!.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
})

it('clears a cancelled or completed highlight without hiding any rows or replaying saved writing', () => {
  fixedMetrics()
  const text = 'A complete answer with several handwritten rows.'
  const view = render(<WrittenReply text={text} progress={0} />)
  expect(active()).toBeTruthy()
  const completeText = board().textContent
  for (const progress of [undefined, text.length, -1, NaN]) {
    view.rerender(<WrittenReply text={text} progress={progress} />)
    expect(active()).toBeNull()
    expect(board().querySelector('.spoken-highlight')).toBeNull()
    expect(board().textContent).toBe(completeText)
    expect(board().closest('.written-reply')!.getAttribute('data-reveal')).toBe('false')
  }
})

it('positions rows after blank paragraphs at the same absolute baseline as their speech highlight', () => {
  fixedMetrics()
  const text = 'Before.\n\n\nAfter.'
  render(<WrittenReply text={text} progress={text.indexOf('After.')} />)
  const rows = [...board().querySelectorAll('.handwriting-row')]
  expect(rows.map(row => row.textContent)).toEqual(['Before.', '', '', 'After.'])
  expect(rows.map(row => row.getAttribute('y'))).toEqual(['64', '103', '142', '181'])
  expect(active()).toBe(rows[3])
  expect(Number(board().querySelector('.spoken-highlight')!.getAttribute('y'))).toBe(Number(rows[3].getAttribute('y')) - 32)
  expect(board().textContent).toBe('Before.After.')
})

it('keeps the current spoken word highlighted after responsive reflow', () => {
  let width = 800
  fixedMetrics(width)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: 100, width, height: 100, toJSON: () => ({}) }))
  let resize!: ResizeObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback } observe() {} disconnect = disconnect })
  const text = 'One clear idea follows another. Keep every word on this board.'
  const view = render(<WrittenReply text={text} progress={text.indexOf('every')} />)
  expect(active()?.textContent).toContain('every')
  const wideRows = board().querySelectorAll('.handwriting-row').length
  width = 320
  act(() => resize([], {} as ResizeObserver))
  expect(board().querySelectorAll('.handwriting-row').length).toBeGreaterThan(wideRows)
  expect(active()?.textContent).toContain('every')
  expect(board().querySelectorAll('[data-active="true"]')).toHaveLength(1)
  expect(board().textContent!.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  view.unmount()
  expect(disconnect).toHaveBeenCalledTimes(1)
})

it.each([{ zoom: 1.25, layoutWidth: 286 }, { zoom: 1.5, layoutWidth: 239 }, { zoom: 1.25, layoutWidth: 920 }])('magnifies handwriting at $zoom zoom using the unzoomed $layoutWidth-pixel layout width', ({ zoom, layoutWidth }) => {
  fixedMetrics(layoutWidth)
  const physicalWidth = layoutWidth * zoom
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: physicalWidth, bottom: 100, width: physicalWidth, height: 100, toJSON: () => ({}) })
  const text = 'Readable writing stays complete while the board is enlarged.'
  render(<WrittenReply text={text} progress={text.indexOf('board')} />)
  const viewBoxWidth = Number(board().getAttribute('viewBox')!.split(' ')[2])
  const fontSize = Number(board().querySelector('text')!.getAttribute('font-size'))
  expect(fontSize * physicalWidth / viewBoxWidth).toBeCloseTo(32 * zoom)
  expect(viewBoxWidth).toBe(layoutWidth)
  expect([...board().querySelectorAll('.handwriting-row')].every(row => Array.from(row.textContent!).length * 20 <= layoutWidth - 96)).toBe(true)
  expect(active()?.textContent).toContain('board')
  expect(board().textContent!.replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
})
