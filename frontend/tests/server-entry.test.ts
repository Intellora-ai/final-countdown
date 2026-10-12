import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(done => child.once('exit', () => done()))
  child.kill('SIGTERM')
  const force = setTimeout(() => child.kill('SIGKILL'), 2000)
  await exited; clearTimeout(force)
}
it('serves deployment health while enforcing authentication and durable limits in the actual server', async () => {
  const reservation = createServer()
  await new Promise<void>(done => reservation.listen(0, '127.0.0.1', done))
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('No port')
  const port = address.port
  await new Promise<void>(done => reservation.close(() => done()))
  const state = await mkdtemp(join(tmpdir(), 'canvas-entry-'))
  const base = `http://127.0.0.1:${port}`
  const asset = `entry-fixture-${randomUUID()}.txt`
  await mkdir('dist', { recursive: true })
  await writeFile(join('dist', asset), 'A readable board asset')
  const headers = { Authorization: 'Basic ' + Buffer.from('canvas:entry-test-password-only').toString('base64') }
  // Run actual source in mutation workers. This hook resolves Vite's
  // extensionless TypeScript imports without replacing application behavior.
  const loader = `import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e}}});
await import(${JSON.stringify(pathToFileURL(resolve('server/index.ts')).href)});`
  let child: ChildProcess | undefined
  async function start(stateDirectory = state) {
    child = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', loader], {
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', CANVAS_ACCESS_PASSWORD: 'entry-test-password-only', CANVAS_STATE_DIR: stateDirectory, CANVAS_DAILY_REQUESTS: '1', LESSON_API_URL: '', LESSON_MODEL: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let errors = ''; child.stderr!.on('data', data => { errors += data })
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error('Server startup failed: ' + errors)
      try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(200) }); return } catch {}
      await new Promise(done => setTimeout(done, 25))
    }
    throw new Error('Server startup timed out: ' + errors)
  }
  try {
    await start()
    const health = await fetch(base + '/api/health')
    expect(health.status).toBe(200); expect(await health.json()).toEqual({ ok: true })
    expect((await fetch(base + '/api/health', { method: 'HEAD' })).status).toBe(200)
    expect((await fetch(base + '/api/health', { method: 'POST' })).status).toBe(401)
    expect((await fetch(base + '/api/health', { method: 'HEAD', headers })).status).toBe(200)
    expect((await fetch(base)).status).toBe(401)
    expect((await fetch(base + '/api/lesson', { method: 'POST', body: '{}' })).status).toBe(401)
    const staticAsset = await fetch(base + '/' + asset, { headers })
    expect(staticAsset.status).toBe(200)
    expect(await staticAsset.text()).toBe('A readable board asset')
    expect((await fetch(base + '/' + asset, { method: 'HEAD', headers })).status).toBe(200)
    expect((await fetch(base + '/' + asset, { method: 'PUT', headers })).status).toBe(405)
    // Invalid URL escapes must produce an error status, never a successful page.
    const malformedPath = await fetch(base + '/%', { headers })
    expect(malformedPath.status).toBe(500)
    expect(await malformedPath.text()).toBe('Request failed.')
    const answer = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })
    expect(answer.status).toBe(503)
    expect(answer.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    const limited = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    await stop(child!); await start()
    expect((await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })).status).toBe(429)
    await stop(child!)
    const unavailableStorage = join(state, 'not-a-directory')
    await writeFile(unavailableStorage, 'Storage is unavailable')
    await start(unavailableStorage)
    const unavailable = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{"question":"Explain"}' })
    expect(unavailable.status).toBe(503)
    expect((await unavailable.json()).error).toContain('storage')
  } finally {
    if (child) await stop(child)
    await rm(state, { recursive: true, force: true })
    await rm(join('dist', asset), { force: true })
  }
}, 10000)
