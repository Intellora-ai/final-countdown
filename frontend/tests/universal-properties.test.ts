// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { tokens, mergeMemory } from '../src/learner'
import { wrapText } from '../src/text-layout'
import { generateLesson } from '../server/api'

// Fixed seeds reproduce failures; assertions describe contracts, not topic answers.
const seeds = Array.from({ length: 500 }, (_, i) => i + 1)
function input(seed: number) {
  let value = seed
  const next = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value }
  return { next, word: () => 'w' + next().toString(36) }
}
it.each(seeds)('Unicode token normalization preserves equivalent vocabulary, seed %i', seed => {
  const random = input(seed), word = random.word()
  const text = `${word} café Ångström गणित 水 ${random.word()}`
  expect(tokens(text.normalize('NFD'))).toEqual(tokens(text.normalize('NFC')))
  expect(tokens(text.toUpperCase())).toEqual(tokens(text))
  expect(tokens(text)).toContain(word)
})
it.each(seeds)('bounded memory preserves complete Unicode characters, seed %i', seed => {
  const prefix = input(seed).word(), text = prefix + '🙂'.repeat(1100)
  const saved = mergeMemory('previous', text)
  expect(saved.length).toBeLessThanOrEqual(2000)
  expect(text.startsWith(saved)).toBe(true)
  expect(saved).not.toMatch(/[\uD800-\uDBFF]$/u)
  expect(mergeMemory(text, undefined)).toBe(text)
  expect(mergeMemory(text, '')).toBe('')
})
it.each(seeds)('layout preserves arbitrary Unicode ink and respects measured width, seed %i', seed => {
  const random = input(seed), width = 4 + random.next() % 30
  const text = `${random.word()}🙂é水${random.word()}`
  const rows = wrapText(text, width, value => Array.from(value).length)
  expect(rows.join('')).toBe(text)
  for (const row of rows) expect(Array.from(row).length).toBeLessThanOrEqual(width)
})
it.each(seeds)('replaceable provider transports unseen questions without altering answers, seed %i', async seed => {
  const random = input(seed), question = `${random.word()} ${random.word()}?`, model = random.word()
  const answer = { explanation: `${random.word()} — 水 🙂`, blocks: [] }
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  expect(await generateLesson({ question }, { url: 'https://provider.test/chat', model, format: 'json_object' }, send)).toEqual(answer)
  const body = JSON.parse(send.mock.calls[0][1]!.body as string)
  expect(body.model).toBe(model)
  expect(body.messages.at(-1)).toEqual({ role: 'user', content: question })
  expect(send).toHaveBeenCalledTimes(1)
})
