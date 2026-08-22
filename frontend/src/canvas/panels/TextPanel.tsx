import React, { useState } from 'react'
import { color, type, space, radius, stroke, ink } from '../design/tokens'
import type { PanelProps } from '../renderer/renderers'

/* PROSE, and the disclosure that keeps it from overflowing.
 *
 * The forbidden adaptation is making the text smaller so it fits. When prose
 * exceeds its box the block TRANSFORMS -- it shows an opening and offers the
 * rest -- and every character stays reachable. Nothing here reads a font size
 * from anywhere but the token layer, so there is no code path that could
 * shrink to fit even if someone wanted one.
 */
export function TextPanel({ data, derived, disclosure, title }: PanelProps) {
  const [expanded, setExpanded] = useState(false)
  const d = data as { paragraphs: string[] }
  const marks = (derived.marks ?? []) as Array<{ word: string; paragraphs: number[] }>

  const limit = disclosure?.strategy === 'truncate_expand' && !expanded
    ? disclosure.initiallyVisible
    : Infinity

  let used = 0
  const shown: string[] = []
  for (const p of d.paragraphs) {
    if (used >= limit) break
    shown.push(used + p.length <= limit ? p : p.slice(0, Math.max(0, limit - used)) + '…')
    used += p.length
  }
  const hidden = d.paragraphs.length - shown.length

  /* Emphasis is a WORD the contract resolved to positions. The stylesheet
   * decides what an emphasised word looks like; the lesson never does. */
  const emphasise = (text: string, index: number) => {
    const words = marks.filter((m) => m.paragraphs.includes(index)).map((m) => m.word)
    if (!words.length) return text
    const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return text.split(pattern).map((part, i) =>
      words.some((w) => w.toLowerCase() === part.toLowerCase())
        ? <strong key={i} style={{ color: color.accent, fontWeight: type.body.weight }}>{part}</strong>
        : part,
    )
  }

  return (
    <div>
      {title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text,
          margin: 0, marginBottom: space.md,
        }}>{title}</h3>
      )}

      {shown.map((p, i) => (
        <p key={i} style={{
          fontFamily: type.body.family, fontSize: type.body.size,
          lineHeight: type.body.lineHeight, color: color.text,
          margin: 0, marginBottom: space.md, maxWidth: '68ch',
        }}>
          {emphasise(p, i)}
        </p>
      ))}

      {disclosure?.strategy === 'truncate_expand' && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            minHeight: 40, cursor: 'pointer',
            background: color.surface, border: `${stroke.hair}px solid ${color.border}`,
            borderRadius: radius.sm, color: ink.axis,
            fontFamily: type.mono.family, fontSize: type.mono.size,
            padding: `${space.xs}px ${space.md}px`,
          }}
        >
          {disclosure.notice ?? `Show the rest${hidden > 0 ? ` (${hidden} more)` : ''}`}
        </button>
      )}
    </div>
  )
}
