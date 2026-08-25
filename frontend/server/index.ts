#!/usr/bin/env node
/**
 * THE ALMANAC SERVER
 *
 * One Node process. It holds the API key, talks to the model, and hands the
 * browser lessons that have already been validated.
 *
 * WHY IT BINDS TO LOOPBACK BY DEFAULT
 *     This process holds a credential. Binding every interface by default puts
 *     it on the local network of whatever machine runs it, which on a laptop in
 *     a cafe is the cafe. Deployment sets HOST deliberately.
 *
 * WHY THE BODY IS CAPPED WHILE IT IS READ
 *     Reading a request fully and then measuring it means one request can
 *     exhaust memory. The cap is enforced per chunk, and the connection is torn
 *     down the moment it is passed. Content-Length is not trusted: it is a claim
 *     by the client, and the bytes are the fact.
 */

import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { chooseProvider } from './provider.ts'
import { createOllamaModel, DEFAULT_OLLAMA_ENDPOINT } from './ollama.ts'
import type { Readable } from 'node:stream'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { createModel } from './model.ts'
import { createLedger, type Ledger } from './almanac/ledger.ts'
import { fileStore } from './almanac/fileStore.ts'

/** Loopback. Override with HOST only when the exposure is intended. */
export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8787
const MAX_BODY_BYTES = 256 * 1024

export type BodyResult =
  | { ok: true; value: Record<string, unknown>; bytes: number }
  | { ok: false; reason: 'too-large' | 'malformed'; bytes: number }

/** Read at most `maxBytes`, then parse. Never buffers past the cap. */
export async function readJsonBody(stream: Readable, maxBytes: number): Promise<BodyResult> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of stream) {
    /* The stream's async iterator is typed as unknown: it yields Buffers in
     * practice, and strings when an encoding has been set on it. Both are
     * handled rather than assumed. */
    const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.length
    if (bytes > maxBytes) {
      /* Stop pulling. Everything already read is dropped unparsed. */
      if (typeof (stream as { destroy?: unknown }).destroy === 'function') {
        (stream as unknown as { destroy(): void }).destroy()
      }
      return { ok: false, reason: 'too-large', bytes }
    }
    chunks.push(buffer)
  }

  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return { ok: true, value: {}, bytes }

  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: 'malformed', bytes }
    }
    return { ok: true, value: parsed as Record<string, unknown>, bytes }
  } catch {
    return { ok: false, reason: 'malformed', bytes }
  }
}

export interface ServerOptions {
  readonly model: ModelPort
  readonly search: SearchPort
  readonly almanac?: Ledger
  readonly secrets?: readonly string[]
}

export function createServer(options: ServerOptions): Server {
  const handle = createHandler({
    model: options.model,
    search: options.search,
    ...(options.almanac === undefined ? {} : { almanac: options.almanac }),
    secrets: options.secrets,
    maxBodyBytes: MAX_BODY_BYTES,
  })

  const send = (res: ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      /* Nothing here is ever a document, so nothing here should be sniffed. */
      'x-content-type-options': 'nosniff',
    })
    res.end(payload)
  }

  return createNodeServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const path = (req.url ?? '/').split('?')[0]
      const method = req.method ?? 'GET'

      if (method !== 'POST') {
        const response = await handle({ method, path })
        send(res, response.status, response.body)
        return
      }

      const body = await readJsonBody(req, MAX_BODY_BYTES)
      if (!body.ok) {
        const status = body.reason === 'too-large' ? 413 : 400
        send(res, status, {
          error: body.reason === 'too-large' ? 'request too large' : 'body must be a JSON object',
        })
        return
      }

      const response = await handle({ method, path, body: body.value, rawLength: body.bytes })
      send(res, response.status, response.body)
    })().catch((error: unknown) => {
      /* TWO HALVES, AND BOTH ARE REQUIRED.
       *
       * The client learns nothing, because a stack trace is a map of the
       * machine. The OPERATOR learns everything, because otherwise a failure
       * cannot be diagnosed at all -- and that is not hypothetical: a missing
       * ledger directory returned 500 "internal error" with NOTHING written
       * anywhere, while the process went on looking perfectly healthy.
       *
       * Logged to stderr rather than to a response, and never through `send`. */
      console.error('[almanac] unhandled error while serving a request:', error)
      if (!res.headersSent) send(res, 500, { error: 'internal error' })
    })
  })
}

/* ---------------------------------------------------------------- CLI ---- */

function main(): void {
  const host = process.env['HOST'] ?? DEFAULT_HOST
  const port = Number.parseInt(process.env['PORT'] ?? String(DEFAULT_PORT), 10)

  /* Explicit, never clever. `OLLAMA_MODEL` picks the local model; a key picks
     Anthropic; neither refuses to start. A silent fallback would teach a
     student with a 3B model on a laptop while everyone believed the key was
     working. */
  const provider = chooseProvider(process.env as Record<string, string | undefined>)
  const model =
    provider.kind === 'ollama'
      ? createOllamaModel({ model: provider.model, ...(provider.endpoint === undefined ? {} : { endpoint: provider.endpoint }) })
      : createModel({ apiKey: provider.apiKey })

  /* Only a real credential is worth scrubbing from responses. There is none in
     local mode, and listing an empty string would make `scrub` match
     everywhere. */
  const secrets = provider.kind === 'anthropic' ? [provider.apiKey] : []
  const search: SearchPort = {
    /* Wired in Phase 4. Until then the route answers honestly rather than
     * pretending to have searched. */
    async search() {
      throw new Error('search is not configured')
    },
  }

  /* Almanac's memory. One JSON file beside the curriculum it plans against. */
  const ledgerPath = process.env['ALMANAC_LEDGER'] ?? 'data/almanac-ledger.json'
  const almanac = createLedger(fileStore(ledgerPath))

  const server = createServer({ model, search, almanac, secrets })
  server.listen(port, host, () => {
    console.log(`almanac server listening on http://${host}:${port}`)
    console.log(`  ledger: ${ledgerPath}`)
    console.log(
      provider.kind === 'ollama'
        ? `  model:  ${provider.model} via ollama at ${provider.endpoint ?? DEFAULT_OLLAMA_ENDPOINT}`
        : '  model:  anthropic',
    )
    if (host !== DEFAULT_HOST) {
      console.log(
        provider.kind === 'anthropic'
          ? `WARNING: bound to ${host}, not loopback. This process holds an API key.`
          : `WARNING: bound to ${host}, not loopback.`,
      )
    }
  })
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  try {
    main()
  } catch (error) {
    /* Someone is starting this by hand. A missing key is a setup problem, and a
     * stack trace buries the one line that says which. */
    console.log(`almanac server: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
