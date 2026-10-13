import { useEffect, useMemo, useState } from 'react'
import { WrittenReply } from './WrittenReply'
import { calculate } from './math'
import { plotPath } from './drawing'
import type { Lesson } from './lesson'
import DOMPurify from 'dompurify'
import handwritingFont from '../public/fonts/Caveat.ttf?inline'

// These CSS longhands have equivalent SVG presentation attributes. Everything
// else remains unsupported; the ordinary sanitizer/resource checks still apply.
const presentationStyles = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing', 'stop-color', 'stop-opacity']
function plotTuple(source: string | null) {
  const tokens = (source ?? '').trim().split(/[\s,]+/)
  const values = tokens.map(Number)
  if (tokens.length !== 4 || tokens.some(token => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) || values.some(value => !Number.isFinite(value) || Math.abs(value) > 10000)) throw new Error('Plot boxes and domains need four finite numbers between -10000 and 10000.')
  return values
}

type Parameter = NonNullable<Extract<Lesson['blocks'][number], { kind: 'svg' }>['parameters']>[number]
export function bindSvg(source: string, values: Record<string, number>) {
  return source.replace(/\{\{([^{}]+)\}\}/g, (_, expression: string) => String(calculate(expression, undefined, values)))
}
// Render in the browser's SVG image context, never as active document markup.
// Sanitize the exported copy too, because it may later be opened as a document.
export function prepareSvg(source: string) {
  const input = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (input.querySelector('parsererror') || input.documentElement.localName !== 'svg') throw new Error('Return a complete SVG drawing with a viewBox.')
  const ids = Array.from(input.querySelectorAll('[id]')).map(element => element.id)
  if (new Set(ids).size !== ids.length) throw new Error('SVG element IDs must be unique.')
  // Evaluate bounded numeric declarations before sanitization can remove an
  // invalid marker and accidentally leave a model's incorrect fallback path.
  const plots = Array.from(input.querySelectorAll('path[data-plot]'))
  const axes = Array.from(input.querySelectorAll('g[data-axes]'))
  if (plots.length > 32 || axes.length > 32) throw new Error('A drawing may contain at most 32 computed plots and 32 axes groups.')
  for (const element of [...plots, ...axes]) {
    const [x, y, width, height] = plotTuple(element.getAttribute('data-box'))
    const [xMin, xMax, yMin, yMax] = plotTuple(element.getAttribute('data-domain'))
    if (width <= 0 || height <= 0 || xMin >= xMax || yMin >= yMax) throw new Error('Plot dimensions must be positive and domain ranges must increase.')
    if (element.localName === 'path') {
      const expression = element.getAttribute('data-plot')?.trim() ?? ''
      if (!expression || expression.length > 200) throw new Error('A plot needs an expression of 1–200 characters.')
      const geometry = plotPath({ expression, x, y, width, height, xMin, xMax, yMin, yMax })
      if (!geometry) throw new Error('The plot has no drawable curve in this range. Check its expression and domain.')
      element.setAttribute('d', geometry)
    } else {
      if (element.getAttribute('data-axes') !== 'true') throw new Error('An axes declaration must use data-axes="true".')
      element.replaceChildren()
      const size = Math.min(width, height) / 15
      const append = (tag: string, attributes: Record<string, number | string>, text = '') => {
        const child = input.createElementNS('http://www.w3.org/2000/svg', tag)
        for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, String(value))
        child.textContent = text; element.append(child)
      }
      const ink = { stroke: 'currentColor', 'stroke-width': size / 12 }
      if (yMin <= 0 && yMax >= 0) {
        const axisY = y + yMax / (yMax - yMin) * height
        append('line', { x1: x, y1: axisY, x2: x + width, y2: axisY, ...ink })
        append('text', { x: x + width - size / 5, y: Math.max(y + size, axisY - size / 3), 'font-size': size, 'text-anchor': 'end', fill: 'currentColor' }, 'x')
      }
      if (xMin <= 0 && xMax >= 0) {
        const axisX = x - xMin / (xMax - xMin) * width
        append('line', { x1: axisX, y1: y, x2: axisX, y2: y + height, ...ink })
        append('text', { x: Math.min(x + width - size, axisX + size / 3), y: y + size, 'font-size': size, fill: 'currentColor' }, 'y')
      }
    }
  }
  const style = document.createElement('span').style
  for (const element of Array.from(input.querySelectorAll('[style]'))) {
    style.cssText = element.getAttribute('style') ?? ''
    for (const property of presentationStyles) {
      const value = style.getPropertyValue(property)
      if (value) element.setAttribute(property, value)
    }
    element.removeAttribute('style')
  }
  // Avoid IDs such as 'blur' being stripped as browser-global name collisions.
  for (const element of Array.from(input.querySelectorAll('*'))) {
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === 'id') attr.value = `board-${attr.value}`
      else if (['href', 'xlink:href'].includes(attr.name) && attr.value.startsWith('#')) attr.value = `#board-${attr.value.slice(1)}`
      else attr.value = attr.value.replace(/url\(\s*(['"]?)#([^\s'"()\\]+)\1\s*\)/gi, 'url(#board-$2)')
    }
  }
  const clean = DOMPurify.sanitize(new XMLSerializer().serializeToString(input), {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['foreignObject', 'image', 'style', 'a', 'animate', 'animateMotion', 'animateTransform', 'set'],
    FORBID_ATTR: ['style'],
  })
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const root = doc.documentElement
  if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('Return a complete SVG drawing with a viewBox.')
  const coordinates = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/)
  const box = coordinates.map(Number)
  if (box.length !== 4 || !coordinates.every(value => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || box.some(n => Math.abs(n) > 100000)) throw new Error('The SVG needs a finite, positive viewBox.')
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(element.attributes)) {
      // Resource references may only target definitions inside this drawing.
      if (attr.value.includes('\\') || (['href', 'xlink:href'].includes(attr.name) && !/^#[^\s'"()\\]+$/.test(attr.value)) ||
          (/url\s*\(/i.test(attr.value) && !/^url\(\s*(['"]?)#[^\s'"()\\]+\1\s*\)$/i.test(attr.value))) element.removeAttributeNode(attr)
    }
  }
  const available = new Set(Array.from(root.querySelectorAll('[id]')).map(element => element.id))
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(element.attributes)) {
      const reference = ['href', 'xlink:href'].includes(attr.name) ? attr.value.slice(1) : attr.value.match(/^url\(#([^\s'"()\\]+)\)$/)?.[1]
      if (reference && !available.has(reference)) throw new Error(`The drawing references a missing SVG definition: ${reference.replace(/^board-/, '')}.`)
    }
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  root.setAttribute('width', String(box[2])); root.setAttribute('height', String(box[3]))
  if (root.querySelector('text')) {
    if (!root.getAttribute('font-family')) root.setAttribute('font-family', 'Caveat, cursive')
    for (const element of [root, ...Array.from(root.querySelectorAll('[font-family]'))]) {
      if (/^cursive$/i.test(element.getAttribute('font-family')?.trim() ?? '')) element.setAttribute('font-family', 'Caveat, cursive')
    }
    // SVG images cannot inherit page fonts. Only this trusted bundled font CSS
    // is added after sanitization, so the same drawing also works when saved.
    const font = doc.createElementNS('http://www.w3.org/2000/svg', 'style')
    font.textContent = `@font-face{font-family:Caveat;src:url('${handwritingFont}') format('truetype');font-style:normal;font-weight:400 700}`
    root.prepend(font)
  }
  return new XMLSerializer().serializeToString(root)
}
export default function SvgArtwork({ source, title, parameters = [], fallbackText }: { source: string; title: string; parameters?: Parameter[]; fallbackText?: string }) {
  const [changes, setChanges] = useState<Record<string, number>>({})
  useEffect(() => { setChanges({}) }, [source])
  const values = Object.fromEntries(parameters.map(p => [p.id, Math.max(p.min, Math.min(p.max, changes[p.id] ?? p.value))]))
  const [zoom, setZoom] = useState(1)
  const drawing = useMemo(() => {
    try { return { svg: prepareSvg(bindSvg(source, values)), error: '' } }
    catch (error) { return { svg: '', error: error instanceof Error ? error.message : 'The SVG could not be rendered.' } }
  }, [source, JSON.stringify(values)])
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}`
  return <div className="board-drawing artwork-surface">
    <div className="drawing-tools" aria-label={`${title} controls`}>
      <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
      <button onClick={() => setZoom(1)}>Fit</button>
      <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
      <span>{Math.round(zoom * 100)}%</span>{!drawing.error && <a href={url} download="artwork.svg">Save SVG</a>}
    </div>
    {parameters.length > 0 && <fieldset className="artwork-controls"><legend>Explore</legend>{parameters.map(p => <label key={p.id}>{p.label} <output>{values[p.id]}</output><input type="range" aria-label={p.label} min={p.min} max={p.max} step={p.step} value={values[p.id]} onChange={event => setChanges(current => ({ ...current, [p.id]: Number(event.target.value) }))} /></label>)}<button onClick={() => setChanges({})}>Reset controls</button></fieldset>}
    {drawing.error ? <><p role="alert">The drawing could not be evaluated: {drawing.error}</p>{fallbackText && <WrittenReply text={fallbackText} />}</> : <div className="drawing-viewport" tabIndex={0} aria-label={`Pan ${title}`}><img src={url} alt={title} style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: 'block' }} /></div>}
  </div>
}
