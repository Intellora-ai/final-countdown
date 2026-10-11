// @vitest-environment jsdom
import { modelLessonSchema } from '../src/lesson'
import { describe, expect, it } from 'vitest'
import { bindSvg, prepareSvg } from '../src/SvgArtwork'
const wrap = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">${content}</svg>`
describe('general SVG artwork', () => {
  it.each([
    '<g transform="rotate(15)"><ellipse cx="120" cy="90" rx="80" ry="40"/></g>',
    '<defs><linearGradient id="paint"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs><path d="M0 0 Q120 200 400 40" fill="url(#paint)"/>',
    '<defs><clipPath id="clip"><circle r="20"/></clipPath><mask id="mask"><rect width="100" height="100" fill="white"/></mask></defs><g clip-path="url(#clip)" mask="url(#mask)"><text x="20" y="30">Any subject</text></g>',
    '<defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter><pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle r="2"/></pattern></defs><rect width="80" height="80" fill="url(#dots)" filter="url(#blur)"/>',
  ])('preserves general vector composition: %s', content => {
    const svg = prepareSvg(wrap(content))
    expect(svg.replace(/board-/g, '')).toContain(content)
  })
  it('removes active content and outside resources even from the exported document', () => {
    const svg = prepareSvg(wrap('<script>alert(1)</script><foreignObject><div>HTML</div></foreignObject><image href="https://outside.test/a"/><style>text{fill:red}</style><rect onclick="alert(1)" fill="url(https://outside.test/p)"/><use href="https://outside.test/other.svg#x"/><animate attributeName="href" values="bad"/>'))
    expect(svg).not.toMatch(/script|foreignObject|<image|<style|onclick|outside\.test|<animate/)
    expect(svg).toContain('<rect')
  })
  it.each(['<div>not SVG</div>', '<svg/>', '<svg viewBox="0 0 0 40"/>', '<svg viewBox="0 0 Infinity 40"/>'])('rejects invalid artwork: %s', source => {
    expect(() => prepareSvg(source)).toThrow()
  })
})

describe('declarative interactive drawings', () => {
  it('evaluates multiple named parameters and math without executing code', () => {
    expect(bindSvg('<circle cx="{{origin+radius*cos(angle)}}" r="{{radius}}"/>', { origin: 20, radius: 10, angle: 0 })).toBe('<circle cx="30" r="10"/>')
    expect(() => bindSvg('{{window.alert(1)}}', {})).toThrow()
    expect(() => bindSvg('{{missing}}', {})).toThrow()
    expect(() => bindSvg('{{1/zero}}', { zero: 0 })).toThrow()
  })
  it('detects broken definitions and duplicate IDs instead of displaying incomplete artwork', () => {
    expect(() => prepareSvg(wrap('<path fill="url(#missing)"/>'))).toThrow(/missing/)
    expect(() => prepareSvg(wrap('<g id="a"/><g id="a"/>'))).toThrow(/unique/)
  })
  it('rejects unusable controls before accepting model output', () => {
    const p = { id: 'radius', label: 'Radius', min: 1, max: 100, value: 20, step: 1 }
    const lesson = (parameters: unknown[]) => ({ explanation: 'Explore.', blocks: [{ kind: 'svg', title: 'Explore', source: wrap('<circle r="{{radius}}"/>'), parameters }] })
    expect(modelLessonSchema.safeParse(lesson([p])).success).toBe(true)
    for (const invalid of [{ ...p, max: 0 }, { ...p, value: 200 }, { ...p, step: 0 }, { ...p, id: 'sin' }]) expect(modelLessonSchema.safeParse(lesson([invalid])).success).toBe(false)
    expect(modelLessonSchema.safeParse(lesson([p, p])).success).toBe(false)
  })
})
