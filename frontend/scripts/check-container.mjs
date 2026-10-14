import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const image = process.argv[2]
assert.ok(image, 'Supply the image built from this checkout.')
const name = 'canvas-check-' + randomUUID(), volume = name + '-state', password = randomUUID()
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 }).trim()
const headers = { Authorization: 'Basic ' + Buffer.from('canvas:' + password).toString('base64') }
let base
async function ready() {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(base, { signal: AbortSignal.timeout(1000) }); if (response.status === 401) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Container never became reachable: ' + docker('logs', name))
}
try {
  docker('run', '-d', '--name', name, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '-p', '127.0.0.1::8787', '-v', volume + ':/app/state', '-e', 'CANVAS_ACCESS_PASSWORD=' + password, '-e', 'CANVAS_DAILY_REQUESTS=1', image)
  const port = JSON.parse(docker('inspect', name))[0].NetworkSettings.Ports['8787/tcp'][0].HostPort
  base = 'http://127.0.0.1:' + port
  await ready()
  const health = await fetch(base + '/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true })
  assert.equal(docker('inspect', '--format', '{{.Config.User}}', name), 'node')
  assert.equal((await fetch(base)).status, 401)
  const ui = await fetch(base, { headers }); assert.equal(ui.status, 200)
  assert.match(ui.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  const html = await ui.text(); assert.ok(!html.includes(password))
  const appScript = html.match(/src="([^"]+\.js)"/)?.[1]; assert.ok(appScript)
  const script = await fetch(base + appScript, { headers }); assert.equal(script.status, 200); assert.match(script.headers.get('content-type'), /javascript/)
  const assets = docker('exec', name, 'node', '-e', "console.log(require('node:fs').readdirSync('/app/frontend/dist/assets').find(f=>/^pdf.worker.*\\.mjs$/.test(f)))")
  const worker = await fetch(base + '/assets/' + assets, { headers }); assert.equal(worker.status, 200); assert.match(worker.headers.get('content-type'), /javascript/)
  const first = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{}' }); assert.equal(first.status, 400)
  const next = await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{}' }); assert.equal(next.status, 429)
  docker('restart', name)
  const restartedPort = JSON.parse(docker('inspect', name))[0].NetworkSettings.Ports['8787/tcp'][0].HostPort
  base = 'http://127.0.0.1:' + restartedPort
  await ready()
  assert.equal((await fetch(base + '/api/lesson', { method: 'POST', headers, body: '{}' })).status, 429)
  console.log('Container passed: non-root, read-only filesystem, authentication, static assets, PDF worker, persistent quota and restart.')
} finally {
  // Clean only the resources created by this check, including on assertion failure.
  try { docker('rm', '-f', name) } catch {}
  try { docker('volume', 'rm', volume) } catch {}
}
