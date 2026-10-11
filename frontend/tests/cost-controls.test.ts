import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compactContext } from '../server/context'
import { authenticated, RequestBudget } from '../server/protection'
import { generateLesson, modelConfig } from '../server/api'
const directories: string[] = []
afterEach(() => { directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })) })
const drawing = (label: string) => ({ explanation: label, blocks: [{ kind: 'svg' as const, title: label, source: '<svg viewBox="0 0 800 400">' + '<path d="M0 0 L400 200"/>'.repeat(100) + '</svg>' }] })
it('keeps earlier meaning and latest geometry while reducing repeated vector context', () => {
  const memory = ['one', 'two', 'three'].map(question => ({ question, lesson: drawing(question) }))
  const result = compactContext(memory)
  expect(result.turns[0].lesson.explanation).toBe('one')
  expect(result.turns[0].lesson.blocks).toEqual([])
  expect(result.turns[2].lesson).toEqual(memory[2].lesson)
  expect(JSON.stringify(result.turns).length).toBeLessThan(JSON.stringify(memory).length / 2)
  expect(result.geometryOmitted).toBe(false)
})
it('deduplicates selected context and explicitly identifies oversized omitted geometry', () => {
  const previous = drawing('latest')
  expect(compactContext([{ question: 'q', lesson: previous }], previous).turns).toHaveLength(1)
  const result = compactContext([{ question: 'q', lesson: previous }], undefined, 300)
  expect(result.turns[0].lesson.explanation).toBe('latest')
  expect(result.turns[0].lesson.blocks).toEqual([])
  expect(result.geometryOmitted).toBe(true)
})
it('uses a small JSON contract and a bounded output without automatic retries', async () => {
  const calls: RequestInit[] = []
  const send = async (_url: unknown, init?: RequestInit) => { calls.push(init!); return Response.json({ choices: [{ message: { content: '{"explanation":"Hi!"}' } }] }) }
  await generateLesson({ question: 'hi' }, { url: 'https://provider.test/chat', model: 'test', format: 'json_object', maxTokens: 1024 }, send as typeof fetch)
  const payload = JSON.parse(calls[0].body as string)
  expect(payload.max_tokens).toBe(1024)
  expect(payload.messages[0].content.length).toBeLessThan(2500)
  expect(calls).toHaveLength(1)
})
it('detects truncated output instead of returning incomplete drawings or retrying', async () => {
  const send = async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })
  await expect(generateLesson({ question: 'draw' }, { url: 'https://provider.test/chat', model: 'test' }, send as typeof fetch)).rejects.toThrow('MODEL_OUTPUT_TRUNCATED')
})
it('propagates JSON mode and output settings from the same configuration used by Vite', () => {
  expect(modelConfig({ LESSON_RESPONSE_FORMAT: 'json_object', LESSON_MAX_TOKENS: '2048' })).toMatchObject({ format: 'json_object', maxTokens: 2048 })
  expect(() => modelConfig({ LESSON_MAX_TOKENS: '0' })).toThrow()
})
it('requires the intended access credentials and rejects absent or wrong credentials', () => {
  const password = 'test-only-password'
  const header = (text: string) => 'Basic ' + Buffer.from(text).toString('base64')
  expect(authenticated(undefined, password)).toBe(false)
  expect(authenticated(header('canvas:wrong'), password)).toBe(false)
  expect(authenticated(header('canvas:' + password), password)).toBe(true)
})
it('bounds concurrency, allows release once, and bounds burst requests', () => {
  const budget = new RequestBudget({ concurrent: 1, burst: 2 })
  const first = budget.acquire(); expect('release' in first).toBe(true)
  expect('retry' in budget.acquire()).toBe(true)
  if ('release' in first) { first.release(); first.release() }
  const next = budget.acquire(); expect('release' in next).toBe(true)
  if ('release' in next) next.release()
  expect('retry' in budget.acquire()).toBe(true)
})
it('retains a daily budget across restarts and renews on the next UTC day', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canvas-budget-')); directories.push(dir)
  const file = join(dir, 'budget.json'); let now = Date.parse('2026-10-11T12:00:00Z')
  const options = { daily: 1, file, clock: () => now }
  const first = new RequestBudget(options).acquire()
  if ('release' in first) first.release()
  expect('retry' in new RequestBudget(options).acquire()).toBe(true)
  now += 86400000
  expect('release' in new RequestBudget(options).acquire()).toBe(true)
})
