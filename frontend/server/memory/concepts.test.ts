/**
 * D4 — LEARNING-AWARE REUSE, IN TWO BANDS, BECAUSE ONE THRESHOLD CANNOT WORK.
 *
 * Measured on this machine, `nomic-embed-text`, 768 dims, ~12 ms warm:
 *
 *   "what is photosynthesis" ~ "explain photosynthesis to me"    0.889
 *   "zeros of a polynomial"  ~ "roots of a polynomial"           0.785
 *   "what is a zero..."      ~ "how many zeros can a quadratic"  0.673
 *   "what is photosynthesis" ~ "how do plants make food"         0.529
 *   "what is photosynthesis" ~ "what caused the french revolution" 0.429
 *   "zeros of a polynomial"  ~ "how do plants make food"         0.363
 *
 * The widest gap available is 0.429 (two different subjects) to 0.529 (the
 * brief's own example), so the lower cut can only sit at 0.50 -- thin, which
 * is why that band merges nothing and carries one sentence of context.
 * Above 0.75 is the SAME concept and its knowledge is reused.
 */
import { describe, expect, it } from 'vitest'
import { conceptsIn, SAME_CONCEPT, RELATED } from './concepts.ts'
import { inMemoryStore } from './inMemory.spec.ts'

const her = { studentId: 'stu-1', tabId: 'any', lessonId: 'anything' }
const him = { studentId: 'stu-2', tabId: 'any', lessonId: 'anything' }

/** A deterministic stand-in with the same shape and the measured distances. */
const vectors: Record<string, readonly number[]> = {
  'what is photosynthesis': [1, 0, 0],
  'explain photosynthesis to me': [0.889, Math.sqrt(1 - 0.889 ** 2), 0],
  'how do plants make food': [0.529, Math.sqrt(1 - 0.529 ** 2), 0],
  'what caused the french revolution': [0.429, 0, Math.sqrt(1 - 0.429 ** 2)],
}
const embed = async (text: string) => vectors[text] ?? null

describe('a question is resolved to a concept by meaning', () => {
  it('the first question makes the concept, and the same question finds it again', async () => {
    const store = conceptsIn(inMemoryStore(), embed)
    const made = await store.resolve(her, 'what is photosynthesis')
    expect(made).toMatchObject({ id: expect.any(String), how: 'new' })
    const again = await store.resolve(her, 'what is photosynthesis')
    expect(again).toMatchObject({ id: made!.id, how: 'same' })
  })

  it('a rewording is the SAME concept, so what was learnt is reused', async () => {
    const store = conceptsIn(inMemoryStore(), embed)
    const first = await store.resolve(her, 'what is photosynthesis')
    const second = await store.resolve(her, 'explain photosynthesis to me')
    expect(second).toMatchObject({ id: first!.id, how: 'same' })
    expect(second!.nearness).toBeGreaterThanOrEqual(SAME_CONCEPT)
  })

  it('a different objective on the same subject is RELATED, never merged', async () => {
    const store = conceptsIn(inMemoryStore(), embed)
    const first = await store.resolve(her, 'what is photosynthesis')
    const second = await store.resolve(her, 'how do plants make food')
    expect(second!.how).toBe('related')
    expect(second!.id).not.toBe(first!.id)
    expect(second!.relatedTo).toBe(first!.id)
    expect(second!.nearness).toBeGreaterThanOrEqual(RELATED)
    expect(second!.nearness).toBeLessThan(SAME_CONCEPT)
  })

  it('a different subject is neither, and never borrows the other one', async () => {
    const store = conceptsIn(inMemoryStore(), embed)
    const first = await store.resolve(her, 'what is photosynthesis')
    const other = await store.resolve(her, 'what caused the french revolution')
    expect(other!.how).toBe('new')
    expect(other!.id).not.toBe(first!.id)
    expect(other!.relatedTo).toBeUndefined()
  })

  it('one learner never resolves to another learner concept', async () => {
    const memory = inMemoryStore()
    const store = conceptsIn(memory, embed)
    await store.resolve(her, 'what is photosynthesis')
    expect((await store.resolve(him, 'explain photosynthesis to me'))!.how).toBe('new')
  })

  it('no embeddings model means no resolution, and nothing breaks', async () => {
    const store = conceptsIn(inMemoryStore(), async () => null)
    expect(await store.resolve(her, 'what is photosynthesis')).toBeNull()
  })

  it('a corrupt row resolves nothing rather than throwing', async () => {
    const memory = inMemoryStore()
    const store = conceptsIn(memory, embed)
    await store.resolve(her, 'what is photosynthesis')
    for (const key of [...memory.rows.keys()]) memory.rows.set(key, 'not json')
    expect((await store.resolve(her, 'explain photosynthesis to me'))!.how).toBe('new')
  })
})
