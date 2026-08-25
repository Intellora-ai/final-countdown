// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import TutorView from './TutorView'

/**
 * ONE QUESTION PER ASK, HOWEVER FAST THE CLICKING IS.
 *
 * Measured in a browser on 2026-08-25 against `/#/quick-question`, counting
 * the thread's own elements before and after:
 *
 *     1 click   -> 1 exchange     correct
 *     2 clicks  -> 2 exchanges    a double-click asks twice
 *     8 clicks  -> 8 exchanges    every click of a rage-burst asks again
 *
 * The component looks guarded. `send()` opens with
 *
 *     if (!question || busy) return
 *
 * and the button carries `disabled={busy}`. Neither holds, and the reason is
 * the same for both: `busy` is React STATE. `setBusy(true)` does not take
 * effect until React re-renders, so a synchronous burst of clicks all run
 * against the same closure, all read `busy === false`, and all proceed. The
 * `disabled` attribute is not on the button yet either, for the same reason.
 * An asynchronous flag cannot be a mutual-exclusion latch.
 *
 * WHY THIS MATTERS MORE LATER THAN IT DOES TODAY, AND IS STILL A DEFECT NOW.
 * With no model configured every duplicate is a local no-op that appends
 * another refusal, so today the damage is a cluttered thread. `TutorView`
 * reads `VITE_TUTOR_ENDPOINT`, and the moment that endpoint exists each
 * duplicate becomes a real, paid model call — eight clicks, eight calls. This
 * is the shape that bills people twice, caught before it could.
 *
 * THE ORACLE. Not "a spy was called once" — the exchanges the student can
 * actually see. The count for a burst must equal the count for a single
 * click, whatever that count happens to be in this environment, so the test
 * measures the duplication rather than a hard-coded thread size.
 */

/* This project's jsdom environment provides NO localStorage — probed, not
 * assumed: `typeof window.localStorage` is `undefined` here. TutorView reads
 * it unguarded on mount (`window.localStorage.getItem(SAVE_KEY)`), so without
 * this the component throws before any click is possible. A real in-memory
 * Storage is installed rather than a spy, so the save path below behaves the
 * way it does in a browser instead of being mocked away. */
function installMemoryStorage(): void {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k)
    },
    setItem: (k, v) => {
      map.set(k, String(v))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
}

beforeEach(() => {
  installMemoryStorage()
  /* jsdom implements no layout, so it ships no scrollIntoView. The component
   * calls it after every exchange to keep the newest answer in view. Stubbed
   * because it is a viewport effect with nothing to assert in a stub renderer,
   * not because the call is unwanted. */
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

/** Every question and answer node the thread has rendered. */
function threadSize(): number {
  return document.querySelectorAll('.tutor-thread dt, .tutor-thread dd').length
}

async function ask(text: string, clicks: number): Promise<void> {
  /* By its screen-reader label, not its placeholder: the label is the thing a
   * non-sighted student actually navigates by, so querying it also keeps that
   * label load-bearing rather than decorative. */
  const input = screen.getByLabelText(/ask the tutor/i)
  fireEvent.change(input, { target: { value: text } })

  const button = screen.getByRole('button', { name: /ask|thinking/i })
  await act(async () => {
    /* Synchronous, with no await between them. This is what a double-click and
     * a trackpad stutter actually look like, and it is the exact window an
     * async state flag cannot close. */
    for (let i = 0; i < clicks; i += 1) fireEvent.click(button)
    await Promise.resolve()
  })
  /* Let every promise chain the clicks started settle before counting. */
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('the tutor, clicked faster than it can answer', () => {
  it('records one exchange for one click, which is the baseline the burst is measured against', async () => {
    render(<TutorView />)
    const before = threadSize()

    await ask('what is opportunity cost', 1)

    const perQuestion = threadSize() - before
    /* The pair's must-pass half. If a single click recorded nothing, the burst
     * assertion below would be satisfied by a component that does nothing at
     * all, and would prove the opposite of what it claims. */
    expect(perQuestion).toBeGreaterThan(0)
  })

  it('records no more for eight rapid clicks than it does for one', async () => {
    render(<TutorView />)

    const start = threadSize()
    await ask('first question', 1)
    const perQuestion = threadSize() - start

    const beforeBurst = threadSize()
    await ask('second question', 8)
    const fromBurst = threadSize() - beforeBurst

    /* Eight clicks, one question. Measured against the SAME component's own
     * single-click cost, so the assertion cannot drift with the thread's
     * rendering shape. */
    expect(fromBurst).toBe(perQuestion)
  })

  it('still accepts a genuine second question after the first has finished', async () => {
    /* The other half of the pair. A latch that never releases would pass the
     * burst test perfectly and break the product: one question per page load,
     * forever. */
    render(<TutorView />)

    const start = threadSize()
    await ask('first question', 1)
    const afterFirst = threadSize()
    await ask('second question', 1)
    const afterSecond = threadSize()

    expect(afterFirst).toBeGreaterThan(start)
    expect(afterSecond).toBeGreaterThan(afterFirst)
  })
})
