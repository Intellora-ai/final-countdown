/*
 * WHAT THE VENDOR IS ACTUALLY ASKED TO RESERVE.
 *
 * `speed.test.ts` proves the handler hands the client a small budget for a
 * decision. That is the argument, not the request: the number that costs money
 * and rate budget is the one in the JSON body, and nothing read it. An edit
 * that dropped `max_tokens: reserved`, or computed it after the body was built,
 * would put every decision back on a lesson's reservation -- spending an
 * 8,000-per-minute allowance four times faster, and bringing back the 429s
 * whose retry pauses a learner sits through -- with every existing test green.
 *
 * `fetchImpl` is the seam `createGroqModel` already takes for exactly this.
 */
import { describe, expect, it } from 'vitest'

import { createGroqModel } from './groq.ts'
import { hostedProviders, VENDORS } from './provider.ts'

function capturing(): { bodies: Record<string, unknown>[]; fetchImpl: never } {
  const bodies: Record<string, unknown>[] = []
  const fetchImpl = (async (_url: string, init: { body?: string }) => {
    bodies.push(JSON.parse(init.body ?? '{}') as Record<string, unknown>)
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      }),
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }),
    }
  }) as never
  return { bodies, fetchImpl }
}

describe('a decision is not charged as a lesson', () => {
  it('sends the caller’s budget as max_tokens', async () => {
    const { bodies, fetchImpl } = capturing()
    const model = createGroqModel({ apiKey: 'k', model: 'test-model', fetchImpl })

    await model.chat?.('You are the controller', 'STUDENT SAID: hi', undefined, 600)

    expect(bodies).toHaveLength(1)
    expect(bodies[0]?.['max_tokens'], 'the vendor was asked to reserve something else').toBe(600)
  })

  it('still reserves the concept default when the caller says nothing', async () => {
    /* The authoring call passes no budget and must keep the reservation it has
       always had -- a lesson truncated to a decision's size is not a saving. */
    const { bodies, fetchImpl } = capturing()
    const model = createGroqModel({ apiKey: 'k', model: 'test-model', fetchImpl })

    await model.chat?.('Teach ONE atomic concept', 'photosynthesis')

    expect(bodies[0]?.['max_tokens']).toBe(1400)
  })

  it('asks for far less on a decision than on a lesson', async () => {
    /* Stated as the relationship rather than as two constants, so the test says
       what matters even when either number is retuned. */
    const { bodies, fetchImpl } = capturing()
    const model = createGroqModel({ apiKey: 'k', model: 'test-model', fetchImpl })

    await model.chat?.('You are the controller', 'STUDENT SAID: hi', undefined, 600)
    await model.chat?.('Teach ONE atomic concept', 'photosynthesis')

    expect(Number(bodies[0]?.['max_tokens'])).toBeLessThan(Number(bodies[1]?.['max_tokens']))
  })
})

