import type { Plugin } from 'vite'

import { ENDPOINT, MAX_BODY_BYTES, failed, searchTheOpenWeb } from './server/openweb'
import { MemoryCache } from './src/websearch/gather'

/**
 * THE VITE ADAPTER, AND NOTHING ELSE.
 *
 * The whole open-web pipeline -- env contract, provider reading, redaction,
 * `searchTheOpenWeb` -- lived here until the production server wired the same
 * route. It moved VERBATIM to `server/openweb.ts` so both servers answer
 * through one function; the reasoning is written at the top of that file.
 * What remains here is only what vite itself needs: the middleware glue.
 *
 * The re-exports below keep every existing import of this file true.
 */
export {
  API_KEY_ENV,
  ENDPOINT,
  ENDPOINT_ENV,
  searchTheOpenWeb,
} from './server/openweb'
export type {
  FetchJson,
  SearchDeps,
  SearchReply,
  SearchReplyBody,
  SearchedPage,
} from './server/openweb'

/**
 * Attach the route to the dev server.
 *
 * `configureServer` only, deliberately — matching `/api/doubt`. `vite preview`
 * serves the production build, and pretending the route exists there would make
 * a build behave one way locally and another way deployed. Plainly absent in
 * both is the honest failure.
 */
/**
 * One cache for the life of the dev server.
 *
 * Module-level so a second learner asking the same question pays nothing, and
 * created HERE rather than defaulted inside `searchTheOpenWeb`, so tests get
 * isolation for free. `provenance.freshnessOf` already reports a cached page
 * as not-live, which is what keeps this from trading a correctness property
 * for latency.
 */
const CACHE = new MemoryCache()

export function searchPlugin(): Plugin {
  return {
    name: 'learning-os-web-search',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        let aborted = false

        request.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BODY_BYTES) {
            aborted = true
            const tooLong = failed(413, 'that question is too long', '')
            response.statusCode = tooLong.status
            response.setHeader('content-type', 'application/json')
            response.end(tooLong.body)
            request.destroy()
            return
          }
          chunks.push(chunk)
        })

        request.on('end', () => {
          if (aborted) return
          void searchTheOpenWeb(Buffer.concat(chunks).toString('utf8'), { cache: CACHE }).then((out) => {
            response.statusCode = out.status
            response.setHeader('content-type', 'application/json')
            response.end(out.body)
          })
        })
      })
    },
  }
}
