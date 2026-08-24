import { describe, expect, it } from 'vitest'

import { formatCell } from './TableView'

/**
 * Cell formatting is the part of a table that can be wrong without looking
 * wrong: every value below renders as *something*, and only a test can say
 * whether that something is the number the data actually holds.
 *
 * Three things are being defended:
 *   1. an absent value never reads as a measurement;
 *   2. a value too large or too small for grouped digits still reads as itself;
 *   3. ordinary numbers — the ones in almost every row — do not change.
 */

/* -------------------------------------------------------------------------- */
/* 1. Absence is not zero                                                     */
/* -------------------------------------------------------------------------- */

describe('a cell with no value', () => {
  it('renders an em dash for a missing key, a null, and an empty string', () => {
    for (const value of [undefined, null, '', '   ']) {
      const cell = formatCell(value, 'number')
      expect(cell.missing).toBe(true)
      expect(cell.text).toBe('—')
    }
  })

  it('renders an em dash for NaN and Infinity, which are failed sums, not data', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatCell(value, 'number')).toEqual({ text: '—', missing: true })
    }
  })

  it('never produces a blank cell or the string "undefined"', () => {
    for (const type of ['text', 'number', 'percent', 'currency'] as const) {
      const cell = formatCell(undefined, type)
      expect(cell.text.trim()).not.toBe('')
      expect(cell.text).not.toContain('undefined')
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2. The scientific threshold, from both sides                               */
/* -------------------------------------------------------------------------- */

describe('very large and very small magnitudes', () => {
  it('switches to scientific notation at 1e6 and above', () => {
    expect(formatCell(6.02e23, 'number').text).toBe('6.02e+23')
    expect(formatCell(1e6, 'number').text).toBe('1.00e+6')
    expect(formatCell(2_400_000, 'number').text).toBe('2.40e+6')
  })

  it('keeps the sign on a large negative rather than losing it to the exponent', () => {
    expect(formatCell(-6.02e23, 'number').text).toBe('-6.02e+23')
    expect(formatCell(-1e6, 'number').text).toBe('-1.00e+6')
  })

  it('leaves everything just under the threshold grouped', () => {
    expect(formatCell(999_999, 'number').text).toBe('999,999')
    expect(formatCell(-999_999, 'number').text).toBe('-999,999')
    expect(formatCell(999_999.99, 'number').text).toBe('999,999.99')
  })

  it('switches below 1e-4, where two decimal places would print a value as 0', () => {
    expect(formatCell(0.00003, 'number').text).toBe('3.00e-5')
    expect(formatCell(-0.00003, 'number').text).toBe('-3.00e-5')
    // Exactly at the bound, grouped output still says something true.
    expect(formatCell(0.0001, 'number').text).toBe('0')
  })

  it('treats zero as zero, not as a small number', () => {
    expect(formatCell(0, 'number').text).toBe('0')
    expect(formatCell(-0, 'number').text).toBe('-0')
  })

  it('applies the same threshold to percent and currency', () => {
    expect(formatCell(6.02e23, 'percent').text).toBe('6.02e+23%')
    expect(formatCell(6.02e23, 'currency').text).toContain('6.02e+23')
    expect(formatCell(-6.02e23, 'currency').text.startsWith('-')).toBe(true)
  })

  it('keeps the currency symbol when the value goes scientific', () => {
    const ordinary = formatCell(1234, 'currency').text
    const huge = formatCell(6.02e23, 'currency').text
    const symbol = ordinary.replace(/[\d.,\s-]/g, '')
    expect(symbol.length).toBeGreaterThan(0)
    expect(huge).toContain(symbol)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. Ordinary numbers are untouched                                          */
/* -------------------------------------------------------------------------- */

describe('the numbers that appear in almost every row', () => {
  it('formats by column type, and the common cases do not change', () => {
    expect(formatCell(103.9, 'number').text).toBe('103.9')
    expect(formatCell(41.4, 'percent').text).toBe('41.4%')
    expect(formatCell(100, 'percent').text).toBe('100%')
    expect(formatCell(1234.5, 'number').text).toBe('1,234.5')
  })

  it('formats currency with a symbol', () => {
    const text = formatCell(1234.5, 'currency').text
    expect(text).toMatch(/\d/)
    expect(text.replace(/[\d.,\s-]/g, '').length).toBeGreaterThan(0)
  })

  it('passes a string through untouched rather than coercing it to NaN', () => {
    expect(formatCell('n/a', 'number')).toEqual({ text: 'n/a', missing: false })
    expect(formatCell('<0.01', 'percent')).toEqual({ text: '<0.01', missing: false })
  })

  it('shows a number in a TEXT column exactly as written', () => {
    // The author declared the column text; adding separators would override that.
    expect(formatCell(1234567, 'text').text).toBe('1234567')
  })
})