describe('a rate limit is handed up, not waited out, when somebody else can answer', () => {
  /*
   * MEASURED ON THE RUNNING SERVER. Gemini answered 429, this client sat out
   * `WAIT_BEFORE_RETRY_MS` -- 800ms then 14s -- twice in one request, and
   * `POST /api/ask` came back 502 after 31.5s with a Groq key configured and
   * Groq never asked. Waiting is the right fix only for the client that has
   * nobody behind it.
   */
  function refusing(status: number, body: unknown): { tries: number[]; fetchImpl: never } {
    const tries: number[] = []
    const fetchImpl = (async () => {
      tries.push(1)
      return {
        ok: false,
        status,
        headers: { get: () => null },
        json: async () => body,
        text: async () => JSON.stringify(body),
      }
    }) as never
    return { tries, fetchImpl }
  }

  it('gives up after ONE attempt when a standby is behind it', async () => {
    const { tries, fetchImpl } = refusing(429, {})
    const model = createGroqModel({
      apiKey: 'k',
      model: 'test-model',
      fetchImpl,
      waitOutRateLimits: false,
    })

    await expect(model.chat?.('sys', 'user')).rejects.toThrow(/429/)
    expect(tries, 'it waited out a rate limit while a standby sat idle').toHaveLength(1)
  })

  /*
   * THE OTHER HALF OF THIS -- that the LAST client still waits a rate limit out
   * -- IS NOT TESTED HERE, DELIBERATELY, AND THAT IS A COST WORTH NAMING.
   *
   * Asserting it means really waiting `WAIT_BEFORE_RETRY_MS`, measured at
   * 14.8s, and a test that holds a vitest worker that long changes the SUITE:
   * `m4-consistency`'s five-process race began failing with "the 5 processes
   * never overlapped, so nothing raced anything" -- it passes alone and cannot
   * get the CPU under that much contention. A slow test that re-proves
   * unchanged behaviour is not worth destabilising a test that catches real
   * races.
   *
   * What it would have covered is the DEFAULT, which nothing changed: absent
   * and `true` both take the branch this file's fast case proves is skipped
   * only when the flag is explicitly `false`.
   */

})

describe('a vendor reserves what IT needs, not what the longest-winded one needs', () => {
  /*
   * `max_tokens` IS A RESERVATION, NOT A MEASUREMENT: a vendor deducts it at
   * request time whatever the reply costs. So one constant serving five hosts
   * has to clear the LONGEST-writing one, and every other host then overpays on
   * every single request.
   *
   * MEASURED ON THIS ACCOUNT, the day this was written:
   *
   *   tokens per day (TPD): Limit 200000, Used 199967, Requested 1473
   *
   * 1,473 a concept is ~135 lessons a day. `gpt-oss`'s own measured worst case
   * is 791, so 609 of those tokens could never have been used.
   */
  it('sends the per-vendor reservation on the wire', async () => {
    const { bodies, fetchImpl } = capturing()
    const model = createGroqModel({
      apiKey: 'k',
      model: 'openai/gpt-oss-120b',
      fetchImpl,
      conceptTokens: 1000,
    })

    await model.chat?.('Teach ONE atomic concept', 'photosynthesis')

    expect(bodies[0]?.['max_tokens'], 'the vendor reserved somebody else’s worst case').toBe(1000)
  })

  it('gives the measured vendor a smaller reservation than the unmeasured ones', () => {
    /* Stated as the relationship, so it still says what matters if either
       number is retuned when the ceiling log produces better evidence. */
    const groq = VENDORS.find((one) => one.keyVar === 'GROQ_API_KEY')
    const gemini = VENDORS.find((one) => one.keyVar === 'GEMINI_API_KEY')

    expect(groq?.conceptTokens).toBeLessThan(gemini?.conceptTokens ?? 0)
    /* And it must still clear `gpt-oss`'s measured worst case of 791, or the
       saving is bought with truncated lessons. */
    expect(groq?.conceptTokens ?? 0).toBeGreaterThan(791)
  })

  it('carries the number from the vendor table to the client that sends it', () => {
    /* The two halves are in different files, and a reservation that stops at
       the provider record is a saving nobody gets. */
    const built = hostedProviders({ GROQ_API_KEY: 'gsk_test' })
    expect(built).toHaveLength(1)
    expect(built[0]?.conceptTokens).toBe(
      VENDORS.find((one) => one.keyVar === 'GROQ_API_KEY')?.conceptTokens,
    )
  })
})

