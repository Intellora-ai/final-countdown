/* The browser's side of the Almanac wire.
 *
 * DESIRED OUTCOME
 *   Today's list is the one Almanac WROTE DOWN, and the dashboard can always
 *   tell "there is nothing to study" apart from "I could not ask".
 *
 * WHY THAT SECOND HALF IS THE WHOLE POINT
 *   A failed fetch that returns an empty day is indistinguishable from a real
 *   empty day. The screen would say "nothing to do today" while the truth is
 *   "the planner is down", and a student would go to bed having studied
 *   nothing on the word of a bug. So every failure carries a reason and no
 *   failure ever produces a day.
 */

import { describe, expect, it, vi } from 'vitest'
import { createAlmanacClient, dayRequestFor } from './client'

const DAY = {
  date: '2026-08-25',
  items: [
    { conceptId: 'c1', subjectId: 'maths', chapterId: 'ch1', minutes: 15 },
    { conceptId: 'c2', subjectId: 'science', chapterId: 'ch9', minutes: 20, carriedFrom: '2026-08-24' },
  ],
  allocated: 35,
  capacity: 120,
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('asking Almanac for the day', () => {
  it('posts exactly what the planner requires, to the day route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ day: DAY }))
    const client = createAlmanacClient({ fetchImpl })

    await client.day({
      date: '2026-08-25', schoolClass: 9,
      dailyMinutes: 120, subjectIds: ['maths', 'science'],
    })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/day')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      date: '2026-08-25', schoolClass: 9,
      dailyMinutes: 120, subjectIds: ['maths', 'science'],
    })
  })

  it('returns the written day, carriedFrom included', async () => {
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockResolvedValue(ok({ day: DAY })) })
    const result = await client.day({
      date: '2026-08-25', schoolClass: 9, dailyMinutes: 120, subjectIds: ['maths'],
    })

    expect(result).toEqual({ ok: true, day: DAY })
    // carriedFrom is what makes a row backlog. Losing it in transit would turn
    // yesterday's unfinished work into today's, silently.
    expect(result.ok && result.day.items[1].carriedFrom).toBe('2026-08-24')
  })

  it('treats a genuinely empty day as a SUCCESS, not a failure', async () => {
    /* Nothing to study is a real answer. Reporting it as an error would push
     * the screen into a fallback it does not need. */
    const empty = { date: '2026-08-25', items: [], allocated: 0, capacity: 120 }
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockResolvedValue(ok({ day: empty })) })

    expect(await client.day({
      date: '2026-08-25', schoolClass: 9, dailyMinutes: 120, subjectIds: ['maths'],
    })).toEqual({ ok: true, day: empty })
  })
})

