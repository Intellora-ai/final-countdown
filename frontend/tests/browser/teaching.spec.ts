import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const opening = 'Opening step: Read one idea at a time and notice how each sentence connects to the last. '.repeat(7).trim()
const middle = 'Middle step: Connect this idea to an example, then check why it works. '.repeat(10).trim()
const ending = 'Final step: The complete answer ends here. Keep this final idea in view while the teacher reads it.'
const explanation = `${opening}\n\n${middle}\n\n${ending}`
const title = 'One idea at a time'
type SpeechRecord = { utterance: SpeechSynthesisUtterance; queuedBoundary: SpeechSynthesisUtterance['onboundary'] }
type SpeechFixture = { records: SpeechRecord[]; calls: { pause: number; resume: number; cancel: number }; boundary(index: number, queued?: boolean): void }
type TeachingWindow = typeof window & { __teachingSpeech: SpeechFixture }

async function speechFixture(page: Page) {
  // Keep Chromium's native utterance and boundary-event objects, but replace
  // the speech service. This verifies browser synchronization, not audio output.
  await page.addInitScript(() => {
    const records: SpeechRecord[] = []
    const calls = { pause: 0, resume: 0, cancel: 0 }
    const service = {
      paused: false,
      speak(utterance: SpeechSynthesisUtterance) { records.push({ utterance, queuedBoundary: utterance.onboundary }) },
      cancel() { calls.cancel++ },
      pause() { calls.pause++; service.paused = true },
      resume() { calls.resume++; service.paused = false },
    }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: service })
    Object.defineProperty(window, '__teachingSpeech', { value: {
      records, calls,
      boundary(charIndex: number, queued = false) {
        const record = records.at(-1)!
        const event = new SpeechSynthesisEvent('boundary', { utterance: record.utterance, charIndex, name: 'word' })
        if (queued) record.queuedBoundary?.call(record.utterance, event)
        else record.utterance.dispatchEvent(event)
      },
    } })
  })
}
async function fixture(page: Page) {
  const questions: string[] = []
  // All teaching responses are explicit local fixtures; no provider is called.
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => {
    questions.push(route.request().postDataJSON().question)
    return route.fulfill({ json: { lesson: { title, explanation, blocks: [] } } })
  })
  await page.goto('/')
  return questions
}
async function ask(page: Page, question = 'Explain one idea at a time') {
  await page.getByRole('textbox', { name: 'Your question' }).fill(question)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Written answer' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect((await page.getByRole('img', { name: 'Written answer' }).locator('text').textContent())!.replace(/\s/g, '')).toBe(explanation.replace(/\s/g, ''))
}
async function shell(page: Page) {
  const positions = await page.evaluate(() => {
    const visible = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }
    }
    return { header: visible('header'), composer: visible('.composer'), board: visible('.board-stage'), height: innerHeight, width: innerWidth, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, pageScroll: scrollY }
  })
  for (const box of [positions.header, positions.composer]) {
    expect(box.top).toBeGreaterThanOrEqual(-1)
    expect(box.bottom).toBeLessThanOrEqual(positions.height + 1)
    expect(box.left).toBeGreaterThanOrEqual(-1)
    expect(box.right).toBeLessThanOrEqual(positions.width + 1)
  }
  expect(positions.board.bottom).toBeLessThanOrEqual(positions.composer.top)
  expect(positions.documentWidth).toBeLessThanOrEqual(positions.width + 1)
  expect(positions.documentHeight).toBeLessThanOrEqual(positions.height + 1)
  expect(positions.pageScroll).toBe(0)
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible()
  await expect(page.getByRole('button', { name: '+ New topic' })).toBeVisible()
  return positions
}
async function evidence(page: Page, info: TestInfo, name: string) {
  const directory = '/tmp/studdy-teaching-board-after'
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${info.project.name}-${name}.png`)
  await page.screenshot({ path })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('native speech boundaries follow the spoken row while pause, user pan and cancellation keep control with the learner', async ({ page }, info) => {
  await speechFixture(page)
  const questions = await fixture(page)
  await ask(page)
  const stage = page.locator('.board-stage')
  const writing = page.getByRole('img', { name: 'Written answer' })
  const follow = page.getByRole('button', { name: 'Follow teacher' })
  const lastRowWord = (await writing.locator('.handwriting-row').last().textContent())!.trim().split(/\s+/)[0]
  const finalBoundary = [...explanation.matchAll(/\S+/g)].filter(word => word[0] === lastRowWord).at(-1)!.index
  const finalCaption = explanation.slice(finalBoundary)
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Board zoom').selectOption({ label: '100%' })
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()
  expect(await page.evaluate(() => (window as TeachingWindow).__teachingSpeech.records.map(record => record.utterance.text))).toEqual([explanation])
  await expect(writing.locator('.handwriting-row[data-active="true"]')).toHaveCount(1)
  await page.evaluate(index => (window as TeachingWindow).__teachingSpeech.boundary(index), finalBoundary)
  await expect(page.getByLabel('Voice caption')).toHaveText(finalCaption)
  await expect(writing.locator('.handwriting-row').last()).toHaveAttribute('data-active', 'true')
  await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => stage.evaluate(element => {
    const viewport = element.getBoundingClientRect(), row = element.querySelector('[data-active="true"]')!.getBoundingClientRect()
    return row.top >= viewport.top && row.bottom <= viewport.bottom
  })).toBe(true)
  await expect(writing.locator('.spoken-highlight')).toHaveCount(1)
  await expect.poll(() => writing.locator('.handwriting-row').last().evaluate(row => getComputedStyle(row).opacity)).toBe('1')
  const alignment = await writing.evaluate(element => {
    const row = element.querySelector('[data-active="true"]')!.getBoundingClientRect()
    const highlight = element.querySelector('.spoken-highlight')!.getBoundingClientRect()
    return { distance: Math.abs((row.top + row.bottom) / 2 - (highlight.top + highlight.bottom) / 2), rowHeight: row.height }
  })
  expect(alignment.distance).toBeLessThan(alignment.rowHeight / 3)
  await shell(page)
  await page.getByRole('button', { name: 'Pause reading' }).click()
  await expect(page.getByRole('button', { name: 'Resume reading' })).toBeVisible()
  expect(await page.evaluate(() => (window as TeachingWindow).__teachingSpeech.calls.pause)).toBe(1)
  expect(await page.evaluate(() => speechSynthesis.paused)).toBe(true)
  await expect(page.getByLabel('Voice caption')).toHaveText(finalCaption)
  await evidence(page, info, 'follow-paused-caption')
  if (info.project.name === 'phone') {
    const normalViewport = page.viewportSize()!
    await page.setViewportSize({ width: normalViewport.width, height: 320 })
    await evidence(page, info, 'short-height-paused')
    await shell(page)
    const question = page.getByRole('textbox', { name: 'Your question' })
    await question.click()
    await question.fill('A follow-up remains reachable while reading is paused.')
    await expect(question).toHaveValue('A follow-up remains reachable while reading is paused.')
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Send', exact: true }).scrollIntoViewIfNeeded()
    const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox()
    expect(send!.y + send!.height).toBeLessThanOrEqual(321)
    await question.clear()
    await page.setViewportSize(normalViewport)
  }
  await page.getByRole('button', { name: 'Resume reading' }).click()
  expect(await page.evaluate(() => (window as TeachingWindow).__teachingSpeech.calls.resume)).toBe(1)
  expect(await page.evaluate(() => speechSynthesis.paused)).toBe(false)
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await stage.hover(); await page.mouse.wheel(0, -30000)
  await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBe(0)
  await page.evaluate(index => (window as TeachingWindow).__teachingSpeech.boundary(index), explanation.indexOf('Middle step:'))
  await expect(page.getByLabel('Voice caption')).toContainText('Middle step: Connect this idea to an example')
  expect((await page.getByLabel('Voice caption').textContent())!.length).toBeLessThan(140)
  await expect(writing.locator('.handwriting-row[data-active="true"]')).toContainText('Middle')
  expect(await stage.evaluate(element => element.scrollTop)).toBe(0)
  await page.evaluate(index => (window as TeachingWindow).__teachingSpeech.boundary(index), finalBoundary)
  await expect(page.getByLabel('Voice caption')).toHaveText(finalCaption)
  expect(await stage.evaluate(element => element.scrollTop)).toBe(0)
  await follow.click()
  await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Stop speaking', exact: true }).click()
  await expect(page.getByLabel('Voice caption')).toHaveCount(0)
  await expect(writing.locator('[data-active="true"], .spoken-highlight')).toHaveCount(0)
  const stoppedAt = await stage.evaluate(element => element.scrollTop)
  await page.evaluate(() => (window as TeachingWindow).__teachingSpeech.boundary(0, true))
  await expect(page.getByLabel('Voice caption')).toHaveCount(0)
  await expect(writing.locator('[data-active="true"], .spoken-highlight')).toHaveCount(0)
  expect(await stage.evaluate(element => element.scrollTop)).toBe(stoppedAt)
  await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toBeEnabled()
  expect(questions).toEqual(['Explain one idea at a time'])
})

test('fresh writing reveals once, saved boards reopen without replay, and reduced motion keeps persistent controls visible', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const questions = await fixture(page)
  await ask(page)
  const writing = page.locator('.written-reply')
  const stage = page.locator('.board-stage')
  await expect(writing).toHaveAttribute('data-reveal', 'true')
  const reveal = await writing.locator('.handwriting-row').evaluateAll(rows => rows.map(row => {
    const style = getComputedStyle(row)
    return { name: style.animationName, duration: parseFloat(style.animationDuration), delay: parseFloat(style.animationDelay) }
  }))
  expect(reveal.length).toBeGreaterThan(15)
  expect(reveal.every(row => row.name === 'write-row' && row.duration > 0 && row.duration <= 0.3 && row.delay <= 0.96)).toBe(true)
  expect(reveal.at(-1)!.delay).toBeGreaterThan(reveal[0].delay)
  await expect.poll(() => writing.locator('.handwriting-row').last().evaluate(row => getComputedStyle(row).opacity)).toBe('1')
  const initial = await shell(page)
  const normalGlyphHeight = await writing.locator('.handwriting-row').first().evaluate(row => row.getBoundingClientRect().height)
  await page.getByLabel('Board zoom').selectOption({ label: '125%' })
  expect(await page.locator('.board-content').evaluate(element => Number(getComputedStyle(element).zoom))).toBe(1.25)
  await expect.poll(async () => {
    const zoomedGlyphHeight = await writing.locator('.handwriting-row').first().evaluate(row => row.getBoundingClientRect().height)
    // Native SVG font bounds round to browser pixels. A two-pixel allowance
    // still rejects the approximately ten-pixel shortfall from unchanged text.
    return Math.abs(zoomedGlyphHeight - normalGlyphHeight * 1.25)
  }).toBeLessThanOrEqual(2)
  const zoomed = await shell(page)
  expect(zoomed.header).toEqual(initial.header)
  expect(zoomed.composer).toEqual(initial.composer)
  await page.getByLabel('Board zoom').selectOption({ label: '100%' })
  expect(await page.locator('.board-content').evaluate(element => Number(getComputedStyle(element).zoom))).toBe(1)
  await stage.hover(); await page.mouse.wheel(0, 30000)
  await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const panned = await shell(page)
  expect(panned.header).toEqual(initial.header)
  expect(panned.composer).toEqual(initial.composer)
  await page.getByRole('button', { name: '+ New topic' }).click()
  await expect(page.getByRole('region', { name: 'Blank canvas' })).toBeEmpty()
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeFocused()
  await page.getByRole('button', { name: 'Saved lessons', exact: true }).click()
  await page.getByRole('navigation', { name: 'Saved lessons' }).getByRole('button', { name: title, exact: true }).click()
  await expect(writing).toHaveAttribute('data-reveal', 'false')
  expect(await writing.locator('.handwriting-row').last().evaluate(row => getComputedStyle(row).animationName)).toBe('none')
  await page.reload()
  await expect(writing).toHaveAttribute('data-reveal', 'false')
  expect(await writing.locator('.handwriting-row').last().evaluate(row => getComputedStyle(row).animationName)).toBe('none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '+ New topic' }).click()
  await ask(page, 'Explain it without motion')
  await expect(writing).toHaveAttribute('data-reveal', 'true')
  const reduced = await writing.locator('.handwriting-row').evaluateAll(rows => rows.map(row => ({ name: getComputedStyle(row).animationName, opacity: getComputedStyle(row).opacity, animations: row.getAnimations().length })))
  expect(reduced.length).toBeGreaterThan(15)
  expect(reduced.every(row => row.name === 'none' && row.opacity === '1' && row.animations === 0)).toBe(true)
  await shell(page)
  await evidence(page, info, 'reduced-motion-board')
  expect(questions).toEqual(['Explain one idea at a time', 'Explain it without motion'])
})