describe('a spent DAY is not waited out by anybody', () => {
  /*
   * MEASURED, with both accounts empty: `POST /api/ask` returned 502 after
   * 31.0s, and 30 of those seconds were this client sitting out a limit whose
   * own first reply said
   *
   *   tokens per day (TPD): Limit 200000, Used 199967 ... try again in 10m22s
   *
   * `WAIT_BEFORE_RETRY_MS` is `[800, 14_000]`, so a spent day cost 14.8s per
   * model call to rediscover something the vendor stated immediately.
   */
  const DAILY = {
    error: {
      type: 'tokens',
      code: 'rate_limit_exceeded',
      message:
        'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` ' +
        'service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199967, ' +
        'Requested 1473. Please try again in 10m22.079999999s.',
    },
  }
  const PER_MINUTE = {
    error: {
      type: 'tokens',
      code: 'rate_limit_exceeded',
      message:
        'Rate limit reached on tokens per minute (TPM): Limit 8000, Used 7900, ' +
        'Requested 1473. Please try again in 3.2s.',
    },
  }

  /*
   * `resetsIn` IS THE VENDOR'S OWN HEADER, not a test knob. `groq.ts` honours
   * `x-ratelimit-reset-tokens` over its fixed pauses precisely so it waits the
   * real figure rather than a hand-picked one -- so a double that reports a
   * reset of 0.05s makes the retry immediate while exercising exactly the code
   * path a 12-second reset would. That keeps this test honest AND keeps it off
   * the 14.8s fixed ladder, which holds a worker long enough to starve
   * `m4-consistency`'s five-process race of the CPU it needs to race.
   */
  function refusing(body: unknown, resetsIn = '0.05s'): { tries: number[]; fetchImpl: never } {
    const tries: number[] = []
    const fetchImpl = (async () => {
      tries.push(1)
      return {
        ok: false,
        status: 429,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'x-ratelimit-reset-tokens' ? resetsIn : null,
        },
        json: async () => body,
        text: async () => JSON.stringify(body),
      }
    }) as never
    return { tries, fetchImpl }
  }

  it('stops at once when the vendor says the DAY is spent', async () => {
    const { tries, fetchImpl } = refusing(DAILY)
    /* The last client -- the one for which waiting would otherwise be right. */
    const model = createGroqModel({
      apiKey: 'k',
      model: 'test-model',
      fetchImpl,
      waitOutRateLimits: true,
    })

    await expect(model.chat?.('sys', 'user')).rejects.toThrow(/daily token budget is spent/)
    expect(tries, 'it waited out a budget that refills tomorrow').toHaveLength(1)
  })

  it('still waits out a per-MINUTE ceiling, which waiting really does fix', async () => {
    /* The distinction is the whole point: one clears in seconds and one does
       not clear today. Collapsing them either wastes 14.8s or throws away the
       retry that a minute-bucket genuinely needs. */
    const { tries, fetchImpl } = refusing(PER_MINUTE)
    const model = createGroqModel({
      apiKey: 'k',
      model: 'test-model',
      fetchImpl,
      waitOutRateLimits: true,
    })

    await expect(model.chat?.('sys', 'user')).rejects.toThrow(/short-term token budget is spent/)
    expect(tries.length, 'a ceiling that clears in seconds was abandoned').toBeGreaterThan(1)
  })

  it('remembers how much of the day the vendor said is left, from a SUCCESSFUL reply', async () => {
    /* MEASURED 2026-09-02: the day's budget ran out mid-afternoon and every
       question until the reset waited out the retry loop before failover
       moved on. The vendor had been saying `x-ratelimit-remaining-tokens` on
       every good reply all day, and nothing read it. */
    const model = createGroqModel({
      apiKey: 'gsk_x',
      model: 'm',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] }),
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'x-ratelimit-remaining-tokens' ? '512' : name.toLowerCase() === 'x-ratelimit-reset-tokens' ? '30s' : null,
        },
      }),
    })
    expect(model.budgetLeft?.()).toBeNull()
    await model.chat!('sys', 'q')
    const left = model.budgetLeft?.()
    expect(left?.remainingTokens).toBe(512)
    expect(left?.resetInMs).toBeGreaterThan(25_000)
    expect(left?.resetInMs).toBeLessThanOrEqual(30_000)
  })
})
