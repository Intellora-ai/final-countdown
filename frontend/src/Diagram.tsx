import { useEffect, useId, useMemo, useState } from 'react'
import type { Lesson } from './lesson'
import { diagramLayout } from './diagram-layout'

type DiagramBlock = Extract<Lesson['blocks'][number], { kind: 'diagram' }>
export function Diagram({ block }: { block: DiagramBlock }) {
  const arrow = useId().replace(/:/g, '')
  const [selected, setSelected] = useState<string | null>(null)
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => { let active = true; void document.fonts?.ready.then(() => { if (active) setFontReady(true) }); return () => { active = false } }, [])
  const drawing = useMemo(() => diagramLayout(block), [block, fontReady])
  return <>
    <div className="diagram-scroll" tabIndex={0} aria-label={`Pan ${block.title}`}><svg viewBox={`0 0 ${drawing.width} ${drawing.height}`} style={{ width: `${drawing.width}px` }} role="img" aria-label={block.title}>
      <defs><marker id={arrow} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="var(--accent)" /></marker></defs>
      {drawing.edges.map((edge, i) => {
        const active = selected === null || edge.from === selected || edge.to === selected
        return <g key={i}><path d={edge.points.map((point, j) => `${j ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')} fill="none" stroke={active ? 'var(--accent)' : 'var(--line)'} strokeWidth={selected !== null && active ? 4 : 2} strokeLinejoin="round" markerEnd={`url(#${arrow})`} />
          {edge.label && <foreignObject x={edge.x! - 90} y={edge.y! - edge.height! / 2} width="180" height={edge.height}><div className="edge-note">{edge.label}</div></foreignObject>}
        </g>
      })}
      {drawing.nodes.map(node => <foreignObject key={node.id} x={node.x - node.width / 2} y={node.y - node.height / 2} width={node.width} height={node.height}><button className="diagram-node" aria-pressed={selected === node.id} onClick={() => setSelected(current => current === node.id ? null : node.id)}><strong>{node.label}</strong>{node.detail && <small>{node.detail}</small>}</button></foreignObject>)}
    </svg></div>
    {selected !== null && <button onClick={() => setSelected(null)}>Clear selection · {block.nodes.find(node => node.id === selected)?.label}</button>}
  </>
}
