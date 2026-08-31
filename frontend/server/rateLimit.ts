/**
 * HOW MANY PAID REQUESTS ONE CALLER MAY MAKE.
 *
 * WHY THIS EXISTS
 *     `/api/lesson`, `/api/ask`, `/api/doubt` and `/api/search` each reach a
 *     model that charges per token. Before this file there was no cap of any
 *     kind, on any route: a single loop from a single machine could spend the
 *     whole budget, and nothing would refuse it or even report it.
 *
 * WHY THE PER-KEY LIMIT IS DELIBERATELY GENEROUS
 *     This is a school product. Thirty students in one classroom reach this
 *     server from ONE public address, so a limit tuned for one person refuses
 *     most of a class -- and it does it at the exact moment the product is
 *     being used properly, which reads to everyone involved as the product
 *     being broken. The per-key limit is therefore sized for a room, not a
 *     person.
 *
 * WHY THERE IS ALSO A GLOBAL CEILING
 *     A per-key limit cannot bound the bill, because nothing bounds the NUMBER
 *     of keys. Ten thousand addresses each politely inside their own limit is
 *     still ten thousand times the cost. The global ceiling is the one that
 *     actually protects the account; the per-key limit is what keeps one caller
 *     from consuming it alone.
 *
 * WHAT THE PER-KEY LIMIT IS AND IS NOT
 *     Best effort. A bounded table keyed on a caller-controlled value can
 *     always be flushed by inventing keys, so a determined caller evicts their
 *     own throttled entry and returns with a full budget. Measured, not
 *     assumed: a test asserting otherwise failed against this implementation
 *     and would have failed against any other. Pinning refused keys only moves
 *     the flood onto a different victim.
 *
 *     So per-key stops ONE IMPOLITE CALLER, and the global ceiling is what
 *     stops a determined one -- it counts requests, which cannot be invented,
 *     rather than callers, which can.
 *
 * WHY THE KEY TABLE IS BOUNDED
 *     The map is keyed on a value the caller controls. An unbounded one is the
 *     same defect this server just closed in the ledger -- unlimited growth
 *     from anonymous requests -- so a limiter without a cap here would be a
 *     denial of service wearing a safety vest.
 *
 * WHY TIME IS A PARAMETER
 *     A limiter that reads the clock cannot be tested at the boundary, and the
 *     boundary is the entire behaviour.
 *
 * WHAT THIS IS NOT
 *     Not distributed. Each process counts its own requests, so N replicas
 *     admit N times the ceiling. That is honest for a single instance and is
 *     recorded rather than hidden; a shared counter belongs with the shared
 *     ledger, not before it.
 */

export interface RateLimit {
  /** True when this request may proceed. Consumes budget only when it does. */
  take(key: string, now: number): boolean
  /** How many keys are currently tracked. Exposed so the bound is testable. */
  size(): number
}

export interface RateLimitOptions {
  /** Requests one key may make per window. Sized for a classroom, not a person. */
  readonly limit: number
  readonly windowMs: number
  /** Requests ALL keys together may make per window. This is the bill guard. */
  readonly globalLimit: number
  /** Most keys tracked at once. Oldest-touched are dropped first. */
  readonly maxKeys?: number
}

interface Counter {
  windowStart: number
  used: number
}

const DEFAULT_MAX_KEYS = 10_000

export function fixedWindow(options: RateLimitOptions): RateLimit {
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS
  /* Insertion order is what makes eviction "oldest touched": a key is deleted
   * and re-set on every hit, so it moves to the end. */
  const counters = new Map<string, Counter>()
  let globalWindowStart = 0
  let globalUsed = 0
  let started = false

  return {
    take(key, now) {
      if (!started) {
        globalWindowStart = now
        started = true
      }

      /* THE GLOBAL CEILING IS CHECKED FIRST and it is checked for every caller,
       * including one never seen before. Checking per-key first would let a
       * flood of fresh keys past the ceiling one request each. */
      if (now - globalWindowStart >= options.windowMs) {
        globalWindowStart = now
        globalUsed = 0
      }
      if (globalUsed >= options.globalLimit) return false

      const existing = counters.get(key)
      const counter: Counter =
        existing === undefined || now - existing.windowStart >= options.windowMs
          ? { windowStart: now, used: 0 }
          : existing

      if (counter.used >= options.limit) {
        /* Re-set so a refused caller still counts as recently seen. Otherwise
         * the callers being refused are the first evicted, and eviction hands
         * them a fresh budget -- turning the bound into a bypass. */
        counters.delete(key)
        counters.set(key, counter)
        return false
      }

      counter.used += 1
      globalUsed += 1
      counters.delete(key)
      counters.set(key, counter)

      while (counters.size > maxKeys) {
        const oldest = counters.keys().next()
        if (oldest.done === true) break
        counters.delete(oldest.value)
      }
      return true
    },

    size() {
      return counters.size
    },
  }
}
