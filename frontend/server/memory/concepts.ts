/**
 * D4 — LEARNING-AWARE REUSE, IN TWO BANDS, BECAUSE ONE THRESHOLD CANNOT WORK.
 *
 * Every lookup in this system is an exact key match, so a rephrasing is a
 * full-price miss: the same learner, asking the same thing in her own words,
 * is taught from nothing. This resolves a question to a concept by MEANING,
 * using the local `nomic-embed-text`.
 *
 * THE TWO BANDS ARE MEASURED, NOT CHOSEN. On this machine, 768 dims:
 *
 *   "what is photosynthesis" ~ "explain photosynthesis to me"      0.889
 *   "zeros of a polynomial"  ~ "roots of a polynomial"             0.785
 *   "what is a zero of..."   ~ "how many zeros can a quadratic..." 0.673
 *   "what is photosynthesis" ~ "how do plants make food"           0.529
 *   "what is photosynthesis" ~ "what caused the french revolution" 0.429
 *   "zeros of a polynomial"  ~ "how do plants make food"           0.363
 *
 * The pair the brief names -- photosynthesis and plants making food -- sits at
 * 0.529, one tenth above two DIFFERENT SUBJECTS at 0.429. No single cut takes
 * the first without taking the second, and merging two subjects would corrupt
 * both the learner model and every decision made from it. So:
 *
 *   >= 0.75  the SAME concept. Knowledge is reused: what was written for it,
 *            which ways in were spent, what did not land.
 *   >= 0.50  RELATED. A separate concept, carrying only the fact that she has
 *            been near this before -- context, never knowledge.
 *   <  0.50  new. Nothing is borrowed.
 *
 * THE LOWER CUT IS THIN AND THAT IS WHY IT MERGES NOTHING. The widest gap
 * available on this model is 0.429 (two different subjects) to 0.529 (the
 * brief's own example), so 0.50 is the only place it can sit. A cut that thin
 * would be reckless if it merged two concepts; it does not. It carries one
 * sentence of context -- "she has been near this before" -- and a wrong guess
 * there costs a sentence, not a corrupted learner model.
 *
 * That is the four kinds of reuse kept apart (knowledge, context, experience,
 * negative memory) rather than collapsed into one similarity number.
 */
import { memoryKey, type MemoryOwner } from './key.ts'
import type { MemoryStore } from './sqliteStore.ts'
import { nearest, type Embed } from '../embed.ts'

/** Measured above: a rewording or a synonym, safe to treat as one concept. */
export const SAME_CONCEPT = 0.75
/** Measured above: the same ground, a different objective. Context only. */
export const RELATED = 0.5
const MOST_CONCEPTS_KEPT = 300

export interface Resolved {
  readonly id: string
  readonly how: 'new' | 'same' | 'related'
  /** Cosine to the nearest known concept; 0 when there was nothing to compare. */
  readonly nearness: number
  /** Set only for `related`: the concept she has been near before. */
  readonly relatedTo?: string
}

export interface ConceptIndex {
  /** Null when no embeddings model answered: no resolution, not a failure. */
  resolve(owner: MemoryOwner, said: string): Promise<Resolved | null>
}

interface Entry {
  readonly id: string
  readonly said: string
  readonly vector: readonly number[]
  readonly at: string
}

export function keyFor(owner: MemoryOwner): string {
  return memoryKey({ ...owner, lessonId: 'concepts' })
}

/** A readable id from the words that first made it, so a person can read a row. */
export function idFor(said: string): string {
  return said.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'concept'
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['id'] === 'string' &&
    typeof v['said'] === 'string' &&
    Array.isArray(v['vector']) &&
    v['vector'].every((one) => typeof one === 'number') &&
    typeof v['at'] === 'string'
  )
}

function knownFrom(text: string | undefined): Entry[] {
  if (text === undefined) return []
  try {
    const parsed = JSON.parse(text) as { concepts?: unknown }
    return Array.isArray(parsed.concepts) ? parsed.concepts.filter(isEntry) : []
  } catch {
    return []
  }
}

export function conceptsIn(store: MemoryStore, embed: Embed): ConceptIndex {
  return {
    async resolve(owner, said) {
      const vector = await embed(said)
      if (vector === null) return null
      const key = keyFor(owner)
      const known = knownFrom(store.read(key))
      const closest = nearest(vector, known, RELATED)
      const score = closest === null ? 0 : scoreOf(vector, closest.vector)
      if (closest !== null && score >= SAME_CONCEPT) {
        return { id: closest.id, how: 'same', nearness: score }
      }
      const at = new Date().toISOString()
      const made = { id: unique(idFor(said), known), said, vector, at }
      remember(store, key, known, made, at)
      return closest === null
        ? { id: made.id, how: 'new', nearness: 0 }
        : { id: made.id, how: 'related', nearness: score, relatedTo: closest.id }
    },
  }
}

function scoreOf(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let left = 0
  let right = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!
    left += a[i]! * a[i]!
    right += b[i]! * b[i]!
  }
  return left === 0 || right === 0 ? 0 : dot / (Math.sqrt(left) * Math.sqrt(right))
}

function unique(id: string, known: readonly Entry[]): string {
  if (!known.some((one) => one.id === id)) return id
  for (let i = 2; ; i += 1) {
    const candidate = `${id}-${i}`
    if (!known.some((one) => one.id === candidate)) return candidate
  }
}

function remember(store: MemoryStore, key: string, known: readonly Entry[], made: Entry, at: string): void {
  store.update(key, at, () => {
    const after = [...known, made]
    return JSON.stringify({ concepts: after.slice(Math.max(0, after.length - MOST_CONCEPTS_KEPT)) })
  })
}
