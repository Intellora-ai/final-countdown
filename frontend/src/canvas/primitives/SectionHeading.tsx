import React from 'react'
import { color, ink, type, typeLegacy, overlay, primitiveSize } from '../design/tokens'

/* A NUMBERED PANEL HEADING — badge, title, and a muted sub-label.
 *
 * The reference numbers its panels ① to ⑥, and that numbering is not
 * decoration: it is how a learner is told the order to read six things that
 * are not stacked in a column. Any lesson with more than two panels needs it,
 * so it cannot live inside the gas scene as a local function -- which is
 * precisely where it was.
 *
 * The badge renders a real number rather than a ①-⑥ glyph, because glyphs run
 * out at twenty and a lesson may have more panels than that.
 */

export interface SectionHeadingProps {
  /** Omitted when a panel is not part of a numbered sequence. */
  index?: number
  title: string
  sub?: string
  /** 'h2' inside a board whose question is the h1. */
  as?: 'h2' | 'h3'
}

export function Badge({ n }: { n: number }) {
  return (
    <span data-canvas="badge" style={{
      width: primitiveSize.badge, height: primitiveSize.badge,
      borderRadius: '50%',
      border: `${primitiveSize.badgeBorder}px solid ${overlay.ruleStrong}`,
      color: color.textMuted,
      fontFamily: type.mono.family,
      fontSize: typeLegacy.badge.size,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flex: 'none',
    }}>
      {n}
    </span>
  )
}

export function SectionHeading({ index, title, sub, as = 'h2' }: SectionHeadingProps) {
  const Tag = as
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: primitiveSize.headGap }}>
      {index !== undefined && <Badge n={index} />}
      <span style={{ display: 'flex', flexDirection: 'column', gap: primitiveSize.headTextGap }}>
        <Tag data-canvas="section-title" style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: ink.pure, margin: 0,
        }}>
          {title}
        </Tag>
        {sub && (
          <p data-canvas="section-sub" style={{
            fontFamily: type.micro.family, fontSize: type.micro.size,
            letterSpacing: type.micro.tracking, textTransform: 'uppercase',
            color: ink.sub, margin: 0,
          }}>
            {sub}
          </p>
        )}
      </span>
    </div>
  )
}
