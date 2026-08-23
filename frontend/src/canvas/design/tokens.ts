/**
 * The design system. Law 4's only legal home for a raw value.
 *
 * EVERY COLOUR IN THE APP TRACES HERE
 * -----------------------------------
 * Nothing outside this file may write a hex, `rgb()`, `hsl()`, a named CSS
 * colour, or an arbitrary px/rem for spacing, type, radius or stroke. That is
 * not tidiness — it is the mechanism that makes "same design grammar, different
 * composition" true. A single component that keeps its own padding breaks the
 * invariance the whole system is for.
 *
 * The expensive look does not come from many colours. It comes from lighting,
 * transparency, blur and space. One accent, used sparingly, reads richer than
 * six.
 */

export const tokens = {
  /* -- Surfaces ---------------------------------------------------------- */
  color: {
    void: '#0b0f12',
    surface: '#12181d',
    surfaceLift: '#182026',
    panel: 'rgb(255 255 255 / 0.04)',
    panelHover: 'rgb(255 255 255 / 0.07)',
    line: 'rgb(255 255 255 / 0.09)',
    lineStrong: 'rgb(255 255 255 / 0.18)',

    /* -- Type ------------------------------------------------------------ */
    ink: '#e8f0f4',
    inkMuted: '#8fa2ad',
    inkFaint: '#5b6b76',

    /* -- The accent. Cyan, and only cyan. -------------------------------- */
    accent: '#4ecdc4',
    accentSoft: '#9be5df',
    accentDeep: '#2a7c78',
    accentGlow: 'rgb(78 205 196 / 0.35)',

    /* -- Tones. MEANING, not decoration. --------------------------------- */
    insight: '#4ecdc4',
    warning: '#e0a458',
    result: '#8fd0f0',
  },

  /**
   * The series palette. A model picks an INDEX; it never picks a colour.
   *
   * Fixed order and fixed length: `colorIndex: 3` must mean the same thing in
   * every lesson, or two charts side by side quietly disagree about what
   * "series 3" is.
   */
  series: ['#4ecdc4', '#8fd0f0', '#e0a458', '#b48ce0', '#7ee0a0', '#e88b9a'] as const,

  /* -- Spacing. One scale, no in-between values. ------------------------- */
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
    xxxl: '48px',
  },

  /**
   * Seven type roles, and only seven.
   *
   * A role is a job ("this is the lesson's question"), not a size. Adding an
   * eighth because something "needs to be a bit smaller" is how a type scale
   * dies.
   */
  type: {
    question: { size: '30px', weight: 500, height: 1.3 },
    sectionTitle: { size: '17px', weight: 600, height: 1.3, tracking: '0.06em' },
    blockTitle: { size: '14px', weight: 500, height: 1.35 },
    body: { size: '14px', weight: 400, height: 1.6 },
    caption: { size: '12px', weight: 400, height: 1.5 },
    label: { size: '11px', weight: 500, height: 1.4, tracking: '0.1em' },
    metric: { size: '28px', weight: 500, height: 1.1 },
  },

  radius: { sm: '4px', md: '8px', lg: '12px', pill: '999px' },
  stroke: { hair: '1px', thin: '1.5px', thick: '2px' },
  motion: { fast: '150ms', base: '220ms', slow: '380ms', ease: 'cubic-bezier(0.22, 1, 0.36, 1)' },

  /** Arrow geometry is constant; arrow COUNT is whatever the content needs. */
  arrow: { head: 7, strokeWidth: 1.5, dash: 'none' },
} as const

export type Tokens = typeof tokens

/**
 * Publish the tokens as CSS custom properties on one element.
 *
 * Applied at runtime rather than generated into a stylesheet, so there is no
 * second artefact that can drift from this file. One source, and the DOM reads
 * it directly.
 */
export function cssVariables(): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(tokens.color)) out[`--c-${kebab(key)}`] = value
  tokens.series.forEach((hex, i) => (out[`--series-${i}`] = hex))
  for (const [key, value] of Object.entries(tokens.space)) out[`--s-${key}`] = value
  for (const [key, value] of Object.entries(tokens.radius)) out[`--r-${key}`] = value
  for (const [key, value] of Object.entries(tokens.stroke)) out[`--stroke-${key}`] = value
  out['--ease'] = tokens.motion.ease
  out['--t-fast'] = tokens.motion.fast
  out['--t-base'] = tokens.motion.base
  out['--t-slow'] = tokens.motion.slow

  for (const [role, spec] of Object.entries(tokens.type)) {
    const r = kebab(role)
    out[`--type-${r}-size`] = spec.size
    out[`--type-${r}-weight`] = String(spec.weight)
    out[`--type-${r}-height`] = String(spec.height)
    if ('tracking' in spec) out[`--type-${r}-tracking`] = spec.tracking
  }

  return out
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/** The tone a block declared, resolved to the one colour that means it. */
export function toneColor(tone: 'neutral' | 'insight' | 'warning' | 'result'): string {
  if (tone === 'insight') return tokens.color.insight
  if (tone === 'warning') return tokens.color.warning
  if (tone === 'result') return tokens.color.result
  return tokens.color.inkMuted
}
