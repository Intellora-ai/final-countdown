/**
 * MEASUREMENT, KEPT HONEST BY WHAT IT REFUSES TO COMPUTE.
 *
 * THREE PATHS, NEVER ONE NUMBER
 * -----------------------------
 * Answering from local knowledge, from cache, and from a live fetch are not
 * three speeds of the same operation — they are different physics. One does no
 * I/O; one does a round trip to memory or disk; one waits on the open internet
 * and cannot beat the speed of light to the far host. Averaging them produces
 * a headline that moves when the CACHE HIT RATE moves and is read as though
 * the system got faster. So there is no combined percentile here, and the
 * tests assert its absence rather than its value.
 *
 * NEAREST-RANK, NOT INTERPOLATED
 * ------------------------------
 * An interpolated p95 reports a duration no request ever had. For a budget you
 * intend to hold yourself to, a real observation is the useful answer, and
 * "the 95th slowest of the last hundred" is a sentence an engineer can act on.
 *
 * FAILURES STAY IN THE DISTRIBUTION
 * ---------------------------------
 * Excluding timed-out requests is the most flattering bug available: every
 * slow request is dropped precisely because it was slow, and a system that
 * times out half the time reports an excellent p99. Outcomes are counted
 * separately, but their durations are counted too.
 *
 * NO AVERAGE, ANYWHERE
 * --------------------
 * Not an oversight. A mean over a long-tailed latency distribution is
 * dominated by the tail while reading like a typical case, and it is the first
 * number anyone quotes. It is not offered because it should not be quoted.
 */

export type PathKind = 'local' | 'cached' | 'live'

export type Outcome = 'ok' | 'error' | 'timeout'

export interface PathStats {
  count: number
  successes: number
  failures: number
  timeouts: number
  /** Undefined until something has been measured. Never 0, never NaN. */
  p50?: number
  p95?: number
  p99?: number
  min?: number
  max?: number
}

export interface StageStats {
  count: number
  p50?: number
  p95?: number
  p99?: number
}

export interface Summary {
  local: PathStats
  cached: PathStats
  live: PathStats
  /** Hits over hits-plus-misses. Undefined before any web request. */
  cacheHitRate?: number
  /** Only stages actually recorded appear. An absent stage is absent. */
  stages: Record<string, StageStats>
}

/**
 * The p-th percentile by nearest rank, or undefined when there is nothing to
 * report.
 *
 * `p` is exclusive of 0 because the zeroth percentile is not a thing anyone
 * means; `min` is on the stats object for that.
 */
export function percentile(values: readonly number[], p: number): number | undefined {
  if (!Number.isFinite(p) || p <= 0 || p > 100) return undefined
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

interface Bucket {
  durations: number[]
  successes: number
  failures: number
  timeouts: number
}

const emptyBucket = (): Bucket => ({ durations: [], successes: 0, failures: 0, timeouts: 0 })

/**
 * Sort once, read everything off the sorted array.
 *
 * Written this way after the 200k-sample test failed twice over. `percentile`
 * copies and sorts on every call, so asking it for p50, p95 and p99 sorted the
 * same array three times; and `Math.min(...durations)` spreads every sample
 * into an argument list, which is a RangeError once the array is large enough
 * — a crash that only appears in production volumes and never in a unit test
 * with five samples in it.
 */
function fromSorted(sorted: readonly number[], p: number): number | undefined {
  if (!sorted.length) return undefined
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

function statsOf(b: Bucket): PathStats {
  const sorted = [...b.durations].sort((x, y) => x - y)
  return {
    count: sorted.length,
    successes: b.successes,
    failures: b.failures,
    timeouts: b.timeouts,
    p50: fromSorted(sorted, 50),
    p95: fromSorted(sorted, 95),
    p99: fromSorted(sorted, 99),
    min: sorted.length ? sorted[0] : undefined,
    max: sorted.length ? sorted[sorted.length - 1] : undefined,
  }
}

export class Latency {
  private readonly paths: Record<PathKind, Bucket> = {
    local: emptyBucket(),
    cached: emptyBucket(),
    live: emptyBucket(),
  }

  private readonly stages = new Map<string, number[]>()

  /**
   * One completed request.
   *
   * A non-finite or negative duration is DROPPED rather than stored. It is
   * not a measurement — it is a bug upstream — and admitting it would move
   * every percentile computed afterwards.
   */
  record(path: PathKind, ms: number, outcome: Outcome = 'ok'): void {
    const bucket = this.paths[path]
    if (!bucket) return
    if (!Number.isFinite(ms) || ms < 0) return
    bucket.durations.push(ms)
    if (outcome === 'timeout') bucket.timeouts += 1
    else if (outcome === 'error') bucket.failures += 1
    else bucket.successes += 1
  }

  /** One stage of the pipeline, so the budget can be attributed. */
  stage(name: string, ms: number): void {
    if (!name || !Number.isFinite(ms) || ms < 0) return
    const list = this.stages.get(name)
    if (list) list.push(ms)
    else this.stages.set(name, [ms])
  }

  /**
   * A snapshot, detached from the log.
   *
   * Copied on the way out so a caller holding a summary is not silently
   * mutated by later traffic — a dashboard that changes under a reader is a
   * dashboard nobody can quote.
   */
  summary(): Summary {
    const cachedCount = this.paths.cached.durations.length
    const liveCount = this.paths.live.durations.length
    const web = cachedCount + liveCount

    const stages: Record<string, StageStats> = {}
    for (const [name, values] of this.stages) {
      const sorted = [...values].sort((x, y) => x - y)
      stages[name] = {
        count: sorted.length,
        p50: fromSorted(sorted, 50),
        p95: fromSorted(sorted, 95),
        p99: fromSorted(sorted, 99),
      }
    }

    return {
      local: statsOf(this.paths.local),
      cached: statsOf(this.paths.cached),
      live: statsOf(this.paths.live),
      /* Local answers are excluded on purpose: not having needed the web is
         not a cache hit, and folding them in inflates the very number the
         cache is meant to be judged by. */
      ...(web ? { cacheHitRate: cachedCount / web } : {}),
      stages,
    }
  }
}
