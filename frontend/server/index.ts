import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname, sep } from 'node:path'
import { authenticated, RequestBudget } from './protection'
import { api } from './api'

const production = process.env.NODE_ENV === 'production'
const password = process.env.CANVAS_ACCESS_PASSWORD
if (production && (!password || password.length < 16)) throw new Error('Production requires CANVAS_ACCESS_PASSWORD with at least 16 characters. Serve behind HTTPS.')
const daily = Number(process.env.CANVAS_DAILY_REQUESTS ?? 100)
if (!Number.isInteger(daily) || daily < 1 || daily > 10000) throw new Error('CANVAS_DAILY_REQUESTS must be between 1 and 10000.')
const budget = new RequestBudget({ daily, file: production ? resolve(process.env.CANVAS_STATE_DIR ?? '.canvas-state', 'request-budget.json') : undefined })
const root = fileURLToPath(new URL('../dist', import.meta.url))
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' }
const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self)')
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  if (password && !authenticated(req.headers.authorization, password)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Canvas", charset="UTF-8"', 'Cache-Control': 'no-store' }).end('Canvas access required.'); return
  }
  try {
    if ((req.url ?? '').startsWith('/api/')) {
      if ((req.url ?? '').split('?')[0] === '/api/lesson' && req.method === 'POST') {
        const permit = budget.acquire()
        if ('retry' in permit) { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(permit.retry), 'Cache-Control': 'no-store' }).end(JSON.stringify({ error: permit.reason })); return }
        try { await api(req, res) } finally { permit.release() }
      } else await api(req, res)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname))
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return }
    let file = path === root ? resolve(root, 'index.html') : path
    let body: Buffer
    try { body = await readFile(file) }
    catch {
      if (extname(path)) { res.writeHead(404).end(); return }
      file = resolve(root, 'index.html'); body = await readFile(file)
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': file.includes(sep + 'assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache' })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    if ((req.url ?? '').startsWith('/api/')) {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error: 'The server could not complete the request. Check server capacity and storage.' }))
    } else { if (!res.headersSent) res.writeHead(500); res.end('Request failed.') }
  }
})
server.headersTimeout = 15000
server.requestTimeout = 30000
server.keepAliveTimeout = 5000
server.listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1', () => {
  console.log('Canvas server started. Model configuration stays on the server.')
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref() })
