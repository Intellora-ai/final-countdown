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

test('equations, exact polygons and automatic connected diagrams render together', async ({ page }, testInfo) => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Idea ${i}`, detail: 'A longer explanation that needs measured wrapping.' }))
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id, label: 'leads to' }))
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { explanation: 'Typeset and lay out the meaning.', blocks: [
    { kind: 'math', title: 'Formula', latex: '\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
    { kind: 'scene', title: 'Exact shapes', width: 650, height: 350, elements: [
      { type: 'polygon', x: 150, y: 150, radius: 90, sides: 3, color: '#9cd8ff' },
      { type: 'polygon', x: 400, y: 150, radius: 90, sides: 6, color: '#f2dc8e' },
      { type: 'math', x: 100, y: 260, width: 400, height: 80, latex: 'a^2+b^2=c^2' },
    ] },
    { kind: 'diagram', title: 'Connected ideas', nodes, edges },
  ] } } }))
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Explain using equations and connected shapes')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('math')).toHaveCount(2)
  const shapes = page.getByRole('img', { name: 'Exact shapes' })
  expect(await shapes.locator('polygon').evaluateAll(polygons => polygons.map(p => (p as SVGPolygonElement).points.numberOfItems))).toEqual([3, 6])
  const diagram = page.getByRole('img', { name: 'Connected ideas' })
  await expect(diagram.locator('button')).toHaveCount(12)
  await expect(diagram.locator('path[marker-end]')).toHaveCount(11)
  await diagram.getByRole('button', { name: /Idea 0/ }).click()
  await expect(diagram.getByRole('button', { name: /Idea 0/ })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('computed-visuals.png'), fullPage: true })
})

test('general SVG artwork loads, zooms and exports without external requests', async ({ page }) => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><linearGradient id="ink"><stop offset="0" stop-color="#93d6ff"/><stop offset="1" stop-color="#ffd080"/></linearGradient></defs><g transform="translate(50 40)"><path d="M0 150 C80 -40 250 280 400 80" stroke="url(#ink)" stroke-width="8" fill="none"/><text x="30" y="270" fill="#ffffff" font-size="32">Free composition</text></g><image href="https://outside.test/a"/><script>alert(1)</script></svg>'
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { explanation: 'A freely composed drawing.', blocks: [{ kind: 'svg', title: 'Artwork', source }] } } }))
  const external: string[] = []; page.on('request', request => { if (request.url().includes('outside.test')) external.push(request.url()) })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Draw free artwork')
  await page.getByRole('button', { name: 'Send' }).click()
  const artwork = page.getByRole('img', { name: 'Artwork', exact: true })
  await expect(artwork).toBeVisible()
  await expect.poll(() => artwork.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(600)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByText('125%', { exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Save SVG' }).click()
  const file = await (await pending).createReadStream()
  const chunks: Buffer[] = []; for await (const chunk of file!) chunks.push(Buffer.from(chunk))
  const exported = Buffer.concat(chunks).toString()
  expect(exported).toContain('linearGradient'); expect(exported).toContain('Free composition')
  expect(exported).not.toMatch(/script|outside\.test|<image/)
  expect(external).toEqual([])
  await page.reload()
  await expect(page.getByRole('img', { name: 'Artwork', exact: true })).toBeVisible()
})

test('interactive SVG updates numeric geometry, exports the current value and resets', async ({ page }) => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><circle cx="200" cy="150" r="{{radius}}" fill="#93d6ff"/><text x="10" y="30" fill="white">Area: {{pi*radius^2}}</text></svg>'
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { explanation: 'Explore how size changes.', blocks: [{ kind: 'svg', title: 'Interactive artwork', source, parameters: [{ id: 'radius', label: 'Radius', min: 10, max: 100, value: 40, step: 1 }] }] } } }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Make a drawing I can explore')
  await page.getByRole('button', { name: 'Send' }).click()
  const slider = page.getByRole('slider', { name: 'Radius' })
  await expect(slider).toHaveValue('40')
  await slider.focus(); await slider.press('End')
  await expect(slider).toHaveValue('100')
  const image = page.getByRole('img', { name: 'Interactive artwork', exact: true })
  await expect.poll(async () => decodeURIComponent((await image.getAttribute('src'))!)).toContain('r="100"')
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Save SVG' }).click()
  const stream = await (await pending).createReadStream()
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString()).toContain('r="100"')
  await page.getByRole('button', { name: 'Reset controls' }).click()
  await expect(slider).toHaveValue('40')
  await expect.poll(async () => decodeURIComponent((await image.getAttribute('src'))!)).toContain('r="40"')
})

test('plain conversation is handwritten on the answer canvas without chat paragraphs', async ({ page }, testInfo) => {
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: { explanation: 'Hey! What would you like to explore today? We can write, draw, and work through your ideas together.', blocks: [] } } }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('hi')
  await page.getByRole('button', { name: 'Send' }).click()
  const board = page.getByRole('region', { name: 'Answer canvas' })
  await expect(board.locator('svg text')).toContainText('Hey!')
  await expect(board.locator('p:not(.sr-only)')).toHaveCount(0)
  await expect(board.getByRole('button')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  expect(await board.locator('svg').evaluate(svg => (svg as SVGSVGElement).viewBox.baseVal.width)).toBeLessThanOrEqual(850)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('canvas-only-writing.png'), fullPage: true })
})
