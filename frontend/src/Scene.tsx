import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Lesson } from './lesson'
import { paperInk } from './ink'
import { plotPath, polygonPoints } from './drawing'
import { wrapText, fontMeasure } from './text-layout'
const MathNote = lazy(() => import('./MathNote'))

type SceneBlock = Extract<Lesson['blocks'][number], { kind: 'scene' }>
type Element = SceneBlock['elements'][number]
function Label({ x, y, label, width = 300, size = 28, center = false, color = 'currentColor' }: { x: number; y: number; label: string; width?: number; size?: number; center?: boolean; color?: string }) {
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => { let active = true; void document.fonts?.ready.then(() => { if (active) setFontReady(true) }); return () => { active = false } }, [])
  const rows = useMemo(() => wrapText(label, width, fontMeasure(size)), [label, width, size, fontReady])
  return <text x={x} y={y} fill={color} fontSize={size} textAnchor={center ? 'middle' : 'start'}>
    {rows.map((row, i) => <tspan key={i} x={x} dy={i === 0 ? (center ? -(rows.length - 1) * size * 0.6 + size * 0.3 : 0) : size * 1.2}>{row}</tspan>)}
  </text>
}
function Draw({ element }: { element: Element }) {
  const color = 'color' in element && element.color ? paperInk(element.color) : 'currentColor'
  const stroke = { stroke: color, strokeWidth: ('strokeWidth' in element ? element.strokeWidth : undefined) ?? 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (element.type === 'math') return <foreignObject x={element.x} y={element.y} width={element.width ?? 500} height={element.height ?? 180}><div style={{ fontSize: element.fontSize ?? 28 }}><Suspense fallback={<p>{element.latex}</p>}><MathNote latex={element.latex} /></Suspense></div></foreignObject>
  if (element.type === 'polygon') return <g><polygon points={polygonPoints(element.x, element.y, element.radius, element.sides, element.rotation)} {...stroke} fill={element.fill ?? 'none'} />{element.label && <Label x={element.x} y={element.y} label={element.label} width={element.radius * 1.4} center />}</g>
  if (element.type === 'text') return <Label x={element.x} y={element.y} label={element.label} width={element.width} size={element.fontSize} color={color} />
  if (element.type === 'path') return <path d={element.d} {...stroke} fill={element.fill ?? 'none'} />
  if (element.type === 'plot') {
    const d = plotPath(element)
    const axisX = element.x + (0 - element.xMin) / (element.xMax - element.xMin) * element.width
    const axisY = element.y + (element.yMax - 0) / (element.yMax - element.yMin) * element.height
    return <g>
      <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="none" stroke="var(--line)" />
      {axisX >= element.x && axisX <= element.x + element.width && <line x1={axisX} y1={element.y} x2={axisX} y2={element.y + element.height} stroke="var(--muted)" />}
      {axisY >= element.y && axisY <= element.y + element.height && <line x1={element.x} y1={axisY} x2={element.x + element.width} y2={axisY} stroke="var(--muted)" />}
      <Label x={element.x} y={element.y - 14} label={`y = ${element.expression}`} width={element.width} size={24} color={color} />
      <Label x={element.x} y={element.y + element.height + 28} label={`${element.xMin} ≤ x ≤ ${element.xMax}; ${element.yMin} ≤ y ≤ ${element.yMax}`} width={element.width} size={20} />
      {d ? <path d={d} {...stroke} fill="none" /> : <Label x={element.x + 12} y={element.y + 36} label="No curve could be drawn in this range" width={element.width - 24} size={22} />}
    </g>
  }
  if (element.type === 'rect' || element.type === 'circle') {
    const width = element.type === 'rect' ? element.width : element.radius * 2
    const x = element.type === 'rect' ? element.x + element.width / 2 : element.x
    const y = element.type === 'rect' ? element.y + element.height / 2 : element.y
    return <g>{element.type === 'rect'
      ? <rect x={element.x} y={element.y} width={element.width} height={element.height} rx="9" {...stroke} fill={element.fill ?? 'var(--surface)'} />
      : <circle cx={element.x} cy={element.y} r={element.radius} {...stroke} fill={element.fill ?? 'var(--surface)'} />}
      {element.label && <Label x={x} y={y} label={element.label} width={Math.max(20, width - 20)} center />}
    </g>
  }
  const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1)
  const head = 12
  return <g><line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} {...stroke} />
    {element.type === 'arrow' && <path d={`M${element.x2 - head * Math.cos(angle - 0.45)} ${element.y2 - head * Math.sin(angle - 0.45)} L${element.x2} ${element.y2} L${element.x2 - head * Math.cos(angle + 0.45)} ${element.y2 - head * Math.sin(angle + 0.45)}`} {...stroke} fill="none" />}
    {element.label && <Label x={(element.x1 + element.x2) / 2} y={(element.y1 + element.y2) / 2 - 12} label={element.label} width={240} center />}
  </g>
}
export function Scene({ block, controls = true }: { block: SceneBlock; controls?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [box, setBox] = useState(`0 0 ${block.width} ${block.height}`)
  const [exportError, setExportError] = useState('')
  useLayoutEffect(() => {
    let active = true
    const fit = () => {
      if (!active || !contentRef.current?.getBBox) return
      const bounds = contentRef.current.getBBox()
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return
      const left = Math.min(0, bounds.x - 24), top = Math.min(0, bounds.y - 24)
      const right = Math.max(block.width, bounds.x + bounds.width + 24), bottom = Math.max(block.height, bounds.y + bounds.height + 24)
      setBox(`${left} ${top} ${right - left} ${bottom - top}`)
    }
    fit(); void document.fonts?.ready.then(() => { if (active) requestAnimationFrame(fit) })
    return () => { active = false }
  }, [block])
  async function download() {
    setExportError('')
    try {
      if (!svgRef.current) return
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.style.cssText = 'color:#292b30;--surface:#fffdf8;--line:#ded8cc;--muted:#82796d;font-family:Caveat,cursive;font-size:28px'
      const values = box.split(' ').map(Number)
      clone.setAttribute('width', String(values[2])); clone.setAttribute('height', String(values[3]))
      const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      for (const [key, value] of Object.entries({ x: values[0], y: values[1], width: values[2], height: values[3], fill: '#fffdf8' })) background.setAttribute(key, String(value))
      clone.prepend(background)
      const font = await fetch('/fonts/Caveat.ttf')
      if (!font.ok) throw new Error('Font unavailable')
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; void font.blob().then(blob => reader.readAsDataURL(blob), reject) })
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
      style.textContent = `@font-face{font-family:Caveat;src:url('${data}')}text{font-family:Caveat,cursive}`
      clone.prepend(style)
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'blackboard.svg'; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setExportError('The drawing could not be exported. Please try again.') }
  }
  return <div className="board-drawing">
    {controls && <div className="drawing-tools" aria-label={`${block.title} controls`}><button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button><button onClick={() => setZoom(1)}>Fit</button><button onClick={() => setZoom(z => Math.min(4, z + 0.25))} aria-label="Zoom in">+</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => { void download() }}>Save SVG</button></div>}
    <div className="drawing-viewport" tabIndex={0} aria-label={`Pan ${block.title}`}><svg ref={svgRef} viewBox={box} role="img" aria-label={block.title} style={{ width: `${zoom * 100}%` }}><g ref={contentRef}>{block.elements.map((element, i) => <Draw key={i} element={element} />)}</g></svg></div>
    {exportError && <p role="alert">{exportError}</p>}
  </div>
}
