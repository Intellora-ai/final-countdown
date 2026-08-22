import React from 'react'
import { color, pending, pendingSize, space } from '../design/tokens'

/* PANEL ② — the causal sentence, drawn as a sentence.
 *
 * Temperature rises, so particles move faster, so they carry more kinetic
 * energy, so they hit the walls more often, so the pressure rises. That is one
 * chain of because, and the panel's whole job is to keep it reading as ONE
 * chain rather than five boxes: the ends are accent-coloured because they are
 * the two things the question names, and the middle is quiet because it is the
 * mechanism between them.
 *
 * The arrow is an SVG marker rather than a text glyph so it has the same
 * weight and colour as every other line on the board.
 */

export interface ChainStep {
  label: string
  /** 'cause' and 'effect' are the two ends of the sentence. */
  tone?: 'cause' | 'effect' | 'middle'
  /** Optional emoji-free glyph beneath, e.g. the heat source. */
  icon?: 'heat' | 'impact'
}

function Arrow() {
  return (
    <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true" style={{ flex: 'none' }}>
      <line x1={1} y1={6} x2={19} y2={6} stroke="var(--sc-accent)" strokeWidth={1.3} />
      <path d="M18 2.2 L24 6 L18 9.8 Z" fill="var(--sc-accent)" />
    </svg>
  )
}

function HeatGlyph() {
  return (
    <svg width={38} height={26} viewBox="0 0 38 26" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${9 + i * 8} 16 c0 -3 -3 -3.5 -3 -6.5 c0 -2.4 2 -3.6 2 -5.5 c1.6 1.6 1.2 3.4 0.4 4.8 c-0.8 1.5 0.6 2.6 0.6 4.4 c0 1.3 -0.5 2.2 0 2.8 Z`}
          fill={color.warning}
          opacity={0.85}
        />
      ))}
      <rect x={3} y={17} width={32} height={4} rx={2} fill={pending.stoveBody} />
      <rect x={6} y={21} width={26} height={2.5} rx={1.2} fill={pending.stoveBase} />
    </svg>
  )
}

function ImpactGlyph() {
  return (
    <svg width={54} height={62} viewBox="0 0 54 62" aria-hidden="true">
      <line x1={40} y1={2} x2={40} y2={60} stroke={pending.white50} strokeWidth={1.2} />
      {[16, 44].map((cy, i) => (
        <g key={i}>
          <circle cx={20} cy={cy} r={7} fill={pending.particleCore} opacity={0.22} />
          <circle cx={20} cy={cy} r={4} fill={pending.particleHalo} />
          <line x1={24} y1={cy} x2={36} y2={cy} stroke={color.accentGlow} strokeWidth={1.1} opacity={0.7} />
          {[-1, 0, 1].map((k) => (
            <line key={k} x1={40} y1={cy} x2={46 + Math.abs(k) * 2} y2={cy + k * 7}
              stroke={pending.spark} strokeWidth={1.1} opacity={0.85} />
          ))}
        </g>
      ))}
    </svg>
  )
}

export function CausalChain({ steps }: { steps: ChainStep[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: pendingSize.gap10 }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Arrow />}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space.xs, flex: 'none' }}>
            <span
              style={{
                fontSize: s.tone === 'cause' || s.tone === 'effect' ? 14 : 12.5,
                fontWeight: s.tone === 'cause' || s.tone === 'effect' ? 700 : 500,
                letterSpacing: s.tone === 'cause' || s.tone === 'effect' ? '0.05em' : '0.01em',
                textTransform: s.tone === 'cause' || s.tone === 'effect' ? 'uppercase' : 'none',
                color: s.tone === 'cause' || s.tone === 'effect' ? 'var(--sc-accent)' : 'var(--sc-ink)',
                fontStyle: s.tone === 'middle' ? 'italic' : 'normal',
                fontFamily: s.tone === 'middle' ? "'Fraunces', Georgia, serif" : 'inherit',
                textAlign: 'center',
                maxWidth: 92,
                lineHeight: pendingSize.line125,
              }}
            >
              {s.label}
            </span>
            {s.icon === 'heat' && <HeatGlyph />}
            {s.icon === 'impact' && <ImpactGlyph />}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}
