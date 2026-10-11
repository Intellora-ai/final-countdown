import { describe, expect, it } from 'vitest'
import { wrapText } from '../src/text-layout'
describe('measured text wrapping', () => {
  it.each(['wide words and tiny words', 'averylongunbrokenidentifier', '日本語の長い説明', '🙂🙂🙂🙂', 'first\n\nlast'])('preserves content and keeps rows within measured width: %s', text => {
    const measure = (s: string) => Array.from(s).reduce((n, c) => n + (c === 'i' ? 1 : 2), 0)
    const rows = wrapText(text, 12, measure)
    expect(rows.every(row => measure(row) <= 12)).toBe(true)
    expect(rows.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
    if (text.includes('\n\n')) expect(rows).toContain('')
  })
})
