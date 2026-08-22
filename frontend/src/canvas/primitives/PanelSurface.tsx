import React from 'react'
import { color, radius, stroke, elevation, surface, space } from '../design/tokens'

/* THE FROSTED PANEL — the reference's interactive surface, as a component.
 *
 * It existed only as `.sc-panel` in scene.css, which meant one lesson could
 * have it and no other could. Extracting it is the difference between a style
 * the gas scene happens to use and a surface the product owns.
 *
 * THE GRADIENT IS THE POINT. A flat fill reads as a grey box; the top-to-bottom
 * fade plus an inset highlight along the top edge is what reads as glass. Those
 * three values were tuned together against the reference and are reproduced
 * here exactly -- the legacy scene must not shift a pixel.
 */

export type PanelTone = 'glass' | 'bare' | 'card'

export interface PanelSurfaceProps {
  tone?: PanelTone
  children: React.ReactNode
  /** Blocks canvas panning so controls inside stay usable. */
  interactive?: boolean
  style?: React.CSSProperties
  className?: string
}

export function PanelSurface({
  tone = 'glass', children, interactive = false, style, className,
}: PanelSurfaceProps) {
  const tones: Record<PanelTone, React.CSSProperties> = {
    /* The simulation panel. */
    glass: {
      background: `linear-gradient(180deg, ${surface.glassTop}, ${surface.glassBottom})`,
      border: `${stroke.hair}px solid ${color.border}`,
      borderRadius: radius.lg,
      boxShadow: elevation.panel,
      backdropFilter: `blur(${surface.glassBlur})`,
    },
    /* Prose sits on the canvas itself. Framing everything identically is what
     * makes a board read as a dashboard instead of a lesson. */
    bare: {},
    /* The half-clipped edge cards. */
    card: {
      background: color.surfaceRaised,
      border: `${stroke.hair}px solid ${color.border}`,
      borderRadius: radius.md,
      padding: `${space.md}px ${space.lg}px`,
    },
  }

  return (
    <div
      data-canvas="panel"
      data-tone={tone}
      className={className}
      style={{ ...tones[tone], ...style }}
      {...(interactive ? { 'data-no-pan': true } : {})}
    >
      {children}
    </div>
  )
}
