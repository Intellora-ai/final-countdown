/*
 * WHAT HAPPENS TO A LEARNER WHEN AN ACCOUNT RUNS OUT.
 *
 * Not a unit test of a wrapper. The scenario is the one that actually happened
 * on this machine: an afternoon of ordinary teaching spent Groq's 200,000
 * tokens per DAY, and from `Used 198032` onward every single request answered
 * `the model could not be reached (429 tokens/rate_limit_exceeded)`. The
 * product had one account between it and teaching nothing.
 *
 * Each test below is a real operator situation, written from the outside: what
 * they configured, what the vendors did, and what the learner got.
 */
import { describe, expect, it, vi } from 'vitest'

import { failover, type Standby } from './failover.ts'
import type { Model } from './model.ts'

/** A vendor that answers. */
const answers = (text: string): Model => ({
  lesson: async () => ({ lesson: text }),
  chat: async () => text,
  nextPart: async () => ({ part: text }),
})

/** A vendor that refuses, in the words `groq.ts` actually builds. */
const refuses = (why: string): Model => ({
  lesson: async () => {
    throw new Error(why)
  },
  chat: async () => {
    throw new Error(why)
  },
  nextPart: async () => {
    throw new Error(why)
  },
})

const SPENT = 'the model could not be reached (429 tokens/rate_limit_exceeded — the daily token budget is spent, try again in 7m4.224s)'

const line = (vendor: string, model: Model): Standby => ({ vendor, model })

describe('the day the free tier runs out', () => {
  it('teaches from the next vendor instead of failing', async () => {
    const kimi = vi.fn(async () => 'a lesson about photosynthesis')
    const model = failover([
      line('groq', refuses(SPENT)),
      line('moonshot', { ...answers('unused'), chat: kimi }),
    ])

    await expect(model.chat!('sys', 'photosynthesis')).resolves.toBe(
      'a lesson about photosynthesis',
    )
    expect(kimi).toHaveBeenCalledOnce()
  })

  it('moves on from a 429 that carries no vendor code at all', async () => {
    /*
     * MEASURED ON THE RUNNING SERVER, and it took the product down completely:
     *
     *   [failover] gemini could not answer: the model could not be reached (429)
     *   POST /api/ask -> 502 in 31.5s
     *
     * with a Groq key configured, a Groq client built, and Groq never asked.
     *
     * Every other 429 case in this file is written in GROQ'S wording --
     * `(429 tokens/rate_limit_exceeded ...)` -- which the string tests catch.
     * Gemini sends a bare `(429)`, so every string test missed it and the
     * status fell through to `code >= 500`. The vendor whose phrasing nobody
     * had written a test from was the one vendor that could disable failover,
     * and it is FIRST in `VENDORS`.
     */
    const kimi = vi.fn(async () => 'a lesson about the tyndall effect')
    const model = failover([
      line('gemini', refuses('the model could not be reached (429)')),
      line('moonshot', { ...answers('unused'), chat: kimi }),
    ])

    await expect(model.chat!('sys', 'the tyndall effect')).resolves.toBe(
      'a lesson about the tyndall effect',
    )
    expect(kimi, 'the standby was never asked, so the learner got a 502').toHaveBeenCalledOnce()
  })

  it('moves on from a bare 429 for a whole lesson too', async () => {
    /* `lesson` and `chat` are two entry points into the same loop; a fix that
       only reached one of them would leave the other path dead. */
    const kimi = vi.fn(async () => ({ id: 'a-lesson' }))
    const model = failover([
      line('gemini', refuses('the model could not be reached (429)')),
      line('moonshot', { ...answers('unused'), lesson: kimi }),
    ])

    await expect(model.lesson({} as never)).resolves.toEqual({ id: 'a-lesson' })
    expect(kimi).toHaveBeenCalledOnce()
  })

  it('does not touch a standby while the primary is healthy', async () => {
    /* Which vendor teaches on a good day must not change, or every measurement
       in CONSTRAINTS.md becomes unrepeatable. */
    const standby = vi.fn(async () => 'never')
    const model = failover([
      line('groq', answers('the primary taught this')),
      line('moonshot', { ...answers('never'), chat: standby }),
    ])

    await expect(model.chat!('sys', 'q')).resolves.toBe('the primary taught this')
    expect(standby).not.toHaveBeenCalled()
  })

  it('walks past every spent vendor to the one that still has budget', async () => {
    const model = failover([
      line('moonshot', refuses(SPENT)),
      line('zai', refuses(SPENT)),
      line('groq', refuses(SPENT)),
      line('deepseek', answers('deepseek taught this')),
    ])

    await expect(model.chat!('sys', 'q')).resolves.toBe('deepseek taught this')
  })
})

