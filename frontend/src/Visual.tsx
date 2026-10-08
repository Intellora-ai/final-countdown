import { useId, useState } from 'react'
import type { Lesson } from './lesson'

export function Visual({ block }: { block: Lesson['blocks'][number] }) {
  const arrow = useId().replace(/:/g, '')
  const [selected, setSelected] = useState<string | null>(null)
  const selectedEdges = block.kind === 'diagram' && selected !== null
    ? new Set(block.edges.flatMap(edge => edge.from === selected || edge.to === selected ? [edge.from + '::' + edge.to] : []))
    : new Set<string>()
  return <section className="visual"><h2>{block.title}</h2>
    {block.kind === 'steps' && <ol className="steps">{block.items.map((item, i) => <li key={i}><span>{i + 1}</span><p>{item}</p></li>)}</ol>}
    {block.kind === 'comparison' && <div className="table-scroll"><table><thead><tr>{block.columns.map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {block.kind === 'chart' && <div className="chart" role="img" aria-label={block.points.map(p => `${p.label}: ${p.value} ${block.unit}`).join(', ')}>{block.points.map((point, i) => <div className="bar-row" key={i}><span>{point.label}</span><div className="bar-track"><div className="bar" style={{ width: `${point.value / Math.max(1, ...block.points.map(p => p.value)) * 100}%` }} /></div><span>{point.value} {block.unit}</span></div>)}</div>}
    {block.kind === 'diagram' && <div className="diagram-scroll"><svg viewBox={`0 0 680 ${Math.ceil(block.nodes.length / 2) * 160}`} role="img" aria-label={block.title}>
      <defs><marker id={arrow} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="var(--accent)" /></marker></defs>
      {block.edges.map((edge, i) => {
        const from = block.nodes.findIndex(n => n.id === edge.from), to = block.nodes.findIndex(n => n.id === edge.to)
        const x1 = 170 + (from % 2) * 340, y1 = 64 + Math.floor(from / 2) * 160
        const x2 = 170 + (to % 2) * 340, y2 = 64 + Math.floor(to / 2) * 160
        const dx = x2 - x1, dy = y2 - y1
        const offset = dx === 0 ? 46 / Math.max(1, Math.abs(dy)) : 140 / Math.max(1, Math.abs(dx))
        const active = selectedEdges.has(edge.from + '::' + edge.to)
        return <g key={i}><line x1={x1 + dx * offset} y1={y1 + dy * offset} x2={x2 - dx * offset} y2={y2 - dy * offset} stroke={selected === null || active ? 'var(--accent)' : 'var(--line)'} strokeWidth={active ? '4' : '2'} markerEnd={`url(#${arrow})`} />{edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 22} textAnchor="middle" className="edge-label">{edge.label.slice(0, 36)}</text>}</g>
      })}
      {block.nodes.map((node, i) => <foreignObject key={node.id} x={30 + (i % 2) * 340} y={18 + Math.floor(i / 2) * 160} width="280" height="92"><button className="diagram-node" aria-pressed={selected === node.id} onClick={() => setSelected(current => current === node.id ? null : node.id)} title={node.detail}><strong>{node.label}</strong>{node.detail && <small>{node.detail}</small>}</button></foreignObject>)}
    </svg></div>}
    {block.kind === 'diagram' && selected !== null && <button onClick={() => setSelected(null)}>Clear selection · {block.nodes.find(node => node.id === selected)?.label}</button>}
  </section>
}
