import { describe, expect, it } from 'vitest'
import { wrapText } from '../src/text-layout'
describe('measured text wrapping', () => {
  it.each(['wide words and tiny words', 'averylongunbrokenidentifier', '日本語の長い説明', '🙂🙂🙂🙂', 'first\n\nlast'])('preserves content and keeps rows within measured width: %s', text => {
    const measure = (s: string) => Array.from(s).reduce((n, c) => n + (c === 'i' ? 1 : 2), 0)
    const rows = wrapText(text, 12, measure)
    expect(rows.every(row => measure(row) <= 12)).toBe(true)
    expect(rows.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
    if (!text.includes('\n\n')) expect(rows.every(row => row.length > 0)).toBe(true)
    if (text.includes('\n\n')) expect(rows).toContain('')
    if (!/\s/u.test(text)) for (let i = 0; i < rows.length - 1; i++) {
      const nextCodepoint = Array.from(rows[i + 1])[0]
      expect(measure(rows[i] + nextCodepoint)).toBeGreaterThan(12)
    }
  })
})
