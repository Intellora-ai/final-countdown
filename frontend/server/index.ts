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
import { chooseProvider, GEMINI_ENDPOINT } from './provider.ts'
import { createOllamaModel, DEFAULT_OLLAMA_ENDPOINT } from './ollama.ts'
import { createGroqModel } from './groq.ts'
import type { Readable } from 'node:stream'

import { createHandler, type DoubtPort, type ModelPort, type SearchPort } from './handler.ts'
import { doubtPort } from './doubtEngine.ts'
import { createSearchPort } from './searchPort.ts'
import { createModel } from './model.ts'
import { createLedger, type Ledger } from './almanac/ledger.ts'
import { serveStatic } from './static.ts'
import { fixedWindow, type RateLimit } from './rateLimit.ts'
import { fileStore } from './almanac/fileStore.ts'
import { migrate, postgresLedger } from './almanac/postgresLedger.ts'
import { pgPool } from './almanac/pgClient.ts'

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
  /**
   * The doubt engine bridge. Absent means `/api/doubt` answers 503 with a
   * document rather than 404 — see `handler.ts`, where 404 is the symptom of
   * the route not being deployed and must not be the symptom of anything else.
   */
  readonly doubt?: DoubtPort
  readonly secrets?: readonly string[]
  /**
   * Directory holding the built browser app, served for every non-`/api` path.
   *
   * ABSENT MEANS API-ONLY, and that is the default on purpose. In development
   * Vite serves the app and proxies the API here; a server that also served a
   * stale `dist/` would answer some requests from a build made hours ago while
   * the developer watched their edits do nothing.
   */
  readonly webRoot?: string
  /**
   * Caps the routes that cost money. Absent means uncapped, which is correct
   * for a unit test and is never correct for a deployment.
   */
  readonly limiter?: RateLimit
  /**
   * Trust `x-forwarded-for` for the caller's address.
   *
   * OFF BY DEFAULT, AND THAT IS THE SAFE DIRECTION. The header is written by
   * whoever sent the request, so trusting it on a directly-exposed server lets
   * any caller mint a fresh identity per request and walk past a per-key limit.
   * Behind a load balancer the socket address is the balancer's and every
   * student shares it, so the header is the only real identity there -- which
   * is why this is a deployment decision, not a default.
   */
  readonly trustProxy?: boolean
}

/** The routes that reach a paid model or a paid search. */
const PAID = new Set(['/api/lesson', '/api/ask', '/api/doubt', '/api/search'])

/**
 * Who to count this request against.
 *
 * `/api/health` is never counted anywhere: it is what the orchestrator calls to
 * decide whether this process is alive, and a limiter that refuses it turns a
 * busy minute into a restart loop.
 */
export function callerKey(
  req: IncomingMessage,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
    /* The left-most entry is the original client; everything after it is a hop.
     * Taking the last would count the nearest proxy and lump everyone together. */
    const client = first?.split(',')[0]?.trim()
    if (client !== undefined && client !== '') return client
  }
  return req.socket.remoteAddress ?? 'unknown'
}

