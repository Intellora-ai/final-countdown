import { describe, expect, it } from 'vitest'

import { ask, usableSources } from './pipeline'
import { API_KEY_ENV, ENDPOINT_ENV, searchTheOpenWeb } from '../../server/openweb'
import type { SearchProvider } from './engine'
import type { FetchOutcome } from './fetchPage'

/**
 * A PAGE THAT WAS READ MUST STILL BE ABOUT THE SUBJECT.
 *
 * MEASURED LIVE 2026-09-03, through the real /api/search on this machine, after
 * nine search engines were switched on. Asking "trigonometric ratios class 10
 * school level, simple language" returned twenty pages, and these were among
 * the ones handed back as SOURCES a lesson could be written from:
 *
 *   pubmed.ncbi.nlm.nih.gov   "Cookies must be enabled"        (x8)
 *   pmc.ncbi.nlm.nih.gov      "Checking your browser - reCAPTCHA"
 *   pmc.ncbi.nlm.nih.gov      "Selective Inhibitors of Janus Kinase 3"
 *   data.worldbank.org        "Price level index (GDP)"
 *   en.wikipedia.org          "Comparison of programming languages"
 *   www.harvard.edu           "Language"
 *
 * and for "photosynthesis": "Baldwin Class 10-12-D" and "Bantu languages".
 *
 * Two separate faults, one rule:
 *
 *   1. A BOT WALL IS NOT A SOURCE. "Cookies must be enabled" is a page that
 *      told us nothing. Citing it says a claim rests on evidence when it rests
 *      on a cookie notice.
 *   2. THE LEVEL WORDS WERE SEARCHED AS CONTENT. The class scope -- "class 10
 *      school level, simple language" -- is a bias for the engine, not part of
 *      the subject, and engines matched it literally: hence Bantu LANGUAGES,
 *      Baldwin CLASS 10-12-D, and Harvard's "Language" page.
 *
 * Both are the same missing check: the guard that reads a hit's SNIPPET before
 * fetching was never applied to the page's own TEXT afterwards. `select.ts`
 * even says so in its header -- "that also ranks pages already read, whose text
 * -- not their snippet -- is what says the subject" -- and nothing did it.
 *
 * Every page body below is the real thing those sites serve.
 */

const now = () => Date.parse('2026-09-03T00:00:00Z')

/** What pubmed actually serves a bot, measured. */
const COOKIE_WALL = '<html><body><h1>Cookies must be enabled</h1><p>To use this site, please enable cookies in your browser settings and reload the page.</p></body></html>'
/** What pmc actually serves a bot, measured. */
const CAPTCHA_WALL = '<html><body><h1>Checking your browser - reCAPTCHA</h1><p>Please complete the security check to access this page.</p></body></html>'

function fetcherFor(pages: Record<string, string>): (url: string) => Promise<FetchOutcome> {
  return async (url: string) => {
    const body = pages[url]
    if (body === undefined) return { ok: false, reason: 'network', detail: 'not in fixture', elapsedMs: 1, attempts: 1 }
    return {
      ok: true,
      page: { requestedUrl: url, finalUrl: url, status: 200, contentType: 'text/html', body, bytes: body.length, truncated: false, elapsedMs: 1, attempts: 1, redirects: [], retrievedAt: new Date(now()).toISOString() },
      elapsedMs: 1,
      attempts: 1,
    }
  }
}

