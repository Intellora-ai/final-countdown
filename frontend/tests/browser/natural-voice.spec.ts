import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const waveform = readFileSync(new URL('../fixtures/natural-voice.wav', import.meta.url))
test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true, naturalVoice: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { title: 'An idea', explanation: 'Let us take one idea at a time.', blocks: [] } } }))
  await page.route('**/api/speech', route => route.fulfill({ body: waveform, contentType: 'audio/wav' }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Explain an idea')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Written answer' })).toBeVisible()
})
test('plays a real Kokoro waveform through native Web Audio, pauses, resumes and completes', async ({ page }) => {
  await expect(page.getByRole('combobox', { name: 'Voice', exact: true })).toHaveValue('natural')
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()
  await expect(page.getByText('Speaking…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause reading', exact: true }).click()
  await page.waitForTimeout(2300)
  await expect(page.getByRole('button', { name: 'Resume reading', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume reading', exact: true }).click()
  await expect(page.getByText('Speaking…', { exact: true })).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})
test('stops generated audio immediately and keeps the composer usable on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 })
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()
  await page.getByRole('button', { name: 'Stop speaking', exact: true }).click()
  await expect(page.getByText('Speaking…', { exact: true })).toHaveCount(0)
  const input = page.getByRole('textbox', { name: 'Your question' })
  await expect(input).toBeVisible()
  const bounds = await input.boundingBox(); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
test('reuses native gesture-unlocked audio across automatic replies and interruption', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as typeof window & { __contexts: AudioContext[]; __recognition: { onresult: ((event: unknown) => void) | null }[] }
    w.__contexts = []; w.__recognition = []
    const Native = window.AudioContext
    window.AudioContext = class extends Native { constructor() { super(); w.__contexts.push(this) } }
    // Only microphone transcription is a fixture; playback remains genuine Web Audio.
    Object.defineProperty(window, 'SpeechRecognition', { value: class {
      lang = ''; interimResults = false; continuous = false
      onresult = null; onend = null; onerror = null
      constructor() { w.__recognition.push(this) }
      start() {} stop() {}
    } })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start voice', exact: true }).click()
  const ask = () => page.evaluate(() => {
    const w = window as typeof window & { __recognition: { onresult: ((event: unknown) => void) | null }[] }
    w.__recognition.at(-1)!.onresult?.({ results: [[{ transcript: 'Explain another idea.' }]] })
  })
  await ask()
  await expect(page.getByText('Speaking…', { exact: true })).toBeVisible()
  await expect(page.getByText('Listening… pause when you finish.', { exact: true })).toBeVisible({ timeout: 6000 })
  await ask()
  await expect(page.getByText('Speaking…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Interrupt', exact: true }).click()
  await expect(page.getByText('Speaking…', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'End voice', exact: true }).click()
  expect(await page.evaluate(() => {
    const contexts = (window as typeof window & { __contexts: AudioContext[] }).__contexts
    return contexts.map(context => context.state)
  })).toEqual(['closed'])
})
test('native audio continues on its sample clock while the UI completion callback is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const records: { when: number; duration: number; queuedAt: number; callbackAt?: number }[] = []
    const w = window as typeof window & { __waveClock: typeof records }
    w.__waveClock = records
    const Native = window.AudioContext
    window.AudioContext = class extends Native {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source), index = records.length
        source.start = (...args) => {
          records.push({ when: args[0] ?? this.currentTime, duration: source.buffer!.duration, queuedAt: this.currentTime })
          start(...args)
        }
        source.addEventListener('ended', () => {
          if (index === 0) { const until = performance.now() + 300; while (performance.now() < until) { /* deliberate UI stall */ } }
          records[index].callbackAt = this.currentTime
        })
        return source
      }
    }
  })
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { explanation: 'The first idea stays together. Another clear idea follows.', blocks: [] } } }))
  await page.reload()
  await page.getByRole('button', { name: '+ New topic', exact: true }).click()
  await page.getByRole('textbox', { name: 'Your question' }).fill('Explain the relationship')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()
  await page.waitForFunction(() => (window as typeof window & { __waveClock: unknown[] }).__waveClock.length === 2)
  const initial = await page.evaluate(() => (window as typeof window & { __waveClock: { when: number; duration: number; queuedAt: number }[] }).__waveClock)
  expect(initial[1].when).toBeCloseTo(initial[0].when + initial[0].duration, 6)
  expect(initial[1].queuedAt).toBeLessThan(initial[1].when)
  await expect(page.getByText('Speaking…', { exact: true })).toHaveCount(0, { timeout: 6000 })
  const finished = await page.evaluate(() => (window as typeof window & { __waveClock: { when: number; duration: number; callbackAt: number }[] }).__waveClock)
  expect(finished[0].callbackAt).toBeGreaterThan(finished[1].when + .15)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
