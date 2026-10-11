import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'

// Render in the browser's SVG image context, never as active document markup.
// Sanitize the exported copy too, because it may later be opened as a document.
export function prepareSvg(source: string) {
  const input = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (input.querySelector('parsererror') || input.documentElement.localName !== 'svg') throw new Error('Return a complete SVG drawing with a viewBox.')
  // Avoid IDs such as 'blur' being stripped as browser-global name collisions.
  for (const element of [input.documentElement, ...Array.from(input.querySelectorAll('*'))]) {
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === 'id') attr.value = `board-${attr.value}`
      else if (['href', 'xlink:href'].includes(attr.name) && attr.value.startsWith('#')) attr.value = `#board-${attr.value.slice(1)}`
      else attr.value = attr.value.replace(/url\(\s*(['"]?)#([\w.-]+)\1\s*\)/gi, 'url(#board-$2)')
    }
  }
  const clean = DOMPurify.sanitize(new XMLSerializer().serializeToString(input), {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'image', 'style', 'a', 'animate', 'animateMotion', 'animateTransform', 'set'],
    FORBID_ATTR: ['style'],
  })
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const root = doc.documentElement
  if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('Return a complete SVG drawing with a viewBox.')
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || box.some(n => Math.abs(n) > 100000)) throw new Error('The SVG needs a finite, positive viewBox.')
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(element.attributes)) {
      // Resource references may only target definitions inside this drawing.
      if ((['href', 'xlink:href'].includes(attr.name) && !/^#[\w.-]+$/.test(attr.value)) ||
          (/url\s*\(/i.test(attr.value) && !/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(attr.value))) element.removeAttributeNode(attr)
    }
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  root.setAttribute('width', String(box[2])); root.setAttribute('height', String(box[3]))
  return new XMLSerializer().serializeToString(root)
}
export default function SvgArtwork({ source, title }: { source: string; title: string }) {
  const [zoom, setZoom] = useState(1)
  const drawing = useMemo(() => {
    try { return { svg: prepareSvg(source), error: '' } }
    catch (error) { return { svg: '', error: error instanceof Error ? error.message : 'The SVG could not be rendered.' } }
  }, [source])
  if (drawing.error) return <p role="alert">{drawing.error}</p>
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}`
  return <div className="board-drawing">
    <div className="drawing-tools" aria-label={`${title} controls`}>
      <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
      <button onClick={() => setZoom(1)}>Fit</button>
      <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
      <span>{Math.round(zoom * 100)}%</span><a href={url} download="artwork.svg">Save SVG</a>
    </div>
    <div className="drawing-viewport" tabIndex={0} aria-label={`Pan ${title}`}><img src={url} alt={title} style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: 'block' }} /></div>
  </div>
}
