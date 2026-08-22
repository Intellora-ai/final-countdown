import React from 'react'
import { Katex } from './EquationPanel'

/* THE MARGIN SKETCH — the same relation, drawn the way it gets drawn on paper.
 *
 * The reference has a pencilled P-against-T sketch below the cube, next to the
 * formal graph on the right. That repetition is pedagogy, not redundancy: the
 * formal chart is the measurement and this is the gesture, and a learner who
 * has only ever seen the gesture recognises the chart because of it.
 *
 * Deliberately NOT a chart component. It has no scale, no ticks and no data,
 * because it is not claiming any — a sketch that borrowed axis machinery would
 * be implying a precision it does not have.
 */
export function SketchNote({ width = 300 }: { width?: number }) {
  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span style={{
          fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic',
          fontSize: 13, color: '#cbd5d1', borderBottom: '1px solid rgba(255,255,255,0.28)',
          paddingBottom: 2,
        }}>
          Particle motion energy
        </span>
        <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 10.5, color: 'var(--sc-ink-faint)' }}>
          (increased kinetic collision)
        </span>
      </div>

      <svg width={width} height={128} aria-hidden="true">
        {/* left gesture: the rising arrow with tick marks */}
        <g transform="translate(6,10)">
          <line x1={10} y1={96} x2={10} y2={8} stroke="rgba(255,255,255,0.45)" strokeWidth={1.1} />
          <line x1={10} y1={96} x2={104} y2={96} stroke="rgba(255,255,255,0.45)" strokeWidth={1.1} />
          <path d="M16 88 L92 20" stroke="#2dd4bf" strokeWidth={1.5} />
          <path d="M86 18 L94 18 L94 26" stroke="#2dd4bf" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          {[[30, 74], [48, 58], [66, 42]].map(([x, y], i) => (
            <line key={i} x1={x - 8} y1={y + 8} x2={x} y2={y} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          ))}
          <path d="M24 40 L38 30" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          <path d="M34 28 L40 29 L38 34" stroke="rgba(255,255,255,0.4)" strokeWidth={1} fill="none" />
        </g>

        {/* right: the clean P vs T line with the 300 K drop-line */}
        <g transform="translate(126,10)">
          <line x1={14} y1={96} x2={14} y2={6} stroke="rgba(255,255,255,0.5)" strokeWidth={1.1} />
          <line x1={14} y1={96} x2={150} y2={96} stroke="rgba(255,255,255,0.5)" strokeWidth={1.1} />
          <path d="M10 4 L14 -2 L18 4" stroke="rgba(255,255,255,0.5)" strokeWidth={1.1} fill="none" />
          <path d="M148 92 L154 96 L148 100" stroke="rgba(255,255,255,0.5)" strokeWidth={1.1} fill="none" />
          <text x={2} y={2} fontSize={12} fill="#cbd5d1" fontFamily="'Fraunces', Georgia, serif" fontStyle="italic">P</text>
          <text x={152} y={110} fontSize={12} fill="#cbd5d1" fontFamily="'Fraunces', Georgia, serif" fontStyle="italic">T</text>
          <path d="M18 90 L140 20" stroke="#2dd4bf" strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={80} cy={55} r={3} fill="#2dd4bf" />
          <line x1={80} y1={58} x2={80} y2={96} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
          <text x={68} y={110} fontSize={9.5} fill="#8b949e" fontFamily="ui-monospace, monospace">300K</text>
          <text x={96} y={30} fontSize={10.5} fill="#cbd5d1" fontFamily="'Fraunces', Georgia, serif" fontStyle="italic">(P=kT)</text>
        </g>
      </svg>

      <div style={{ fontSize: 22, color: '#dbe6ea', marginTop: -6 }}>
        <Katex latex="PV = nRT" />
      </div>
    </div>
  )
}
