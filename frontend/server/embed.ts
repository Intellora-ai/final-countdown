/**
 * D4 — MEANING, MEASURED LOCALLY AND FOR NOTHING.
 *
 * `nomic-embed-text` runs in the Ollama already on this machine: free, local,
 * no key, 137M parameters, milliseconds per question. It turns a question into
 * a vector so "what is photosynthesis" and "how do plants make food" can be
 * recognised as one concept -- which every lookup in this system currently
 * cannot do, because every lookup is an exact key match and a rephrasing is a
 * full-price miss.
 *
 * WHAT THIS IS NOT. It is not a judgement about the learner and it never
 * decides anything on its own: it proposes that two questions mean the same
 * thing, and the caller decides what to reuse (`memory/concepts.ts` keeps the
 * four kinds of reuse apart). When the model is absent, every call is `null`
 * and the system behaves exactly as it did before -- honestly, with no
 * resolution rather than a wrong one.
 */

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'
const LONGEST_EMBED_MS = 5_000

export type Embed = (text: string) => Promise<readonly number[] | null>

export interface EmbeddingOptions {
  readonly model?: string
  readonly endpoint?: string
  readonly fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

/**
 * How close two meanings are, -1 to 1. Zero for anything that cannot be
 * compared -- different lengths, a zero vector, an empty one -- because a
 * missing answer must never look like a confident one.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let left = 0
  let right = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!
    left += a[i]! * a[i]!
    right += b[i]! * b[i]!
  }
  if (left === 0 || right === 0) return 0
  const value = dot / (Math.sqrt(left) * Math.sqrt(right))
  return Number.isFinite(value) ? value : 0
}

export interface Known {
  readonly id: string
  readonly vector: readonly number[]
}

/** The nearest known meaning, or null when none is near enough to trust. */
export function nearest<T extends Known>(vector: readonly number[], known: readonly T[], atLeast: number): T | null {
  let best: T | null = null
  let bestScore = atLeast
  for (const one of known) {
    const score = cosine(vector, one.vector)
    if (score >= bestScore) {
      best = one
      bestScore = score
    }
  }
  return best
}

export function embeddingsFrom(options: EmbeddingOptions = {}): Embed {
  const model = options.model ?? DEFAULT_EMBEDDING_MODEL
  const endpoint = (options.endpoint ?? 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const call = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init))
  return async (text) => {
    const prompt = text.trim()
    if (prompt === '') return null
    const stopWaiting = new AbortController()
    const abandon = setTimeout(() => { stopWaiting.abort() }, LONGEST_EMBED_MS)
    try {
      const response = await call(`${endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt }),
        signal: stopWaiting.signal,
      })
      if (!response.ok) return null
      const body = (await response.json()) as { embedding?: unknown }
      return Array.isArray(body.embedding) && body.embedding.every((one) => typeof one === 'number' && Number.isFinite(one))
        ? (body.embedding as number[])
        : null
    } catch {
      /* Not installed, not running, or too slow: no resolution, not a failure. */
      return null
    } finally {
      clearTimeout(abandon)
    }
  }
}