describe('a page that turned out to be about something else is not a source', () => {
  it('drops a bot wall, and keeps the page that actually teaches', async () => {
    const wall = 'https://pubmed.ncbi.nlm.nih.gov/12345/'
    const real = 'https://en.wikipedia.org/wiki/Trigonometry'
    const provider: SearchProvider = {
      name: 'nine-engines',
      search: async () => [
        { url: wall, title: 'Trigonometric ratios in orthodontics', snippet: 'A study of trigonometric ratios.' },
        { url: real, title: 'Trigonometry', snippet: 'Trigonometry studies the ratios of the sides of a triangle.' },
      ],
    }
    const result = await ask('trigonometric ratios', {
      provider,
      fetchImpl: fetcherFor({
        [wall]: COOKIE_WALL,
        [real]: '<p>The trigonometric ratios sine, cosine and tangent relate the sides of a right triangle to its angles.</p>',
      }),
      now,
    })
    const citable = usableSources(result.retrieved).map((r) => r.hit.url)
    expect(citable, 'a cookie notice was kept as a source a lesson could cite').not.toContain(wall)
    expect(citable, 'the page that actually teaches was dropped too').toContain(real)
    /* AND IT IS STILL THERE TO BE SEEN. Removing it outright blinded the
       retrieval benchmark, which grades "fetched the wrong thing" as zero
       precision and cannot grade what it cannot see. */
    expect(
      result.retrieved.map((r) => r.hit.url),
      'the bad page vanished, so nothing can measure that the search fetched it',
    ).toContain(wall)
  })

  it('drops a CAPTCHA page the same way', async () => {
    const wall = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1/'
    const real = 'https://en.wikipedia.org/wiki/Photosynthesis'
    const provider: SearchProvider = {
      name: 'nine-engines',
      search: async () => [
        { url: wall, title: 'Limits on Natural Photosynthesis', snippet: 'On the limits of photosynthesis.' },
        { url: real, title: 'Photosynthesis', snippet: 'Photosynthesis converts light into chemical energy.' },
      ],
    }
    const result = await ask('photosynthesis', {
      provider,
      fetchImpl: fetcherFor({
        [wall]: CAPTCHA_WALL,
        [real]: '<p>Photosynthesis is how plants turn light, water and carbon dioxide into sugar and oxygen.</p>',
      }),
      now,
    })
    const citable = usableSources(result.retrieved).map((r) => r.hit.url)
    expect(citable, 'a reCAPTCHA page was kept as a source').not.toContain(wall)
    expect(citable).toContain(real)
    expect(result.retrieved.map((r) => r.hit.url), 'the bad page vanished instead of being marked').toContain(wall)
  })

  it('never lets the LEVEL words become part of the subject in the first place', async () => {
    /*
     * THIS CASE MOVED, AND WHY IT MOVED IS THE FIX.
     *
     * It used to call the pipeline with "photosynthesis class 10 school level,
     * simple language" -- one string -- and expect the Bantu languages page to
     * be dropped. It could not be: "language" IS one of that string's words, so
     * the page honestly matched, and no downstream filter could tell a subject
     * word from a scope word once they were in the same sentence.
     *
     * So the level stopped being glued on. It travels beside the question as
     * its own field, the engine is still biased by it, and `interpret()` never
     * sees it. The polluted query this case was built from is now a string the
     * product cannot produce -- which is a better outcome than filtering it.
     *
     * Asserted here at the real boundary, through the real route.
     */
    const asked: string[] = []
    const wrong = 'https://en.wikipedia.org/wiki/Bantu_languages'
    const real = 'https://en.wikipedia.org/wiki/Photosynthesis'

    const reply = await searchTheOpenWeb(
      JSON.stringify({ query: 'photosynthesis', scope: 'class 10 school level, simple language' }),
      {
        /* A REALISTIC KEY, and it has to be. Written as 'k', the route's own
           redactor -- correctly -- blanked every letter "k" in the reply, so
           the assertion read `en.wi[redacted]ipedia.org` and the test failed
           while the product was right. A one-character secret is not a secret
           any service issues. */
        env: { [API_KEY_ENV]: 'test-key-9f2c4a17b8', [ENDPOINT_ENV]: 'https://p.example/s?q={query}&key={key}' },
        fetchJson: async (url: string) => {
          asked.push(decodeURIComponent(new URL(url).searchParams.get('q') ?? ''))
          return {
            results: [
              { url: wrong, title: 'Bantu languages', content: 'A simple language family of central and southern Africa.' },
              { url: real, title: 'Photosynthesis', content: 'Photosynthesis converts light into chemical energy.' },
            ],
          }
        },
        fetchImpl: fetcherFor({
          [wrong]: '<p>The Bantu languages are a large family of languages spoken across central and southern Africa.</p>',
          [real]: '<p>Photosynthesis is how plants turn light, water and carbon dioxide into sugar and oxygen.</p>',
        }),
      },
    )

    /* The engine WAS told the level -- that part must not be lost by the fix. */
    expect(
      asked.some((q) => q.includes('class 10 school level')),
      'the engine was never told the reading level, so the fix threw the feature away',
    ).toBe(true)
    expect(asked.every((q) => q.includes('photosynthesis')), 'her own words did not reach the engine').toBe(true)

    /* And the page that matched only the level words is not a source. */
    const urls = (JSON.parse(reply.body) as { pages: { url: string }[] }).pages.map((p) => p.url)
    expect(urls, 'a page about African languages was a source for a photosynthesis lesson').not.toContain(wrong)
    expect(urls, 'the page that actually teaches was dropped too').toContain(real)
  })

  it('keeps a page whose snippet was thin but whose text is squarely on the subject', async () => {
    /* The rule must not become "the snippet decides". An engine often returns a
       useless snippet for an excellent page, and this check exists precisely
       because the TEXT is the better evidence. */
    const real = 'https://ncert.example/maths/trig'
    const provider: SearchProvider = {
      name: 'nine-engines',
      search: async () => [{ url: real, title: 'Chapter 8', snippet: 'PDF download' }],
    }
    const result = await ask('trigonometric ratios', {
      provider,
      fetchImpl: fetcherFor({
        [real]: '<p>In this chapter we define the trigonometric ratios of an acute angle in a right triangle.</p>',
      }),
      now,
    })
    expect(
      usableSources(result.retrieved).map((r) => r.hit.url),
      'a page whose own text is exactly on the subject was thrown away for a bad snippet',
    ).toContain(real)
  })
})