describe('when the planner cannot answer', () => {
  const request = {
    date: '2026-08-25', schoolClass: 9 as const,
    dailyMinutes: 120, subjectIds: ['maths'],
  }

  it('reports a network failure with a reason, and no day', async () => {
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) })
    const result = await client.day(request)

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('day')
    expect(!result.ok && result.reason).toMatch(/could not be reached/i)
  })

  it('passes the server\'s own explanation through when it gives one', async () => {
    /* 503 with "the planner is not configured on this server" is the real
     * response from a server started without a ledger. Replacing it with a
     * generic message would hide the one fact that fixes it. */
    const client = createAlmanacClient({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false, status: 503,
        json: async () => ({ error: 'the planner is not configured on this server' }),
      }),
    })
    const result = await client.day(request)

    expect(result).toEqual({ ok: false, reason: 'the planner is not configured on this server' })
  })

  it('does not crash when an error response has no readable body, and does not put the number on her screen', async () => {
    /*
     * THE ASSERTION CHANGED, AND IT GOT STRONGER RATHER THAN WEAKER.
     *
     * It used to be `toContain('500')`. `reason` is rendered verbatim on the
     * front door, so that pinned "the planner answered 500" as the first thing
     * a child reads under "Today's learning" with no API server running --
     * which is what everyone who clones this repository has.
     * `tests/integration/law-c-she-never-reads-a-machine-code.spec.ts` failed
     * on exactly that string, on the front door and behind "Hide curriculum",
     * and Law C is the older claim: a child never reads a machine code.
     *
     * So the number is not lost, it is REDIRECTED -- to the console, where a
     * developer looks and a child does not. Both halves are asserted here;
     * dropping the number and telling nobody would be the weaker test.
     */
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = createAlmanacClient({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false, status: 500, json: async () => { throw new Error('not json') },
      }),
    })
    const result = await client.day(request)

    expect(result.ok).toBe(false)
    const reason = !result.ok ? result.reason : ''
    expect(reason, 'an unreadable body left her with no reason at all').not.toBe('')
    expect(reason, 'a status code reached the screen a child reads').not.toMatch(/\d{3}/)
    /* Law C forbids silence as firmly as it forbids a code, and these are the
       words it scans for. */
    expect(reason, 'she was told it went wrong and not what to do about it')
      .toMatch(/\b(try|check|ask|set|open|press|start|need|install|configure|contact|again|meanwhile|instead)\b/i)
    expect(
      warned.mock.calls.flat().join(' '),
      'the status was dropped instead of redirected, so nobody can diagnose it',
    ).toContain('500')
    warned.mockRestore()
  })

  it('refuses an item whose carriedFrom is not a date string', async () => {
    /* MUTATION EVIDENCE. Relaxing the `carriedFrom` type check survived every
     * other test here, because nothing sent a bad one -- the field is passed
     * through whole, so only a wrong TYPE can expose the check. A numeric
     * carriedFrom would be rendered straight into the backlog label as
     * "Backlog — set on 42". */
    const bad = { ...DAY, items: [{ ...DAY.items[0], carriedFrom: 42 }] }
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockResolvedValue(ok({ day: bad })) })

    expect(await client.day({
      date: '2026-08-25', schoolClass: 9, dailyMinutes: 120, subjectIds: ['maths'],
    })).toEqual({ ok: false, reason: 'the planner returned something that is not a day' })
  })

  it('refuses a 200 whose body is not a day', async () => {
    /* A proxy, a login page, or a future API change all return 200. Trusting
     * the status code alone puts `undefined.items` in front of a student. */
    for (const body of [{}, { day: null }, { day: { date: '2026-08-25' } }, 'hello']) {
      const client = createAlmanacClient({ fetchImpl: vi.fn().mockResolvedValue(ok(body)) })
      const result = await client.day(request)
      expect(result.ok, `accepted a non-day body: ${JSON.stringify(body)}`).toBe(false)
    }
  })
})

describe('marking a concept done', () => {
  it('posts the student and the concept, and nothing else', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ done: true }))
    await createAlmanacClient({ fetchImpl }).markDone('s1', 'c1')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/done')
    /* FLIPPED, AND THE OLD VERSION PINNED A DEFECT.
     *
     * It asserted the client SENDS `studentId`. That is exactly what broke the
     * product: the server now assigns identity and signs it into a cookie, so
     * the first request (no cookie) was fine and the SECOND arrived carrying
     * both the cookie AND the stale claim, disagreed with itself, and was
     * refused with 403. A dashboard that works once and then stops.
     *
     * The body must now carry the concept and nothing about who she is. */
    expect(JSON.parse(init.body)).toEqual({ conceptId: 'c1' })
  })

  it('reports failure rather than pretending the work was recorded', async () => {
    /* Showing a concept as done when the ledger never got it is the worst
     * outcome here: the student believes it is finished, and tomorrow's plan
     * brings it back with no explanation. */
    const client = createAlmanacClient({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) })
    expect(await client.markDone('s1', 'c1')).toEqual({
      ok: false, reason: 'the planner could not be reached',
    })
  })
})

describe('turning a student record into a day request', () => {
  const student = { id: 's1', cls: '9', subjects: ['maths', 'science'], minutes: 120 }

  it('converts the class, which the record stores as text', () => {
    expect(dayRequestFor(student, '2026-08-25')).toEqual({
      ok: true,
      request: {
        date: '2026-08-25', schoolClass: 9,
        dailyMinutes: 120, subjectIds: ['maths', 'science'],
      },
    })
  })

  it('refuses a student with no class, and says which field is missing', () => {
    /* Sending `schoolClass: NaN` earns a 400 that reads like a server fault.
     * The real fault is an unfinished setup, and the message should say so. */
    const result = dayRequestFor({ ...student, cls: null }, '2026-08-25')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/class/i)
  })

  it('refuses a class that is not one Almanac supports', () => {
    for (const cls of ['8', '13', 'nine', '']) {
      const result = dayRequestFor({ ...student, cls }, '2026-08-25')
      expect(result.ok, `accepted class ${JSON.stringify(cls)}`).toBe(false)
    }
  })

  it('refuses a student who has chosen no subjects', () => {
    const result = dayRequestFor({ ...student, subjects: [] }, '2026-08-25')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/subject/i)
  })

  it('falls back to a sensible daily budget when minutes are unset', () => {
    const result = dayRequestFor({ ...student, minutes: null }, '2026-08-25')
    expect(result.ok && result.request.dailyMinutes).toBe(120)
  })
})
