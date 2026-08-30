/**
 * REPORTING A MEASUREMENT, NOT A SCORE.
 *
 * Two runs of the sixteen-item any-topic matrix both scored 14/16 and DIFFERENT
 * pairs failed. That was read as "the fix worked, variance replaced it, net
 * zero". It is not a null result -- it is an instrument that cannot tell a
 * two-question effect from noise, and never could.
 *
 * Two things moved between those runs: the change under test, and the route,
 * which was not under test and could not be held still. One run was asked two
 * questions at once and no arithmetic separates them afterwards.
 *
 * And the sample cannot rescue it. Sixteen items at ~87.5% has a spread wide
 * enough to swallow a two-question difference, and the normal approximation is
 * not even valid here: it wants n(1-p) > 5, and 16 x 0.125 = 2.
 *
 * So this file reports what a single run actually contains:
 *
 *   PER ITEM   which item, and why -- the finding the total destroyed
 *   PER SEED   a pass count, one sample of a randomised system
 *   ACROSS     mean and standard deviation, so the spread is visible
 *
 * The total is a headline. The per-item verdicts are the evidence.
 */

export interface ItemVerdict {
  /** What was asked. Stable across runs, so two runs can be lined up. */
  readonly item: string
  readonly ok: boolean
  /** Why it failed. Empty when it passed. */
  readonly why: string
  /**
   * The transport failure, verbatim from the provider, when the model was
   * never reached at all.
   *
   * SEPARATE FROM `why` ON PURPOSE. `why` is the GATE's verdict on an answer;
   * this is the absence of an answer. Collapsing them is what let sixteen
   * `HTTP 404`s read as sixteen teaching refusals and a passing suite.
   */
  readonly unreachable?: string
}

export interface SeedRun {
  readonly seed: number
  readonly items: readonly ItemVerdict[]
}

export interface Spread {
  /** Pass count per seed, in the order the seeds were run. */
  readonly passes: readonly number[]
  readonly mean: number
  /** Population standard deviation over exactly the seeds that were run. */
  readonly std: number
}

/**
 * One line per item, verdict first and the reason attached to it.
 *
 * The 2-fixed/2-broken finding in the earlier runs existed only in the
 * per-item detail; the ratio was identical both times and hid it completely.
 * That is why this is printed on EVERY run and not only when a total moves.
 */
export function itemTable(items: readonly ItemVerdict[]): string {
  return items
    .map((v) => {
      /* UNREACHABLE is its own word, and the provider's own message follows
         it. `REFUSED ... the model could not be reached` reads as a judgement
         about the lesson; it was a dead model id in a config file, and the
         provider had already said so. */
      if (v.unreachable !== undefined && v.unreachable !== '') {
        return `${'UNREACHED'.padEnd(8)} ${v.item} -- ${v.unreachable}`
      }
      const head = `${(v.ok ? 'TAUGHT' : 'REFUSED').padEnd(8)} ${v.item}`
      return v.why === '' ? head : `${head} -- ${v.why}`
    })
    .join('\n')
}

/**
 * Mean and spread over n seeds.
 *
 * POPULATION, not sample, standard deviation. These seeds are not drawn from a
 * larger population of seeds to be estimated -- they ARE the runs performed,
 * and the number wanted is the spread among them. The sample form would also
 * divide by zero on a single seed, and reporting NaN for the commonest case is
 * worse than reporting the truthful 0.
 */
export function summarise(runs: readonly SeedRun[]): Spread {
  const passes = runs.map((run) => run.items.filter((item) => item.ok).length)
  if (passes.length === 0) return { passes: [], mean: 0, std: 0 }
  const mean = passes.reduce((a, b) => a + b, 0) / passes.length
  const variance = passes.reduce((a, b) => a + (b - mean) ** 2, 0) / passes.length
  return { passes, mean, std: Math.sqrt(variance) }
}

/**
 * Every item where the model was never reached.
 *
 * WHY A RUN NEEDS THIS AND A SCORE DOES NOT COVER IT.
 *
 * The matrix deliberately does NOT assert its score: a shape refusal is the
 * gate working, and failing the build on it would make the gate the enemy. But
 * "the instrument ran at all" is not a score, and it was never checked -- so a
 * run in which nothing answered passed, sixteen times over, in under a second.
 *
 * A shape refusal IS a measurement: the model answered and the answer was
 * refused. Only a transport failure is the absence of one, which is why this
 * reads `unreachable` and never `ok`.
 */
export function neverReached(runs: readonly SeedRun[]): readonly ItemVerdict[] {
  return runs.flatMap((run) =>
    run.items.filter((item) => item.unreachable !== undefined && item.unreachable !== ''),
  )
}

/**
 * The floor below which a generation cannot have happened, per item.
 *
 * Deliberately far under any real figure. The measured means on this matrix
 * have run 12s to 223s per item; 250ms is not a performance expectation, it is
 * a statement about physics. Setting it near the real mean would make the check
 * fire on a fast provider and get it deleted, and a check that has been deleted
 * enforces nothing.
 */
export const MIN_MS_PER_GENERATION = 250

/**
 * Whether a run finished too fast to have generated what it claims.
 *
 * WHY THE PROCESS IS CHECKED AND NOT ONLY THE OUTPUT.
 *
 * `neverReached` catches the failure already seen -- the provider answered 404
 * and said so. It cannot catch the next way a run goes hollow, because that one
 * will not announce itself: a cache returning stubs, a fake left wired in, a
 * mock that answers instantly. Every one of those produces individually
 * plausible outputs, so no assertion on the output can separate them.
 *
 * What they share is arithmetic. The run that prompted this took 972ms for
 * sixteen items and reported PASS.
 *
 * An empty run is not judged: zero items in zero time is not evidence of
 * anything, and refusing it would fire on a legitimately empty matrix.
 */
export function implausiblyFast(items: readonly ItemVerdict[], elapsedMs: number): boolean {
  if (items.length === 0) return false
  return elapsedMs < items.length * MIN_MS_PER_GENERATION
}
