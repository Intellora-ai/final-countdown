/**
 * D4 — CONCEPTS ARE RESOLVED BY MEANING, NOT BY THE WORDS TYPED.
 *
 * "What is photosynthesis?" and "How do plants make food?" are the same
 * concept and a different learning objective. Today every lookup is an exact
 * key match, so the second is a full-price miss: the work done for the first
 * is thrown away and she is taught from nothing.
 *
 * `nomic-embed-text` is already installed in Ollama on this machine: free,
 * local, no key. When it is not there, nothing resolves and nothing breaks.
 */
import { describe, expect, it } from 'vitest'
import { cosine, embeddingsFrom, nearest } from './embed.ts'

const of = (...numbers: number[]) => numbers

describe('how close two meanings are', () => {
  it('is 1 for the same direction, 0 for a right angle, and never NaN', () => {
    expect(cosine(of(1, 0), of(2, 0))).toBeCloseTo(1)
    expect(cosine(of(1, 0), of(0, 1))).toBeCloseTo(0)
    expect(cosine(of(0, 0), of(1, 1))).toBe(0)
    expect(cosine(of(1, 0), of(1, 0, 0))).toBe(0)
    expect(cosine([], [])).toBe(0)
  })

  it('picks the nearest known meaning, and nothing at all when none is near enough', () => {
    const known = [
      { id: 'photosynthesis', vector: of(1, 0, 0) },
      { id: 'french-revolution', vector: of(0, 1, 0) },
    ]
    expect(nearest(of(0.98, 0.02, 0), known, 0.9)?.id).toBe('photosynthesis')
    expect(nearest(of(0, 0, 1), known, 0.9)).toBeNull()
    expect(nearest(of(1, 0, 0), [], 0.9)).toBeNull()
  })
})

describe('the embeddings port', () => {
  it('asks the local model and hands back the vector', async () => {
    const asked: { url: string; body: unknown }[] = []
    const embed = embeddingsFrom({
      model: 'nomic-embed-text',
      fetchImpl: async (url, init) => {
        asked.push({ url, body: JSON.parse(String(init?.body)) })
        return { ok: true, json: async () => ({ embedding: [0.1, 0.2, 0.3] }) } as Response
      },
    })
    expect(await embed('how do plants make food')).toEqual([0.1, 0.2, 0.3])
    expect(asked[0]?.url).toContain('/api/embeddings')
    expect(asked[0]?.body).toMatchObject({ model: 'nomic-embed-text', prompt: 'how do plants make food' })
  })

  it('a model that is not installed, a broken reply, or a dead socket is null -- never a throw', async () => {
    const missing = embeddingsFrom({ model: 'nomic-embed-text', fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response })
    expect(await missing('anything')).toBeNull()
    const nonsense = embeddingsFrom({ model: 'nomic-embed-text', fetchImpl: async () => ({ ok: true, json: async () => ({ embedding: 'not a vector' }) }) as Response })
    expect(await nonsense('anything')).toBeNull()
    const dead = embeddingsFrom({ model: 'nomic-embed-text', fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
    expect(await dead('anything')).toBeNull()
  })

  it('an empty question is never sent to the model at all', async () => {
    let calls = 0
    const embed = embeddingsFrom({ model: 'nomic-embed-text', fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({ embedding: [1] }) } as Response } })
    expect(await embed('   ')).toBeNull()
    expect(calls).toBe(0)
  })
})
