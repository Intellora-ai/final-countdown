// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { passages } from '../src/attachments'
import { retrieve, mergeMemory, tokens } from '../src/learner'
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

it('finds the same written evidence across Unicode normalization forms without rewriting the document', () => {
  const words = ['café', 'résumé', 'Ångström', 'गणित', 'العَرَبِيَّة']
  for (const word of words) {
    for (const stored of [word.normalize('NFC'), word.normalize('NFD')]) {
      for (const query of [word.normalize('NFC'), word.normalize('NFD')]) {
        const evidence = `${stored}: original evidence`
        const document = 'unrelated '.repeat(800) + evidence + ' ending '.repeat(100)
        const excerpt = passages(document, query, 200)
        expect(excerpt, `stored=${stored}, query=${query}`).toContain(evidence)
        const entries = [{ id: 'retained', question: stored, lesson: { explanation: 'Retained understanding', blocks: [] } }]
        expect(retrieve(entries, query, new Set())).toContain('Retained understanding')
      }
    }
  }
})

it('keeps combining marks within words instead of matching a different word after removing them', () => {
  expect(tokens('العَرَبِيَّة')).toEqual(new Set(['العَرَبِيَّة']))
  const entries = [{ id: 'unrelated', question: 'गण', lesson: { explanation: 'An unrelated word', blocks: [] } }]
  expect(retrieve(entries, 'गणित', new Set())).toBe('')
})

it('retrieves meaningful one-character variables and words without matching inside unrelated words', () => {
  for (const query of ['x', 'π', '水', 'א', '7']) {
    const evidence = `${query}: retained definition`
    const entries = [{ id: 'retained', question: query, lesson: { explanation: evidence, blocks: [] } }]
    expect(retrieve(entries, query, new Set())).toContain(evidence)
    const document = 'unrelated '.repeat(800) + evidence + ' ending '.repeat(100)
    expect(passages(document, query, 100)).toContain(evidence)
  }
  expect(retrieve([{ id: 'different', question: 'example', lesson: { explanation: 'unrelated', blocks: [] } }], 'x', new Set())).toBe('')
})

it('prioritizes stronger relevant learning rather than whichever records were saved first', () => {
  for (let i = 0; i < 30; i++) {
    const first = word(), second = word(), third = word(), strongest = word()
    const weak = Array.from({ length: 5 }, (_, index) => ({ id: `weak-${index}`, question: first, lesson: { explanation: 'Weak ' + word(), blocks: [] } }))
    const relevant = { id: strongest, question: [first, second, third].join(' '), lesson: { explanation: strongest, blocks: [] } }
    for (const entries of [[...weak, relevant], [relevant, ...weak], [weak[0], relevant, ...weak.slice(1)]]) {
      const recalled = retrieve(entries, [first, second, third].join(' '), new Set())
      expect(recalled).toContain(strongest)
      expect(recalled.indexOf(strongest)).toBeLessThan(recalled.indexOf('Weak'))
    }
  }
})

it('never returns document contents for an invalid excerpt budget', () => {
  const document = 'private ' + word() + ' evidence'
  for (const budget of [NaN, Infinity, -Infinity, 0, -1, -100]) {
    expect(passages(document, word(), budget)).toBe('')
  }
})

it('prefers excerpts containing the requested relationships over unrelated vocabulary near a lone match', () => {
  for (let i = 0; i < 30; i++) {
    const first = word(), second = word()
    const noisy = [first, ...Array.from({ length: 30 }, word)].join(' ')
    const evidence = `${first} ${second}: relational evidence`
    const document = noisy + '\n' + 'padding '.repeat(500) + evidence + ' padding'.repeat(500)
    const excerpt = passages(document, first + ' ' + second, 180)
    expect(excerpt).toContain(evidence)
    expect(excerpt.length).toBeLessThanOrEqual(180)
  }
})
