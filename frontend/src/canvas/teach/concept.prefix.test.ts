import { describe, expect, it } from 'vitest'

import { conceptRequest } from './concept'
import type { Source } from './grounding'

/**
 * THE STABLE PREFIX IS THE PROMPT CACHE.
 *
 * Ollama reuses its KV cache, and Groq its prefix cache, exactly when the
 * start of the prompt is byte-for-byte what it was last time. The audit found
 * 8,737 characters re-sent verbatim on every request and nothing declaring
 * them cacheable; on these vendors nothing has to be declared -- the prefix
 * only has to STAY IDENTICAL. So this file guards the property the cache
 * depends on: every rule comes first, unchanged by anything about the
 * request, and the first per-request word appears only after all of them.
 */

function commonPrefix(a: string, b: string): string {
  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1
  return a.slice(0, at)
}

const source: Source = { url: 'https://a.example/x', title: 'A', text: 'Sugars are made in the Calvin cycle.' }

const variants = [
  conceptRequest('photosynthesis'),
  conceptRequest('why do magnets attract iron'),
  conceptRequest('photosynthesis', [source]),
  conceptRequest('photosynthesis', [], ['route-a', 'route-b'], 7),
  conceptRequest('photosynthesis', [], [], 3, ['You were told the light reactions split water.']),
]

describe('the system prompt starts the same way every time', () => {
  it('shares one long, identical prefix across questions, sources, routes and history', () => {
    const shared = variants.reduce((prefix, next) => commonPrefix(prefix, next))
    expect(shared.length, 'the rules are not where a cache can reuse them').toBeGreaterThan(3000)
    /* The prefix ends where the request begins, never inside a rule. */
    expect(shared.trimEnd().endsWith('\n') || shared.endsWith('\n')).toBe(true)
  })

  it('keeps every rule inside the shared prefix -- the request begins only after the last one', () => {
    /* The grounding preamble is the first per-request line, and it is placed
       right before the question. So the shared prefix must run through the
       LAST rule; a rule that fell after the grounding would be re-sent
       differently on every request and never cached. */
    const shared = variants.reduce((prefix, next) => commonPrefix(prefix, next))
    for (const rule of [
      'Reply with ONE JSON object and nothing else.',
      'exactly ONE block with "role":"definition"',
      '"checkpoint" is OPTIONAL and usually absent: this is a canvas for',
    ]) {
      expect(shared, `the rule fell outside the shared prefix: ${rule}`).toContain(rule)
    }
    for (const prompt of variants) {
      expect(prompt.startsWith(shared)).toBe(true)
    }
  })
})

describe('how much of the prompt is cacheable, as a number', () => {
  /*
   * B2 ASKED FOR A CACHEABLE PREFIX; IDENTITY ALONE DOES NOT SAY HOW MUCH.
   *
   * The test above proves the rules sit in one byte-identical prefix. It would
   * still pass if that prefix were forty characters long, which is worth
   * nothing: a provider caches a PREFIX, and the saving is its size.
   *
   * MEASURED 2026-09-03 across the five variants above (a different question,
   * a source, spent routes, prior wording): 8,769 identical leading characters
   * -- 137 lines, 91.5% of the shortest prompt of the five. The floors below
   * are set under those numbers, not at them, so ordinary edits to the rules
   * do not trip the test while a change that moves a per-request line ABOVE
   * the rules -- which is what actually destroys a cache -- does.
   */
  const shared = (() => {
    const first = variants[0]!
    let n = 0
    while (n < first.length && variants.every((v) => v[n] === first[n])) n += 1
    return n
  })()

  it('is thousands of characters, not a handful', () => {
    expect(shared).toBeGreaterThan(8_000)
  })

  it('is most of what is sent, so caching it is worth doing', () => {
    const smallest = Math.min(...variants.map((v) => v.length))
    expect(shared / smallest).toBeGreaterThan(0.85)
  })

  it('ends where the REQUEST begins, not part-way through a rule', () => {
    /* The prefix must break at a seam a reader can point at. If it ended
       mid-sentence the cache would still work and the prompt would have a rule
       that half the requests never see. */
    const first = variants[0]!
    expect(first[shared - 1], 'the shared part stops in the middle of a line').toBe('\n')
    const divergent = first.slice(shared).split('\n')[0] ?? ''
    expect(divergent, 'the first line that differs is not the request itself').toMatch(/Teach ONE atomic concept/)
  })
})
