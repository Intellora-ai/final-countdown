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
import { chooseProvider, hostedProviders, type OpenAiCompatible } from './provider.ts'
import { createOllamaModel, DEFAULT_OLLAMA_ENDPOINT } from './ollama.ts'
import { createGroqModel, DEFAULT_GROQ_MODEL } from './groq.ts'
import { failover } from './failover.ts'
import { pgStore } from './almanac/pgStore.ts'
import { sqliteMemoryStore } from './memory/sqliteStore.ts'
import { canvasMemory, type CanvasMemory } from './memory/store.ts'
import { explanationsIn, type Explanations } from './memory/explanations.ts'
import { writtenLessons, type WrittenLessons } from './memory/lessons.ts'
import type { Readable } from 'node:stream'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { resolveIdentitySecret } from './identity.ts'
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
      /* STOP PULLING, BUT DO NOT TEAR DOWN THE CONNECTION HERE.
       *
       * This used to call `stream.destroy()`, and destroying the REQUEST
       * destroys the socket the RESPONSE has to travel back on -- so the 413
       * the caller is about to send could never arrive. Measured: a save just
       * over the limit came back as "the connection was dropped: Remote end
       * closed connection without response". A person who saved too much was
       * told nothing at all, which is the worst of both outcomes.
       *
       * Returning is enough to stop reading. The caller answers in words and
       * closes the socket afterwards -- see where this is called. */
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
  /** The canvas's memory. Absent means /api/memory answers 503, never a guess. */
  readonly memory?: CanvasMemory
  /** What she has already been told. Absent means the caller's list is trusted alone. */
  readonly explanations?: Explanations
  /** Lessons any learner can read. Absent means every ask is authored. */
  readonly lessons?: WrittenLessons
  /** The key identities are signed with. No default; see `identity.ts`. */
  readonly identitySecret: string
  readonly secrets?: readonly string[]
}