describe('a failure another vendor cannot fix is not asked of another vendor', () => {
  it('stops at the first host when the request itself is wrong', async () => {
    /* A model name that does not exist is refused by everyone, so trying four
       hosts turns one fast failure into four slow ones while a learner waits. */
    const second = vi.fn(async () => 'never')
    const model = failover([
      line('groq', refuses('the model could not be reached (404 model_not_found)')),
      line('moonshot', { ...answers('never'), chat: second }),
    ])

    await expect(model.chat!('sys', 'q')).rejects.toThrow(/model_not_found/)
    expect(second).not.toHaveBeenCalled()
  })

  it('does try another when the key itself was refused', async () => {
    /* Another vendor's key is a different key. */
    const model = failover([
      line('groq', refuses('the model could not be reached (401 invalid_api_key)')),
      line('moonshot', answers('the second key worked')),
    ])
    await expect(model.chat!('sys', 'q')).resolves.toBe('the second key worked')
  })

  it('does try another when a host is down', async () => {
    const model = failover([
      line('groq', refuses('the model could not be reached (503 service_unavailable)')),
      line('moonshot', answers('the second host was up')),
    ])
    await expect(model.chat!('sys', 'q')).resolves.toBe('the second host was up')
  })
})

describe('what the operator is told', () => {
  it('leads with the primary’s reason, not the last standby’s', async () => {
    /* They configured the first one and meant it to answer. "deepseek: 404"
       would send them to fix a vendor they were not using. */
    const model = failover([
      line('groq', refuses(SPENT)),
      line('deepseek', refuses('the model could not be reached (500 server_error)')),
    ])

    await expect(model.chat!('sys', 'q')).rejects.toThrow(/daily token budget is spent/)
  })

  it('names every vendor it asked, so a silent fallback cannot hide', async () => {
    const model = failover([
      line('groq', refuses(SPENT)),
      line('moonshot', refuses(SPENT)),
    ])

    await expect(model.chat!('sys', 'q')).rejects.toThrow(/tried 2:.*groq.*moonshot/s)
  })

  it('does not pretend to offer a call no configured vendor can make', async () => {
    /* CONTRACT CHANGED, DELIBERATELY. This used to assert a thrown sentence,
       and a thrown sentence is the wrong audience: `handler.ts` branches on
       whether `chat` EXISTS to choose the concept path over the whole-lesson
       path, so declaring a `chat` that can only fail turned a request the
       whole-lesson path would have SERVED into a dead end the learner saw.
       Absent is what the router needs in order to fall back. */
    const noChat: Model = { lesson: async () => ({}) }
    const model = failover([line('groq', noChat), line('moonshot', noChat)])

    expect(model.chat).toBeUndefined()
    /* And the call it CAN make is still made. */
    await expect(model.lesson({} as never)).resolves.toEqual({})
  })
})

describe('the shape of the product does not change with the weather', () => {
  it('offers chat when ANY vendor can, so the teaching path is stable', async () => {
    /* `handler.ts` branches on whether `chat` EXISTS to choose the concept path
       over the whole-lesson path. A wrapper whose `chat` came and went with its
       primary would move a learner between two different teaching paths
       depending on which vendor was healthy that minute. */
    const noChat: Model = { lesson: async () => ({}) }
    const model = failover([line('groq', noChat), line('moonshot', answers('taught'))])

    expect(typeof model.chat).toBe('function')
    await expect(model.chat!('sys', 'q')).resolves.toBe('taught')
  })

  it('hands a single vendor straight back, unwrapped', async () => {
    /* One vendor needs no roll-call sentence in front of its failures. */
    const only = answers('solo')
    expect(failover([line('groq', only)])).toBe(only)
  })

  it('refuses to be built with nothing to fall back to', () => {
    expect(() => failover([])).toThrow(/no models/)
  })
})