export function createServer(options: ServerOptions): Server {
  const handle = createHandler({
    model: options.model,
    search: options.search,
    ...(options.almanac === undefined ? {} : { almanac: options.almanac }),
    ...(options.doubt === undefined ? {} : { doubt: options.doubt }),
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

      /* THE APP ITSELF, BEFORE THE API IS CONSULTED.
       *
       * Only paths outside `/api/` are offered to the file server, so a
       * mistyped or undeployed API route keeps returning `handler.ts`'s JSON
       * 404 rather than quietly returning the app's HTML. That distinction is
       * load-bearing: a 404 there is how an operator learns a route was never
       * deployed, and HTML with a 200 would hide it completely. */
      if (options.webRoot !== undefined && !path.startsWith('/api/')) {
        const served = await serveStatic(options.webRoot, path, method, res)
        if (served) return
      }

      /* THE CAP, BEFORE THE BODY IS EVEN READ.
       *
       * Refusing here rather than inside the handler means a flood costs this
       * process one small allocation per request instead of a parsed 256 KB
       * body, and it keeps `handler.ts` a pure function of a request rather
       * than something that has to know who is calling. */
      if (options.limiter !== undefined && PAID.has(path)) {
        const key = callerKey(req, options.trustProxy === true)
        if (!options.limiter.take(key, Date.now())) {
          send(res, 429, { error: 'too many requests, please slow down' })
          return
        }
      }

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
      : provider.kind === 'groq'
        ? createGroqModel({ apiKey: provider.apiKey, model: provider.model })
        : provider.kind === 'gemini'
          /* THE SAME CLIENT. Google's `/v1beta/openai` surface speaks the
             OpenAI request and response shape Groq does, so only the base URL
             changes. A second transport for an identical protocol is how two
             providers quietly drift apart. */
          ? createGroqModel({
              apiKey: provider.apiKey,
              model: provider.model,
              endpoint: GEMINI_ENDPOINT,
            })
          : createModel({ apiKey: provider.apiKey })

  /* Only a real credential is worth scrubbing from responses. There is none in
     local mode, and listing an empty string would make `scrub` match
     everywhere. */
  /* Every credential this process holds, so `scrub` can catch one that escapes
   * into a response by a route nobody predicted. The search key is listed for
   * the same reason the model key is: `searchPort.ts` keeps it out of its own
   * messages, and this is the layer that does not have to trust that. Empty
   * strings are filtered — listing one would make `scrub` match everywhere. */
  const secrets = [
    /* EVERY credential this process holds, not just Anthropic's. A Groq key is
       exactly as leakable and exactly as worth scrubbing; listing only one
       provider's key would mean the scrub silently stopped covering the one
       actually in use. */
    ...(provider.kind === 'anthropic' || provider.kind === 'groq' || provider.kind === 'gemini' ? [provider.apiKey] : []),
    process.env['WEB_SEARCH_API_KEY'] ?? '',
  ].filter((secret) => secret.length > 0)
  /* THE REAL OPEN-WEB SEARCH, not a stub that throws.
   *
   * This read "Wired in Phase 4" and threw on every call, while the working
   * implementation sat in `vite-plugin-search.ts` behind a dev-only hook. It is
   * now `server/searchWeb.ts` and this is the port onto it. With no
   * `WEB_SEARCH_API_KEY` set it still refuses — but it refuses because the
   * provider is unconfigured, which is a fact, rather than because nobody
   * finished the wiring. */
  const search: SearchPort = createSearchPort()

  /* ALMANAC'S MEMORY, AND WHICH ONE IS CHOSEN IS A DEPLOYMENT DECISION.
   *
   * `ALMANAC_DATABASE_URL` set   -> PostgreSQL, shared by every copy of this
   *                                 process. The only option that survives
   *                                 running more than one.
   * unset                        -> one JSON file, for a single process on one
   *                                 machine, which is development.
   *
   * THE FILE IS NOT A SMALLER DATABASE, it is a different guarantee. Measured
   * on 2026-08-30 with two replicas on one shared file: 28 of 60 marks lost,
   * and 10 of 20 refused with 500 because both processes wrote the same
   * temporary filename. So a deployment that scales and leaves this unset is
   * silently losing a student's work, and the startup log says which one is in
   * use rather than leaving anybody to guess. */
  const databaseUrl = process.env['ALMANAC_DATABASE_URL']
  const ledgerPath = process.env['ALMANAC_LEDGER'] ?? 'data/almanac-ledger.json'
  const usingDatabase = databaseUrl !== undefined && databaseUrl !== ''
  const pool = usingDatabase ? pgPool({ connectionString: databaseUrl }) : undefined
  const almanac =
    pool === undefined ? createLedger(fileStore(ledgerPath)) : postgresLedger(pool)

  /* THE DOUBT ENGINE, ON THE DEPLOYED SERVER.
   *
   * `LEARNING_OS_ROOT` names the directory holding `learning-os/`, so a
   * container that puts the repository somewhere other than the working
   * directory does not have to guess. The bridge finds the interpreter from
   * there; `doubtEngine.ts` documents the order it tries. */
  const doubt = doubtPort({ root: process.env['LEARNING_OS_ROOT'] ?? process.cwd() })

  /* WHERE THE BUILT APP LIVES.
   *
   * `WEB_ROOT` is set by the image, which knows where it copied `dist/`.
   * Unset means API-only -- the development shape, where Vite serves the app.
   * Serving is therefore opt-in: a misconfigured deployment fails by not
   * showing the app, never by showing a stale one. */
  const webRoot = process.env['WEB_ROOT']

  /* SIZED FOR A CLASSROOM, NOT A PERSON. Thirty students in one room share one
   * public address, so a per-person limit would refuse most of a class at the
   * exact moment the product was being used properly. The global ceiling is
   * what actually bounds the spend. */
  const limiter = fixedWindow({
    limit: Number.parseInt(process.env['RATE_LIMIT_PER_MINUTE'] ?? '120', 10),
    windowMs: 60_000,
    globalLimit: Number.parseInt(process.env['RATE_LIMIT_GLOBAL_PER_MINUTE'] ?? '600', 10),
  })

  const server = createServer({
    model,
    search,
    almanac,
    doubt,
    secrets,
    limiter,
    trustProxy: process.env['TRUST_PROXY'] === 'true',
    ...(webRoot === undefined || webRoot === '' ? {} : { webRoot }),
  })
  /* THE SCHEMA IS APPLIED BEFORE THE FIRST REQUEST, NOT ON THE FIRST WRITE.
   *
   * `CREATE TABLE IF NOT EXISTS` is safe to run from every replica at once. A
   * process that cannot reach its database must fail HERE, loudly, rather than
   * start, log "listening", pass its health check and then return 500 to the
   * first student who marks something done -- the failure shape this codebase
   * has already been bitten by once. */
  const ready = pool === undefined ? Promise.resolve() : migrate(pool)

  ready.then(
    () => {
  server.listen(port, host, () => {
    console.log(`almanac server listening on http://${host}:${port}`)
    console.log(`  ledger: ${usingDatabase ? 'postgresql (shared by every replica)' : `${ledgerPath} (single process only)`}`)
    console.log(
      `  limits: ${process.env['RATE_LIMIT_PER_MINUTE'] ?? '120'}/min per caller, ` +
        `${process.env['RATE_LIMIT_GLOBAL_PER_MINUTE'] ?? '600'}/min overall` +
        (process.env['TRUST_PROXY'] === 'true' ? ', x-forwarded-for trusted' : ''),
    )
    console.log(webRoot === undefined || webRoot === '' ? '  app:    not served (API only -- set WEB_ROOT to serve the built app)' : `  app:    ${webRoot}`)
    console.log(`  doubt:  learning-os engine under ${process.env['LEARNING_OS_ROOT'] ?? process.cwd()}`)
    console.log(
      /* THE LINE NAMES THE PROVIDER ACTUALLY IN USE. A startup banner that said
         "anthropic" while Groq wrote the lessons would be the same quiet lie
         `chooseProvider` refuses to tell: everyone reads the log, believes the
         key is working, and nobody can explain why the lessons changed. */
      provider.kind === 'ollama'
        ? `  model:  ${provider.model} via ollama at ${provider.endpoint ?? DEFAULT_OLLAMA_ENDPOINT}`
        : provider.kind === 'groq'
          ? `  model:  ${provider.model} via groq`
          : provider.kind === 'gemini'
            ? `  model:  ${provider.model} via gemini`
            : '  model:  anthropic',
    )
    if (host !== DEFAULT_HOST) {
      console.log(
        provider.kind === 'anthropic'
          ? `WARNING: bound to ${host}, not loopback. This process holds an API key.`
          : `WARNING: bound to ${host}, not loopback.`,
      )
    }
    if (!usingDatabase) {
      console.log(
        'WARNING: the ledger is a local file. Running more than one copy of this ' +
          'process against it loses a student\'s progress. Set ALMANAC_DATABASE_URL.',
      )
    }
  })
    },
    (error: unknown) => {
      console.error(
        `almanac server: could not prepare the database: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      process.exit(1)
    },
  )
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
