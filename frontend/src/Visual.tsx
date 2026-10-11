import { lazy, Suspense } from 'react'
import type { Lesson } from './lesson'
import { Scene } from './Scene'
import { Diagram } from './Diagram'
const SvgArtwork = lazy(() => import('./SvgArtwork'))
const MathNote = lazy(() => import('./MathNote'))

export function Visual({ block }: { block: Lesson['blocks'][number] }) {
  return <section className="visual"><h2>{block.title}</h2>
    {block.kind === 'steps' && <ol className="steps">{block.items.map((item, i) => <li key={i}><span>{i + 1}</span><p>{item}</p></li>)}</ol>}
    {block.kind === 'comparison' && <div className="table-scroll"><table><thead><tr>{block.columns.map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {block.kind === 'chart' && <div className="chart" role="img" aria-label={block.points.map(p => `${p.label}: ${p.value} ${block.unit}`).join(', ')}>{block.points.map((point, i) => <div className="bar-row" key={i}><span>{point.label}</span><div className="bar-track"><div className="bar" style={{ width: `${point.value / Math.max(1, ...block.points.map(p => p.value)) * 100}%` }} /></div><span>{point.value} {block.unit}</span></div>)}</div>}
    {block.kind === 'diagram' && <Diagram block={block} />}
    {block.kind === 'math' && <Suspense fallback={<p>{block.latex}</p>}><MathNote latex={block.latex} /></Suspense>}
    {block.kind === 'svg' && <Suspense fallback={<p>Preparing drawing…</p>}><SvgArtwork source={block.source} title={block.title} parameters={block.parameters} /></Suspense>}
    {block.kind === 'scene' && <Scene block={block} />}
  </section>
}
