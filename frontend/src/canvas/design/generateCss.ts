import { space, type, color, series, radius, stroke, motion } from './tokens'

/* TOKENS -> CSS CUSTOM PROPERTIES, in one direction only.
 *
 * CSS cannot feed WebGL — `<meshStandardMaterial color="var(--x)" />` throws —
 * so TypeScript is the source and CSS is the consumer.
 *
 * THESE ARE APPLIED AT RUNTIME, NOT WRITTEN TO A FILE, and that is the whole
 * point. A codegen step produces a checked-in artefact that can be edited by
 * hand, drift from its source, and be caught only by whoever remembers to
 * re-run it. Handing the variables to the scene element as an inline style
 * removes the artefact, so there is nothing to drift FROM: the stylesheet and
 * the WebGL scene read the same object in the same tick.
 */

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

export function cssVariables(): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(space)) out[`--c-space-${kebab(k)}`] = `${v}px`
  for (const [k, v] of Object.entries(color)) out[`--c-color-${kebab(k)}`] = v
  series.forEach((v, i) => { out[`--c-series-${i}`] = v })
  for (const [k, v] of Object.entries(radius)) out[`--c-radius-${kebab(k)}`] = `${v}px`
  for (const [k, v] of Object.entries(stroke)) out[`--c-stroke-${kebab(k)}`] = `${v}px`

  for (const [k, v] of Object.entries(type)) {
    out[`--c-type-${kebab(k)}-size`] = `${v.size}px`
    out[`--c-type-${kebab(k)}-line`] = String(v.lineHeight)
    out[`--c-type-${kebab(k)}-weight`] = String(v.weight)
    out[`--c-type-${kebab(k)}-tracking`] = v.tracking
    out[`--c-type-${kebab(k)}-family`] = v.family
  }

  out['--c-motion-fast'] = `${motion.fast}ms`
  out['--c-motion-base'] = `${motion.base}ms`
  out['--c-motion-slow'] = `${motion.slow}ms`
  out['--c-motion-ease'] = motion.ease

  return out
}

/** The same variables as CSS text. Not written to disk — used by the tests to
 *  assert the block is scoped and complete. */
export function cssText(): string {
  const vars = cssVariables()
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  return `/* GENERATED FROM src/canvas/design/tokens.ts — DO NOT EDIT.
 * Regenerate: npm run tokens
 * A drift test asserts this file matches tokens.ts exactly. */
.scene {\n${body}\n}\n`
}
