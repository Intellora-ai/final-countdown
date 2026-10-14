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
it('keeps the topic and explanation when compacting older or oversized boards without inventing absent titles', () => {
  for (const title of ['Before and after', '速度の変化', undefined]) {
    const prior = { ...drawing('First explanation'), ...(title ? { title } : {}) }
    const latest = drawing('Latest explanation')
    const input = [{ question: 'First question', lesson: prior }, { question: 'Next question', lesson: latest }]
    const snapshots = JSON.stringify(input)
    const compact = compactContext(input)
    expect(compact.turns[0].lesson).toEqual({ ...(title ? { title } : {}), explanation: prior.explanation, blocks: [] })
    expect(compact.turns[1].lesson).toEqual(latest)
    const oversized = compactContext([{ question: 'First question', lesson: prior }], undefined, 300)
    expect(oversized.turns[0].lesson).toEqual({ ...(title ? { title } : {}), explanation: prior.explanation, blocks: [] })
    expect(oversized.geometryOmitted).toBe(true)
    expect(JSON.stringify(input)).toBe(snapshots)
  }
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
it('a repeated release cannot grant extra simultaneous requests', () => {
  const budget = new RequestBudget({ concurrent: 1, burst: 10 })
  const first = budget.acquire()
  if (!('release' in first)) throw new Error('First request was denied')
  first.release(); first.release()
  const second = budget.acquire()
  expect('release' in second).toBe(true)
  expect('retry' in budget.acquire()).toBe(true)
  if ('release' in second) second.release()
})
it('burst capacity returns after the rolling minute without waiting for tomorrow', () => {
  let now = Date.parse('2026-10-12T10:00:00Z')
  const budget = new RequestBudget({ burst: 1, clock: () => now })
  const first = budget.acquire()
  if ('release' in first) first.release()
  now += 59999
  expect('retry' in budget.acquire()).toBe(true)
  now += 1
  expect('release' in budget.acquire()).toBe(true)
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
it('transmits learner context, file excerpts and photos through the configured model without extra calls', async () => {
 let payload: any
 const send = async (_url: unknown, init?: RequestInit) => { payload=JSON.parse(init!.body as string);return Response.json({choices:[{message:{content:JSON.stringify({explanation:'A tailored answer',learner:'Learning algebra',blocks:[]})}}]}) }
 const result=await generateLesson({question:'Explain',learner:'Prefers diagrams',recall:'Struggled with fractions',attachments:[{name:'notes.txt',text:'Evidence'},{name:'photo.jpg',image:'data:image/jpeg;base64,YQ=='}]}, {url:'https://provider.test/chat',model:'replaceable',format:'json_object'},send as typeof fetch)
 expect(result.learner).toBe('Learning algebra');expect(payload.messages.at(-1).content[0].text).toContain('Struggled with fractions');expect(payload.messages.at(-1).content[1].image_url.url).toBe('data:image/jpeg;base64,YQ==')
 expect(JSON.parse(payload.messages.at(-1).content[0].text).documents).toEqual([{name:'notes.txt',excerpt:'Evidence'}])
 expect(payload.messages.at(-1).content).toHaveLength(2)
})
it('does not expose disabled learner memory even if a client includes it',async()=>{
 let payload:any;const send=async(_url:unknown,init?:RequestInit)=>{payload=JSON.parse(init!.body as string);return Response.json({choices:[{message:{content:'{"explanation":"Hello"}'}}]})}
 await generateLesson({question:'hi',remember:false,learner:'private preference',recall:'private answer'},{url:'https://provider.test/chat',model:'test'},send as typeof fetch)
 expect(JSON.stringify(payload)).not.toContain('private preference');expect(JSON.stringify(payload)).not.toContain('private answer')
})
