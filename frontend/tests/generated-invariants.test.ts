// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { passages } from '../src/attachments'
import { retrieve, mergeMemory } from '../src/learner'
import { requestSchema } from '../src/lesson'

// Repeatable generated inputs, not a list of school topics or expected answers.
let seed = 73491
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
const word = () => 'term' + Math.floor(random() * 1e9).toString(36)
it('retains matching evidence across arbitrary document offsets and small budgets', () => {
  for (let i = 0; i < 100; i++) {
    const query = word(), offset = Math.floor(random() * 10000), budget = 80 + Math.floor(random() * 400)
    const text = 'noise '.repeat(Math.ceil(offset / 6)) + query + ' evidence ' + 'other '.repeat(500)
    const excerpt = passages(text, query, budget)
    expect(excerpt.length).toBeLessThanOrEqual(budget)
    expect(excerpt, `offset=${offset}, budget=${budget}`).toContain(query)
  }
})
it('retrieves unseen vocabulary regardless of archive order and excludes selected records', () => {
  for (let i = 0; i < 60; i++) {
    const query = word(), id = word()
    const entries = Array.from({ length: 20 }, () => ({ id: word(), question: word(), lesson: { explanation: word(), blocks: [] } }))
    const relevant = { id, question: query, lesson: { explanation: 'evidence ' + word(), blocks: [] } }
    entries.splice(Math.floor(random() * entries.length), 0, relevant)
    expect(retrieve(entries, query, new Set())).toContain(relevant.lesson.explanation)
    expect(retrieve([...entries].reverse(), query, new Set())).toContain(relevant.lesson.explanation)
    expect(retrieve(entries, query, new Set([id]))).toBe('')
  }
})
it('bounds updated memory for arbitrary Unicode content without changing unchanged notes', () => {
  for (const length of [0, 1, 1999, 2000, 2001, 10000]) {
    const value = '学'.repeat(length)
    expect(mergeMemory('old', value).length).toBeLessThanOrEqual(2000)
    expect(mergeMemory(value, undefined)).toBe(value)
  }
})
it('rejects ambiguous attachments and malformed image URLs independently of filename', () => {
  for (let i = 0; i < 50; i++) {
    const name = word()
    for (const attachment of [{ name }, { name, text: 'evidence', image: 'data:image/jpeg;base64,YQ==' }, { name, image: 'https://example.test/' + word() }, { name, image: 'data:image/svg+xml;base64,YQ==' }]) {
      expect(requestSchema.safeParse({ question: word(), attachments: [attachment] }).success).toBe(false)
    }
  }
})
