// @vitest-environment jsdom
import { lessonInstructions, modelLessonSchema } from '../src/lesson'
import { describe, expect, it } from 'vitest'
import { bindSvg, prepareSvg } from '../src/SvgArtwork'
const wrap = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">${content}</svg>`
const documentFor = (source: string) => new DOMParser().parseFromString(prepareSvg(source), 'image/svg+xml')

describe('computed SVG function curves', () => {
  const source = (expression: string, box = '100 50 400 300', domain = '-2 2 -2 2') => wrap(`<path data-plot="${expression}" data-box="${box}" data-domain="${domain}" fill="none" stroke="blue"/>`)
  const points = (svg: string) => Array.from(documentFor(svg).querySelector('path')!.getAttribute('d')?.matchAll(/([ML])([-\d.]+) ([-\d.]+)/g) ?? [], match => ({ move: match[1], x: Number(match[2]), y: Number(match[3]) }))

  it.each([
    { expression: 'x', domain: '-2 2 -2 2', expected: [[100, 350], [300, 200], [500, 50]] },
    { expression: 'abs(x)', domain: '-2 2 0 2', expected: [[100, 50], [300, 350], [500, 50]] },
    { expression: 'x^2', domain: '-2 2 0 4', expected: [[100, 50], [300, 350], [500, 50]] },
    { expression: 'sin(x)', domain: `0 ${2 * Math.PI} -1 1`, expected: [[100, 200], [300, 200], [500, 200]] },
  ])('maps $expression into mathematical upward y coordinates', ({ expression, domain, expected }) => {
    const curve = points(source(expression, undefined, domain))
    expect(curve).toHaveLength(401)
    expect([curve[0], curve[200], curve[400]].map(({ x, y }) => [x, y])).toEqual(expected)
    if (expression === 'x^2') expect(curve[100]).toEqual({ move: 'L', x: 200, y: 275 })
    if (expression === 'sin(x)') {
      expect(curve[100]).toEqual({ move: 'L', x: 200, y: 50 })
      expect(curve[300]).toEqual({ move: 'L', x: 400, y: 350 })
    }
  })
  it('renders the exact path convention taught to the model', () => {
    const example = lessonInstructions.match(/<path\s+data-plot="[^"]+"[^>]*\/>/)?.[0]
    expect(example).toBeTruthy()
    const curve = points(wrap(example!))
    expect([curve[0], curve[200], curve[400]].map(({ x, y }) => [x, y])).toEqual([[40, 40], [240, 265], [440, 40]])
  })
  it('binds controls before computing geometry and overwrites a model-sketched path', () => {
    const controlled = source('{{slope}}*x').replace('fill="none"', 'd="M100 50 L500 350" fill="none"')
    const rising = points(bindSvg(controlled, { slope: 1 }))
    const falling = points(bindSvg(controlled, { slope: -1 }))
    expect([rising[0].y, rising.at(-1)!.y]).toEqual([350, 50])
    expect([falling[0].y, falling.at(-1)!.y]).toEqual([50, 350])
  })
  it('rejects malformed declarations even when sanitization would remove their marker', () => {
    expect(() => prepareSvg(source('x]&gt;').replace('fill="none"', 'd="M100 50 L500 350" fill="none"'))).toThrow(/plot/i)
  })
  it('draws thin visible crossings and rejects an isolated point with no drawable segment', () => {
    expect(points(source('x', '0 0 400 300', '-2 2 -.001 .001')).some(point => point.move === 'L')).toBe(true)
    expect(() => prepareSvg(source('x^2', '0 0 400 300', '-2 2 -1 0'))).toThrow(/plot/i)
  })
  it('leaves holes in undefined or out-of-range parts rather than connecting across them', () => {
    const reciprocal = points(source('1/x', '0 0 400 400'))
    expect(reciprocal.filter(point => point.move === 'M')).toHaveLength(2)
    expect(reciprocal.every(point => point.x <= 150 || point.x >= 250)).toBe(true)
    expect(reciprocal.every(point => point.y >= 0 && point.y <= 400)).toBe(true)
    const root = points(source('sqrt(x)', '0 0 400 400'))
    expect(root[0]).toEqual({ move: 'M', x: 200, y: 200 })
    expect(root.every(point => point.x >= 200 && point.y <= 200)).toBe(true)
  })
  it.each([
    ['empty expression', '', '0 0 400 300', '-2 2 -2 2'],
    ['long expression', 'x+'.repeat(100) + '1', '0 0 400 300', '-2 2 -2 2'],
    ['executable expression', 'window.alert(1)', '0 0 400 300', '-2 2 -2 2'],
    ['resource expression', 'url(https://outside.test)', '0 0 400 300', '-2 2 -2 2'],
    ['no visible points', '100', '0 0 400 300', '-2 2 -2 2'],
    ['missing box coordinates', 'x', '0 0 400', '-2 2 -2 2'],
    ['hex box coordinates', 'x', '0 0 0x100 300', '-2 2 -2 2'],
    ['zero box width', 'x', '0 0 0 300', '-2 2 -2 2'],
    ['negative box height', 'x', '0 0 400 -300', '-2 2 -2 2'],
    ['unbounded box', 'x', '10001 0 400 300', '-2 2 -2 2'],
    ['nonfinite domain', 'x', '0 0 400 300', '-Infinity 2 -2 2'],
    ['reversed x range', 'x', '0 0 400 300', '2 -2 -2 2'],
    ['zero y range', 'x', '0 0 400 300', '-2 2 2 2'],
  ])('rejects %s instead of silently drawing invented geometry', (_, expression, box, domain) => {
    expect(() => prepareSvg(source(expression, box, domain))).toThrow(/plot/i)
  })
  it('accepts ordinary SVG decimal formatting for plot boxes and domains', () => {
    const curve = points(source('x', ' 1e2, +50, 400., 3e2 ', ' -2, 2, -2, 2 '))
    expect(curve[0]).toEqual({ move: 'M', x: 100, y: 350 })
  })
  it('bounds local plotting work without restricting ordinary vector artwork', () => {
    const path = '<path data-plot="x" data-box="0 0 400 300" data-domain="-2 2 -2 2"/>'
    expect(documentFor(wrap(path.repeat(32))).querySelectorAll('path[d]')).toHaveLength(32)
    expect(() => prepareSvg(wrap(path.repeat(33)))).toThrow(/plot/i)
    const drawing = '<path d="M10 40 Q50 0 90 40" stroke="blue" fill="none"/>'
    expect(prepareSvg(wrap(drawing))).toContain(drawing)
  })
})