export function createServer(options: ServerOptions): Server {
  const handle = createHandler({
    model: options.model,
    search: options.search,
    ...(options.almanac === undefined ? {} : { almanac: options.almanac }),
    ...(options.memory === undefined ? {} : { memory: options.memory }),
    ...(options.explanations === undefined ? {} : { explanations: options.explanations }),
    ...(options.lessons === undefined ? {} : { lessons: options.lessons }),
    identitySecret: options.identitySecret,
    secrets: options.secrets,
    maxBodyBytes: MAX_BODY_BYTES,
  })

  const send = (res: ServerResponse, status: number, body: unknown, setCookie?: string): void => {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      /* Nothing here is ever a document, so nothing here should be sniffed. */
      'x-content-type-options': 'nosniff',
      /* Sent only when the handler minted an identity. Spread rather than set
       * to undefined: `writeHead` renders an undefined value as the string
       * "undefined", which would plant a cookie header that means nothing. */
      ...(setCookie === undefined ? {} : { 'set-cookie': setCookie }),
    })
    res.end(payload)
  }

  return createNodeServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const asked = req.url ?? '/'
      const cut = asked.indexOf('?')
      const path = cut === -1 ? asked : asked.slice(0, cut)
      /* Carried rather than discarded: a memory read names what it wants in the
       * query, and this line used to throw that away. */
      const query = cut === -1 ? '' : asked.slice(cut + 1)
      const method = req.method ?? 'GET'

      /* WHICH VERBS CARRY A BODY, ASKED OF THE VERB RATHER THAN HARDCODED TO
       * POST.
       *
       * This read a body only for POST, so the first PUT this server ever
       * received arrived with nothing attached and was refused with "body must
       * be a JSON object" -- a message that blames the caller for a body it did
       * send. Measured: every memory write failed that way.
       *
       * PUT carries a body by definition; GET and HEAD do not. Naming the verbs
       * that DO is the version of this line that does not have to be revisited
       * the next time a route needs one. */
      const carriesABody = method === 'POST' || method === 'PUT' || method === 'PATCH'

      /* The raw Cookie header, carried through untouched. `identity.ts` parses
       * it, because parsing a header is not the transport's job and doing it in
       * two places is how the two disagree. */
      /* JOINED RATHER THAN INDEXED. Node types a header as `string | string[]`
       * because some headers legally repeat. Taking `[0]` would silently drop
       * every cookie after the first, so a student whose browser also holds an
       * unrelated cookie could lose her identity depending on ordering. */
      const rawCookie = req.headers['cookie']
      const cookie = Array.isArray(rawCookie) ? rawCookie.join('; ') : rawCookie

      if (!carriesABody) {
        const response = await handle({ method, path, query, cookie })
        send(res, response.status, response.body, response.setCookie)
        return
      }

      const body = await readJsonBody(req, MAX_BODY_BYTES)
      if (!body.ok) {
        const status = body.reason === 'too-large' ? 413 : 400
        send(res, status, {
          error: body.reason === 'too-large' ? 'request too large' : 'body must be a JSON object',
        })
        /* ANSWER FIRST, THEN CUT THE FLOOD OFF. The rest of an oversized body
         * is still arriving and nothing will read it, so the socket is closed
         * once the reply is written -- in that order, because closing first is
         * what stopped the reply being delivered at all. */
        if (body.reason === 'too-large' && typeof req.destroy === 'function') {
          req.destroy()
        }
        return
      }

      const response = await handle({ method, path, query, cookie, body: body.value, rawLength: body.bytes })
      send(res, response.status, response.body, response.setCookie)
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
  /* One branch per provider, spelled out. A ternary chain here would be the
     one place where a wrong branch sends a credential to the wrong host. */
  let model
  /* The hosted clients this process can send to, or none. Read once; see below. */
  let hosted: readonly OpenAiCompatible[] = []
  if (provider.kind === 'ollama') {
    model = createOllamaModel({
      model: provider.model,
      ...(provider.endpoint === undefined ? {} : { endpoint: provider.endpoint }),
    })
  } else if (provider.kind === 'openai-compatible') {
    /* One client, five hosts. See `provider.ts`: Groq, Moonshot (Kimi), Z.ai
       (GLM), NVIDIA NIM and DeepSeek all speak this exact shape, and a second
       copy of the retry policy and the deadline would be a second place for
       both to drift. */
    /*
     * EVERY CONFIGURED HOST, NOT JUST THE WINNER. See `failover.ts`.
     *
     * `chooseProvider` picked one and stopped, so a spent daily budget stopped
     * the product outright -- measured here as Groq reaching `Used 198032` of
     * 200,000 tokens per DAY in one afternoon, after which every lesson
     * answered "the model could not be reached". Standbys are asked only when
     * the primary cannot answer, and only for failures another host could
     * actually fix, so which vendor teaches on a healthy day is unchanged.
     *
     * The first entry IS `provider` -- `hostedProviders` walks the same
     * `VENDORS` list in the same order -- so a single-key setup builds exactly
     * the client it built before and `failover` hands it straight back.
     */
    /* READ ONCE. This was called here and again for the secrets list below, so
       two walks of a MUTABLE `process.env` produced two views of the same
       thing -- and a value changed between them would have built a client
       whose key was not in the scrub list, which is the exact gap the secrets
       fix closed. One list, used twice, cannot disagree with itself. */
    hosted = hostedProviders(process.env)
    model = failover(
      hosted.map((each) => ({
        vendor: each.vendor,
        model: createGroqModel({
          apiKey: each.apiKey,
          model: each.model,
          baseUrl: each.baseUrl,
          /* So a blank key names the variable the operator actually set, not
             `GROQ_API_KEY` for all five hosts. See `GroqOptions.keyVar`. */
          keyVar: each.keyVar,
        }),
      })),
    )
  } else {
    model = createModel({ apiKey: provider.apiKey })
  }

  /* Only a real credential is worth scrubbing from responses. There is none in
     local mode, and listing an empty string would make `scrub` match
     everywhere. */
  /* Every real credential is scrubbed from responses. Listing an empty string
     would make `scrub` match everywhere, so local mode contributes none. */
  /*
   * EVERY CREDENTIAL IN PLAY, NOT JUST THE ONE THAT WON.
   *
   * This listed `provider.apiKey` alone, which was exactly right while
   * `chooseProvider` picked one vendor and no other key was ever read. Failover
   * builds a client for EVERY configured vendor, so the number of live
   * credentials grew and the number being scrubbed did not: an operator holding
   * Groq and Moonshot keys had the Moonshot one unprotected the moment Groq ran
   * dry and the standby started answering.
   *
   * `scrub` removes each listed secret from responses, so the list has to be
   * the set of keys this process can send -- which is precisely the set
   * `hostedProviders` builds clients from.
   */
  const secrets =
    provider.kind === 'openai-compatible'
      ? hosted.map((each) => each.apiKey)
      : provider.kind === 'anthropic'
        ? [provider.apiKey]
        : []
  const search: SearchPort = {
    /* Wired in Phase 4. Until then the route answers honestly rather than
     * pretending to have searched. */
    async search() {
      throw new Error('search is not configured')
    },
  }

  /* ALMANAC'S MEMORY. A shared database when one is named, a file otherwise.
   *
   * The file is correct for ONE server and wrong for two, and it fails loudly
   * rather than quietly: measured through the real product, two replicas
   * sharing one ledger file answered FIFTEEN of twenty concurrent "mark done"
   * requests with 500, because both wrote the whole file at once. See
   * `pgStore.ts`.
   *
   * Explicit, never clever -- the same rule `provider.ts` follows for models. A
   * server that silently fell back to a file when the database was unreachable
   * would lose a class's work while every check stayed green. */
  const databaseUrl = process.env['ALMANAC_DATABASE_URL']
  const ledgerPath = process.env['ALMANAC_LEDGER'] ?? 'data/almanac-ledger.json'
  const store = databaseUrl === undefined || databaseUrl.trim() === ''
    ? fileStore(ledgerPath)
    : pgStore({ connectionString: databaseUrl.trim() })
  const almanac = createLedger(store)

  /* THE CANVAS'S MEMORY. One SQLite file beside the ledger.
   *
   * Named rather than defaulted to `:memory:`: a server that silently forgot
   * everything on restart, while answering every save with "saved", is exactly
   * the quiet failure this project keeps guarding against. */
  const memoryPath = process.env['CANVAS_MEMORY_DB'] ?? 'data/canvas-memory.db'
  /*
   * ONE STORE, TWO READERS, AND THAT IS THE POINT.
   *
   * `canvasMemory` holds what the canvas saved; `explanationsIn` holds what she
   * has already been told. Both go in the SAME file, through the same
   * transactional `update`, so a lesson's progress and its explanation history
   * cannot disagree about whether a write happened -- and Phase 3 inherits
   * every durability and isolation proof Phases 1 and 2 already paid for
   * instead of arguing them again in a second engine.
   */
  const memoryStore = sqliteMemoryStore(memoryPath)
  const memory = canvasMemory({ store: memoryStore })
  const explanations = explanationsIn(memoryStore)
  /* One shelf of written lessons, shared by every learner. See `memory/lessons.ts`. */
  const lessons = writtenLessons(memoryStore)

  /* THE IDENTITY SECRET. REQUIRED, AND THE SERVER REFUSES TO START WITHOUT IT.
   *
   * NO GENERATED DEFAULT, WHICH IS THE TEMPTING VERSION AND IS WRONG TWICE.
   * A secret invented at boot changes on every restart, so every student's
   * cookie stops verifying and everyone silently becomes a new person with an
   * empty memory -- the exact "it forgot everything" failure the line above
   * refuses for the database. And with two replicas, each would invent its own,
   * so a student would be a different person depending on which one answered.
   *
   * Refusing to boot is louder than either, and loud is the point. */
  const configuredSecret = (process.env['ALMANAC_IDENTITY_SECRET'] ?? '').trim()
  const secretPath = process.env['ALMANAC_IDENTITY_SECRET_FILE'] ?? 'data/identity-secret'
  const resolved = configuredSecret === ''
    ? resolveIdentitySecret(secretPath)
    : { secret: configuredSecret, generated: false }
  const identitySecret = resolved.secret

  const server = createServer({ model, search, almanac, memory, explanations, lessons, identitySecret, secrets })
  server.listen(port, host, () => {
    console.log(`almanac server listening on http://${host}:${port}`)
    console.log(`  memory: ${memoryPath} (sqlite, safe for many servers)`)
    /* SAID AT STARTUP, NOT LEFT TO BE DISCOVERED. The file-backed secret is
     * correct on one machine and silently wrong on two: each would generate its
     * own, and a student would be a different person depending on which replica
     * answered. Naming the limit is the difference between a documented
     * boundary and an outage nobody can explain. */
    console.log(
      configuredSecret !== ''
        ? '  identity: ALMANAC_IDENTITY_SECRET (shared — safe for many servers)'
        : `  identity: ${secretPath} (${resolved.generated ? 'generated just now' : 'reused'} — safe for ONE machine only)`,
    )
    console.log(
      databaseUrl === undefined || databaseUrl.trim() === ''
        ? `  ledger: ${ledgerPath} (one file — safe for ONE server only)`
        : '  ledger: postgres (shared, safe for many servers)',
    )
    console.log(
      provider.kind === 'ollama'
        ? `  model:  ${provider.model} via ollama at ${provider.endpoint ?? DEFAULT_OLLAMA_ENDPOINT}`
        : provider.kind === 'openai-compatible'
          /* THE VENDOR IS NAMED, NOT JUST THE MODEL. With five hosts behind one
             client, "gpt-oss-120b" alone does not say which account is being
             spent or which endpoint a failure came from. */
          ? `  model:  ${provider.model} via ${provider.vendor}`
          : '  model:  anthropic',
    )
    if (host !== DEFAULT_HOST) {
      console.log(
        provider.kind === 'anthropic' || provider.kind === 'openai-compatible'
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
