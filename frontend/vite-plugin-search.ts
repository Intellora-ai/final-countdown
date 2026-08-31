import type { Plugin } from 'vite'

import { MemoryCache } from './src/websearch/gather'

import {
  ENDPOINT,
  API_KEY_ENV,
  ENDPOINT_ENV,
  failed,
  MAX_SEARCH_BODY_BYTES,
  searchTheOpenWeb,
  type FetchJson,
  type SearchDeps,
  type SearchReply,
  type SearchReplyBody,
  type SearchedPage,
} from './server/searchWeb'

/**
 * THE DEV-SERVER ADAPTER FOR OPEN-WEB SEARCH.
 *
 * The search itself lives in `server/searchWeb.ts`, beside the server that is
 * deployed. This file is the piece that hangs it off the Vite dev server.
 */

export {
  ENDPOINT,
  API_KEY_ENV,
  ENDPOINT_ENV,
  MAX_SEARCH_BODY_BYTES,
  searchTheOpenWeb,
}
export type { FetchJson, SearchDeps, SearchReply, SearchReplyBody, SearchedPage }

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
          if (size > MAX_SEARCH_BODY_BYTES) {
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
