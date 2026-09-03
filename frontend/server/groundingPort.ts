/**
 * THE PORT BETWEEN LESSON AUTHORING AND THE OPEN WEB.
 *
 * `index.ts` wired `SearchPort.search` to `throw new Error('search is not
 * configured')` from the day this server existed. The handler's `lookUp` catch
 * turned the throw into an empty source list, so the failure was silent and
 * complete: every lesson this server has ever written was ungrounded, and the
 * search started in parallel with the controller saved nothing because there
 * was nothing to search with. Meanwhile the open-web pipeline that DOES work
 * answered /api/search alone, one route over.
 *
 * This is the adapter that was missing. The same pages /api/search returns
 * become the sources the author cites -- through the same pipeline, the same
 * cache, the same provider, so dev and prod cannot drift.
 *
 * FAILING TO FIND SOURCES IS STILL NOT FAILING TO TEACH. An unconfigured
 * provider, a network error, a malformed body: every one of them is an empty
 * list, and `groundingPreamble([])` returns '' -- the lesson is honestly
 * ungrounded rather than falsely sourced, exactly as before, only now the
 * empty list is the exception rather than the rule.
 */

import type { OpenWebReply, SearchPort, SearchResult } from './handler.ts'

/** What the pipeline says about one page, read for the two fields used here. */
function asPage(value: unknown): { url: string; text: string; suspicious: boolean; aboutTheSubject: boolean } | null {
  if (typeof value !== 'object' || value === null) return null
  const page = value as Record<string, unknown>
  if (typeof page['url'] !== 'string' || typeof page['text'] !== 'string') return null
  return {
    url: page['url'],
    text: page['text'],
    suspicious: page['suspicious'] === true,
    /* ABSENT MEANS CITABLE, and deliberately so: an older server, or any reply
       that predates the field, must keep grounding lessons exactly as it did.
       Only an explicit `false` -- the route's own judgement -- withholds a
       page. */
    aboutTheSubject: page['aboutTheSubject'] !== false,
  }
}

export interface GroundingOptions {
  /** How long the author waits for the web before writing without it. */
  readonly budgetMs?: number
}

/* MEASURED 2026-09-02 from the timing lines on a laptop model: controller
   1.6 s, grounding 19.7 s, first streamed word 22.5 s. The first word waited
   on the web -- a search provider waiting out slow engines, then five page
   reads -- and the lesson could not start until it came back. Past this
   budget the author writes without sources, exactly as it does when no
   provider is configured: honestly ungrounded, and now. Four seconds is what
   a fast search costs here (2.8-3.2 s measured through /api/search); a
   search that is still going at four is one that is waiting on an engine
   that will not answer. */
export const GROUNDING_BUDGET_MS = 4_000

export function searchPortFrom(
  openWeb: (requestBody: string) => Promise<OpenWebReply>,
  options: GroundingOptions = {},
): SearchPort {
  const budgetMs = options.budgetMs ?? GROUNDING_BUDGET_MS
  return {
    async search(query: string, scope = ''): Promise<readonly SearchResult[]> {
      /* EVERY EMPTY ANSWER SAYS WHY, IN THE LOG. The handler prints how many
         sources a lesson had; when that is zero, this is the only place that
         knows whether the web had nothing, the engine failed, or this adapter
         misread the reply. Measured 2026-09-02: "[grounding] 0 source(s)" on a
         server whose /api/search returned four pages, and nothing to say which. */
      const empty = (why: string): readonly SearchResult[] => {
        console.log(`[grounding] no sources for "${query.slice(0, 60)}": ${why}`)
        return []
      }
      const searchingAt = Date.now()
      let reply: OpenWebReply
      try {
        let giveUp: ReturnType<typeof setTimeout> | undefined
        const tooLate = new Promise<null>((resolve) => {
          giveUp = setTimeout(() => resolve(null), budgetMs)
        })
        /* The pipeline is told when to stop, a little before this port gives
           up, so it returns the pages it has instead of being cut off with
           them in hand. */
        const deadlineAt = searchingAt + Math.max(500, budgetMs - 500)
        const answered = await Promise.race([openWeb(JSON.stringify({ query, scope, deadlineAt })), tooLate]).finally(() => {
          if (giveUp !== undefined) clearTimeout(giveUp)
        })
        if (answered === null) return empty(`the web had not answered after ${budgetMs}ms, so the lesson is written without it`)
        reply = answered
        console.log(`[timing] grounding searched in ${Date.now() - searchingAt}ms`)
      } catch (thrown) {
        return empty(`the pipeline threw: ${thrown instanceof Error ? thrown.message : String(thrown)}`)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(reply.body)
      } catch {
        return empty(`status ${reply.status}, body is not JSON`)
      }
      if (reply.status !== 200) {
        const said = (parsed as { engineError?: unknown } | null)?.engineError
        return empty(`status ${reply.status}${typeof said === 'string' ? `: ${said}` : ''}`)
      }
      /* F2: in words the author can act on; absent when nothing was checked,
         which must never read as agreement. */
      const verdict = (parsed as { check?: { status?: unknown } } | null)?.check?.status
      const agreement =
        verdict === 'supported'
          ? 'Two independent sources agree on this. State it plainly.'
          : verdict === 'single-source'
            ? 'Only one source says this. Say it, and say that it rests on one source.'
            : verdict === 'conflicting'
              ? 'The sources disagree. Say what each says and that they disagree; do not pick one silently.'
              : undefined
      const pages = (parsed as { pages?: unknown } | null)?.pages
      if (!Array.isArray(pages)) return empty(`status 200 but no pages array in the reply`)
      if (pages.length === 0) return empty('the web had nothing usable to say')

      return pages
        .map(asPage)
        /* A page the pipeline flagged as addressing this software is not a
           source. Grounding a lesson on it would hand a stranger's
           instructions to the author under the name of a citation.
           And nor is a page the route reported as NOT about the subject: since
           2026-09-03 the route reports every page it read rather than dropping
           the ones it judged off-topic, so the judgement has to be honoured
           here instead of relied on there. A cookie wall carries no
           instruction, so `suspicious` alone would let it through. */
        .filter((page): page is { url: string; text: string; suspicious: boolean; aboutTheSubject: boolean } =>
          page !== null && !page.suspicious && page.aboutTheSubject)
        .map((page) => ({ url: page.url, content: page.text, ...(agreement === undefined ? {} : { agreement }) }))
    },
  }
}
