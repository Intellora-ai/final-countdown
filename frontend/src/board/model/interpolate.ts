import { formatValue } from './resolve'
import type { ResolvedModel } from './types'

/* LIVE TEXT — a sentence that changes when the learner moves a slider.
 *
 * `"At {T} K the pressure is {P|1} kPa."` The braces name model values; the
 * optional `|n` is decimal places. Everything else is literal text.
 *
 * THE OUTPUT IS SEGMENTS, NOT A STRING. A bound value has to be visually
 * distinguishable from prose — otherwise a number that just changed looks
 * exactly like a number that was always there — and it has to be announced to
 * a screen reader as a live region. Returning segments lets the renderer do
 * both; returning a string would force the renderer to re-parse, or to accept
 * HTML, which is the one thing the content language never does.
 *
 * AN UNKNOWN NAME IS SHOWN AS A DASH, NOT LEFT AS '{x}'. Braces on a lesson
 * board read as a bug to the learner. A dash reads as "no value", which is
 * exactly what it is.
 */

export interface TextSegment {
  text: string
  /** Present when this segment came from a {binding}. */
  bound?: string
}

const TOKEN = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*(\d)\s*)?\}/g

/** True when the string contains at least one {binding}. */
export function hasBindings(text: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(text)
}

/** Every model name a string reads. */
export function bindingsIn(text: string): string[] {
  const out: string[] = []
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(text))) if (out.indexOf(m[1]) < 0) out.push(m[1])
  return out
}

export function interpolate(text: string, model: ResolvedModel): TextSegment[] {
  if (typeof text !== 'string' || !text) return []
  const out: TextSegment[] = []
  let last = 0
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    const name = m[1]
    const precision = m[2] !== undefined ? Number(m[2]) : model.meta[name]?.precision
    const value = Object.prototype.hasOwnProperty.call(model.scope, name) ? model.scope[name] : undefined
    out.push({ text: formatValue(value, precision), bound: name })
    last = m.index + m[0].length
  }

  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** The plain string a screen reader or an aria-label needs. */
export function interpolateToString(text: string, model: ResolvedModel): string {
  return interpolate(text, model).map((s) => s.text).join('')
}