describe('a spent vendor is not asked first again all day', () => {
  it('goes straight to the standby on the next question', async () => {
    /* THE COST THIS REMOVES, AND IT ONLY EXISTS ACROSS REQUESTS. Groq reports a
       spent daily budget at 3pm. Without a memory, every question until
       midnight asks it FIRST and waits out `groq.ts`'s retry loop -- two
       pauses, up to thirty seconds each -- before reaching the vendor that
       could have answered at once. A learner pays that on every question. */
    const groq = vi.fn(async () => {
      throw new Error(SPENT)
    })
    const kimi = vi.fn(async () => 'kimi taught this')
    const model = failover([
      line('groq', { ...answers('x'), chat: groq }),
      line('moonshot', { ...answers('x'), chat: kimi }),
    ])

    await expect(model.chat!('sys', 'first')).resolves.toBe('kimi taught this')
    expect(groq).toHaveBeenCalledTimes(1)

    await expect(model.chat!('sys', 'second')).resolves.toBe('kimi taught this')
    /* Not asked again: the vendor said when it comes back and it has not. */
    expect(groq).toHaveBeenCalledTimes(1)
    expect(kimi).toHaveBeenCalledTimes(2)
  })

  it('still asks a spent vendor when every vendor is spent', async () => {
    /* Skipping must never become refusing. If everything is spent the request
       is still made, and still fails honestly rather than inventing an outage. */
    const groq = vi.fn(async () => {
      throw new Error(SPENT)
    })
    const model = failover([
      line('groq', { ...answers('x'), chat: groq }),
      line('moonshot', { ...answers('x'), chat: async () => { throw new Error(SPENT) } }),
    ])

    await expect(model.chat!('sys', 'a')).rejects.toThrow(/budget is spent/)
    await expect(model.chat!('sys', 'b')).rejects.toThrow(/budget is spent/)
    expect(groq).toHaveBeenCalledTimes(2)
  })

  it('keeps one wrapper’s exhaustion out of another’s ordering', async () => {
    /* A module-level map would let one set of standbys reorder another's, and
       nothing could build a fresh wrapper with a clean slate. */
    const spent = failover([
      line('groq', { ...answers('x'), chat: async () => { throw new Error(SPENT) } }),
      line('moonshot', answers('standby')),
    ])
    await expect(spent.chat!('sys', 'q')).resolves.toBe('standby')

    const fresh = failover([
      line('groq', answers('primary')),
      line('moonshot', answers('standby')),
    ])
    await expect(fresh.chat!('sys', 'q')).resolves.toBe('primary')
  })
})

describe('a busy minute is not a spent day', () => {
  /*
   * `groq.ts` names two budgets and they are not the same length of problem.
   * Groq's own headers put the minute bucket's reset at 577ms; the day bucket
   * said `try again in 7m4.224s` with 1,968 tokens left of 200,000. Every test
   * above supplies the daily message WITH a time in it, so the fallback these
   * cover -- a message with no time at all -- had no coverage, and it stood a
   * healthy primary down for an hour after one busy minute.
   */
  const SHORT = 'the model could not be reached (429 tokens/rate_limit_exceeded — the short-term token budget is spent)'
  const DAILY_NO_TIME = 'the model could not be reached (429 tokens/rate_limit_exceeded — the daily token budget is spent)'

  const twoVendors = (why: string) => {
    const primary = vi.fn(async () => {
      throw new Error(why)
    })
    return {
      primary,
      model: failover([
        line('groq', { ...answers('x'), chat: primary }),
        line('moonshot', answers('standby')),
      ]),
    }
  }

  it('stands a per-minute exhaustion down for a minute, not an hour', async () => {
    const { primary, model } = twoVendors(SHORT)
    await expect(model.chat!('sys', 'a')).resolves.toBe('standby')

    /* A minute later the primary is due back. Asserted through the only door
       there is -- ask again with the clock moved on. */
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 61_000)
      await expect(model.chat!('sys', 'b')).resolves.toBe('standby')
    } finally {
      vi.useRealTimers()
    }
    /* Asked a second time, because a minute's stand-down had expired. An hour's
       would not have. */
    expect(primary).toHaveBeenCalledTimes(2)
  })

  it('keeps a per-day exhaustion down past a minute', async () => {
    const { primary, model } = twoVendors(DAILY_NO_TIME)
    await expect(model.chat!('sys', 'a')).resolves.toBe('standby')

    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 61_000)
      await expect(model.chat!('sys', 'b')).resolves.toBe('standby')
    } finally {
      vi.useRealTimers()
    }
    /* Not asked again: a day is not over in a minute. */
    expect(primary).toHaveBeenCalledTimes(1)
  })
})

