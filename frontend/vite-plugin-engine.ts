import { resolve as resolvePath } from 'node:path'
import type { Plugin } from 'vite'

import {
  askEngine,
  ENGINE_PYTHON_ENV,
  explainStderr,
  interpreterFor,
  MAX_BODY_BYTES,
  type DoubtEngineOptions,
  type EngineReply,
} from './server/doubtEngine'

/**
 * THE DEV-SERVER ADAPTER FOR THE DOUBT ENGINE.
 *
 * The bridge itself now lives in `server/doubtEngine.ts`, beside the server that
 * is actually deployed. See that file for why the direction is this way round.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER
 * -------------------------------------
 * A production build. `vite build` produces static files and this middleware is
 * not among them. That is still true and it is no longer a gap: the deployed
 * answer to `/api/doubt` is `server/handler.ts`, serving the same bridge through
 * the same `askEngine`.
 */

/** Re-exported so existing callers and tests keep one import site. */
export { askEngine, ENGINE_PYTHON_ENV, explainStderr, interpreterFor, MAX_BODY_BYTES }
export type { DoubtEngineOptions, EngineReply }

/** Kept for source compatibility with callers that named the old type. */
export type EnginePluginOptions = DoubtEngineOptions

/** The one route. Relative, so it cannot leak a key it never has. */
export const ENDPOINT = '/api/doubt'

/**
 * Attach the route to the dev server.
 *
 * `configureServer` only — deliberately no `configurePreviewServer`. `vite
 * preview` serves the production build, and pretending the engine is present
 * there would make a build behave one way locally and another way deployed,
 * which is worse than it plainly being absent in both.
 */
export function enginePlugin(options: EnginePluginOptions = {}): Plugin {
  return {
    name: 'learning-os-engine',
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
            response.statusCode = 413
            response.setHeader('content-type', 'application/json')
            response.end(
              JSON.stringify({ outcome: 'bad_request', refusal: 'that question is too long' }),
            )
            request.destroy()
            return
          }
          chunks.push(chunk)
        })

        request.on('end', () => {
          if (aborted) return
          void askEngine(Buffer.concat(chunks).toString('utf8'), {
            root: options.root ?? resolvePath(server.config.root, '..'),
            ...(options.python === undefined ? {} : { python: options.python }),
          }).then((reply) => {
            response.statusCode = reply.status
            response.setHeader('content-type', 'application/json')
            response.end(reply.body)
          })
        })
      })
    },
  }
}
