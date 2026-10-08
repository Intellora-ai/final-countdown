import { test, expect } from '@playwright/test'

test('a generated visual lesson survives reload and a follow-up carries context', async ({ page }) => {
  const lesson = { title: 'Energy transfer', explanation: 'Energy moves between stores.', blocks: [{ kind: 'diagram', title: 'Falling object', nodes: [{ id: 'a', label: 'Potential energy' }, { id: 'b', label: 'Kinetic energy' }], edges: [{ from: 'a', to: 'b', label: 'falls' }] }], check: 'What changes as it falls?' }
  // A provider fixture verifies the browser workflow, not real model quality.
  await page.route('**/api/health', route => route.fulfill({ json: { modelConfigured: true } }))
  const requests: { question: string; previous?: unknown }[] = []
  await page.route('**/api/lesson', async route => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: { lesson } }) })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your question' }).fill('Explain energy transfer')
  await page.getByRole('button', { name: 'Teach me' }).click()
  await expect(page.getByRole('heading', { name: 'Energy transfer', level: 1 })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Falling object' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Energy transfer', level: 1 })).toBeVisible()
  await page.getByRole('textbox', { name: 'Your question' }).fill('Why does it fall?')
  await page.getByRole('button', { name: 'Teach me' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1].previous).toEqual(lesson)
  await page.getByRole('button', { name: '+ New topic' }).click()
  await expect(page.getByRole('heading', { name: 'What do you want' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
