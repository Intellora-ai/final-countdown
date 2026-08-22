import { describe, it, expect } from 'vitest'
import { space, type, color, series, radius, stroke, motion, COLLAPSE_CANDIDATES } from './tokens'
import { cssVariables, cssText } from './generateCss'

/* THE TOKEN LAYER'S OWN GUARDS.
 *
 * Two jobs. First, the shape the brief specifies is actually the shape that
 * exists — seven type roles, a 4px space scale, six series colours, nothing
 * extra sneaking in. Second, the CSS the canvas consumes is derivable from
 * tokens.ts, so the two cannot drift into a fifth palette the way the first
 * four appeared.
 */

describe('the scale is the scale', () => {
  it('has exactly the 4px spacing scale and nothing else', () => {
    expect(Object.values(space)).toEqual([0, 4, 8, 12, 16, 24, 32, 48, 64, 96])
  })

  it('has exactly seven type roles', () => {
    expect(Object.keys(type).sort()).toEqual(
      ['body', 'display', 'heading', 'label', 'micro', 'mono', 'title'],
    )
  })

  it('fixes size, line-height, weight and tracking together on every role', () => {
    /* A size chosen without its line-height is how a design system leaks. */
    for (const [name, role] of Object.entries(type)) {
      expect(role.size, name).toBeGreaterThan(0)
      expect(role.lineHeight, name).toBeGreaterThan(0)
      expect(role.weight, name).toBeGreaterThanOrEqual(400)
      expect(role.tracking, name).toMatch(/em$/)
      expect(role.family, name).toBeTruthy()
    }
  })

  it('has exactly the fourteen semantic colour roles plus bgDeep', () => {
    expect(Object.keys(color).sort()).toEqual([
      'accent', 'accentDim', 'accentGlow', 'bg', 'bgDeep', 'border', 'borderStrong',
      'negative', 'positive', 'surface', 'surfaceRaised', 'text', 'textFaint',
      'textMuted', 'warning',
    ])
  })

  it('names no colour after a component or a hue', () => {
    /* 'teal', 'gauge', 'cube' are how a role vocabulary dies. */
    for (const k of Object.keys(color)) {
      expect(k, k).not.toMatch(/teal|cyan|blue|green|red|gauge|cube|panel|chart/i)
    }
  })

  it('has six series colours in a fixed order', () => {
    expect(series).toHaveLength(6)
    expect(new Set(series).size, 'series colours must be distinct').toBe(6)
  })

  it('has one easing curve, not two', () => {
    expect(motion.ease).toMatch(/^cubic-bezier/)
    expect(Object.keys(motion).filter((k) => /ease/i.test(k))).toHaveLength(1)
  })

  it('keeps radius and stroke to the named steps', () => {
    expect(Object.keys(radius)).toEqual(['sm', 'md', 'lg', 'xl', 'pill'])
    expect(Object.keys(stroke)).toEqual(['hair', 'base', 'bold'])
  })
})

describe('CSS is derived from tokens, never authored beside them', () => {
  const vars = cssVariables()

  it('emits a custom property for every token', () => {
    expect(vars['--c-color-accent']).toBe(color.accent)
    expect(vars['--c-space-lg']).toBe('16px')
    expect(vars['--c-type-display-size']).toBe(`${type.display.size}px`)
    expect(vars['--c-series-0']).toBe(series[0])
    expect(vars['--c-motion-ease']).toBe(motion.ease)
  })

  it('namespaces every property so it cannot collide with the dashboard', () => {
    /* The dashboard owns --accent, --space-4 and friends. The canvas must not
     * shadow them: this refactor is forbidden from restyling the dashboard,
     * and an unprefixed --accent would do exactly that. */
    for (const k of Object.keys(vars)) expect(k, k).toMatch(/^--c-/)
  })

  it('produces a scoped block, not a global one', () => {
    /* Scoped to .scene, never :root. The dashboard owns the global scope and
     * this refactor is forbidden from restyling it. */
    const text = cssText()
    expect(text).toContain('.scene {')
    expect(text).not.toContain(':root')
  })

  it('covers every --sc-* alias the stylesheet expects to resolve', () => {
    /* scene.css now defines its --sc-* layer as var(--c-*). A token renamed
     * without updating the stylesheet would silently resolve to nothing and
     * paint transparent — this is the assertion that catches it. */
    for (const needed of [
      '--c-color-bg', '--c-color-bg-deep', '--c-color-text', '--c-color-text-muted',
      '--c-color-text-faint', '--c-color-accent', '--c-color-accent-glow',
      '--c-color-accent-dim', '--c-color-surface', '--c-color-border',
      '--c-color-surface-raised', '--c-color-border-strong',
    ]) {
      expect(vars[needed], needed).toBeDefined()
    }
  })

  it('carries no value the token layer does not define', () => {
    const values = new Set(Object.values(vars))
    const known = new Set<string>([
      ...Object.values(color),
      ...series,
      ...Object.values(space).map((v) => `${v}px`),
      ...Object.values(radius).map((v) => `${v}px`),
      ...Object.values(stroke).map((v) => `${v}px`),
      motion.ease, `${motion.fast}ms`, `${motion.base}ms`, `${motion.slow}ms`,
      ...Object.values(type).flatMap((t) => [
        `${t.size}px`, String(t.lineHeight), String(t.weight), t.tracking, t.family,
      ]),
    ])
    for (const v of values) expect(known.has(v), `orphan value: ${v}`).toBe(true)
  })
})

describe('the collapse candidates are recorded, not silently applied', () => {
  it('lists every value that would change a pixel if absorbed into a role', () => {
    const all = Object.values(COLLAPSE_CANDIDATES).flat()
    expect(all.length, 'candidates are documented').toBeGreaterThan(30)
  })

  it('never lists a value that is already a role — that would be a no-op claim', () => {
    const roles = new Set<string>(Object.values(color))
    for (const v of Object.values(COLLAPSE_CANDIDATES).flat()) {
      expect(roles.has(v), `${v} is already a role and is not a candidate`).toBe(false)
    }
  })
})
