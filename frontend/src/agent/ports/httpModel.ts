/**
 * The `ModelPort` the product actually uses.
 *
 * WHAT THIS FILE IS FOR. `src/agent` was written complete and left unreachable:
 * every capability, the whole teaching ledger, and no implementation of the one
 * interface that turns a plan into prose. Nothing in the app could construct an
 * agent, so nothing did. This is the missing half.
 *
 * OPENAI-SHAPED ON PURPOSE. The target is a model the user runs themselves.
 * Ollama, LM Studio, llama.cpp's server and vLLM all serve
 * `/v1/chat/completions` with the OpenAI request body, so one client reaches all
 * of them and switching models is an environment variable, not a rewrite.
 *
 * ON THE API KEY, AND THIS IS THE PART TO READ TWICE.
 *
 * Anything reaching this file from `import.meta.env.VITE_*` is COMPILED INTO THE
 * BUNDLE AND SERVED TO THE BROWSER. For a model on `localhost` that is fine:
 * the "key" is a placeholder a local runner ignores, and the traffic never
 * leaves the machine. For a hosted provider it is not fine in any degree --- a
 * key in a browser bundle is a published key, and rotating it is the only
 * remedy. `assertLocalOrKeyless` below refuses that combination rather than
 * trusting whoever configures it to remember. A hosted model needs a server-side
 * proxy holding the key, which is the same conclusion `practice/engine/
 * modelProvider.ts` reached for the same reason.
 *
 * EVERY FAILURE PATH THROWS, and that is safe by design. `loop.ts` catches
 * around `ports.model.generate` and produces an answer that says it failed with
 * `degraded` set, so the student sees an honest refusal. The one thing that must
 * never happen here is returning a plausible empty string, because verification
 * would then check it and report on it as though it were an answer.
 */
import type { GenerateRequest, ModelPort } from '../kernel/loop'

