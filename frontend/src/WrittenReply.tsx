import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { fontMeasure, wrapText } from './text-layout'

// Plain model replies still become board writing, not a second chat surface.
export function WrittenReply({ text, progress, reveal = false }: { text: string; progress?: number; reveal?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  useLayoutEffect(() => {
    // Layout pixels exclude CSS zoom; using physical bounds cancels magnification.
    // Keep room for the 96px margins and one glyph even in a very narrow panel.
    const measure = () => { const w = root.current?.clientWidth; if (w) setWidth(Math.max(128, w)) }
    measure()
    if (typeof ResizeObserver === 'undefined' || !root.current) return
    const observer = new ResizeObserver(measure); observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    let active = true
    void document.fonts?.ready.then(() => { if (active) setFontReady(true) })
    return () => { active = false }
  }, [])
  const rows = useMemo(() => {
    const measure = fontMeasure(32)
    // Wrapping collapses whitespace, but speech boundaries refer to the original
    // UTF-16 string. Match visible code points back to their original offsets.
    const offsets = Array.from(text.matchAll(/\S/gu), match => match.index)
    let glyph = 0
    return wrapText(text, width - 96, measure).map(content => {
      const start = offsets[glyph] ?? text.length
      glyph += Array.from(content.matchAll(/\S/gu)).length
      return { content, start, width: measure(content) }
    })
  }, [text, fontReady, width])
  const current = progress !== undefined && Number.isFinite(progress) && progress >= 0 && progress < text.length
    ? rows.reduce((found, row, i) => row.start <= progress ? i : found, -1) : -1
  const height = Math.max(200, rows.length * 39 + 96)
  return <div className="written-reply" data-reveal={reveal} ref={root}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Written answer" fontFamily="Caveat, cursive" style={{ display: 'block', width: '100%', height: 'auto' }}>
      {current >= 0 && <rect className="spoken-highlight" aria-hidden="true" x={36} y={32 + current * 39} width={Math.min(width - 72, rows[current].width + 24)} height={39} rx={8} />}
      <text x={48} y={64} fill="currentColor" fontSize={32}>
        {rows.map((row, i) => <tspan key={i} className="handwriting-row" data-active={i === current ? 'true' : undefined} style={{ '--row-index': i } as CSSProperties} x={48} y={64 + i * 39}>{row.content}</tspan>)}
      </text>
    </svg>
  </div>
}
