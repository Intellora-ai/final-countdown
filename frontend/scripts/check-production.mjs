import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const state = await mkdtemp(join(tmpdir(), 'canvas-production-'))
const password = randomUUID()
const authorization = 'Basic ' + Buffer.from('canvas:' + password).toString('base64')
let calls = 0, child
const upstream = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const payload = JSON.parse(Buffer.concat(chunks).toString())
  assert.equal(payload.response_format.type, 'json_object')
  assert.equal(payload.max_tokens, 512)
  assert.equal(payload.messages.at(-1).content, '你好')
  calls++
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ explanation: 'Hello!', blocks: [] }) } }] }))
})
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const upstreamPort = await listen(upstream)
const reservation = createServer(); const port = await listen(reservation)
await new Promise(resolve => reservation.close(resolve))
const base = `http://127.0.0.1:${port}`
async function start(extra = {}) {
  child = spawn(process.execPath, ['dist-server/index.js'], { env: {
    ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1',
    CANVAS_ACCESS_PASSWORD: password, CANVAS_STATE_DIR: state, CANVAS_DAILY_REQUESTS: '1',
    LESSON_API_URL: `http://127.0.0.1:${upstreamPort}/chat`, LESSON_MODEL: 'fixture',
    LESSON_API_KEY: 'fixture-only', LESSON_RESPONSE_FORMAT: 'json_object', LESSON_MAX_TOKENS: '512', ...extra,
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  let failure = ''; child.stderr.on('data', data => { failure += data })
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Production server failed: ' + failure)
    try { await fetch(base); return } catch { await new Promise(resolve => setTimeout(resolve, 50)) }
  }
  throw new Error('Production server did not become reachable.')
}
async function stop() {
  if (!child || child.exitCode !== null) return
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM') })
}
try {
  await start()
  assert.equal((await fetch(base)).status, 401)
  assert.equal((await fetch(base + '/api/lesson', { method: 'POST', body: '{}' })).status, 401)
  assert.equal(calls, 0)
  const ui = await fetch(base, { headers: { Authorization: authorization } })
  assert.equal(ui.status, 200)
  assert.match(ui.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  const html = await ui.text()
  assert.ok(!html.includes('fixture-only'))
  const answer = await fetch(base + '/api/lesson', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '你好' }) })
  assert.equal(answer.status, 200)
  assert.equal((await answer.json()).lesson.explanation, 'Hello!')
  const limited = await fetch(base + '/api/lesson', { method: 'POST', headers: { Authorization: authorization }, body: '{"question":"again"}' })
  assert.equal(limited.status, 429)
  assert.ok(limited.headers.get('retry-after'))
  assert.equal(calls, 1)
  await stop(); await start()
  assert.equal((await fetch(base + '/api/lesson', { method: 'POST', headers: { Authorization: authorization }, body: '{"question":"again"}' })).status, 429)
  assert.equal(calls, 1)
  await stop()
  const refused = spawn(process.execPath, ['dist-server/index.js'], { env: { ...process.env, NODE_ENV: 'production', CANVAS_ACCESS_PASSWORD: '' }, stdio: 'ignore' })
  assert.notEqual(await new Promise(resolve => refused.once('exit', resolve)), 0)
  console.log('Production checks passed: authentication, UTF-8 request, JSON mode, output cap, headers, persistent quota, fail-closed startup and graceful shutdown. Provider was a local fixture.')
} finally {
  await stop()
  await new Promise(resolve => upstream.close(resolve))
  await rm(state, { recursive: true, force: true })
}
