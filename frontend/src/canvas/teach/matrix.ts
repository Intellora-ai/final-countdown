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
