/**
 * The canvas's view of the situation: the questions this product still owes.
 *
 * WHY THE SHAPES ARE DECLARED HERE AND NOT IMPORTED FROM THE SERVER.
 * The same layering rule as `webResolver.ts`: `tsconfig.canvas.json` checks
 * this directory under `noUncheckedIndexedAccess`, and importing a server
 * module drags that project's files into the stricter config. The canvas
 * depends on WHAT it needs from the route, stated structurally; the server's
 * `openLoops.ts` satisfies it, and the route tests hold the two in agreement.
 *
 * EVERY FAILURE IS SILENCE, BY DESIGN. This whole ledger is a courtesy — a
 * card on arrival, an entry written when an answer could not be given. A
 * courtesy that can break the asking of questions has forgotten what it is,
 * so: reads degrade to "no loops", writes are fire-and-forget, and nothing
 * here ever throws into a learner's flow.
 */

export interface OpenLoop {
  readonly question: string
  readonly lesson: string
  readonly stalled: 'refused' | 'failed'
  readonly at: string
}

/** What `answering.ts` needs in order to keep the ledger honest. */
export interface SituationPort {
  /** An answer could not be given; the product now owes one. */
  opened(loop: { question: string; lesson: string; stalled: 'refused' | 'failed' }): void
  /** A real answer was given for this question; the debt (if any) is settled. */
  resolved(question: string): void
}

const ROUTE = '/api/situation'

type FetchLike = typeof fetch

/**
 * The loops this student holds, or [] for every kind of nothing: no server,
 * a 503 from an unconfigured one, a shape this client cannot read.
 */
export async function fetchOpenLoops(fetchImpl?: FetchLike): Promise<readonly OpenLoop[]> {
  const doFetch = fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') return []
  let payload: unknown
  try {
    const response = await doFetch(ROUTE)
    if (!response.ok) return []
    payload = await response.json()
  } catch {
    return []
  }
  if (typeof payload !== 'object' || payload === null) return []
  const raw = (payload as Record<string, unknown>)['openLoops']
  if (!Array.isArray(raw)) return []
  const out: OpenLoop[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const question = record['question']
    const lesson = record['lesson']
    const stalled = record['stalled']
    const at = record['at']
    if (typeof question !== 'string' || question.trim() === '') continue
    if (stalled !== 'refused' && stalled !== 'failed') continue
    out.push({
      question,
      lesson: typeof lesson === 'string' ? lesson : '',
      stalled,
      at: typeof at === 'string' ? at : '',
    })
  }
  return out
}

/** The write half: PUTs that never surface a failure. */
export function situationClient(fetchImpl?: FetchLike): SituationPort {
  const doFetch = fetchImpl ?? globalThis.fetch
  const put = (body: Record<string, unknown>): void => {
    if (typeof doFetch !== 'function') return
    void doFetch(ROUTE, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      /* A ledger write that failed is a courtesy that did not happen. */
    })
  }
  return {
    opened(loop) {
      put({ question: loop.question, lesson: loop.lesson, stalled: loop.stalled })
    },
    resolved(question) {
      put({ question, resolved: true })
    },
  }
}
