import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname, sep } from 'node:path'
import { api } from './api'

const root = fileURLToPath(new URL('../dist', import.meta.url))
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
createServer(async (req, res) => {
  try {
    if ((req.url ?? '').startsWith('/api/')) { await api(req, res); return }
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
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { if (!res.headersSent) res.writeHead(500); res.end('Request failed.') }
}).listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1', () => {
  console.log('Canvas server started. Model configuration stays on the server.')
})
