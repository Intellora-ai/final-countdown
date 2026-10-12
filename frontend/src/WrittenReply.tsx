import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Scene } from './Scene'
import { fontMeasure, wrapText } from './text-layout'

// Plain model replies still become board writing, not a second chat surface.
export function WrittenReply({ text }: { text: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  useLayoutEffect(() => {
    const measure = () => { const w = root.current?.getBoundingClientRect().width; if (w) setWidth(Math.max(320, Math.min(800, w))) }
    measure()
    if (typeof ResizeObserver === 'undefined' || !root.current) return
    const observer = new ResizeObserver(measure); observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontReady(true))
  }, [])
  const block = useMemo(() => ({
    kind: 'scene' as const, title: 'Written answer', width,
    height: Math.max(200, wrapText(text, width - 96, fontMeasure(32)).length * 39 + 96),
    elements: [{ type: 'text' as const, x: 48, y: 64, label: text, width: width - 96, fontSize: 32 }],
  }), [text, fontReady, width])
  return <div className="written-reply" ref={root}><Scene block={block} controls={false} /></div>
}