describe('computed SVG zero axes', () => {
  const axes = (domain: string, attrs = '') => documentFor(wrap(`<g data-axes="true" data-box="40 40 400 300" data-domain="${domain}" ${attrs}/>`))
  const lines = (doc: Document) => Array.from(doc.querySelectorAll('line')).map(line => ['x1', 'y1', 'x2', 'y2'].map(key => Number(line.getAttribute(key))))
  it('places zero at its actual position in asymmetric ranges using the exact prompt example', () => {
    const example = lessonInstructions.match(/<g\s+data-axes="true"[^>]*\/>/)?.[0]
    expect(example).toBeTruthy()
    const doc = documentFor(wrap(example!))
    expect(lines(doc)).toEqual(expect.arrayContaining([[40, 265, 440, 265], [240, 40, 240, 340]]))
    expect(Array.from(doc.querySelectorAll('text')).map(text => text.textContent).sort()).toEqual(['x', 'y'])
  })
  it('omits absent zero axes and includes zero exactly on a boundary', () => {
    expect(lines(axes('1 3 2 5'))).toEqual([])
    expect(lines(axes('0 4 -2 0'))).toEqual(expect.arrayContaining([[40, 40, 440, 40], [40, 40, 40, 340]]))
    expect(lines(axes('-2 2 1 3'))).toEqual([[240, 40, 240, 340]])
  })
  it('recomputes explicit axis declarations while preserving unrelated manual artwork', () => {
    const doc = documentFor(wrap('<g data-axes="true" data-box="40 40 400 300" data-domain="-3 3 -1 3"><line x1="0" y1="0" x2="1" y2="1"/></g><line id="manual" x1="10" y1="20" x2="30" y2="40"/>'))
    expect(doc.querySelector('g')!.querySelectorAll('line')).toHaveLength(2)
    expect(doc.querySelector('#board-manual')!.getAttribute('y1')).toBe('20')
  })
  it('validates and bounds axis declarations before sanitization', () => {
    expect(() => axes('3 -3 -1 3')).toThrow(/plot|axes/i)
    expect(() => prepareSvg(wrap('<g data-axes="true]&gt;" data-box="40 40 400 300" data-domain="-3 3 -1 3"/>'))).toThrow(/axes/i)
    expect(() => prepareSvg(wrap('<g data-axes="true" data-box="40 40 400 300" data-domain="-3 3 -1 3"/>'.repeat(33)))).toThrow(/plot|axes/i)
  })
})

