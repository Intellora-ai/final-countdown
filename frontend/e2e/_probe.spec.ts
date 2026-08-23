import { test } from '@playwright/test'
import { open, settle, teach } from './util/canvas'

test('equation shot', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, testInfo)
  await teach(page, 'Physics')
  const eq = page.locator('.lc-block[data-kind="equation"]').first()
  await eq.screenshot({ path: '/private/tmp/claude-501/-Users-tanveersidhu-ACCOUNTANT/4d8a6fc1-3ead-4984-9310-61bca68823d9/scratchpad/equation.png' })
  console.log('katex html', (await eq.innerHTML()).slice(0, 900))
  console.log('box', JSON.stringify(await eq.boundingBox()))
})

test('3d small', async ({ page }, testInfo) => {
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()) })
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, testInfo)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await page.waitForTimeout(6000)
  const n = await page.locator('.lc-block[data-kind="simulation"] canvas').count()
  const size = n ? await page.locator('.lc-block[data-kind="simulation"] canvas').first().evaluate((el) => ({ w: (el as HTMLCanvasElement).width, h: (el as HTMLCanvasElement).height })) : null
  console.log('375 3D canvases', n, JSON.stringify(size), JSON.stringify(errs))
  // 2D stage fits its block
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.waitForTimeout(600)
  const fit = await page.locator('.lc-block[data-kind="simulation"]').first().evaluate((block) => {
    const svg = block.querySelector('svg')!
    const a = svg.getBoundingClientRect(); const b = block.getBoundingClientRect()
    return { svg: { w: Math.round(a.width), h: Math.round(a.height), r: Math.round(a.right) }, block: { w: Math.round(b.width), r: Math.round(b.right) } }
  })
  console.log('fit', JSON.stringify(fit))
})
