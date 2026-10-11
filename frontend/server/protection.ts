import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function authenticated(header: string | undefined, password: string) {
  if (!header?.startsWith('Basic ')) return false
  const credentials = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const digest = (text: string) => createHash('sha256').update(text).digest()
  return timingSafeEqual(digest(credentials), digest(`canvas:${password}`))
}
export class RequestBudget {
  private active = 0
  private recent: number[] = []
  private state: { day: string; count: number }
  constructor(private options: { daily?: number; burst?: number; concurrent?: number; file?: string; clock?: () => number } = {}) {
    this.state = { day: '', count: 0 }
    if (options.file && existsSync(options.file)) {
      const saved = JSON.parse(readFileSync(options.file, 'utf8'))
      if (typeof saved.day !== 'string' || !Number.isSafeInteger(saved.count) || saved.count < 0) throw new Error('Invalid request-budget state.')
      this.state = saved
    }
  }
  acquire(): { release: () => void } | { retry: number; reason: string } {
    const now = (this.options.clock ?? Date.now)()
    const day = new Date(now).toISOString().slice(0, 10)
    if (day !== this.state.day) this.state = { day, count: 0 }
    this.recent = this.recent.filter(time => now - time < 60000)
    if (this.state.count >= (this.options.daily ?? 100)) return { retry: Math.ceil((Date.parse(day) + 86400000 - now) / 1000), reason: 'The daily answer budget is exhausted. Try again tomorrow.' }
    if (this.active >= (this.options.concurrent ?? 2) || this.recent.length >= (this.options.burst ?? 10)) return { retry: 60, reason: 'The canvas is busy. Please wait before asking again.' }
    this.state.count++
    if (this.options.file) {
      mkdirSync(dirname(this.options.file), { recursive: true })
      writeFileSync(this.options.file + '.tmp', JSON.stringify(this.state), { mode: 0o600 })
      renameSync(this.options.file + '.tmp', this.options.file)
    }
    this.active++; this.recent.push(now)
    let released = false
    return { release: () => { if (!released) { released = true; this.active-- } } }
  }
}
