// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { Root } from 'react-dom/client'
import { act, screen } from '@testing-library/react'
const mounted = vi.hoisted(() => ({ root: undefined as Root | undefined }))
vi.mock('react-dom/client', async importActual => {
  const actual = await importActual<typeof import('react-dom/client')>()
  return { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    mounted.root = actual.createRoot(...args)
    return mounted.root
  } }
})
afterEach(() => {
  act(() => mounted.root?.unmount()); mounted.root = undefined
  document.body.innerHTML = ''; localStorage.clear(); vi.unstubAllGlobals()
})
it('boots the actual application into the document root and exposes a usable question composer', async () => {
  localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true, modelConfigured: false })))
  await act(async () => { await import('../src/main') })
  expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true)
  expect(await screen.findByText('Model not configured')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Saved lessons still open')
  expect(document.querySelector('#root')!.childElementCount).toBeGreaterThan(0)
})
