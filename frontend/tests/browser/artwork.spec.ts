import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (xml: string, options: { contentType: 'image/svg+xml' }) => { window: { document: Document; close(): void } }
}
function exportDocument(xml: string) {
  // The download is inspected as exact XML in Node, with scripts and external
  // resources disabled. No sanitization or markup repair hides export defects.
  const isolated = new JSDOM(xml, { contentType: 'image/svg+xml' })
  const document = isolated.window.document
  isolated.window.close()
  return document
}
async function answer(page: Page, source: string, explanation: string, parameters?: { id: string; label: string; min: number; max: number; value: number; step: number }[]) {
  // These local responses exercise the browser renderer, not provider quality.
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  await page.route('**/api/lesson', route => route.fulfill({ json: { lesson: {
    title: 'A circle on paper', explanation,
    blocks: [{ kind: 'svg', title: 'Circle illustration', source, ...(parameters ? { parameters } : {}) }],
  } } }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Explain this circle using the local browser fixture')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Circle illustration', exact: true })).toBeVisible()
  await expect.poll(() => page.getByRole('img', { name: 'Circle illustration', exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.evaluate(() => document.fonts.ready)
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const directory = process.env.ARTWORK_EVIDENCE_DIR
  if (directory) await mkdir(directory, { recursive: true })
  const path = directory ? join(directory, `${info.project.name}-${name}.png`) : info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}
async function exported(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Save SVG', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('artwork.svg')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return exportDocument(Buffer.concat(chunks).toString())
}
const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240"><circle cx="300" cy="115" r="70" fill="none" stroke="#292b30" stroke-width="4"/><text x="220" y="215" font-size="30" fill="#292b30">Radius and centre</text></svg>'

test('transparent SVG dark ink sits on a warm paper surface', async ({ page }, info) => {
  await answer(page, circle, 'The radius runs from the centre to the circumference.')
  await screenshot(page, info, 'paper-surface')
  const viewport = page.getByLabel('Pan Circle illustration')
  expect(await viewport.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 253, 248)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('SVG image glyphs use the embedded Caveat font and the download carries it', async ({ page }, info) => {
  const label = 'Handwritten circle labels'
  await answer(page, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 140"><text x="40" y="90" font-size="48" fill="#292b30">${label}</text></svg>`, 'The illustration has a handwritten label.')
  await screenshot(page, info, 'embedded-font')
  const metrics = await page.getByRole('img', { name: 'Circle illustration', exact: true }).evaluate((element, text) => {
    const image = element as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const inkWidth = () => {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let first = canvas.width, last = -1
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4
        if (pixels[offset + 3] > 200 && pixels[offset] < 150 && pixels[offset + 1] < 150 && pixels[offset + 2] < 150) { first = Math.min(first, x); last = Math.max(last, x) }
      }
      return last - first + 1
    }
    const rendered = inkWidth()
    const reference = (font: string) => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.font = `48px ${font}`; context.fillStyle = '#292b30'
      context.fillText(text, 40, 90)
      return inkWidth()
    }
    return { rendered, caveat: reference('Caveat'), serif: reference('serif') }
  }, label)
  await info.attach('font-raster-widths', { body: JSON.stringify(metrics), contentType: 'application/json' })
  expect(Math.abs(metrics.caveat - metrics.serif)).toBeGreaterThan(10)
  expect(Math.abs(metrics.rendered - metrics.caveat)).toBeLessThanOrEqual(5)
  const xml = await exported(page)
  expect(xml.querySelector('parsererror')).toBeNull()
  expect(xml.querySelector('style')!.textContent).toMatch(/@font-face[\s\S]*Caveat[\s\S]*data:font\/(?:ttf|truetype);base64,/)
  expect(xml.querySelector('text')!.textContent).toBe(label)
})

test('the complete prose is visibly wrapped on the same canvas as its illustration at narrow widths', async ({ page }, info) => {
  const explanation = 'A radius starts at the centre and ends at the circumference. Every radius of this circle has the same length. The diameter crosses the centre and measures twice the radius.\n\n' +
    'When you increase the radius, the area grows with the square of that change. Doubling the radius therefore gives four times the area. The illustration is a companion to these words; every part of this explanation must remain readable. '.repeat(3) +
    'The complete answer ends here.'
  await answer(page, circle, explanation)
  await screenshot(page, info, 'complete-prose')
  const board = page.getByRole('region', { name: 'Answer canvas' })
  const writing = board.getByRole('img', { name: 'Written answer', exact: true })
  await expect(writing).toBeVisible({ timeout: 3000 })
  expect((await writing.locator('text').textContent())!.replace(/\s/g, '')).toBe(explanation.replace(/\s/g, ''))
  expect(await writing.locator('tspan').count()).toBeGreaterThan(4)
  await page.setViewportSize({ width: 320, height: 720 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await expect.poll(() => writing.evaluate(element => (element as SVGSVGElement).viewBox.baseVal.width)).toBeLessThanOrEqual(360)
  expect((await writing.locator('text').textContent())!.replace(/\s/g, '')).toBe(explanation.replace(/\s/g, ''))
  const glyphSize = await writing.evaluate(element => {
    const drawing = element as SVGSVGElement
    return parseFloat(getComputedStyle(drawing.querySelector('text')!).fontSize) * drawing.getBoundingClientRect().width / drawing.viewBox.baseVal.width
  })
  expect(glyphSize).toBeGreaterThanOrEqual(24)
  const layout = await writing.evaluate(element => {
    const drawing = element as SVGSVGElement
    const box = drawing.viewBox.baseVal
    return [...drawing.querySelectorAll('tspan')].map(row => {
      const bounds = row.getBBox()
      return { left: bounds.x >= box.x, right: bounds.x + bounds.width <= box.x + box.width, top: bounds.y >= box.y, bottom: bounds.y + bounds.height <= box.y + box.height }
    })
  })
  expect(layout.length).toBeGreaterThan(4)
  expect(layout.every(row => row.left && row.right && row.top && row.bottom)).toBe(true)
  await expect(board.getByRole('img', { name: 'Circle illustration', exact: true })).toBeVisible()
  await screenshot(page, info, 'complete-prose-narrow')
})

test('safe inline typography and colours survive the SVG image and exact download', async ({ page }, info) => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><text x="40" y="100" style="font-family:cursive;font-size:42px;font-weight:700;fill:#294d65">Radius = 40</text><path d="M40 140 L360 140" style="stroke:#294d65;stroke-width:4;fill:none"/></svg>'
  await answer(page, source, 'The labelled segment measures forty units.')
  await screenshot(page, info, 'preserved-labels')
  const xml = await exported(page)
  const label = xml.querySelector('text')!
  expect(label.textContent).toBe('Radius = 40')
  expect(label.getAttribute('font-size')).toBe('42px')
  expect(label.getAttribute('font-weight')).toBe('700')
  const colours = await page.evaluate(values => values.map(value => {
    const context = document.createElement('canvas').getContext('2d')!
    context.fillStyle = value!
    return context.fillStyle
  }), [label.getAttribute('fill'), xml.querySelector('path')!.getAttribute('stroke')])
  expect(colours).toEqual(['#294d65', '#294d65'])
  expect(label.getAttribute('font-family')).toContain('Caveat')
  expect(xml.querySelector('path')!.getAttribute('stroke-width')).toBe('4')
})

test('interactive SVG sliders remain usable and export the current labels and geometry before resetting', async ({ page }) => {
  await answer(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><circle cx="200" cy="120" r="{{radius}}" fill="none" stroke="#292b30" stroke-width="3"/><text x="40" y="240" font-size="28">Radius: {{radius}}; diameter: {{2*radius}}</text></svg>', 'Change the radius to compare the circle and its diameter.', [{ id: 'radius', label: 'Radius', min: 10, max: 100, value: 40, step: 1 }])
  const slider = page.getByRole('slider', { name: 'Radius' })
  await expect(slider).toHaveValue('40')
  await slider.focus(); await slider.press('End')
  await expect(slider).toHaveValue('100')
  let xml = await exported(page)
  expect(xml.querySelector('circle')!.getAttribute('r')).toBe('100')
  expect(xml.querySelector('text')!.textContent).toBe('Radius: 100; diameter: 200')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByRole('region', { name: 'Answer canvas' }).getByText('125%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Answer canvas' }).getByText('100%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset controls' }).click()
  await expect(slider).toHaveValue('40')
  xml = await exported(page)
  expect(xml.querySelector('circle')!.getAttribute('r')).toBe('40')
  expect(xml.querySelector('text')!.textContent).toBe('Radius: 40; diameter: 80')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('declarative mathematical curves use upward-positive coordinates and recompute frequency and exponent controls', async ({ page }, info) => {
  // No fixture supplies curve or axis coordinates: the browser computes them
  // from declarations, and independent analytic functions check the result.
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560">' +
    '<text x="20" y="28" font-size="24">y = x</text><text x="340" y="28" font-size="24">y = |x|</text>' +
    '<g data-axes="true" data-box="20 40 260 200" data-domain="-2 2 -2 2" color="#82796d"/>' +
    '<g data-axes="true" data-box="340 40 260 200" data-domain="-2 2 -2 2" color="#82796d"/>' +
    '<path data-plot="x" data-box="20 40 260 200" data-domain="-2 2 -2 2" stroke="#215ca5" stroke-width="4" fill="none"/>' +
    '<path data-plot="abs(x)" data-box="340 40 260 200" data-domain="-2 2 -2 2" stroke="#bc3535" stroke-width="4" fill="none"/>' +
    '<text x="20" y="295" font-size="24">Frequency: {{frequency}}</text><text x="340" y="295" font-size="24">Exponent: {{exponent}}</text>' +
    '<g data-axes="true" data-box="20 320 260 200" data-domain="-2 2 -2 2" color="#82796d"/>' +
    '<g data-axes="true" data-box="340 320 260 200" data-domain="-2 2 -2 4" color="#82796d"/>' +
    '<path data-plot="sin({{frequency}}*x)" data-box="20 320 260 200" data-domain="-2 2 -2 2" stroke="#2b7950" stroke-width="4" fill="none"/>' +
    '<path data-plot="x^{{exponent}}" data-box="340 320 260 200" data-domain="-2 2 -2 4" stroke="#8354a2" stroke-width="4" fill="none"/></svg>'
  await answer(page, source, 'The original line has negative outputs below the horizontal axis. Absolute value reflects those outputs above it. Change the frequency and exponent to explore two more computed curves.', [
    { id: 'frequency', label: 'Frequency', min: 1, max: 2, value: 1, step: 1 },
    { id: 'exponent', label: 'Exponent', min: 1, max: 2, value: 1, step: 1 },
  ])
  await screenshot(page, info, 'computed-curves')
  const check = (xml: Document, colour: string, box: number[], domain: number[], value: (x: number) => number) => {
    const path = xml.querySelector(`path[stroke="${colour}"]`)!
    const d = path.getAttribute('d')
    expect(d).toMatch(/^M/)
    const points = [...d!.matchAll(/[ML]([-+\d.]+) ([-+\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])])
    expect(points.length).toBeGreaterThan(20)
    for (const [px, py] of points) {
      expect([px, py].every(Number.isFinite)).toBe(true)
      expect(px).toBeGreaterThanOrEqual(box[0]); expect(px).toBeLessThanOrEqual(box[0] + box[2])
      expect(py).toBeGreaterThanOrEqual(box[1]); expect(py).toBeLessThanOrEqual(box[1] + box[3])
      const x = domain[0] + (px - box[0]) / box[2] * (domain[1] - domain[0])
      const expectedY = box[1] + box[3] * (domain[3] - value(x)) / (domain[3] - domain[2])
      expect(Math.abs(py - expectedY)).toBeLessThan(0.01)
    }
    return { d, points }
  }
  const checkAxes = (xml: Document) => {
    const groups = [...xml.querySelectorAll('g[data-axes="true"]')]
    expect(groups).toHaveLength(4)
    const boxes = [[20, 40, 260, 200], [340, 40, 260, 200], [20, 320, 260, 200], [340, 320, 260, 200]]
    const domains = [[-2, 2, -2, 2], [-2, 2, -2, 2], [-2, 2, -2, 2], [-2, 2, -2, 4]]
    groups.forEach((group, i) => {
      const [x, y, width, height] = boxes[i], [xMin, xMax, yMin, yMax] = domains[i]
      const lines = [...group.querySelectorAll('line')].map(line => ['x1', 'y1', 'x2', 'y2'].map(name => Number(line.getAttribute(name))))
      const horizontal = lines.find(([x1, y1, x2, y2]) => x1 === x && x2 === x + width && y1 === y2)
      const vertical = lines.find(([x1, y1, x2, y2]) => x1 === x2 && y1 === y && y2 === y + height)
      expect(horizontal).toBeTruthy(); expect(vertical).toBeTruthy()
      expect(horizontal![1]).toBeCloseTo(y + height * yMax / (yMax - yMin), 6)
      expect(vertical![0]).toBeCloseTo(x + width * -xMin / (xMax - xMin), 6)
      expect([...group.querySelectorAll('text')].map(label => label.textContent)).toEqual(expect.arrayContaining(['x', 'y']))
    })
  }
  let xml = await exported(page)
  checkAxes(xml)
  const line = check(xml, '#215ca5', [20, 40, 260, 200], [-2, 2, -2, 2], x => x)
  const absolute = check(xml, '#bc3535', [340, 40, 260, 200], [-2, 2, -2, 2], Math.abs)
  expect(line.points[0][1]).toBeGreaterThan(140)
  expect(line.points.at(-1)![1]).toBeLessThan(140)
  expect(absolute.points[0][1]).toBeLessThan(140)
  expect(absolute.points.at(-1)![1]).toBeLessThan(140)
  const wave = check(xml, '#2b7950', [20, 320, 260, 200], [-2, 2, -2, 2], Math.sin)
  const power = check(xml, '#8354a2', [340, 320, 260, 200], [-2, 2, -2, 4], x => x)
  const pixels = await page.getByRole('img', { name: 'Circle illustration', exact: true }).evaluate(element => {
    const image = element as HTMLImageElement
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    const coloured = (x: number, y: number, colour: 'blue' | 'red') => {
      const values = context.getImageData(x - 3, y - 3, 7, 7).data
      for (let i = 0; i < values.length; i += 4) {
        if (values[i + 3] > 200 && (colour === 'blue' ? values[i] < 70 && values[i + 1] < 140 && values[i + 2] > 140 : values[i] > 150 && values[i + 1] < 100 && values[i + 2] < 100)) return true
      }
      return false
    }
    const axis = (x: number, y: number) => {
      const values = context.getImageData(x - 2, y - 2, 5, 5).data
      for (let i = 0; i < values.length; i += 4) {
        if (values[i + 3] > 50 && Math.abs(values[i] - 130) < 10 && Math.abs(values[i + 1] - 121) < 10 && Math.abs(values[i + 2] - 109) < 10) return true
      }
      return false
    }
    return { negativeLineBelow: coloured(85, 190, 'blue'), negativeLineAbove: coloured(85, 90, 'blue'), reflectedAbove: coloured(405, 90, 'red'), reflectedBelow: coloured(405, 190, 'red'), xAxisAtZero: axis(80, 140), yAxisAtZero: axis(150, 80), asymmetricXAxisAtZero: axis(380, 453) }
  })
  expect(pixels).toEqual({ negativeLineBelow: true, negativeLineAbove: false, reflectedAbove: true, reflectedBelow: false, xAxisAtZero: true, yAxisAtZero: true, asymmetricXAxisAtZero: true })
  await page.getByRole('slider', { name: 'Frequency' }).focus(); await page.getByRole('slider', { name: 'Frequency' }).press('End')
  await page.getByRole('slider', { name: 'Exponent' }).focus(); await page.getByRole('slider', { name: 'Exponent' }).press('End')
  await expect(page.getByRole('slider', { name: 'Frequency' })).toHaveValue('2')
  await expect(page.getByRole('slider', { name: 'Exponent' })).toHaveValue('2')
  xml = await exported(page)
  checkAxes(xml)
  expect(check(xml, '#2b7950', [20, 320, 260, 200], [-2, 2, -2, 2], x => Math.sin(2 * x)).d).not.toBe(wave.d)
  expect(check(xml, '#8354a2', [340, 320, 260, 200], [-2, 2, -2, 4], x => x * x).d).not.toBe(power.d)
  expect([...xml.querySelectorAll('text')].map(label => label.textContent)).toContain('Frequency: 2')
  expect([...xml.querySelectorAll('text')].map(label => label.textContent)).toContain('Exponent: 2')
  const updatedPixels = await page.getByRole('img', { name: 'Circle illustration', exact: true }).evaluate(async element => {
    const image = element as HTMLImageElement; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    const coloured = (x: number, y: number, colour: 'green' | 'purple') => {
      const values = context.getImageData(x - 3, y - 3, 7, 7).data
      for (let i = 0; i < values.length; i += 4) {
        if (values[i + 3] > 200 && (colour === 'green' ? values[i + 1] > 85 && values[i + 1] > values[i] + 30 && values[i + 1] > values[i + 2] + 20 : values[i] > 90 && values[i + 2] > 130 && values[i + 2] > values[i + 1] + 30)) return true
      }
      return false
    }
    // x=1.5 gives sin(3), while x=-1.5 becomes +2.25 after squaring.
    return { newWave: coloured(248, 413, 'green'), oldWave: coloured(248, 370, 'green'), newPower: coloured(373, 378, 'purple'), oldPower: coloured(373, 503, 'purple') }
  })
  expect(updatedPixels).toEqual({ newWave: true, oldWave: false, newPower: true, oldPower: false })
  await screenshot(page, info, 'computed-curves-updated')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
