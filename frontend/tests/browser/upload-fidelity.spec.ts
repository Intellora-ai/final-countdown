import { expect, test } from '@playwright/test'

test('transparent uploaded diagrams retain readable ink when sent to a vision model', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  let image: string | undefined
  await page.route('**/api/lesson', async route => {
    image = route.request().postDataJSON().attachments[0]?.image
    await route.fulfill({ json: { lesson: { explanation: 'The attached diagram is available.', blocks: [] } } })
  })
  await page.goto('/')
  const transparent = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = '#000000'; context.fillRect(48, 48, 32, 32)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Attach files or photos').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') })
  await expect(page.getByRole('button', { name: 'Remove diagram.png' })).toBeVisible()
  await page.getByLabel('Your question').fill('Read the attached diagram.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => image).toBeTruthy()
  const pixels = await page.evaluate(async image => {
    const decoded = new Image(); decoded.src = image!; await decoded.decode()
    const canvas = document.createElement('canvas'); canvas.width = decoded.naturalWidth; canvas.height = decoded.naturalHeight
    const context = canvas.getContext('2d')!; context.drawImage(decoded, 0, 0)
    return { background: [...context.getImageData(8, 8, 1, 1).data], ink: [...context.getImageData(64, 64, 1, 1).data] }
  }, image)
  expect(pixels.background.slice(0, 3).every(channel => channel > 240)).toBe(true)
  expect(pixels.ink.slice(0, 3).every(channel => channel < 15)).toBe(true)
  expect(pixels.background[3]).toBe(255)
})