describe('numbers that are not statuses are not read as statuses', () => {
  /* Token counts, ports, model names and retry hints all carry three digits. */
  it('does not walk the whole fleet because a count contained 403', async () => {
    const second = vi.fn(async () => 'never')
    const model = failover([
      line('groq', refuses('the model could not be reached (404 model_not_found) Used 198403')),
      line('moonshot', { ...answers('never'), chat: second }),
    ])

    await expect(model.chat!('sys', 'q')).rejects.toThrow(/model_not_found/)
    expect(second).not.toHaveBeenCalled()
  })

  it('does not read a local endpoint’s port as an HTTP status', async () => {
    /*
     * THE PROPERTY: a message with a colon rather than a parenthesis carries no
     * status, and `(503 MB free)` in the middle of a sentence is not a 503.
     *
     * WHAT CHANGED, AND WHY THE ASSERTION MOVED. This used to end
     * `expect(second).not.toHaveBeenCalled()`, and that was right when it was
     * written: Ollama could only ever be the PRIMARY in local mode and could
     * never appear in a failover chain, so "no status" and "do not move on"
     * were the same outcome. Ollama can now be a standby, and a laptop with
     * `ollama serve` stopped is exactly the "host that is down or not
     * answering" this file is documented to move for -- so the two came apart
     * and the sentence, not the digits, is what decides now.
     *
     * The anti-misparse property is proven by the next test instead, which uses
     * a sentence `worthAskingAnother` has no other reason to move for.
     */
    const second = vi.fn(async () => 'the hosted vendor answered')
    const model = failover([
      line('ollama', refuses('the model could not be reached: Ollama is not answering at http://127.0.0.1:11434 (503 MB free)')),
      line('moonshot', { ...answers('never'), chat: second }),
    ])

    await expect(model.chat!('sys', 'q')).resolves.toBe('the hosted vendor answered')
    expect(second, 'a stopped laptop model took the hosted vendor down with it').toHaveBeenCalledOnce()
  })

  it('still refuses to find a status inside a sentence that has none', async () => {
    /* Same shape -- a colon, a port, a parenthesised number -- but none of the
       phrases this file matches on. If `(503 MB free)` were being read as a
       status the standby would be asked, and it must not be. */
    const second = vi.fn(async () => 'never')
    const model = failover([
      line('groq', refuses('the model could not be reached: the disk at /var/db:11434 (503 MB free) is full')),
      line('moonshot', { ...answers('never'), chat: second }),
    ])

    await expect(model.chat!('sys', 'q')).rejects.toThrow(/disk/)
    expect(second, 'a parenthesised number in prose was read as an HTTP status').not.toHaveBeenCalled()
  })

  it('still moves on for a real 503 from the hosted client', async () => {
    const model = failover([
      line('groq', refuses('the model could not be reached (503 service_unavailable)')),
      line('moonshot', answers('the second host was up')),
    ])
    await expect(model.chat!('sys', 'q')).resolves.toBe('the second host was up')
  })
})

describe('a local model that is not running is not the end of the road', () => {
  it('asks a hosted vendor after Ollama says it is not answering', async () => {
    /*
     * `ollama.ts` writes `the model could not be reached: Ollama is not
     * answering at <endpoint>` -- a colon and no parenthesis -- so the status
     * regex found nothing and `worthAskingAnother` returned false. Harmless
     * while the laptop is LAST; the moment anyone puts it first, for offline
     * use or to spare a quota, a stopped `ollama serve` takes every hosted
     * vendor behind it down with it.
     */
    const hosted = vi.fn(async () => 'a lesson about photosynthesis')
    const model = failover([
      line(
        'ollama (qwen2.5:7b)',
        refuses(
          'the model could not be reached: Ollama is not answering at http://127.0.0.1:11434. ' +
            'Is it running? Start it with: ollama serve',
        ),
      ),
      line('gemini', { ...answers('unused'), chat: hosted }),
    ])

    await expect(model.chat!('sys', 'photosynthesis')).resolves.toBe(
      'a lesson about photosynthesis',
    )
    expect(hosted, 'a stopped laptop model stopped the whole chain').toHaveBeenCalledOnce()
  })

  it('also moves on when the local model simply never answers', async () => {
    const hosted = vi.fn(async () => 'a lesson')
    const model = failover([
      line(
        'ollama (gemma3:12b)',
        refuses('the model could not be reached: Ollama at http://127.0.0.1:11434 did not answer within 240000ms'),
      ),
      line('gemini', { ...answers('unused'), chat: hosted }),
    ])

    await expect(model.chat!('sys', 'x')).resolves.toBe('a lesson')
    expect(hosted).toHaveBeenCalledOnce()
  })
})