export interface HttpModelOptions {
  /** Full URL of a chat-completions endpoint. Empty means "not configured". */
  readonly endpoint: string
  /** Model name the server expects. Local runners each have their own. */
  readonly model?: string
  /** Only ever a local placeholder. See the header. */
  readonly apiKey?: string
  readonly timeoutMs?: number
  readonly maxTokens?: number
  /** Injected for tests. Defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch
}

const DEFAULT_MODEL = 'local-model'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_TOKENS = 1024
/** Enough of a server's complaint to act on, not enough to fill a log. */
const BODY_SNIPPET = 300

/** Hosts where a key in the bundle cannot leave the machine. */
function isLocal(endpoint: string): boolean {
  try {
    const h = new URL(endpoint).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h.endsWith('.local')
  } catch {
    return false
  }
}

function assertLocalOrKeyless(endpoint: string, apiKey?: string): void {
  if (apiKey && !isLocal(endpoint)) {
    throw new Error(
      `httpModel: refusing to send an API key from the browser to ${endpoint}. `
      + 'Anything in VITE_* is compiled into the bundle, so this key would be published '
      + 'and would need rotating. Point VITE_TUTOR_ENDPOINT at a local model, or put a '
      + 'server-side proxy in front of the hosted one and give the proxy the key.',
    )
  }
}

/**
 * The prompt.
 *
 * IT RESTATES DECISIONS RATHER THAN MAKING THEM. Routing, memory, research,
 * computation and verification have all already run by the time this is called.
 * The only job here is to hand the model what was decided in a form it will
 * follow, and above all to bound it to the claims that were gathered --- because
 * verification downstream checks the answer AGAINST those claims. A prompt that
 * omits them produces an answer from the model's own weights that is then
 * graded against sources it never saw.
 */
export function buildPrompt(req: GenerateRequest): { system: string; user: string } {
  const c = req.communication
  const u = req.understanding

  const system = [
    'You are a teacher. Answer the student directly and correctly.',
    '',
    'GROUNDING, AND THIS OVERRIDES EVERYTHING ELSE BELOW:',
    'Use ONLY the claims supplied under CLAIMS. Do not invent facts, figures,',
    'citations, definitions, or history. If the claims do not support an answer,',
    'say plainly what you cannot establish. A short honest answer beats a',
    'complete invented one, and inventing is the one failure that cannot be',
    'detected downstream.',
    '',
    'Never claim the student has already learned, said, or understood anything.',
    'You are not shown their history here and you must not reconstruct it.',
    '',
    `Depth: ${c.depth}. Lead with: ${c.leadWith}.`,
    `Answer in: ${c.language}.`,
    c.define.length ? `Define these before using them: ${c.define.join(', ')}.` : '',
    c.omit.length ? `Leave these out: ${c.omit.join(', ')}.` : '',
    c.representations.length ? `Preferred form: ${c.representations.join(', ')}.` : '',
    c.progressive ? 'Deliver in stages, checking understanding between them.' : '',
  ].filter(Boolean).join('\n')

  /* CONFIDENCE AND CONFLICT TRAVEL WITH THE CLAIM, because dropping them is
     how a hedged finding becomes a flat assertion. `Claim.conflict` is set when
     sources disagree and its docstring is explicit that carrying the
     disagreement forward is the point; a prompt that renders only `statement`
     collapses it to a majority answer, which is the laundering the field
     exists to prevent. */
  const claims = req.claims.length
    ? req.claims.map((k, i) => {
      const where = k.sources.map((s) => `${s.kind}:${s.ref}`).join(', ')
      const sure = k.confidence < 1 ? `  (confidence ${k.confidence.toFixed(2)} — qualify this, do not assert it flat)` : ''
      const clash = k.conflict ? `\n      SOURCES DISAGREE: ${k.conflict}. Say so; do not pick a side silently.` : ''
      return `  [${i + 1}] ${k.statement}${where ? `  (from ${where})` : ''}${sure}${clash}`
    }).join('\n')
    : '  (none — no verified claims were found for this question)'

  const computed = Object.keys(req.computed).length
    ? `\nCOMPUTED (a tool produced these; use them verbatim, do not recalculate):\n${
      Object.entries(req.computed).map(([k, v]) => `  ${k} = ${JSON.stringify(v)}`).join('\n')}`
    : ''

  const fix = req.mustFix?.length
    ? `\nTHIS IS A REPAIR PASS. Your previous answer failed these checks and this\n`
      + `attempt must fix them specifically rather than start over:\n${
        req.mustFix.map((f) => `  - ${f}`).join('\n')}`
    : ''

  const user = [
    `QUESTION: ${u.goal}`,
    u.constraints.length ? `CONSTRAINTS: ${u.constraints.join('; ')}` : '',
    '',
    'CLAIMS:',
    claims,
    computed,
    fix,
  ].filter(Boolean).join('\n')

  return { system, user }
}

/**
 * One chat turn against the endpoint. System in, user in, text out.
 *
 * WHY THIS IS SEPARATE FROM `httpModel`
 * ------------------------------------
 * `ModelPort.generate` takes a `GenerateRequest` — the agent's whole state:
 * understanding, communication plan, claims, working memory. That is the right
 * shape for the agent and the wrong shape for anything else, and the canvas's
 * lesson author needs none of it: it has a question and a set of rules.
 *
 * The alternative was a second HTTP client with its own timeout handling, its
 * own abort, its own error strings and its own key check — which is how two
 * clients end up disagreeing about what a 200-with-no-content means. So the
 * transport is extracted and both callers share it. `httpModel` is unchanged
 * from the outside: it builds the agent prompt and hands it here.
 */
export function chatOnce(options: HttpModelOptions) {
  const {
    endpoint,
    model = DEFAULT_MODEL,
    apiKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxTokens = DEFAULT_MAX_TOKENS,
    fetchImpl,
  } = options

  return async function chat(system: string, user: string): Promise<string> {
    if (!endpoint) {
      throw new Error(
        'httpModel: no model endpoint is configured, so there is nothing to ask. '
        + 'Set VITE_TUTOR_ENDPOINT to a chat-completions URL — for a local runner '
        + 'that is usually http://localhost:11434/v1/chat/completions (Ollama) or '
        + 'http://localhost:1234/v1/chat/completions (LM Studio) — and '
        + 'VITE_TUTOR_MODEL to the model name it serves.',
      )
    }
    assertLocalOrKeyless(endpoint, apiKey)

    const doFetch = fetchImpl ?? globalThis.fetch
    if (typeof doFetch !== 'function') throw new Error('httpModel: no fetch in this environment')

    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    /* A tab left open on a dead endpoint must not hold a pending request for
       the life of the session. The abort is what turns that into a `degraded`
       turn the student can read. */
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          /* Low, because this is exposition against fixed claims. Sampling
             variety here shows up as the same question answered differently
             on a retry, which reads to a student as the teacher changing its
             mind. */
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      const aborted = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(why))
      throw new Error(
        aborted
          ? `httpModel: the model at ${endpoint} did not answer within ${timeoutMs}ms, so the request timed out.`
          : `httpModel: ${endpoint} is unreachable (${why}). Check the model server is running and that it allows requests from this page.`,
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `httpModel: ${endpoint} returned ${response.status}. ${body.slice(0, BODY_SNIPPET)}`,
      )
    }

    const payload = (await response.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null
    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error(
        `httpModel: ${endpoint} answered 200 with no message content. `
        + 'Treating that as an answer would put an empty string through verification '
        + 'and report on it as though the model had replied.',
      )
    }
    return content
  }
}

export function httpModel(options: HttpModelOptions): ModelPort {
  /* The agent's prompt, over the shared transport. Everything that used to be
     inline here — the endpoint check, the key guard, the abort, the empty-body
     refusal — now lives in `chatOnce` and is shared with the lesson author. */
  const chat = chatOnce(options)

  return {
    async generate(req: GenerateRequest): Promise<string> {
      const { system, user } = buildPrompt(req)
      return chat(system, user)
    },
  }
}

