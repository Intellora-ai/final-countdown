import { test, expect } from '@playwright/test'

const scene = { kind: 'scene', title: 'Explore the curve', width: 800, height: 520, elements: [
  { type: 'text', x: 24, y: 40, label: 'Same board. Different ideas.', width: 650, fontSize: 34 },
  { type: 'plot', expression: 'abs(x)', x: 60, y: 120, width: 380, height: 280, xMin: -3, xMax: 3, yMin: -1, yMax: 4, color: '#9cd8ff' },
  { type: 'path', d: 'M520 200 C550 120 620 120 650 200 S700 300 740 200', color: '#f2dc8e' },
  { type: 'arrow', x1: 540, y1: 340, x2: 670, y2: 240, label: 'A freeform curve' },
  { type: 'rect', x: 500, y: 390, width: 230, height: 100, label: 'Labels wrap instead of disappearing.' },
  { type: 'text', x: 850, y: 570, label: 'Outside the initial page, still visible.' },
] }
const lesson = { title: 'A board you can revise', explanation: 'The browser computes the graph; the model chooses what to explain.', blocks: [scene] }
test('general drawing fits, zooms, exports and is revised with complete context', async ({ page }, testInfo) => {
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  const requests: { memory: unknown[] }[] = []
  await page.route('**/api/lesson', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { lesson: requests.length === 1 ? lesson : { ...lesson, blocks: [{ ...scene, elements: [{ type: 'circle', x: 200, y: 200, radius: 60, label: 'Revised' }] }] } } })
  })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Show a graph, sketch and readable labels')
  await page.getByRole('button', { name: 'Send' }).click()
  const drawing = page.getByRole('img', { name: scene.title })
  await expect(drawing).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(async () => drawing.evaluate(svg => {
    const box = (svg as SVGSVGElement).viewBox.baseVal
    const bounds = svg.querySelector('g')!.getBBox()
    return box.x <= bounds.x && box.y <= bounds.y && box.x + box.width >= bounds.x + bounds.width && box.y + box.height >= bounds.y + bounds.height
  })).toBe(true)
  await expect(drawing.locator('path')).toHaveCount(3)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByText('125%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save SVG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('blackboard.svg')
  const file = await download.createReadStream()
  const chunks: Buffer[] = []; for await (const chunk of file!) chunks.push(Buffer.from(chunk))
  const exported = Buffer.concat(chunks).toString()
  expect(exported).toContain('data:'); expect(exported).toContain('Same board. Different ideas.')
  expect(exported).not.toMatch(/<script|onload=/)
  await page.screenshot({ path: testInfo.outputPath('blackboard.png'), fullPage: true })
  await page.getByRole('textbox', { name: 'Your question' }).fill('Replace the drawing with one circle')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(drawing.locator('circle')).toHaveCount(1)
  expect(requests[1].memory).toEqual([{ question: 'Show a graph, sketch and readable labels', lesson }])
  await page.reload()
  await expect(page.getByRole('img', { name: scene.title }).locator('circle')).toHaveCount(1)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('model text is rendered literally without running markup', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { explanation: 'Look at the label.', blocks: [{ kind: 'scene', title: 'Literal text', elements: [{ type: 'text', x: 30, y: 60, label: '<script>window.pwned=true</script>', width: 700 }] }] } } }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Write literal markup')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('img', { name: 'Literal text' })).toContainText('<script>window.pwned=true</script>')
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
})
