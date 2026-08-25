/* Getting a lesson for one concept, and what happens when we cannot.
 *
 * THE RULE THAT SHAPES ALL OF THIS
 *   A fallback lesson for a DIFFERENT concept is worse than no lesson at all.
 *   The student would be taught the wrong topic, believe they had covered the
 *   right one, and mark it done. So the stored fallback matches by id or it
 *   does not answer.
 */

import { describe, expect, it, vi } from 'vitest'
import { createAlmanacClient } from './client'
import { storedLessonFor } from './lesson'

const LESSON = {
  id: 'photosynthesis',
  question: 'How does a leaf make food?',
  blocks: [{ id: 'a', kind: 'prose', emphasis: 'primary', body: 'A leaf turns light into sugar.' }],
  relations: [],
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('asking the server to teach a concept', () => {
  it('sends the concept and what is known about the student', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ lesson: LESSON, strategy: 'analogy' }))
    await createAlmanacClient({ fetchImpl }).lesson({
      concept: 'Photosynthesis', subject: 'Science', attempts: 3, carriedFrom: '2026-08-24',
    })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/lesson')
    expect(JSON.parse(init.body)).toEqual({
      concept: 'Photosynthesis', subject: 'Science', attempts: 3, carriedFrom: '2026-08-24',
    })
  })

  it('never asks for a strategy, because that is the server\'s decision', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ lesson: LESSON, strategy: 'worked_example' }))
    await createAlmanacClient({ fetchImpl }).lesson({ concept: 'X', strategy: 'analogy' } as never)

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('strategy')
  })

  it('returns the lesson and the strategy the server chose', async () => {
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockResolvedValue(ok({ lesson: LESSON, strategy: 'analogy' })) })
    expect(await client.lesson({ concept: 'Photosynthesis' })).toEqual({
      ok: true, lesson: LESSON, strategy: 'analogy',
    })
  })

  it('refuses a 200 whose body is not a lesson', async () => {
    /* Same reason the day route validates: a proxy, a login page and a future
     * API change all answer 200, and `undefined.blocks` renders as a crash in
     * front of a student. */
    for (const body of [{}, { lesson: null }, { lesson: { id: 'x' } }, { lesson: { id: 'x', question: 'q', blocks: [] } }]) {
      const client = createAlmanacClient({ fetchImpl: vi.fn().mockResolvedValue(ok(body)) })
      const result = await client.lesson({ concept: 'X' })
      expect(result.ok, `accepted ${JSON.stringify(body)}`).toBe(false)
    }
  })

  it('reports an unreachable server with a reason and no lesson', async () => {
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) })
    const result = await client.lesson({ concept: 'X' })

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('lesson')
    expect(!result.ok && result.reason).toMatch(/could not be reached/i)
  })

  it('passes the server\'s own explanation through', async () => {
    const client = createAlmanacClient({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false, status: 502,
        json: async () => ({ error: 'the model returned a lesson that failed validation' }),
      }),
    })
    expect(await client.lesson({ concept: 'X' })).toEqual({
      ok: false, reason: 'the model returned a lesson that failed validation',
    })
  })
})

describe('the stored fallback', () => {
  it('answers for a concept it genuinely has', () => {
    const lesson = storedLessonFor('gas-pressure')
    expect(lesson?.id).toBe('gas-pressure')
    expect(lesson?.blocks.length).toBeGreaterThan(0)
  })

  it('knows the three lessons that are actually stored', () => {
    for (const id of ['gas-pressure', 'bill-becomes-law', 'classifier-evaluation']) {
      expect(storedLessonFor(id)?.id, id).toBe(id)
    }
  })

  it('REFUSES to answer for a concept it does not have', () => {
    /* The whole point. Handing back gas pressure when the student asked for
     * photosynthesis teaches the wrong topic, and they would mark the right
     * one done afterwards. */
    for (const id of ['photosynthesis', '', 'gas', 'GAS-PRESSURE', 'c-9-maths-1']) {
      expect(storedLessonFor(id), id).toBeNull()
    }
  })

  it('returns lessons that pass the canvas validator', () => {
    /* A stored fallback that fails validation renders a refusal, which is the
     * one thing a fallback exists to avoid. */
    for (const id of ['gas-pressure', 'bill-becomes-law', 'classifier-evaluation']) {
      const lesson = storedLessonFor(id)!
      expect(typeof lesson.question).toBe('string')
      expect(lesson.blocks.every((b) => typeof b.id === 'string' && b.id.length > 0)).toBe(true)
    }
  })
})

describe('the stored lessons are valid, not merely present', () => {
  it('every stored id returns a lesson, which means every one passes the gate', () => {
    /* `storedLessonFor` returns null when validation fails, so a null here
     * would mean a stored lesson had rotted -- and the fallback would silently
     * stop existing rather than fail loudly. */
    for (const id of ['gas-pressure', 'bill-becomes-law', 'classifier-evaluation']) {
      expect(storedLessonFor(id), `${id} no longer passes validation`).not.toBeNull()
    }
  })

  it('fills in the defaults the schema promises, so the canvas can render it', () => {
    const lesson = storedLessonFor('gas-pressure')!
    for (const block of lesson.blocks) {
      expect(typeof block.emphasis, block.id).toBe('string')
      expect(typeof block.tone, block.id).toBe('string')
    }
  })
})
