export const TEAL = 'var(--accent)'

export const SUBCOL: Record<string, string> = {
  mathematics: 'var(--agabi-teal-300)', physics: 'var(--agabi-indigo-300)',
  chemistry: 'var(--agabi-indigo-200)', biology: 'var(--agabi-green-500)',
  accountancy: 'var(--agabi-amber-500)', economics: 'var(--agabi-teal-200)',
  history: 'var(--agabi-neutral-300)'
}

export function iso(d: Date) { return d.toISOString().slice(0, 10) }

export function pretty(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function stateLabel(v: string) {
  return v === 'mastered' ? 'Mastered' : v === 'completed' ? 'Completed' : v === 'inProgress' ? 'In progress' : 'Not started'
}

/* State is carried by fill and border weight in ONE hue — the same four
 * treatments the legend shows. Verbatim from the mockup. */
export function nodeStyle(v: string) {
  if (v === 'mastered')   return { fill: TEAL, stroke: TEAL, sw: 1, dash: 'none', bar: TEAL, text: 'var(--accent-foreground)', sub: 'rgba(12,14,22,.62)' }
  if (v === 'completed')  return { fill: 'rgba(26,173,166,.13)', stroke: 'rgba(26,173,166,.42)', sw: 1, dash: 'none', bar: 'rgba(26,173,166,.5)', text: 'var(--foreground)', sub: 'var(--muted-foreground)' }
  if (v === 'inProgress') return { fill: 'var(--card)', stroke: TEAL, sw: 1.5, dash: 'none', bar: TEAL, text: 'var(--foreground)', sub: 'var(--accent)' }
  return { fill: 'var(--input-background)', stroke: 'var(--agabi-neutral-600)', sw: 1, dash: '4 4', bar: 'var(--agabi-neutral-600)', text: 'var(--agabi-neutral-300)', sub: 'var(--muted-foreground)' }
}