describe('standalone artwork typography', () => {
  it('embeds the bundled handwriting font in generated SVG rather than relying on page CSS', () => {
    const doc = documentFor(wrap('<text x="20" y="40">Read me anywhere</text>'))
    expect(doc.documentElement.getAttribute('font-family')).toBe('Caveat, cursive')
    const font = doc.querySelector('style')!.textContent!
    expect(font).toMatch(/@font-face\{font-family:Caveat;/)
    expect(font).toMatch(/src:url\(['"]?data:font\/ttf;base64,[A-Za-z0-9+/=]+['"]?\)/)
    expect(font).not.toContain('/fonts/')
    expect(font).toContain('font-weight:400 700')
  })
  it('uses consistent handwriting for cursive while preserving explicit serif and monospace text', () => {
    const doc = documentFor(wrap('<g font-family="cursive"><text>Handwritten</text></g><text font-family="serif">Formula</text><text font-family="monospace">Code</text>'))
    expect(doc.querySelector('g')!.getAttribute('font-family')).toBe('Caveat, cursive')
    expect(Array.from(doc.querySelectorAll('text')).map(text => text.getAttribute('font-family'))).toEqual([null, 'serif', 'monospace'])
  })
  it('does not attach an unused font to drawings containing only shapes', () => {
    expect(documentFor(wrap('<circle r="10"/>')).querySelector('style')).toBeNull()
  })
  it('preserves safe inline ink and typography as presentation attributes', () => {
    const doc = documentFor(wrap('<g style="fill:#315b49;stroke:#b45b32;stroke-width:2;opacity:.8"><text x="20" y="40" fill="black" style="fill:rgb(10,20,30);font-family:cursive;font-size:32px;font-weight:700;text-anchor:middle">Readable</text></g>'))
    const group = doc.querySelector('g')!, text = doc.querySelector('text')!
    expect(group.getAttribute('fill')).toBe('rgb(49, 91, 73)')
    expect(group.getAttribute('stroke')).toBe('rgb(180, 91, 50)')
    expect(Number(group.getAttribute('stroke-width'))).toBe(2)
    expect(Number(group.getAttribute('opacity'))).toBe(.8)
    expect(text.getAttribute('fill')).toMatch(/rgb\(10,\s*20,\s*30\)/)
    expect(text.getAttribute('font-family')).toBe('Caveat, cursive')
    expect(text.getAttribute('font-size')).toBe('32px')
    expect(text.getAttribute('font-weight')).toBe('700')
    expect(text.getAttribute('text-anchor')).toBe('middle')
    expect(doc.querySelector('[style]')).toBeNull()
  })
  it('keeps a local paint reference from inline styles without permitting outside styles or resources', () => {
    const doc = documentFor(wrap('<defs><linearGradient id="paint"><stop offset="0" stop-color="blue"/></linearGradient></defs><rect style="fill:url(#paint);stroke:url(https://outside.test/paint);background-image:url(https://outside.test/image)"/><style>@import url(https://outside.test/font);text{fill:red}</style><text style="font-family:cursive;filter:url(https://outside.test/filter)">Safe text</text>'))
    expect(doc.querySelector('rect')!.getAttribute('fill')).toBe('url(#board-paint)')
    expect(doc.querySelector('rect')!.hasAttribute('stroke')).toBe(false)
    expect(doc.querySelector('[style]')).toBeNull()
    expect(doc.documentElement.outerHTML).not.toContain('outside.test')
    expect(doc.querySelectorAll('style')).toHaveLength(1)
    expect(doc.querySelector('style')!.textContent).not.toContain('@import')
  })
})

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
  it.each(['paint:blue', '光', 'café'])('keeps local SVG definitions usable for legal ID %s', id => {
    const svg = prepareSvg(wrap(`<defs><linearGradient id="${id}"><stop offset="0" stop-color="#ff0000"/></linearGradient><symbol id="${id}-shape"><circle r="20"/></symbol></defs><rect width="100" height="100" fill="url(#${id})"/><use href="#${id}-shape"/>`))
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const definition = doc.querySelector('linearGradient')!.id
    expect(definition).toBeTruthy()
    expect(doc.querySelector('rect')!.getAttribute('fill')).toBe(`url(#${definition})`)
    expect(doc.querySelector('use')!.getAttribute('href')).toBe(`#${doc.querySelector('symbol')!.id}`)
  })
  it.each(['https://outside.test/x.svg#shape', '//outside.test/x.svg#shape', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)'])('does not retain outside or active reusable-shape resource %s', href => {
    const svg = prepareSvg(wrap(`<use href="${href}"/><feImage href="${href}"/><rect fill="url(${href})"/>`))
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(Array.from(doc.querySelectorAll('*')).some(element => element.hasAttribute('href'))).toBe(false)
    expect(doc.querySelector('rect')!.hasAttribute('fill')).toBe(false)
  })
  it.each(['<div>not SVG</div>', '<svg/>', '<svg viewBox="0 0 0 40"/>', '<svg viewBox="0 0 Infinity 40"/>'])('rejects invalid artwork: %s', source => {
    expect(() => prepareSvg(source)).toThrow()
  })
  it.each(['div', 'html'])('requires an SVG document root instead of unwrapping a nested SVG inside %s', wrapper => {
    expect(() => prepareSvg(`<${wrapper}>${wrap('<rect width="100" height="100"/>')}</${wrapper}>`)).toThrow(/complete SVG/)
  })
  it.each(['0x100', '0b10', '0o200'])('rejects JavaScript-only number syntax %s in SVG coordinates', width => {
    expect(() => prepareSvg(`<svg viewBox="0 0 ${width} 200"><rect width="100" height="100"/></svg>`)).toThrow(/viewBox/)
  })
  it.each([' 0 0 600 400 ', '\t0 0 600 400\n', ' -1e1, +.5, 6e2, 400. '])('accepts valid SVG coordinate formatting %s', viewBox => {
    const svg = prepareSvg(`<svg viewBox="${viewBox}"><rect width="100" height="100"/></svg>`)
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.documentElement.getAttribute('width')).toBe('600')
    expect(doc.documentElement.getAttribute('height')).toBe('400')
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
