import { expect, it } from 'vitest'
import { paperInk } from '../src/ink'
it('preserves dark ink and darkens pale colors for paper', () => {
  expect(paperInk('#292b30')).toBe('#292b30')
  expect(paperInk('#ffffff')).not.toBe('#ffffff')
  expect(paperInk('#9cd8ff')).not.toBe('#9cd8ff')
  expect(paperInk('#000000')).toBe('#000000')
})
