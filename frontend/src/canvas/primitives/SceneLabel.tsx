import React from 'react'
import { color, typeLegacy, font } from '../design/tokens'

/* THE PENCILLED ANNOTATION — "gas", "speed", the note beside a diagram.
 *
 * Serif italic, and reserved. On this surface the sans face is structure and
 * the serif face is commentary or mathematics; that contrast is what lets a
 * learner tell an annotation from a heading without reading either. Making it
 * a component is how the rule survives a second lesson.
 */

export interface SceneLabelProps {
  children: React.ReactNode
  /** 'note' is the italic aside; 'caption' is upright explanatory text. */
  variant?: 'note' | 'caption'
  style?: React.CSSProperties
}

export function SceneLabel({ children, variant = 'note', style }: SceneLabelProps) {
  return (
    <span data-canvas="scene-label" style={{
      fontFamily: font.serif,
      fontStyle: variant === 'note' ? 'italic' : 'normal',
      fontSize: typeLegacy.annotation.size,
      lineHeight: variant === 'caption' ? typeLegacy.annotation.lineHeight : undefined,
      display: variant === 'caption' ? 'block' : undefined,
      color: color.textMuted,
      ...style,
    }}>
      {children}
    </span>
  )
}
