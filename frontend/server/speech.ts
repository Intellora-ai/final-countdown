import type { IncomingMessage, ServerResponse } from 'node:http'
import { generateSpeech } from './voice-model.ts'

let active = 0
export async function speech(req: IncomingMessage, res: ServerResponse, generate = generateSpeech) {
  const json = (status: number, error: string) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error })) }
  let text: string
  try {
    const chunks: Buffer[] = []; let bytes = 0
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk); bytes += buffer.length
      if (bytes > 4096) { json(413, 'Voice request is too large.'); return }
      chunks.push(buffer)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 512) { json(400, 'Send a short text segment.'); return }
    text = input.text
  } catch { json(400, 'Voice text could not be read.'); return }
  if (active >= 2) { res.setHeader('Retry-After', '1'); json(429, 'Voice is busy. Try again shortly.'); return }
  const controller = new AbortController(), disconnect = () => controller.abort()
  res.on('close', disconnect); active++
  let cancelled!: () => void
  try {
    const abort = new Promise<never>((_resolve, reject) => {
      cancelled = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', cancelled)
    })
    const audio = await Promise.race([generate(text, controller.signal), abort])
    if (!res.destroyed) res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }).end(audio)
  } catch {
    if (!res.destroyed) json(503, 'Natural voice could not load. Try again or select Browser voice.')
  } finally { active--; res.off('close', disconnect); controller.signal.removeEventListener('abort', cancelled) }
}
