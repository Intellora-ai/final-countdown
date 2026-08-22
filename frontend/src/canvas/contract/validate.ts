import type { ValidationIssue, ValidationResult } from './types'

/* VALIDATION HELPERS — hand-rolled, and deliberately so.
 *
 * No Zod. Not because a schema library is bad, but because the behaviour this
 * engine needs is not the behaviour a schema library gives: a parse either
 * succeeds or throws, whereas a lesson that arrives slightly wrong should
 * RENDER, with the repair stated to the learner. The blackboard's validator
 * had that property and it was the best thing about it. This re-earns it.
 *
 * The rule it enforces: silence is the one failure mode not allowed. Every
 * repair, truncation and drop produces an issue somebody can read.
 */

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const isStr = (v: unknown): v is string => typeof v === 'string'
export const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
export const isArr = Array.isArray

export class Issues {
  readonly list: ValidationIssue[] = []
  private repaired = false

  repair(path: string, message: string) {
    this.repaired = true
    this.list.push({ path, message, level: 'repair' })
  }

  reject(path: string, message: string) {
    this.list.push({ path, message, level: 'reject' })
  }

  get didRepair() { return this.repaired }
  get rejected() { return this.list.some((i) => i.level === 'reject') }

  ok<T>(value: T): ValidationResult<T> {
    return this.rejected
      ? { ok: false, issues: this.list }
      : { ok: true, value, issues: this.list }
  }

  fail<T>(path: string, message: string): ValidationResult<T> {
    this.reject(path, message)
    return { ok: false, issues: this.list }
  }
}

/* UNKNOWN KEYS ARE REFUSED, NEVER STRIPPED.
 *
 * A stripped key is a smuggling route: a generator that ships `style:` and
 * sees it silently removed will keep shipping it, and one day a version will
 * not strip it. Refusing names the field, so the generator can be fixed. */
export function unknownKey(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  for (const k of Object.keys(obj)) if (allowed.indexOf(k) < 0) return k
  return null
}

/** Reject any key that carries appearance. Laws 1-3, checked at runtime as
 *  well as in the type system, because the payload arrives as JSON. */
const APPEARANCE = new Set([
  'x', 'y', 'top', 'left', 'right', 'bottom', 'width', 'height',
  'color', 'colour', 'background', 'backgroundColor', 'fill', 'stroke',
  'fontSize', 'font', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing',
  'padding', 'margin', 'gap', 'radius', 'borderRadius', 'borderWidth',
  'align', 'alignment', 'textAlign', 'style', 'className', 'css', 'html', 'jsx',
  'position', 'transform', 'zIndex', 'opacity', 'shadow',
])

export function appearanceKey(obj: Record<string, unknown>): string | null {
  for (const k of Object.keys(obj)) if (APPEARANCE.has(k)) return k
  return null
}

export function appearanceKeysDeep(value: unknown, path = ''): string | null {
  if (isArr(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = appearanceKeysDeep(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (!isObj(value)) return null
  const own = appearanceKey(value)
  if (own) return path ? `${path}.${own}` : own
  for (const [k, v] of Object.entries(value)) {
    const hit = appearanceKeysDeep(v, path ? `${path}.${k}` : k)
    if (hit) return hit
  }
  return null
}

/** Clamp a string, saying so. Never silently truncate. */
export function clamp(issues: Issues, path: string, value: string, max: number): string {
  if (value.length <= max) return value
  issues.repair(path, `Shortened to ${max} characters; the full text is still available.`)
  return value.slice(0, max)
}
