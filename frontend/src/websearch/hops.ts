/**
 * §30 AND §31 — WHERE THE TIME ACTUALLY GOES, AND WHETHER CONNECTIONS ARE REUSED.
 *
 * Both sections turn out to be MEASUREMENT requirements, not machinery ones,
 * and reading them that way is most of the work:
 *
 *   §30  "Do not assume geographic proximity automatically guarantees a latency
 *         target. Measure it."
 *   §31  "Repeated requests must not incur avoidable transport overhead."
 *
 * §31 in particular is a trap for anyone who reads it as "build a connection
 * pool". `fetch` already pools connections, and a hand-rolled pool underneath
 * it would be slower, buggier, and would have to reimplement TLS session reuse
 * and HTTP/2 multiplexing to break even. What is genuinely missing is not a
 * pool but EVIDENCE that pooling is happening, which nothing here had.
 *
 * Three of §30's four hops were already being measured — `record('cached')`,
 * `stage('engine')`, `record('live')`. This file does not re-measure them; it
 * presents them as the four hops §30 names, which is the part that was absent.
 *
 * WHY THE HOP WE CANNOT SEE IS STILL REPORTED
 * -------------------------------------------
 * `userToCompute` is the request boundary, and this package starts after the
 * request has already arrived. Reporting it as 0 would be a flattering lie —
 * zero reads as "instant". Omitting it is worse in a subtler way: a report
 * showing three hops of a four-hop path reads as complete, and nobody goes
 * looking for the one that is missing. So it is present, marked
 * `observable: false`, with the reason in a FIELD rather than a comment, so a
 * caller rendering this cannot accidentally drop it.
 *
 * WHY REUSE IS NEVER INFERRED FROM REQUEST COUNT
 * ----------------------------------------------
 * The vacuous implementation reports reuse because two requests were made to
 * the same host. That is a statement about our own loop, not about the
 * transport. A hundred requests each paying full connection setup is a hundred
 * pieces of evidence that reuse is NOT happening — counting them as reuse
 * inverts the signal at exactly the moment it matters.
 *
 * Reuse is therefore evidenced only by later requests to a host costing
 * materially less than the first, and a host with a single request reports
 * `undefined` rather than `false`: one request cannot tell you either way, and
 * saying `false` would be an unsupported claim in the other direction.
 */

import { percentile, type Latency } from './latency'

/* -------------------------------------------------------------------------- */
/* §30 — hops                                                                 */
/* -------------------------------------------------------------------------- */

export const HOP_NAMES = [
  'userToCompute',
  'computeToCache',
  'computeToProvider',
  'providerToSource',
] as const

export type HopName = (typeof HOP_NAMES)[number]

export interface Hop {
  /** False when this package cannot see this hop at all. */
  observable: boolean
  /** Why it is unobservable. Present exactly when `observable` is false. */
  reason?: string
  count: number
  /** Absent when there are no samples. Never defaulted to zero. */
  p50?: number
  p99?: number
}

const unobservable = (reason: string): Hop => ({ observable: false, reason, count: 0 })

function fromSamples(values: readonly number[]): Hop {
  return {
    observable: true,
    count: values.length,
    ...(values.length === 0 ? {} : { p50: percentile(values, 50), p99: percentile(values, 99) }),
  }
}

/**
 * The four hops of §30, from measurements already being taken.
 *
 * Reads the recorder's own samples rather than adding a parallel set, so the
 * hop view and the path view can never disagree — two numbers describing the
 * same thing eventually drift, and the one nobody checks is the one that lies.
 */
export function hopsOf(latency: Latency): Record<HopName, Hop> {
  return {
    userToCompute: unobservable(
      'this package begins after the request has arrived; the client-to-server leg is measured by whatever serves the user',
    ),
    computeToCache: fromSamples(latency.samples('cached')),
    computeToProvider: fromSamples(latency.stageSamples('engine')),
    providerToSource: fromSamples(latency.samples('live')),
  }
}

/* -------------------------------------------------------------------------- */
/* §31 — connection reuse                                                     */
/* -------------------------------------------------------------------------- */

export interface RequestSample {
  host: string
  ms: number
}

export interface ReuseStat {
  requests: number
  firstMs: number
  /**
   * True when later requests cost materially less than the first.
   * `undefined` with a single request — one request cannot evidence either way,
   * and `false` would be an unsupported claim in the other direction.
   */
  reused?: boolean
  /** Median of the requests after the first. Absent when there are none. */
  subsequentP50?: number
}

/**
 * How much cheaper a later request has to be before it counts as reuse.
 *
 * Connection setup — DNS, TCP, TLS — dominates a cold request, so a warm one is
 * dramatically cheaper rather than marginally so. A tight threshold would call
 * ordinary jitter "reuse"; this one only fires on the shape setup costs
 * actually produce.
 */
const REUSE_RATIO = 0.7

export function reuseOf(samples: readonly RequestSample[]): Record<string, ReuseStat> {
  const byHost = new Map<string, number[]>()
  for (const s of samples) {
    /* A non-finite duration is not a measurement. Keeping it would poison the
       median for the whole host. */
    if (!Number.isFinite(s.ms)) continue
    const list = byHost.get(s.host) ?? []
    list.push(Math.max(0, s.ms))
    byHost.set(s.host, list)
  }

  const out: Record<string, ReuseStat> = {}
  for (const [host, times] of byHost) {
    const [first, ...rest] = times
    const subsequentP50 = rest.length === 0 ? undefined : percentile(rest, 50)
    out[host] = {
      requests: times.length,
      firstMs: first,
      ...(subsequentP50 === undefined ? {} : { subsequentP50 }),
      ...(rest.length === 0 || subsequentP50 === undefined
        ? {}
        : { reused: subsequentP50 <= first * (1 - REUSE_RATIO) }),
    }
  }
  return out
}
