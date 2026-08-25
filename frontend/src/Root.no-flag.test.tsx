// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE MUST-FAIL HALF OF THE PAIR. DO NOT MERGE THIS INTO `Root.test.tsx`.
 *
 * `Root.test.tsx` asserts that rendering the real root emits NO
 * `v7_startTransition` warning. On its own that assertion is satisfied by a
 * router that never warns for ANY reason — a changed message, a version bump
 * that drops the warning, a render that silently did not happen. It would go
 * green forever while measuring nothing.
 *
 * This file is the input that MUST warn: the exact configuration the fix
 * replaced, a HashRouter with no `future` prop at all. If this ever goes
 * quiet, the check in the sibling file has stopped meaning anything and both
 * are decoration.
 *
 * WHY IT CANNOT SHARE A FILE. react-router 6.30.6 warns via a module-level
 * `alreadyWarned` map, once per module instance for the life of the process:
 *
 *     const alreadyWarned = {};
 *     function warnOnce(key, message) {
 *       if (!alreadyWarned[message]) { alreadyWarned[message] = true; console.warn(message); }
 *     }
 *
 * `vi.resetModules()` does not defeat it — vitest externalises node_modules,
 * so a dynamic re-import hands back the same instance. Vitest isolates by
 * FILE, so a separate file is the only thing that buys a router which has not
 * yet spoken. This was measured, not assumed: with both cases in one file the
 * second one observed 0 warnings and passed for entirely the wrong reason.
 */

const FUTURE_FLAG = 'v7_startTransition'

describe('a router left in the old synchronous mode', () => {
  it('still warns, which is what makes the sibling assertion non-vacuous', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await React.act(async () => {
      root.render(
        <HashRouter>
          <div>no future prop, exactly as this application shipped before the fix</div>
        </HashRouter>,
      )
    })
    await React.act(async () => {
      root.unmount()
    })
    host.remove()

    const messages = warn.mock.calls.map((call) => call.map(String).join(' '))
    warn.mockRestore()

    expect(messages.filter((m) => m.includes(FUTURE_FLAG))).toHaveLength(1)
  })
})
